/**
 * v3.25 -- tests for host-LLM execution mode + technique entity +
 * synthesizeTemporaryBundle + archetype inference.
 *
 * Tests are designed to NOT require a real LLM call (host-llm mode is
 * tested by writing a fake response.json fixture; synthesize is tested
 * with EVOKERNEL_OFFLINE_ONLY=true to skip the HF fetch).
 */

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildHostLlmRequest,
  writeHostLlmRequest,
  awaitHostLlmResponse,
  responseToOutput,
  shouldUseHostLlm,
  defaultExchangeDir,
  HostLlmTimeoutError,
  type HostLlmRequest,
  type HostLlmResponse,
} from '../agent-deploy/host-llm-adapter';
import {
  synthesizeTemporaryBundle,
  inferArchetypeFromHfConfig,
  listBundles,
} from '../agent-deploy/fetch-bundle';
import { TechniqueSchema } from '@evokernel/schemas';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-25-host-llm');
const FIXTURE_DIST = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-25-bundles');

const SAMPLE_BUNDLE = {
  license: 'CC-BY-4.0',
  generated: '2026-05-04T00:00:00Z',
  schema_version: '0.16',
  request: { model: 'fake', hardware: 'fake-hw' },
  bundle: {
    model: { id: 'fake', name: 'Fake' },
    hardware: { id: 'fake-hw', name: 'Fake HW', generation: 'hopper' },
    vendor: { id: 'fake-vendor', name: 'Fake Vendor' },
    applicable_ops: [
      { id: 'attention', name: 'Attention', category: 'attention',
        formal_semantics: { signature: 'attention(Q, K, V) -> O', edge_cases: [], numerical_rules: [{ aspect: 'accumulator_dtype', per_library: { all_libs: 'FP32' } }], reference_impl: { framework: 'pytorch', snippet: 'torch.scaled_dot_product_attention(Q, K, V)' } }
      },
      { id: 'matmul', name: 'Matmul', category: 'matmul' },
      { id: 'rmsnorm', name: 'RMSNorm', category: 'norm' },
      { id: 'flow-matching-step', name: 'Flow Matching Step', category: 'sampler' },
      { id: 'mel-spectrogram-encode', name: 'Mel-spec Encode', category: 'audio-preprocess' },
    ],
    applicable_fused_kernels: [
      { id: 'fused-rope-qkv', name: 'Fused RoPE-QKV' },
      { id: 'fused-flow-matching-with-cache', name: 'Fused Flow-Matching with Cache' },
    ],
    dsl_examples: [
      { id: 'cuda-flash-attention-hopper', language: 'cuda-cpp', arch_family: 'hopper', title: 'Flash Attention Hopper', code: 'kernel code here', arch_idioms: ['wgmma'] },
    ],
    isa_primitives: [
      { id: 'nvidia-hopper-wgmma', arch_family: 'hopper', class: 'mma' },
    ],
    prior_learnings: [],
  },
};

beforeAll(async () => {
  await mkdir(FIXTURE_DIR, { recursive: true });
  await mkdir(FIXTURE_DIST, { recursive: true });
  // Multiple bundles on fake-hw so synthesize has a template to crib from
  for (const slug of ['boltz-1-on-fake-hw', 'llama-3.3-70b-on-fake-hw']) {
    await writeFile(path.join(FIXTURE_DIST, `${slug}.json`), JSON.stringify(SAMPLE_BUNDLE));
  }
});

afterAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
  await rm(FIXTURE_DIST, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env.EVOKERNEL_HOST_LLM;
  delete process.env.CLAUDEAGENT;
  delete process.env.CLAUDE_CODE_SESSION;
  delete process.env.CODEX_SESSION_ID;
  delete process.env.EVOKERNEL_HOST_LLM_EXCHANGE_DIR;
  delete process.env.EVOKERNEL_OFFLINE_ONLY;
});

// ─────────────────────────────────────────────────────────────────────────
// shouldUseHostLlm — env detection
// ─────────────────────────────────────────────────────────────────────────

