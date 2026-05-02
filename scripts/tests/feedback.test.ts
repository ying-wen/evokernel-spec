/**
 * v3.6 — Layer F (feedback automation) unit tests.
 *
 * Tests the generate→verify→retry pipeline + agent-learning YAML synthesis.
 * Uses test-mode LLM orchestrator (no API calls); structural-mode verification.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { generateAndVerify, synthesizeAgentLearning } from '../agent-deploy/feedback';
import type { AgentContextBundle, ProductionKernelInput } from '../agent-deploy/llm-orchestrator';
import type { VerifyResult } from '../agent-deploy/verify';

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
        edge_cases: [],
        numerical_rules: [
          { aspect: 'accumulator_dtype', per_library: { all_libs: 'FP32 with BF16 inputs' } },
        ],
        reference_impl: { framework: 'pytorch', snippet: 'def matmul(A, B): return A @ B' },
      },
    },
  ],
  applicable_fused_kernels: [],
  dsl_examples: [],
  isa_primitives: [],
  prior_learnings: [],
};

const fakeGenInput: ProductionKernelInput = {
  bundle: fakeBundle,
  op: 'matmul',
  target_arch: 'hopper',
};

describe('generateAndVerify — test mode (deterministic stubs)', () => {
  beforeAll(() => {
    process.env.EVOKERNEL_TEST_MODE = 'true';
  });
  afterAll(() => {
    delete process.env.EVOKERNEL_TEST_MODE;
  });

  it('runs at least 1 attempt and returns a structured result', async () => {
    const result = await generateAndVerify({
      generation: fakeGenInput,
      verification: {},
    });
    expect(result.attempts.length).toBeGreaterThanOrEqual(1);
    expect(result.kernel).toBeDefined();
    expect(result.verification).toBeDefined();
    expect(result.outcome).toMatch(/^(shipped|partial|kernel-gap-blocked)$/);
  });

  it('test stub fails verification (intentional — stub is not real code)', async () => {
    // Test stubs are __device__ void test_stub(){} — has no real op
    // implementation. V2 correctness (op-class invariants for matmul) will fail
    // because there's no MMA, no FP32 acc, no K-loop.
    const result = await generateAndVerify({
      generation: fakeGenInput,
      verification: {},
      max_retries: 2,
    });
    expect(result.kernel.source).toBe('test-stub');
    // Outcome is kernel-gap-blocked because all 2 retries produce same stub
    expect(result.outcome).toBe('kernel-gap-blocked');
  });

  it('attempt history is recorded with diagnostics', async () => {
    const result = await generateAndVerify({
      generation: fakeGenInput,
      verification: {},
      max_retries: 2,
    });
    expect(result.attempts[0].attempt_number).toBe(1);
    expect(result.attempts[0].kernel_source).toBe('test-stub');
    expect(result.attempts[0].verify_status).toBe('fail');
    expect(result.attempts[0].diagnostic).toBeDefined();
  });

  it('respects max_retries (caps attempts)', async () => {
    const result = await generateAndVerify({
      generation: fakeGenInput,
      verification: {},
      max_retries: 1,
    });
    expect(result.attempts.length).toBe(1);
  });
});

describe('synthesizeAgentLearning — YAML output shape', () => {
  it('produces YAML with required top-level fields', () => {
    const yaml = synthesizeAgentLearning({
      input: { generation: fakeGenInput, verification: {} },
      finalKernel: {
        filename: 'matmul_hopper.cu',
        language: 'cuda-cpp',
        code: '...',
        source: 'llm-generated',
        generated_at: '2026-05-03T00:00:00Z',
        prompt_hash: 'abc123',
        references_used: ['cuda-tiled-gemm-hopper'],
        review_notes: [],
      },
      finalVerify: {
        overall: 'pass',
        mode: 'structural',
        v1_build: { status: 'pass', message: 'ok', structural_checks: [], duration_ms: 0 },
        v2_correctness: { status: 'pass', message: 'ok', checks: [], duration_ms: 0 },
        v3_perf: { status: 'pass', message: 'ok', checks: [], duration_ms: 0 },
        summary_md: '',
        duration_ms: 0,
      },
      attempts: [{ attempt_number: 1, kernel_source: 'llm-generated', verify_status: 'pass', diagnostic: undefined }],
      outcome: 'shipped',
    });
    expect(yaml).toMatch(/^id:\s+test-model-matmul-on-test-hw-/);
    expect(yaml).toContain('agent_run_at:');
    expect(yaml).toContain('model_id: test-model');
    expect(yaml).toContain('hardware_id: test-hw');
    expect(yaml).toContain('outcome: shipped');
    expect(yaml).toContain('observations:');
    expect(yaml).toContain('triage_status: open');
    expect(yaml).toContain('perf_delta:');
  });

  it('emits success-pattern observation on first-attempt success', () => {
    const yaml = synthesizeAgentLearning({
      input: { generation: fakeGenInput, verification: {} },
      finalKernel: {
        filename: 'matmul_hopper.cu',
        language: 'cuda-cpp',
        code: '...',
        source: 'llm-generated',
        generated_at: '2026-05-03T00:00:00Z',
        prompt_hash: 'abc123',
        references_used: ['cuda-tiled-gemm-hopper'],
        review_notes: [],
      },
      finalVerify: {
        overall: 'pass',
        mode: 'structural',
        v1_build: { status: 'pass', message: 'ok', structural_checks: [], duration_ms: 0 },
        v2_correctness: { status: 'pass', message: 'ok', checks: [], duration_ms: 0 },
        v3_perf: { status: 'pass', message: 'ok', checks: [], duration_ms: 0 },
        summary_md: '',
        duration_ms: 0,
      },
      attempts: [{ attempt_number: 1, kernel_source: 'llm-generated', verify_status: 'pass', diagnostic: undefined }],
      outcome: 'shipped',
    });
    expect(yaml).toContain('kind: success-pattern');
    expect(yaml).toContain('on first attempt');
  });

  it('emits kernel-gap observation on V1 build failure', () => {
    const yaml = synthesizeAgentLearning({
      input: { generation: fakeGenInput, verification: {} },
      finalKernel: {
        filename: 'matmul_hopper.cu',
        language: 'cuda-cpp',
        code: '...',
        source: 'llm-generated',
        generated_at: '2026-05-03T00:00:00Z',
        prompt_hash: 'abc123',
        references_used: [],
        review_notes: [],
      },
      finalVerify: {
        overall: 'fail',
        mode: 'structural',
        v1_build: {
          status: 'fail',
          message: 'compilation failed',
          structural_checks: [{ name: 'no_todo_or_pseudocode_markers', status: 'fail', message: 'has TODO' }],
          compiler_diagnostic: 'error: TODO found',
          duration_ms: 0,
        },
        v2_correctness: { status: 'skipped', message: 'skipped', checks: [], duration_ms: 0 },
        v3_perf: { status: 'skipped', message: 'skipped', checks: [], duration_ms: 0 },
        summary_md: '',
        retry_diagnostic: 'V1 build failed',
        duration_ms: 0,
      },
      attempts: [{ attempt_number: 1, kernel_source: 'llm-generated', verify_status: 'fail', diagnostic: 'V1 failed' }],
      outcome: 'kernel-gap-blocked',
    });
    expect(yaml).toContain('kind: kernel-gap');
    expect(yaml).toContain('outcome: kernel-gap-blocked');
    expect(yaml).toContain('Layer V V1 build gate failed');
  });

  it('emits numerical-mismatch observation on V2 correctness failure', () => {
    const yaml = synthesizeAgentLearning({
      input: { generation: fakeGenInput, verification: {} },
      finalKernel: {
        filename: 'matmul_hopper.cu',
        language: 'cuda-cpp',
        code: '...',
        source: 'llm-generated',
        generated_at: '2026-05-03T00:00:00Z',
        prompt_hash: 'abc123',
        references_used: [],
        review_notes: [],
      },
      finalVerify: {
        overall: 'fail',
        mode: 'structural',
        v1_build: { status: 'pass', message: 'ok', structural_checks: [], duration_ms: 0 },
        v2_correctness: {
          status: 'fail',
          message: 'correctness checks failed',
          checks: [{ name: 'gemm_uses_fp32_accumulator', status: 'fail', message: 'no FP32 found' }],
          duration_ms: 0,
        },
        v3_perf: { status: 'skipped', message: 'skipped', checks: [], duration_ms: 0 },
        summary_md: '',
        retry_diagnostic: 'V2 failed',
        duration_ms: 0,
      },
      attempts: [{ attempt_number: 1, kernel_source: 'llm-generated', verify_status: 'fail', diagnostic: 'V2 failed' }],
      outcome: 'kernel-gap-blocked',
    });
    expect(yaml).toContain('kind: numerical-mismatch');
    expect(yaml).toContain('Layer V V2 correctness gate failed');
  });

  it('id is generated as <model>-<op>-on-<hw>-<date>', () => {
    const yaml = synthesizeAgentLearning({
      input: { generation: fakeGenInput, verification: {} },
      finalKernel: {
        filename: 'matmul_hopper.cu',
        language: 'cuda-cpp',
        code: '...',
        source: 'llm-generated',
        generated_at: '2026-05-03T00:00:00Z',
        prompt_hash: 'abc123',
        references_used: [],
        review_notes: [],
      },
      finalVerify: {
        overall: 'pass',
        mode: 'structural',
        v1_build: { status: 'pass', message: 'ok', structural_checks: [], duration_ms: 0 },
        v2_correctness: { status: 'pass', message: 'ok', checks: [], duration_ms: 0 },
        v3_perf: { status: 'pass', message: 'ok', checks: [], duration_ms: 0 },
        summary_md: '',
        duration_ms: 0,
      },
      attempts: [{ attempt_number: 1, kernel_source: 'llm-generated', verify_status: 'pass', diagnostic: undefined }],
      outcome: 'shipped',
    });
    // Match pattern: test-model-matmul-on-test-hw-YYYY-MM-DD
    expect(yaml).toMatch(/^id:\s+test-model-matmul-on-test-hw-\d{4}-\d{2}-\d{2}\b/);
  });
});
