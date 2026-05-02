/**
 * v3.4 — Layer G (Generation): LLM-orchestrator for real production kernel code.
 *
 * Replaces the v2.16/v2.18 skeleton emitter (which output TODO-laden templates)
 * with an LLM-orchestrator that takes the v3.3 agent-context bundle as RAG
 * context and emits compileable production code.
 *
 * 4-mode design (operating mode determined by env vars):
 *
 *   1. real       — calls Anthropic Claude API with structured prompt.
 *                   Requires ANTHROPIC_API_KEY. Caches results.
 *   2. cache      — reads pre-generated kernel from .cache/generated-kernels/
 *                   keyed by hash(bundle + op + target). Used in CI + by contributors
 *                   without API keys.
 *   3. test       — deterministic stub generator. Used in unit tests.
 *                   Activated by EVOKERNEL_TEST_MODE=true.
 *   4. skeleton   — falls back to v2.16 skeleton path when none of above apply.
 *                   Marked clearly as a fallback in the output's source field.
 *
 * Why not always call the API: cost (~$0.01-0.10 per kernel), non-determinism
 * (CI flakiness), API key management. Cache mode + test mode keep everything
 * else deterministic.
 *
 * See docs/superpowers/specs/2026-05-03-productized-agent.md § Layer G.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export interface AgentContextBundle {
  /** Subset of the /api/agent-context bundle that we actually consume here. */
  model: { id: string; name?: string };
  hardware: { id: string; name?: string; generation?: string };
  vendor: { id: string; name?: string };
  applicable_ops: Array<{
    id: string;
    name?: string;
    category?: string;
    formal_semantics?: {
      signature?: string;
      edge_cases?: Array<{
        input: string;
        behaviors: Record<string, string>;
        mitigation?: string;
      }>;
      numerical_rules?: Array<{
        aspect: string;
        per_library: Record<string, string>;
        notes?: string;
      }>;
      reference_impl?: { framework: string; snippet: string };
    };
  }>;
  applicable_fused_kernels?: Array<{
    id: string;
    name?: string;
    formal_semantics?: { signature?: string; fusion_lifecycle?: string };
  }>;
  dsl_examples: Array<{
    id: string;
    language: string;
    arch_family: string;
    title: string;
    code: string;
    arch_idioms?: string[];
  }>;
  isa_primitives: Array<{
    id: string;
    arch_family: string;
    class: string;
    cross_vendor_equivalents?: Array<{
      vendor: string;
      arch_family: string;
      primitive_id: string;
      mapping_ratio?: string;
    }>;
  }>;
  prior_learnings?: Array<{
    id: string;
    outcome: string;
    observations: Array<{ kind: string; description: string; op_or_kernel?: string }>;
  }>;
}

export interface ProductionKernelInput {
  bundle: AgentContextBundle;
  /** Op id to generate code for, e.g. "matmul", "rmsnorm", "expert-permute". */
  op: string;
  /** Target arch family, e.g. "hopper", "cdna3", "ascend-da-vinci-3". */
  target_arch: string;
  /** Optional diagnostic from a previous Layer V failure — for retry after build/correctness fail. */
  prior_attempt_diagnostic?: string;
}

export type GenerationSource = 'llm-generated' | 'cache-hit' | 'skeleton-fallback' | 'test-stub';

export interface ProductionKernelOutput {
  /** Filename including extension, e.g. "matmul_hopper.cu". */
  filename: string;
  /** DSL language, e.g. "cuda-cpp", "ascend-c", "hip", "bang-c", "triton". */
  language: string;
  /** The actual emitted code. */
  code: string;
  /** Where the code came from in the 4-mode design. */
  source: GenerationSource;
  /** LLM model name when source === 'llm-generated' (e.g. "claude-sonnet-4-5"). */
  llm_model?: string;
  /** ISO timestamp. */
  generated_at: string;
  /** Content-hash of the input — used as cache key. */
  prompt_hash: string;
  /** Which corpus references the LLM cited (DSL example IDs, formal_semantics aspects). */
  references_used: string[];
  /** Human-facing notes about quality, caveats, what to verify in Layer V. */
  review_notes: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Mode selection
// ─────────────────────────────────────────────────────────────────────────

type OperatingMode = 'real' | 'cache' | 'test' | 'skeleton';

function selectMode(input: ProductionKernelInput): OperatingMode {
  if (process.env.EVOKERNEL_TEST_MODE === 'true') return 'test';
  if (process.env.EVOKERNEL_OFFLINE_ONLY === 'true') return 'cache';
  if (process.env.ANTHROPIC_API_KEY) return 'real';
  return 'skeleton';
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────

const CACHE_DIR = '.cache/generated-kernels';

export async function generateProductionKernel(
  input: ProductionKernelInput
): Promise<ProductionKernelOutput> {
  const promptHash = hashInput(input);
  const mode = selectMode(input);

  // Test mode: deterministic stub, no I/O
  if (mode === 'test') {
    return testStub(input, promptHash);
  }

  // Cache check — applies in real, cache, and skeleton modes
  const cacheKey = `${input.target_arch}__${input.op}__${promptHash.slice(0, 12)}.json`;
  const cachePath = path.join(CACHE_DIR, cacheKey);
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf-8')) as ProductionKernelOutput;
      return { ...cached, source: 'cache-hit' };
    } catch {
      // Cache corrupted — fall through to regenerate.
    }
  }

