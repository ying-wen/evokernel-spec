#!/usr/bin/env node
/**
 * @evokernel/mcp-server — MCP server exposing EvoKernel Spec corpus + the
 * agent-deploy planning pipeline as tools.
 *
 * Compatible with any MCP-aware client:
 *   - Claude Desktop  (via claude_desktop_config.json)
 *   - Cursor          (via mcp.json)
 *   - Continue        (via config.json)
 *   - VS Code (Cline) (via cline_mcp_settings.json)
 *   - Codex CLI       (via ~/.config/codex/mcp.json)
 *   - Sourcegraph Cody, Zed, etc.
 *
 * Tools exposed:
 *   - evokernel_query_hardware    — list / filter accelerators
 *   - evokernel_query_operator    — operator details + kernel coverage
 *   - evokernel_query_isa         — ISA primitives + cross-vendor equivalents
 *   - evokernel_solve             — query the configurations index
 *   - evokernel_coverage_matrix   — per (op × arch × library) coverage
 *   - evokernel_plan_deployment   — full agent-deploy invocation:
 *                                    HF model + hardware → 13 production-grade artifacts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { existsSync } from 'node:fs';

const API_BASE = process.env.EVOKERNEL_API_BASE
  || 'https://yingwen.io/evokernel-spec/api';

// Resolve repo root by walking up from script location until we find
// scripts/agent-deploy/index.ts. Works whether running from source
// (plugins/mcp-server/) or compiled dist (plugins/mcp-server/dist/).
function findRepoRoot(): string {
  if (process.env.EVOKERNEL_REPO_ROOT) return process.env.EVOKERNEL_REPO_ROOT;
  let dir = import.meta.dirname ?? process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'scripts/agent-deploy/index.ts'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: original two-level-up assumption (works when called from source)
  return path.resolve(import.meta.dirname ?? '.', '../..');
}
const REPO_ROOT = findRepoRoot();

async function fetchJson(endpoint: string): Promise<unknown> {
  const r = await fetch(`${API_BASE}/${endpoint}`);
  if (!r.ok) throw new Error(`API ${endpoint} returned ${r.status}`);
  return await r.json();
}

const TOOLS: Tool[] = [
  {
    name: 'evokernel_query_hardware',
    description:
      'Look up AI accelerator hardware specs (GPU / NPU / TPU). Returns compute (FP4/FP8/BF16/FP16 TFLOPS), memory (capacity + bandwidth), power-thermal envelope, ISA primitives. Use to compare cards or check feasibility before deployment planning.',
    inputSchema: {
      type: 'object',
      properties: {
        hardware_id: { type: 'string', description: 'Specific hardware id (e.g. "h100-sxm5", "mi300x", "ascend-910c", "mlu590"). If omitted, returns all 39 cards.' },
        vendor: { type: 'string', description: 'Filter by vendor (nvidia / amd / huawei / cambricon / hygon / moore-threads / biren / etc.)' }
      }
    }
  },
  {
    name: 'evokernel_query_operator',
    description:
      'Look up operator details (FLOPs/bytes formulas, arithmetic intensity, fusion targets, engine implementations, per-arch kernel coverage, formal_semantics edge cases). Use to understand where a kernel exists / is missing across vendors.',
    inputSchema: {
      type: 'object',
      properties: {
        operator_id: { type: 'string', description: 'Operator slug (e.g. "matmul", "softmax", "scaled-dot-product-attention", "mla-attention", "mamba-conv1d").' },
        category: { type: 'string', description: 'Filter by category (matmul / attention / norm / activation / moe-routing / communication / etc.)' }
      }
    }
  },
  {
    name: 'evokernel_query_isa',
    description:
      'Look up ISA primitive details (WGMMA / TCGEN05 / MFMA / Cube / WMMA / TMA / AMX) with cross_vendor_equivalents — the keystone field for cross-vendor kernel codegen. Use when porting a CUDA kernel to ROCm / CANN / MUSA / Metal.',
    inputSchema: {
      type: 'object',
      properties: {
        primitive_id: { type: 'string', description: 'Primitive slug (e.g. "nvidia-hopper-wgmma", "amd-cdna3-mfma-32x32x16", "huawei-ascend-cube").' }
      }
    }
  },
  {
    name: 'evokernel_solve',
    description:
      'Query the unified configuration index (65+ entries: measured cases + playbook recommendations) for ranked viable deployment configurations. Returns each config with derived $/M tokens estimate. Use for "what configurations exist for X?" questions.',
    inputSchema: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: 'Filter to specific model id (or model archetype like "moe-llm-large").' },
        hardware_id: { type: 'string', description: 'Filter to specific hardware id.' },
        max_dollars_per_m_tokens: { type: 'number', description: 'Filter to configurations under this cost.' }
      }
    }
  },
  {
    name: 'evokernel_coverage_matrix',
    description:
      'Query the auto-derived (operator × hardware_arch × kernel_library) 4D coverage matrix. Returns rows where coverage is full/partial/experimental/missing. Use to find ops needing custom kernel codegen on a given arch.',
    inputSchema: {
      type: 'object',
      properties: {
        arch_family: { type: 'string', description: 'Hardware arch (hopper / blackwell / cdna3 / ascend-910 / cambricon-mlu / etc.).' },
        coverage: { type: 'string', enum: ['full', 'partial', 'experimental', 'missing'], description: 'Filter by coverage tier.' },
        operator_id: { type: 'string', description: 'Filter to specific operator.' }
      }
    }
  },
  {
    name: 'evokernel_plan_deployment',
    description:
      'Run the full agent-deploy planning pipeline: takes a HuggingFace model id + hardware id + workload, returns a complete production-grade deployment plan including engine selection, quantization, parallelism, card count, expected throughput, $/M tokens, plus 13 production artifacts (Dockerfile, K8s manifests, Prometheus alerts, runbook, rollback plan, provenance, license audit, SBOM, production checklist). The agent classifies the model into an archetype, queries the corpus, runs a feasibility check across quant options, and synthesizes a plan. Cross-vendor: works across NVIDIA / AMD / Huawei Ascend / Cambricon / Hygon / Moore Threads / Biren.',
    inputSchema: {
      type: 'object',
      required: ['model', 'hardware'],
      properties: {
        model: {
          type: 'string',
          description: 'HuggingFace model id (e.g. "meta-llama/Llama-4-Scout-17B-16E", "deepseek-ai/DeepSeek-V3-Pro").'
        },
        hardware: {
          type: 'string',
          description: 'Hardware id from corpus (h100-sxm5 / mi300x / ascend-910c / mlu590 / dcu-z100 / mtt-s4000 / br104 / ...).'
        },
        workload: {
          type: 'string',
          enum: ['chat', 'rag', 'code', 'math', 'long-context'],
          default: 'chat',
          description: 'Workload archetype — drives engine + eval-suite selection.'
        },
        target_cost: { type: 'number', description: '$/M tokens budget target (optional).' },
        target_ttft_ms: { type: 'number', description: 'TTFT p99 SLA target in ms (optional).' },
        config_path: { type: 'string', description: 'Path to local model config.json (offline / private models).' }
      }
    }
  },
  {
    name: 'evokernel_agent_context',
    description:
      'v3.7 — Layer R: smart-retrieval bundle for given (model, hardware) pair. Returns the FULL knowledge bundle an LLM-orchestrator needs in ONE fetch: model + execution graphs + hardware + vendor + applicable_ops (with formal_semantics) + applicable_fused_kernels (with formal_semantics) + dsl_examples + isa_primitives + kernel_libraries + engine_compile_workflows + prior_learnings + coverage_hints. Pre-built at SSG time as 1140 static JSON files. Use this to seed any agent that needs corpus context.',
    inputSchema: {
      type: 'object',
      required: ['model', 'hardware'],
      properties: {
        model: { type: 'string', description: 'Model id from corpus (e.g. "deepseek-v4-pro").' },
        hardware: { type: 'string', description: 'Hardware id from corpus (e.g. "h100-sxm5").' }
      }
    }
  },
  {
    name: 'evokernel_verify_kernel',
    description:
      'v3.7 — Layer V: run V1/V2/V3 verification gates on arbitrary kernel code. V1 build (structural checks + optional compile), V2 correctness (op-class structural invariants + numerical_rules cross-checks), V3 perf-friendliness checks. Returns pass/fail/partial + Markdown summary + retry_diagnostic for Layer G regeneration. Structural mode is CI-safe; execution mode requires target hardware.',
    inputSchema: {
      type: 'object',
      required: ['code', 'language', 'op', 'target_arch'],
      properties: {
        code: { type: 'string', description: 'Generated kernel code to verify.' },
        language: {
          type: 'string',
          enum: ['cuda-cpp', 'hip', 'ascend-c', 'bang-c', 'musa-c', 'br-cuda', 'metal', 'triton'],
          description: 'Source language of the kernel.'
        },
        op: { type: 'string', description: 'Op id (matmul / attention / rmsnorm / expert-permute / allreduce / etc.) — drives V2 op-class invariant checks.' },
        target_arch: { type: 'string', description: 'Target arch family (hopper / cdna3 / ascend-da-vinci-3 / cambricon-mlu / etc.).' },
        execution_mode: {
          type: 'boolean',
          default: false,
          description: 'If true, attempts real compile/run (requires target compiler/hardware in PATH). Default: false (structural-only, CI-safe).'
        }
      }
    }
  },
  {
    name: 'evokernel_agent_full_pipeline',
    description:
      'v3.7 PRODUCTIZED AGENT — full R→P→G→V→F end-to-end pipeline. Takes (model, hardware, op) and runs: Layer R smart context fetch → Layer G real-code generation via Anthropic Claude API (requires ANTHROPIC_API_KEY env) → Layer V build+correctness+perf verification → Layer F retry-on-fail with diagnostic (≤3 attempts) → Layer F auto-emit agent-learning.yaml. Returns: outcome (shipped/partial/kernel-gap-blocked) + final kernel + verification result + attempt history + agent-learning YAML stub. Without ANTHROPIC_API_KEY: skeleton fallback mode (v2.16 path). EVOKERNEL_TEST_MODE=true: deterministic stubs for testing.',
    inputSchema: {
      type: 'object',
      required: ['model', 'hardware', 'op'],
      properties: {
        model: { type: 'string', description: 'Model id from corpus (e.g. "deepseek-v4-pro").' },
        hardware: { type: 'string', description: 'Hardware id from corpus (e.g. "h100-sxm5", "mlu590").' },
        op: { type: 'string', description: 'Op id to generate (e.g. "fused-rope-qkv", "matmul", "expert-permute").' },
        max_retries: { type: 'number', default: 3, description: 'Max LLM regenerations on V failure (cost/quality trade-off).' },
        execution_mode: {
          type: 'boolean',
          default: false,
          description: 'If true: V1 attempts compile, V2 attempts PyTorch comparison (v3.6+ only), V3 attempts profiling (v3.6+ only). Default: structural-only (CI-safe).'
        }
      }
    }
  }
];

const server = new Server(
  { name: 'evokernel-spec', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  switch (name) {
    case 'evokernel_query_hardware': {
      const all = (await fetchJson('hardware.json')) as { items: any[] };
      let items = all.items;
      if (args.hardware_id) items = items.filter((h) => h.id === args.hardware_id);
      if (args.vendor) items = items.filter((h) => h.vendor.id === args.vendor);
      return { content: [{ type: 'text', text: JSON.stringify({ count: items.length, items }, null, 2) }] };
    }

    case 'evokernel_query_operator': {
      const all = (await fetchJson('operators.json')) as { items: any[] };
      let items = all.items;
      if (args.operator_id) items = items.filter((o) => o.id === args.operator_id);
      if (args.category) items = items.filter((o) => o.category === args.category);
      return { content: [{ type: 'text', text: JSON.stringify({ count: items.length, items }, null, 2) }] };
    }

    case 'evokernel_query_isa': {
      const all = (await fetchJson('isa-primitives.json')) as { items: any[] };
      let items = all.items;
      if (args.primitive_id) items = items.filter((p) => p.id === args.primitive_id);
      return { content: [{ type: 'text', text: JSON.stringify({ count: items.length, items }, null, 2) }] };
    }

    case 'evokernel_solve': {
      const all = (await fetchJson('solve.json')) as { configurations: any[] };
      let configs = all.configurations;
      if (args.model_id) configs = configs.filter((c) => c.model.id === args.model_id || c.model_archetype === args.model_id);
      if (args.hardware_id) configs = configs.filter((c) => c.hardware.id === args.hardware_id);
      if (typeof args.max_dollars_per_m_tokens === 'number') {
        configs = configs.filter((c) => (c.metrics.dollars_per_m_tokens_estimate ?? 99) <= (args.max_dollars_per_m_tokens as number));
      }
      configs.sort((a, b) => (b.default_score ?? 0) - (a.default_score ?? 0));
      return { content: [{ type: 'text', text: JSON.stringify({ count: configs.length, configurations: configs.slice(0, 25) }, null, 2) }] };
    }

    case 'evokernel_coverage_matrix': {
      const all = (await fetchJson('coverage-matrix.json')) as { rows: any[] };
      let rows = all.rows;
      if (args.arch_family) rows = rows.filter((r) => r.arch_family === args.arch_family);
      if (args.coverage) rows = rows.filter((r) => r.library_coverage === args.coverage);
      if (args.operator_id) rows = rows.filter((r) => r.operator_id === args.operator_id);
      return { content: [{ type: 'text', text: JSON.stringify({ count: rows.length, rows: rows.slice(0, 50) }, null, 2) }] };
    }

    case 'evokernel_plan_deployment': {
      const cliPath = path.join(REPO_ROOT, 'scripts/agent-deploy/index.ts');
      const outDir = `/tmp/evokernel-mcp-output-${Date.now()}`;
      const cliArgs = [
        'tsx', cliPath,
        '--model', String(args.model),
        '--hardware', String(args.hardware),
        '--workload', String(args.workload ?? 'chat'),
        '--api-base', API_BASE,
        '--output', outDir
      ];
      if (args.target_cost) cliArgs.push('--target-cost', String(args.target_cost));
      if (args.target_ttft_ms) cliArgs.push('--target-ttft', String(args.target_ttft_ms));
      if (args.config_path) cliArgs.push('--config', String(args.config_path));

      try {
        const stdout = execFileSync('pnpm', cliArgs, {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe']
        });
        const plan = JSON.parse(readFileSync(path.join(outDir, 'deployment_plan.json'), 'utf-8'));
        return {
          content: [
            {
              type: 'text',
              text:
                `✅ Plan generated. Output dir: ${outDir}\n\n` +
                `Recommended:\n` +
                `  Engine: ${plan.recommended.engine}\n` +
                `  Quantization: ${plan.recommended.quantization}\n` +
                `  Parallelism: TP=${plan.recommended.parallelism.tp} EP=${plan.recommended.parallelism.ep}\n` +
                `  Cards: ${plan.recommended.card_count}\n` +
                `  Expected: ${plan.recommended.expected_decode_tok_s_per_card.toFixed(0)} tok/s/card · $${plan.recommended.estimated_dollars_per_m_tokens.toFixed(2)}/M tokens\n` +
                `  Kernel gaps: ${plan.kernel_gaps.length}\n\n` +
                `Artifacts in ${outDir}/:\n` +
                `  - deployment_plan.json\n` +
                `  - launch.sh\n` +
                `  - kernel_gaps.md\n` +
                `  - verification_plan.md\n` +
                `  - Dockerfile\n` +
                `  - kubernetes/deployment.yaml\n` +
                `  - monitoring/prometheus-rules.yaml\n` +
                `  - runbook.md\n` +
                `  - rollback-plan.md\n` +
                `  - provenance.json\n` +
                `  - license-audit.md\n` +
                `  - production-checklist.md\n` +
                `  - sbom.json\n\n` +
                `Full plan JSON below:\n${JSON.stringify(plan, null, 2)}`
            }
          ]
        };
      } catch (e: any) {
        return {
          content: [{ type: 'text', text: `❌ agent-deploy failed: ${e.message || e}\n\nstdout:\n${e.stdout ?? ''}\nstderr:\n${e.stderr ?? ''}` }],
          isError: true
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // v3.7 — productized agent surfaces
    // ─────────────────────────────────────────────────────────────────

    case 'evokernel_agent_context': {
      // Fetch the pre-generated bundle for (model, hardware) directly
      const bundlePath = `agent-context/${String(args.model)}-on-${String(args.hardware)}.json`;
      try {
        const bundle = await fetchJson(bundlePath);
        return { content: [{ type: 'text', text: JSON.stringify(bundle, null, 2) }] };
      } catch (e: any) {
        return {
          content: [{ type: 'text', text: `❌ Bundle not found for (${args.model}, ${args.hardware}). Check /api/agent-context-index.json for valid pairs. Error: ${e.message ?? e}` }],
          isError: true
        };
      }
    }

    case 'evokernel_verify_kernel': {
      // Wrap scripts/agent-deploy/verify/index.ts. Run via subprocess to
      // isolate from MCP server process state.
      const verifyScript = path.join(REPO_ROOT, 'scripts/agent-deploy/verify/index.ts');
      const verifyInput = JSON.stringify({
        code: String(args.code),
        language: String(args.language),
        op: String(args.op),
        target_arch: String(args.target_arch),
        execution_mode: Boolean(args.execution_mode ?? false)
      });
      try {
        const stdout = execFileSync(
          'pnpm',
          ['tsx', '-e', `import('${verifyScript}').then(async m => { const r = await m.runVerification(JSON.parse(process.argv[1])); console.log(JSON.stringify(r, null, 2)); })`, verifyInput],
          { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const result = JSON.parse(stdout);
        return {
          content: [{ type: 'text', text: result.summary_md + '\n\nFull JSON:\n' + JSON.stringify(result, null, 2) }],
          isError: result.overall === 'fail'
        };
      } catch (e: any) {
        return {
          content: [{ type: 'text', text: `❌ Verification invocation failed: ${e.message ?? e}\n\nstderr:\n${e.stderr ?? ''}` }],
          isError: true
        };
      }
    }

    case 'evokernel_agent_full_pipeline': {
      // The crown jewel: full R→P→G→V→F via scripts/agent-deploy/feedback.ts
      // Returns: outcome + kernel + verification + agent-learning YAML
      const feedbackScript = path.join(REPO_ROOT, 'scripts/agent-deploy/feedback.ts');
      const bundlePath = `agent-context/${String(args.model)}-on-${String(args.hardware)}.json`;
      let bundle: any;
      try {
        bundle = await fetchJson(bundlePath);
      } catch (e: any) {
        return {
          content: [{ type: 'text', text: `❌ Layer R: bundle not found for (${args.model}, ${args.hardware}).` }],
          isError: true
        };
      }
      const opEntry = (bundle.bundle?.applicable_ops ?? []).find((o: any) => o.id === args.op)
        ?? (bundle.bundle?.applicable_fused_kernels ?? []).find((k: any) => k.id === args.op);
      const fullInput = JSON.stringify({
        generation: {
          bundle: bundle.bundle,
          op: String(args.op),
          target_arch: bundle.bundle?.hardware?.generation ?? String(args.hardware).split('-')[0],
        },
        verification: {
          numerical_rules: opEntry?.formal_semantics?.numerical_rules,
          reference_impl_python: opEntry?.formal_semantics?.reference_impl?.snippet,
          execution_mode: Boolean(args.execution_mode ?? false),
        },
        max_retries: Number(args.max_retries ?? 3),
      });
      try {
        const stdout = execFileSync(
          'pnpm',
          ['tsx', '-e', `import('${feedbackScript}').then(async m => { const r = await m.generateAndVerify(JSON.parse(process.argv[1])); console.log(JSON.stringify(r, null, 2)); })`, fullInput],
          { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 }
        );
        const result = JSON.parse(stdout);
        const summary =
          `# Productized Agent Pipeline — ${args.model} × ${args.hardware} × ${args.op}\n\n` +
          `**Outcome:** ${result.outcome}  ·  **Attempts:** ${result.attempts.length}  ·  **Source:** ${result.kernel.source}\n\n` +
          `## Verification\n${result.verification.summary_md}\n\n` +
          `## Generated Code\n\`\`\`${result.kernel.language}\n${result.kernel.code.slice(0, 4000)}\n\`\`\`\n\n` +
          `## Agent-Learning YAML (review + commit to data/agent-learnings/)\n\`\`\`yaml\n${result.agent_learning_yaml}\`\`\``;
        return {
          content: [{ type: 'text', text: summary }],
          isError: result.outcome === 'kernel-gap-blocked'
        };
      } catch (e: any) {
        return {
          content: [{ type: 'text', text: `❌ Full-pipeline invocation failed: ${e.message ?? e}\n\nstderr:\n${e.stderr ?? ''}` }],
          isError: true
        };
      }
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('evokernel-mcp server running on stdio');