describe('shouldUseHostLlm (v3.25)', () => {
  it('returns true when EVOKERNEL_HOST_LLM=true', () => {
    process.env.EVOKERNEL_HOST_LLM = 'true';
    expect(shouldUseHostLlm()).toBe(true);
  });
  it('returns true when CLAUDEAGENT is set (CC context)', () => {
    process.env.CLAUDEAGENT = '1';
    expect(shouldUseHostLlm()).toBe(true);
  });
  it('returns true when CLAUDE_CODE_SESSION is set', () => {
    process.env.CLAUDE_CODE_SESSION = 'abc';
    expect(shouldUseHostLlm()).toBe(true);
  });
  it('returns true when CODEX_SESSION_ID is set', () => {
    process.env.CODEX_SESSION_ID = 'xyz';
    expect(shouldUseHostLlm()).toBe(true);
  });
  it('returns false when no host indicators set', () => {
    expect(shouldUseHostLlm()).toBe(false);
  });
  it('does NOT trigger on EVOKERNEL_HOST_LLM=false (string)', () => {
    process.env.EVOKERNEL_HOST_LLM = 'false';
    expect(shouldUseHostLlm()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildHostLlmRequest — bundle excerpt extraction
// ─────────────────────────────────────────────────────────────────────────

describe('buildHostLlmRequest (v3.25)', () => {
  it('produces a valid request with op-relevant bundle excerpt', () => {
    const req = buildHostLlmRequest(
      { bundle: SAMPLE_BUNDLE.bundle as any, op: 'attention', target_arch: 'hopper' },
      'PROMPT TEXT',
      '0123456789abcdef',
      'cuda-cpp',
    );
    expect(req.schema_version).toBe('0.1');
    expect(req.request_id).toContain('attention');
    expect(req.request_id).toContain('fake-hw');
    expect(req.generation.op).toBe('attention');
    expect(req.generation.target_arch).toBe('hopper');
    expect(req.prompt).toBe('PROMPT TEXT');
    expect(req.prompt_hash).toBe('0123456789abcdef');
    expect(req.generation.bundle_excerpt.op_signature).toContain('attention');
    expect(req.generation.bundle_excerpt.relevant_dsl_examples.length).toBeGreaterThan(0);
    expect(req.generation.bundle_excerpt.relevant_isa_primitives.length).toBeGreaterThan(0);
  });

  it('caps DSL examples + ISA primitives at 5 each (cost control)', () => {
    const big_bundle = {
      ...SAMPLE_BUNDLE.bundle,
      dsl_examples: Array.from({ length: 20 }, (_, i) => ({
        id: `dsl-${i}`, language: 'cuda-cpp', arch_family: 'hopper', title: `DSL ${i}`, code: 'X'.repeat(5000),
      })),
      isa_primitives: Array.from({ length: 20 }, (_, i) => ({
        id: `isa-${i}`, arch_family: 'hopper', class: 'mma',
      })),
    };
    const req = buildHostLlmRequest(
      { bundle: big_bundle as any, op: 'matmul', target_arch: 'hopper' },
      'p', 'h', 'cuda-cpp',
    );
    expect(req.generation.bundle_excerpt.relevant_dsl_examples.length).toBeLessThanOrEqual(5);
    expect(req.generation.bundle_excerpt.relevant_isa_primitives.length).toBeLessThanOrEqual(5);
    // Each code excerpt capped at 1500 chars
    for (const d of req.generation.bundle_excerpt.relevant_dsl_examples) {
      expect(d.code_excerpt.length).toBeLessThanOrEqual(1500);
    }
  });

  it('preserves prior_attempt_diagnostic when retrying after V failure', () => {
    const req = buildHostLlmRequest(
      { bundle: SAMPLE_BUNDLE.bundle as any, op: 'attention', target_arch: 'hopper', prior_attempt_diagnostic: 'V2 reference compare failed: max_abs_diff=0.05' },
      'p', 'h', 'cuda-cpp',
    );
    expect(req.generation.prior_attempt_diagnostic).toContain('V2 reference compare failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// host-llm full exchange (write request, write fake response, await)
// ─────────────────────────────────────────────────────────────────────────

describe('host-llm exchange (v3.25)', () => {
  it('round-trips: write request -> fixture writes response -> harness reads it', async () => {
    process.env.EVOKERNEL_HOST_LLM_EXCHANGE_DIR = FIXTURE_DIR;
    const req = buildHostLlmRequest(
      { bundle: SAMPLE_BUNDLE.bundle as any, op: 'attention', target_arch: 'hopper' },
      'prompt', 'abcdef0123456789', 'cuda-cpp',
    );
    await writeHostLlmRequest(req);

    // Simulate the host LLM writing a response
    const fake_response: HostLlmResponse = {
      schema_version: '0.1',
      request_id: req.request_id,
      responded_at: new Date().toISOString(),
      code: '__global__ void attention_kernel() { /* fake host LLM output */ }',
      references_used: ['cuda-flash-attention-hopper', 'nvidia-hopper-wgmma'],
      review_notes: ['Reviewed against FA-3 reference; numerical agreement within tol.'],
      llm_model_used: 'claude-sonnet-test',
    };
    await writeFile(
      path.join(FIXTURE_DIR, `${req.request_id}.response.json`),
      JSON.stringify(fake_response, null, 2),
    );

    const response = await awaitHostLlmResponse(req.request_id, { poll_interval_ms: 50, timeout_ms: 5000 });
    expect(response.code).toContain('attention_kernel');
    expect(response.references_used).toContain('cuda-flash-attention-hopper');
    expect(response.llm_model_used).toBe('claude-sonnet-test');
  });

  it('throws HostLlmTimeoutError when response file never appears', async () => {
    process.env.EVOKERNEL_HOST_LLM_EXCHANGE_DIR = FIXTURE_DIR;
    await expect(
      awaitHostLlmResponse('nonexistent-request-id', { poll_interval_ms: 50, timeout_ms: 200 }),
    ).rejects.toBeInstanceOf(HostLlmTimeoutError);
  });

  it('rejects when response.json contains an error from the host', async () => {
    process.env.EVOKERNEL_HOST_LLM_EXCHANGE_DIR = FIXTURE_DIR;
    const request_id = 'error-test-' + Date.now();
    await writeFile(
      path.join(FIXTURE_DIR, `${request_id}.response.json`),
      JSON.stringify({
        schema_version: '0.1',
        request_id,
        responded_at: new Date().toISOString(),
        code: '',
        references_used: [],
        review_notes: [],
        llm_model_used: 'unknown',
        error: 'Host LLM rate-limited',
      }),
    );
    await expect(
      awaitHostLlmResponse(request_id, { poll_interval_ms: 50, timeout_ms: 1000 }),
    ).rejects.toThrow(/Host LLM reported error: Host LLM rate-limited/);
  });

  it('responseToOutput converts host response into ProductionKernelOutput shape', () => {
    const req: HostLlmRequest = buildHostLlmRequest(
      { bundle: SAMPLE_BUNDLE.bundle as any, op: 'attention', target_arch: 'hopper' },
      'prompt', 'h', 'cuda-cpp',
    );
    const resp: HostLlmResponse = {
      schema_version: '0.1',
      request_id: req.request_id,
      responded_at: '2026-05-04T01:00:00Z',
      code: 'void f() {}',
      references_used: ['ref1'],
      review_notes: ['caveat'],
      llm_model_used: 'gpt-5-test',
    };
    const out = responseToOutput(req, resp, 'attention_hopper.cu');
    expect(out.filename).toBe('attention_hopper.cu');
    expect(out.source).toBe('llm-generated');
    expect(out.llm_model).toBe('gpt-5-test');
    expect(out.code).toBe('void f() {}');
    expect(out.review_notes).toContain('Generated via host-llm exchange (no external Anthropic API call).');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Technique schema + SageAttention YAML
// ─────────────────────────────────────────────────────────────────────────

describe('Technique schema + first SageAttention YAML (v3.25)', () => {
  it('SageAttention YAML parses and validates', async () => {
    const file = path.join(REPO_ROOT, 'data/techniques/sageattention.yaml');
    expect(existsSync(file)).toBe(true);
    const raw = await readFile(file, 'utf-8');
    const parsed = parseYaml(raw);
    const result = TechniqueSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('SageAttention YAML has port_targets covering 6 arch families', async () => {
    const file = path.join(REPO_ROOT, 'data/techniques/sageattention.yaml');
    const raw = await readFile(file, 'utf-8');
    const parsed = TechniqueSchema.parse(parseYaml(raw));
    const archs = parsed.port_targets.map((p) => p.arch_family);
    expect(archs).toContain('hopper');
    expect(archs).toContain('ascend-da-vinci-3');
    expect(archs).toContain('cdna3');
    expect(archs).toContain('cambricon-mlu');
  });

  it('SageAttention has a CUDA reference impl pointing to the upstream repo', async () => {
    const file = path.join(REPO_ROOT, 'data/techniques/sageattention.yaml');
    const parsed = TechniqueSchema.parse(parseYaml(await readFile(file, 'utf-8')));
    expect(parsed.reference_impl.framework).toBe('cuda-cpp');
    expect(parsed.reference_impl.repo).toMatch(/github\.com\/thu-ml\/sageattention/);
  });

  it('TechniqueSchema rejects malformed entries (e.g. invalid arch port status)', () => {
    const bad = {
      id: 'bad-tech',
      name: 'Bad',
      technique_kind: 'attention-optimization',
      reference_url: 'https://example.com',
      applicable_to: { model_archetypes: [], ops: [], hardware_arch_families: [] },
      port_targets: [{ arch_family: 'hopper', status: 'totally-not-a-real-status' }],
      reference_impl: { framework: 'cuda-cpp', repo: 'https://example.com/repo' },
    };
    const result = TechniqueSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// inferArchetypeFromHfConfig + synthesizeTemporaryBundle
// ─────────────────────────────────────────────────────────────────────────

describe('inferArchetypeFromHfConfig (v3.25)', () => {
  it('classifies CogVideoX as diffusion', () => {
    expect(inferArchetypeFromHfConfig({ architectures: ['CogVideoXForConditionalGeneration'] }, 'zai-org/CogVideoX1.5-5B')).toBe('diffusion');
  });
  it('classifies Llama as transformer-decoder', () => {
    expect(inferArchetypeFromHfConfig({ architectures: ['LlamaForCausalLM'] }, 'meta-llama/Llama-3-70B')).toBe('transformer-decoder');
  });
  it('classifies Whisper as encoder-decoder-asr', () => {
    expect(inferArchetypeFromHfConfig({ architectures: ['WhisperForConditionalGeneration'] }, 'openai/whisper-large-v3')).toBe('encoder-decoder-asr');
  });
  it('classifies Mochi as diffusion (via id substring fallback)', () => {
    expect(inferArchetypeFromHfConfig(undefined, 'genmo/mochi-1-preview')).toBe('diffusion');
  });
  it('returns "unknown" for unrecognized model ids and configs', () => {
    expect(inferArchetypeFromHfConfig(undefined, 'random-org/some-mystery-model')).toBe('unknown');
  });
});

describe('synthesizeTemporaryBundle (v3.25)', () => {
  it('synthesizes a bundle for an unknown model on a known hardware (offline mode)', async () => {
    process.env.EVOKERNEL_OFFLINE_ONLY = 'true';
    const result = await synthesizeTemporaryBundle({
      model: 'zai-org/CogVideoX1.5-5B',
      hardware: 'fake-hw',
      dist_path: FIXTURE_DIST,
    });
    expect(result.source).toBe('hf-config-only');
    // Even without HF reachable (offline), bundle synthesis succeeds based on
    // hardware template + id-substring archetype inference.
    expect(result.inferred_archetype).toBe('diffusion');
    expect(result.bundle.model.id).toBe('cogvideox1.5-5b');
    expect(result.bundle.hardware.id).toBe('fake-hw');
    // Diffusion archetype filters ops to attention/matmul/norm/sampler/etc
    const op_ids = result.bundle.applicable_ops.map((o) => o.id);
    expect(op_ids).toContain('attention');
    expect(op_ids).toContain('flow-matching-step');
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it('throws when hardware has no bundles available (no template to crib)', async () => {
    process.env.EVOKERNEL_OFFLINE_ONLY = 'true';
    await expect(
      synthesizeTemporaryBundle({
        model: 'unknown',
        hardware: 'nonexistent-hw',
        dist_path: FIXTURE_DIST,
      }),
    ).rejects.toThrow(/has no bundles/);
  });

  it('caveats explain best-effort nature so user knows to land model in corpus', async () => {
    process.env.EVOKERNEL_OFFLINE_ONLY = 'true';
    const result = await synthesizeTemporaryBundle({
      model: 'meta-llama/Llama-3.5-405B',
      hardware: 'fake-hw',
      dist_path: FIXTURE_DIST,
    });
    expect(result.caveats.some((c) => c.includes('SYNTHESIZED'))).toBe(true);
    expect(result.caveats.some((c) => c.includes('data/models/'))).toBe(true);
  });
});