  // Real path (Anthropic API call)
  if (mode === 'real') {
    try {
      const result = await callLLM(input, promptHash);
      await writeCacheEntry(cachePath, result);
      return result;
    } catch (err) {
      console.error(`[llm-orchestrator] LLM call failed, falling back to skeleton: ${(err as Error).message}`);
      return skeletonFallback(input, promptHash);
    }
  }

  // Cache mode but no cache hit — fall back to skeleton
  if (mode === 'cache') {
    return skeletonFallback(input, promptHash);
  }

  // Skeleton mode (no API key, no test mode, no cache hit)
  return skeletonFallback(input, promptHash);
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 1: real — call Anthropic API
// ─────────────────────────────────────────────────────────────────────────

async function callLLM(input: ProductionKernelInput, promptHash: string): Promise<ProductionKernelOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const model = process.env.EVOKERNEL_LLM_MODEL ?? 'claude-sonnet-4-5';
  const language = pickLanguageForArch(input.target_arch);
  const prompt = buildPrompt(input, language);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errBody.slice(0, 500)}`);
  }

  const json = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
  const { code, references } = parseLLMResponse(text);

  return {
    filename: `${input.op}_${input.target_arch}.${extensionForLanguage(language)}`,
    language,
    code,
    source: 'llm-generated',
    llm_model: model,
    generated_at: new Date().toISOString(),
    prompt_hash: promptHash,
    references_used: references,
    review_notes: [
      `Generated by ${model} via Anthropic API on ${new Date().toISOString().split('T')[0]}.`,
      `Prompt hash: ${promptHash.slice(0, 12)}.`,
      `Cached for future runs at ${CACHE_DIR}/${input.target_arch}__${input.op}__${promptHash.slice(0, 12)}.json — commit this if the kernel passes Layer V verification (v3.5+).`,
      'BEFORE shipping: run Layer V verify (v3.5) — build + correctness vs PyTorch reference + perf profile.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 2: skeleton fallback (v2.16 path, marked as fallback)
// ─────────────────────────────────────────────────────────────────────────

function skeletonFallback(input: ProductionKernelInput, promptHash: string): ProductionKernelOutput {
  const language = pickLanguageForArch(input.target_arch);
  const op = input.bundle.applicable_ops.find((o) => o.id === input.op);
  const opName = op?.name ?? input.op;
  const code = `// ============================================================
// SKELETON FALLBACK — v3.4 LLM orchestrator was not available.
// Mode: skeleton (no ANTHROPIC_API_KEY, no cache hit, not test mode)
//
// To get real production code:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   ./scripts/agent-deploy/...
//
// This skeleton is the v2.16 fallback — see scripts/agent-deploy/kernel-codegen.ts
// for the full template. Refer to /api/agent-context/${input.bundle.model.id}-on-${input.bundle.hardware.id}.json
// for the full RAG context that would be passed to the LLM.
//
// Op: ${opName} on ${input.target_arch}
// ============================================================

// TODO: replace with v2.16 emitCudaInnerByOpClass output
// (this fallback file is a placeholder — kernel-codegen.ts handles real emission)
`;

  return {
    filename: `${input.op}_${input.target_arch}.${extensionForLanguage(language)}`,
    language,
    code,
    source: 'skeleton-fallback',
    generated_at: new Date().toISOString(),
    prompt_hash: promptHash,
    references_used: [],
    review_notes: [
      'WARNING: this is a SKELETON FALLBACK, not production code.',
      'Reasons: ANTHROPIC_API_KEY not set, no cache hit, not in test mode.',
      'To get real production code: set ANTHROPIC_API_KEY and re-run.',
      'Or: contributor with API key can generate + commit cache entries to .cache/generated-kernels/.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 3: test stub
// ─────────────────────────────────────────────────────────────────────────

function testStub(input: ProductionKernelInput, promptHash: string): ProductionKernelOutput {
  const language = pickLanguageForArch(input.target_arch);
  const code = `// TEST STUB — deterministic stub generated by llm-orchestrator test mode.
