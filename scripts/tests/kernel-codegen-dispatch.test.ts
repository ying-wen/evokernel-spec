/**
 * v2.18 — op-class-aware kernel-codegen dispatch tests.
 *
 * Verifies that each op-class produces a structurally different inner loop:
 *   - gemm → "wgmma.mma_async" instructions
 *   - attention → "online softmax" comment + (m, s, acc) state mention
 *   - norm → "row reduction" + "rsqrtf" + "row_rms"
 *   - scatter-permute → "atomicAdd(&expert_counter" + "warp-level radix sort"
 *
 * If any assertion fails, the dispatch regressed (or you intentionally changed
 * the canonical inner-loop comments, in which case update both the codegen
 * comment template and the assertion below).
 */

import { describe, expect, it } from 'vitest';
import { classifyOp, generateKernels } from '../agent-deploy/kernel-codegen';

const fakeIsaPrimitives = [
  {
    id: 'nvidia-hopper-wgmma',
    vendor: 'nvidia',
    arch_family: 'hopper',
    class: 'tensor-mma',
    cross_vendor_equivalents: [
      {
        vendor: 'huawei',
        arch_family: 'ascend-da-vinci-3',
        primitive_id: 'huawei-ascend-cube',
        mapping_ratio: '1× WGMMA m64n64k16 ≈ 4× Cube 16x16x16',
        notes: 'Ascend Cube unit MMA',
      },
    ],
  },
];

const fakeOps = [
  { id: 'matmul', name: 'Matmul', category: 'matmul' },
  { id: 'attention', name: 'Attention', category: 'attention' },
  { id: 'rmsnorm', name: 'RMSNorm', category: 'normalization' },
  { id: 'expert-permute', name: 'Expert Permute', category: 'communication' },
];

const fakeDslExamples = [
  {
    id: 'cuda-tiled-gemm-hopper',
    language: 'cuda-cpp',
    vendor: 'nvidia',
    arch_family: 'hopper',
    category: 'memory-pipeline',
    code: '// stub',
    arch_idioms: [],
  },
];

describe('classifyOp', () => {
  it('classifies matmul as gemm', () => {
    expect(classifyOp('matmul')).toBe('gemm');
    expect(classifyOp('grouped-matmul')).toBe('gemm');
  });

  it('classifies attention ops correctly', () => {
    expect(classifyOp('attention')).toBe('attention');
    expect(classifyOp('mla-attention')).toBe('attention');
    expect(classifyOp('paged-attention-decode')).toBe('attention');
  });

  it('classifies norm ops correctly', () => {
    expect(classifyOp('rmsnorm')).toBe('norm');
    expect(classifyOp('layer-norm')).toBe('norm');
    expect(classifyOp('softmax')).toBe('norm');
  });

  it('classifies scatter/permute ops correctly', () => {
    expect(classifyOp('expert-permute')).toBe('scatter-permute');
    expect(classifyOp('index-put')).toBe('scatter-permute');
    expect(classifyOp('embedding-lookup')).toBe('scatter-permute');
  });

  it('falls back via category hint when op-id is not in any explicit set', () => {
    expect(classifyOp('some-unknown-attn-variant', { id: 'x', name: 'X', category: 'attention' })).toBe('attention');
    expect(classifyOp('unknown-norm-variant', { id: 'x', name: 'X', category: 'normalization' })).toBe('norm');
  });

  it('returns default when op-id unknown and no category', () => {
    expect(classifyOp('totally-unknown-op')).toBe('default');
  });
});

describe('generateKernels — op-class-specialized inner loops (CUDA)', () => {
  function generate(opId: string) {
    const result = generateKernels({
      gaps: [{ op: opId, missing_on: 'hopper', suggestion: 'port from hopper' }],
      target_arch: 'hopper',
      primitives: fakeIsaPrimitives,
      operators: fakeOps,
      dsl_examples: fakeDslExamples,
    });
    expect(result).toHaveLength(1);
    return result[0];
  }

  it('gemm body emits wgmma instructions', () => {
    const k = generate('matmul');
    expect(k.code).toMatch(/wgmma\.mma_async/);
    expect(k.code).toMatch(/wgmma\.commit_group/);
    expect(k.review_notes.find((n) => n.includes('Op class:'))).toContain('gemm');
  });

  it('attention body emits online-softmax pattern', () => {
    const k = generate('attention');
    expect(k.code).toMatch(/ATTENTION INNER LOOP/);
    expect(k.code).toMatch(/online softmax/i);
    expect(k.code).toMatch(/m_old/);
    expect(k.code).toMatch(/m_new/);
    expect(k.review_notes.find((n) => n.includes('Op class:'))).toContain('attention');
    expect(k.review_notes.find((n) => n.includes('online softmax'))).toBeDefined();
  });

  it('norm body emits row reduction + rsqrtf', () => {
    const k = generate('rmsnorm');
    expect(k.code).toMatch(/NORM INNER LOOP/);
    expect(k.code).toMatch(/row reduction/);
    expect(k.code).toMatch(/rsqrtf/);
    expect(k.code).toMatch(/thread_sq_sum/);
    expect(k.review_notes.find((n) => n.includes('Op class:'))).toContain('norm');
  });

  it('scatter-permute body emits index-driven scatter, no MMA', () => {
    const k = generate('expert-permute');
    expect(k.code).toMatch(/SCATTER-PERMUTE INNER LOOP/);
    expect(k.code).toMatch(/atomicAdd/);
    expect(k.code).toMatch(/expert_counter/);
    expect(k.code).toMatch(/no MMA/);
    expect(k.review_notes.find((n) => n.includes('Op class:'))).toContain('scatter-permute');
    expect(k.review_notes.find((n) => n.includes('dead code'))).toBeDefined();
  });

  it('produces structurally different bodies for each op-class', () => {
    const gemm = generate('matmul').code;
    const attn = generate('attention').code;
    const norm = generate('rmsnorm').code;
    const scatter = generate('expert-permute').code;

    // No two bodies should be identical
    const bodies = [gemm, attn, norm, scatter];
    const uniqueBodies = new Set(bodies);
    expect(uniqueBodies.size).toBe(4);
  });
});
