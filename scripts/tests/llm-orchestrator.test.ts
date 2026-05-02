/**
 * v3.4 — Layer G LLM-orchestrator unit tests.
 *
 * Tests the 4-mode dispatch (real / cache / test / skeleton) without making
 * actual API calls. CI runs in test mode (deterministic stubs); contributors
 * with API keys can manually run integration tests separately.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  generateProductionKernel,
  hashInput,
  pickLanguageForArch,
  type ProductionKernelInput,
  type AgentContextBundle,
} from '../agent-deploy/llm-orchestrator';

// Minimal-but-complete fake bundle for testing
const fakeBundle: AgentContextBundle = {
  model: { id: 'test-model', name: 'Test Model' },
  hardware: { id: 'test-hw', name: 'Test HW', generation: 'hopper' },
  vendor: { id: 'nvidia', name: 'NVIDIA' },
  applicable_ops: [
    {
      id: 'matmul',
      name: 'Matmul',
      category: 'matmul',
      formal_semantics: {
        signature: 'matmul(A: [M, K], B: [K, N]) -> C: [M, N]',
        edge_cases: [
          {
            input: 'M, N, K not multiples of tile size',
            behaviors: { all_libs: 'pad with zeros and mask output' },
            mitigation: 'tile alignment or boundary masking',
          },
        ],
        numerical_rules: [
          {
            aspect: 'accumulator_dtype',
            per_library: { all_libs: 'FP32 with BF16/FP16 inputs' },
          },
        ],
        reference_impl: {
          framework: 'pytorch',
          snippet: 'def matmul(A, B):\n    return A @ B',
        },
      },
    },
  ],
  applicable_fused_kernels: [],
  dsl_examples: [
    {
      id: 'cuda-tiled-gemm-hopper',
      language: 'cuda-cpp',
      arch_family: 'hopper',
      title: 'Hopper GEMM',
      code: '// hopper gemm code',
      arch_idioms: ['WGMMA', 'TMA'],
    },
  ],
  isa_primitives: [
    {
      id: 'nvidia-hopper-wgmma',
      arch_family: 'hopper',
      class: 'tensor-mma',
      cross_vendor_equivalents: [
        { vendor: 'amd', arch_family: 'cdna3', primitive_id: 'amd-cdna3-mfma' },
      ],
    },
  ],
  prior_learnings: [],
};

const fakeInput: ProductionKernelInput = {
  bundle: fakeBundle,
  op: 'matmul',
  target_arch: 'hopper',
};

describe('hashInput', () => {
  it('produces a stable 64-char hex hash for identical inputs', () => {
    const h1 = hashInput(fakeInput);
    const h2 = hashInput({ ...fakeInput });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different ops', () => {
    const a = hashInput(fakeInput);
    const b = hashInput({ ...fakeInput, op: 'rmsnorm' });
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different target arches', () => {
    const a = hashInput(fakeInput);
    const b = hashInput({ ...fakeInput, target_arch: 'cdna3' });
    expect(a).not.toBe(b);
  });

  it('considers prior_attempt_diagnostic as part of hash', () => {
    const a = hashInput(fakeInput);
    const b = hashInput({ ...fakeInput, prior_attempt_diagnostic: 'build failed' });
    expect(a).not.toBe(b);
  });
});

describe('pickLanguageForArch', () => {
  it.each([
    ['hopper', 'cuda-cpp'],
    ['blackwell', 'cuda-cpp'],
    ['ampere', 'cuda-cpp'],
    ['ada', 'cuda-cpp'],
    ['cdna3', 'hip'],
    ['cdna4', 'hip'],
    ['rdna4', 'hip'],
    ['ascend-da-vinci-3', 'ascend-c'],
    ['cambricon-mlu', 'bang-c'],
    ['moore-threads-musa-3', 'musa-c'],
    ['biren-vance', 'br-cuda'],
    ['hygon-cdna', 'hip'],
    ['apple-m5', 'metal'],
    ['m3-ultra', 'metal'],
    ['m4-max', 'metal'],
  ])('%s → %s', (arch, expected) => {
    expect(pickLanguageForArch(arch)).toBe(expected);
  });

  it('falls back to cuda-cpp for unknown arch', () => {
    expect(pickLanguageForArch('unknown-arch-xyz')).toBe('cuda-cpp');
  });
});

describe('generateProductionKernel — test mode (deterministic)', () => {
  beforeAll(() => {
    process.env.EVOKERNEL_TEST_MODE = 'true';
  });
  afterAll(() => {
    delete process.env.EVOKERNEL_TEST_MODE;
  });

  it('returns a deterministic test stub', async () => {
    const result = await generateProductionKernel(fakeInput);
    expect(result.source).toBe('test-stub');
    expect(result.language).toBe('cuda-cpp');
    expect(result.filename).toBe('matmul_hopper.cu');
    expect(result.code).toContain('TEST STUB');
    expect(result.code).toContain('matmul_test_stub');
    expect(result.generated_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('test stub is bit-stable across runs (deterministic for tests)', async () => {
    const r1 = await generateProductionKernel(fakeInput);
    const r2 = await generateProductionKernel(fakeInput);
    expect(r1.code).toBe(r2.code);
    expect(r1.prompt_hash).toBe(r2.prompt_hash);
    expect(r1.generated_at).toBe(r2.generated_at);
  });

  it('respects target_arch for language selection', async () => {
    const result = await generateProductionKernel({
      ...fakeInput,
      target_arch: 'ascend-da-vinci-3',
    });
    expect(result.language).toBe('ascend-c');
    expect(result.filename).toBe('matmul_ascend-da-vinci-3.cce');
  });

  it('respects op for filename', async () => {
    const result = await generateProductionKernel({ ...fakeInput, op: 'expert-permute' });
    expect(result.filename).toBe('expert-permute_hopper.cu');
    expect(result.code).toContain('expert_permute_test_stub');
  });
});

describe('generateProductionKernel — skeleton fallback (no API key, no test mode)', () => {
  beforeAll(() => {
    delete process.env.EVOKERNEL_TEST_MODE;
    delete process.env.EVOKERNEL_OFFLINE_ONLY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns skeleton-fallback when no API key and not test mode', async () => {
    // Use a unique op to avoid cache hits from prior test runs
    const result = await generateProductionKernel({ ...fakeInput, op: 'unique-skeleton-test-op' });
    expect(result.source).toBe('skeleton-fallback');
    expect(result.code).toContain('SKELETON FALLBACK');
    expect(result.review_notes.some((n) => n.includes('SKELETON FALLBACK'))).toBe(true);
  });
});

describe('generateProductionKernel — cache mode honors EVOKERNEL_OFFLINE_ONLY', () => {
  beforeAll(() => {
    process.env.EVOKERNEL_OFFLINE_ONLY = 'true';
    delete process.env.EVOKERNEL_TEST_MODE;
  });
  afterAll(() => {
    delete process.env.EVOKERNEL_OFFLINE_ONLY;
  });

  it('falls back to skeleton when cache mode is forced and no cache exists', async () => {
    const result = await generateProductionKernel({ ...fakeInput, op: 'unique-cache-test-op' });
    expect(['cache-hit', 'skeleton-fallback']).toContain(result.source);
  });
});