// Op: ${input.op}, Target: ${input.target_arch}, Language: ${language}
// Hash: ${promptHash.slice(0, 12)}
//
// This is a stable fixture for unit tests. Do NOT use in production.
__device__ void ${input.op.replace(/-/g, '_')}_test_stub() {}
`;

  return {
    filename: `${input.op}_${input.target_arch}.${extensionForLanguage(language)}`,
    language,
    code,
    source: 'test-stub',
    generated_at: '2026-01-01T00:00:00.000Z',  // deterministic for tests
    prompt_hash: promptHash,
    references_used: ['test-mode-stub'],
    review_notes: ['Test-mode stub. EVOKERNEL_TEST_MODE=true was set.'],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Prompt construction
// ─────────────────────────────────────────────────────────────────────────

function buildPrompt(input: ProductionKernelInput, language: string): string {
  const op = input.bundle.applicable_ops.find((o) => o.id === input.op);
  const matchingDsl = input.bundle.dsl_examples.filter(
    (d) => d.arch_family === input.target_arch || input.target_arch.startsWith(d.arch_family)
  );
  const matchingIsa = input.bundle.isa_primitives.filter(
    (p) => p.arch_family === input.target_arch || input.target_arch.startsWith(p.arch_family)
  );

  const sections: string[] = [];

  sections.push(
    `You are an expert ${input.target_arch} kernel engineer. Generate production-ready ${language} code for the \`${input.op}\` operator targeting hardware \`${input.bundle.hardware.id}\`.`
  );

  if (op?.formal_semantics) {
    const fs = op.formal_semantics;
    sections.push('# Operator: ' + (op.name ?? input.op));
    if (fs.signature) sections.push('## Signature\n```\n' + fs.signature + '\n```');
    if (fs.edge_cases?.length) {
      sections.push('## Edge cases\n' + fs.edge_cases.map((ec) => `- **${ec.input}**\n  ${Object.entries(ec.behaviors).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}\n  - Mitigation: ${ec.mitigation ?? '(none)'}`).join('\n\n'));
    }
    if (fs.numerical_rules?.length) {
      sections.push('## Numerical rules\n' + fs.numerical_rules.map((nr) => `- **${nr.aspect}**\n  ${Object.entries(nr.per_library).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}\n  ${nr.notes ?? ''}`).join('\n\n'));
    }
    if (fs.reference_impl?.snippet) {
      sections.push('## PyTorch reference\n```python\n' + fs.reference_impl.snippet + '\n```');
    }
  }

  if (matchingIsa.length > 0) {
    sections.push('# Available ISA primitives for ' + input.target_arch);
    sections.push(matchingIsa.map((p) => `- \`${p.id}\` (class: ${p.class})\n  Cross-vendor equivalents: ${p.cross_vendor_equivalents?.map((e) => `${e.arch_family}→${e.primitive_id}`).join(', ') ?? 'none'}`).join('\n'));
  }

  if (matchingDsl.length > 0) {
    sections.push('# DSL examples (use as structural reference)');
    for (const dsl of matchingDsl.slice(0, 2)) {
      sections.push(`## ${dsl.title} (\`${dsl.id}\`)`);
      sections.push('Idioms: ' + (dsl.arch_idioms?.join(', ') ?? '(none)'));
      sections.push('```' + dsl.language + '\n' + dsl.code.slice(0, 4000) + '\n```');
    }
  }

  if (input.bundle.prior_learnings && input.bundle.prior_learnings.length > 0) {
    sections.push('# Prior agent-learnings on similar ops');
    sections.push(input.bundle.prior_learnings.slice(0, 3).map((l) => `- **${l.id}** (outcome: ${l.outcome})\n${l.observations.map((obs) => `  - ${obs.kind}${obs.op_or_kernel ? ` on ${obs.op_or_kernel}` : ''}: ${obs.description.slice(0, 200)}`).join('\n')}`).join('\n\n'));
  }

  if (input.prior_attempt_diagnostic) {
    sections.push('# PRIOR ATTEMPT FAILED');
    sections.push('Layer V verification rejected the previous generation with this diagnostic:');
    sections.push('```\n' + input.prior_attempt_diagnostic + '\n```');
    sections.push('Address this specific issue in your regeneration.');
  }

  sections.push('# Task');
  sections.push(`Generate a complete, COMPILEABLE ${language} kernel for \`${input.op}\` targeting \`${input.target_arch}\`.

Requirements:
1. Use the documented ISA primitives (prefer ${matchingIsa[0]?.id ?? 'the most relevant'})
2. Follow the structural pattern from the DSL example
3. Implement ALL formal_semantics edge cases and numerical rules
4. Include host-side launch wrapper (kernel<<<>>> or equivalent)
5. Include exact build command (e.g., \`nvcc -arch=sm_90a -O3 -std=c++17 ...\`)

DO NOT emit:
- TODO markers
- Pseudocode
- "// implement this" comments

DO emit:
- Complete kernel body with all branches
- Specific tile shapes (BM=128, BN=128, BK=64 if no better choice)
- Real PTX/ASM for ISA-level primitives where applicable

If you don't know how to handle a specific edge case, prefer the SAFEST documented variant (e.g., FP32 partial sums for online softmax, FP32 reduction for allreduce SUM at world_size > 8).

# Output format

Wrap the code in a single fenced block:
\`\`\`${language}
<COMPLETE PRODUCTION CODE>
\`\`\`

After the code block, list as a bulleted list:
- formal_semantics.numerical_rules aspects you addressed
- DSL example IDs you took structural patterns from
- Any caveats the human reviewer should verify in Layer V`);

  return sections.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────
// LLM response parsing
// ─────────────────────────────────────────────────────────────────────────

function parseLLMResponse(text: string): { code: string; references: string[] } {
  // Extract first fenced code block
  const fenceMatch = text.match(/```[\w-]*\n([\s\S]*?)\n```/);
  const code = fenceMatch?.[1] ?? text;

  // Extract references mentioned after the code block
  const afterCode = text.slice((fenceMatch?.index ?? 0) + (fenceMatch?.[0].length ?? 0));
  const references: string[] = [];
  const refMatches = afterCode.matchAll(/[`-]([\w-]+)[`]?\b/g);
  for (const m of refMatches) {
    if (m[1] && (m[1].includes('-') || m[1].length > 8) && !references.includes(m[1])) {
      references.push(m[1]);
    }
  }
  return { code, references: references.slice(0, 20) };
}

// ─────────────────────────────────────────────────────────────────────────
// Cache I/O
// ─────────────────────────────────────────────────────────────────────────

async function writeCacheEntry(cachePath: string, entry: ProductionKernelOutput): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

export function hashInput(input: ProductionKernelInput): string {
  // Hash the input shape that affects the LLM output. Bundle is large, so we
  // hash only the slices that go into the prompt (op formal_semantics + matching
  // DSL examples + matching ISA primitives + diagnostic).
  const op = input.bundle.applicable_ops.find((o) => o.id === input.op);
  const matchingDsl = input.bundle.dsl_examples
    .filter((d) => d.arch_family === input.target_arch || input.target_arch.startsWith(d.arch_family))
    .map((d) => ({ id: d.id, code: d.code, idioms: d.arch_idioms }));
  const matchingIsa = input.bundle.isa_primitives
    .filter((p) => p.arch_family === input.target_arch || input.target_arch.startsWith(p.arch_family))
    .map((p) => ({ id: p.id, class: p.class, equivs: p.cross_vendor_equivalents }));

  const minimal = {
    op: input.op,
    target_arch: input.target_arch,
    op_formal_semantics: op?.formal_semantics ?? null,
    dsl: matchingDsl,
    isa: matchingIsa,
    diagnostic: input.prior_attempt_diagnostic ?? '',
  };
  return createHash('sha256').update(JSON.stringify(minimal)).digest('hex');
}

export function pickLanguageForArch(target_arch: string): string {
  if (
    target_arch === 'hopper' ||
    target_arch === 'blackwell' ||
    target_arch === 'ampere' ||
    target_arch === 'ada' ||
    target_arch.startsWith('hopper') ||
    target_arch.startsWith('blackwell')
  ) {
    return 'cuda-cpp';
  }
  if (target_arch === 'cdna3' || target_arch === 'cdna4' || target_arch === 'rdna3' || target_arch === 'rdna4') {
    return 'hip';
  }
  if (target_arch.startsWith('ascend-')) return 'ascend-c';
  if (target_arch.startsWith('cambricon')) return 'bang-c';
  if (target_arch.startsWith('moore-threads') || target_arch.startsWith('musa')) return 'musa-c';
  if (target_arch.startsWith('biren')) return 'br-cuda';
  if (target_arch.startsWith('hygon')) return 'hip';
  if (target_arch.startsWith('apple') || target_arch.startsWith('m3') || target_arch.startsWith('m4') || target_arch.startsWith('m5')) {
    return 'metal';
  }
  return 'cuda-cpp';
}

function extensionForLanguage(language: string): string {
  switch (language) {
    case 'cuda-cpp':
      return 'cu';
    case 'hip':
      return 'cpp';
    case 'ascend-c':
      return 'cce';
    case 'bang-c':
      return 'mlu';
    case 'musa-c':
      return 'mu';
    case 'br-cuda':
      return 'br.cu';
    case 'metal':
      return 'metal';
    case 'triton':
      return 'py';
    default:
      return 'cpp';
  }
}
