/**
 * v3.5 — Layer V verification harness unit tests (structural mode only).
 *
 * Execution-mode tests are v3.6+ (require target hardware + compilers).
 * Structural mode runs everywhere — these are CI-safe.
 */

import { describe, expect, it } from 'vitest';
import { runVerification } from '../agent-deploy/verify';

// ─────────────────────────────────────────────────────────────────────────
// Real-ish CUDA samples — what an LLM should produce after v3.4
// ─────────────────────────────────────────────────────────────────────────

const goodAttentionCuda = `
#include <cuda_runtime.h>
#include <cuda_fp16.h>
#include <cuda/barrier>

__global__ void attention_kernel(const __half* Q, const __half* K, const __half* V, __half* O,
                                  int B, int H, int S, int D, float scale) {
    __shared__ __half k_smem[128][128];
    __shared__ __half v_smem[128][128];
    float m_old = -INFINITY;
    float s_old = 0.0f;
    float acc[128] = {0};

    for (int kt = 0; kt < S; kt += 128) {
        // cp.async.bulk K/V tile load
        // wgmma Q @ K^T
        asm volatile("wgmma.mma_async.sync.aligned.m64n128k16 ...");
        float qk[128];
        float m_new = m_old;
        for (int j = 0; j < 128; j++) m_new = fmaxf(m_new, qk[j]);
        float rescale = expf(m_old - m_new);
        s_old *= rescale;
        for (int j = 0; j < 128; j++) s_old += expf(qk[j] - m_new);
        for (int d = 0; d < 128; d++) acc[d] *= rescale;
        // wgmma p @ V into acc
        asm volatile("wgmma.mma_async.sync.aligned.m64n128k16 ...");
        m_old = m_new;
    }
}

void launch_attention(const __half* Q, const __half* K, const __half* V, __half* O,
                       int B, int H, int S, int D, float scale, cudaStream_t stream) {
    dim3 grid(S / 128, B * H);
    dim3 block(128);
    attention_kernel<<<grid, block, 0, stream>>>(Q, K, V, O, B, H, S, D, scale);
}
`;

const badSkeletonCuda = `
#include <cuda_runtime.h>

__global__ void matmul_kernel(...) {
    // TODO: implement this
    // pseudocode:
    //   for k in K: acc += A[k] * B[k]
}
`;

const goodRmsnormAscend = `
#include "kernel_operator.h"
using namespace AscendC;

template <typename T>
class RmsNormKernel {
public:
    __aicore__ inline void Process(uint32_t M, uint32_t N, float eps) {
        for (uint32_t row = 0; row < M; row++) {
            LocalTensor<T> xUB = inQueX.AllocTensor<T>();
            DataCopy(xUB, xGm[row * N], N);
            LocalTensor<float> xFp32 = scratchCast.Get<float>();
            Cast(xFp32, xUB, RoundMode::CAST_NONE, N);
            LocalTensor<float> sqBuf = scratchSqSum.Get<float>();
            Mul(sqBuf, xFp32, xFp32, N);
            ReduceSum(sqBuf, sqBuf, sqBuf, N);
            float sq_sum = sqBuf.GetValue(0);
            float rms = 1.0f / sqrtf(sq_sum / float(N) + eps);
            // ... apply rms ...
        }
    }
private:
    TPipe pipe;
    TQue<QuePosition::VECIN, 2> inQueX;
    TBuf<QuePosition::VECCALC> scratchSqSum;
    TBuf<QuePosition::VECCALC> scratchCast;
    GlobalTensor<T> xGm;
};

extern "C" __global__ __aicore__ void rmsnorm_kernel(GM_ADDR x, GM_ADDR weight, GM_ADDR y,
                                                       uint32_t M, uint32_t N, float eps) {
    RmsNormKernel<bfloat16_t> op;
    op.Process(M, N, eps);
}
`;

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('runVerification — structural mode', () => {
  it('passes a well-formed CUDA attention kernel', async () => {
    const result = await runVerification({
      code: goodAttentionCuda,
      language: 'cuda-cpp',
      op: 'attention',
      target_arch: 'hopper',
      numerical_rules: [
        {
          aspect: 'partial_sum_dtype',
          per_library: { all_libs: 'FP32 mandatory' },
        },
      ],
    });
    expect(result.overall).toBe('pass');
    expect(result.mode).toBe('structural');
    expect(result.v1_build.status).toBe('pass');
    expect(result.v2_correctness.status).toBe('pass');
    expect(result.v3_perf.status).toBe('pass');
    expect(result.summary_md).toContain('PASS');
  });

  it('fails a TODO/skeleton kernel on V1 build (no_todo check)', async () => {
    const result = await runVerification({
      code: badSkeletonCuda,
      language: 'cuda-cpp',
      op: 'matmul',
      target_arch: 'hopper',
    });
    expect(result.overall).toBe('fail');
    expect(result.v1_build.status).toBe('fail');
    const noTodoCheck = result.v1_build.structural_checks.find((c) => c.name === 'no_todo_or_pseudocode_markers');
    expect(noTodoCheck?.status).toBe('fail');
    expect(result.retry_diagnostic).toBeDefined();
    expect(result.retry_diagnostic).toContain('V1 build failed');
  });

  it('passes a well-formed Ascend-C RMSNorm kernel', async () => {
    const result = await runVerification({
      code: goodRmsnormAscend,
      language: 'ascend-c',
      op: 'rmsnorm',
      target_arch: 'ascend-da-vinci-3',
      numerical_rules: [
        {
          aspect: 'partial_sum_dtype',
          per_library: { all_libs: 'FP32 partial sum mandatory' },
        },
      ],
    });
    expect(result.overall).toBe('pass');
    expect(result.v2_correctness.checks.find((c) => c.name === 'norm_uses_fp32_partial_sum')?.status).toBe('pass');
    expect(result.v2_correctness.checks.find((c) => c.name === 'norm_has_reduction')?.status).toBe('pass');
    expect(result.v2_correctness.checks.find((c) => c.name === 'norm_has_rsqrt_or_div')?.status).toBe('pass');
  });

  it('flags missing FP32 partial sum on a BF16-only RMSNorm', async () => {
    const bf16OnlyRmsnorm = `
#include "kernel_operator.h"
__aicore__ inline void rmsnorm() {
    bfloat16_t sum = 0;
    // no FP32 cast, no reduction
    for (int i = 0; i < N; i++) sum += x[i] * x[i];
}
extern "C" __global__ __aicore__ void rmsnorm_kernel() {}
`;
    const result = await runVerification({
      code: bf16OnlyRmsnorm,
      language: 'ascend-c',
      op: 'rmsnorm',
      target_arch: 'ascend-da-vinci-3',
      numerical_rules: [
        { aspect: 'partial_sum_dtype', per_library: { all_libs: 'FP32 partial sum mandatory' } },
      ],
    });
    expect(result.overall).toBe('fail');
    const fp32Check = result.v2_correctness.checks.find((c) => c.name === 'norm_uses_fp32_partial_sum');
    expect(fp32Check?.status).toBe('fail');
  });

  it('detects attention online-softmax invariants when present', async () => {
    const result = await runVerification({
      code: goodAttentionCuda,
      language: 'cuda-cpp',
      op: 'attention',
      target_arch: 'hopper',
    });
    const checks = result.v2_correctness.checks;
    expect(checks.find((c) => c.name === 'attention_has_max_state')?.status).toBe('pass');
    expect(checks.find((c) => c.name === 'attention_has_sum_state')?.status).toBe('pass');
    expect(checks.find((c) => c.name === 'attention_state_is_fp32')?.status).toBe('pass');
    expect(checks.find((c) => c.name === 'attention_uses_exp')?.status).toBe('pass');
    expect(checks.find((c) => c.name === 'attention_has_rescale_pattern')?.status).toBe('pass');
  });

  it('flags missing rescale pattern on a naive attention impl', async () => {
    const naiveAttention = `
#include <cuda_runtime.h>
__global__ void naive_attn(const float* Q, const float* K, const float* V, float* O, int N) {
    // Materializes full attention matrix — no online softmax
    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            float s = 0;
            for (int d = 0; d < 128; d++) s += Q[i*128+d] * K[j*128+d];
            O[i*N+j] = s;
        }
    }
}
void launch_naive_attn() { naive_attn<<<1,1>>>(0,0,0,0,0); }
`;
    const result = await runVerification({
      code: naiveAttention,
      language: 'cuda-cpp',
      op: 'attention',
      target_arch: 'hopper',
    });
    const rescale = result.v2_correctness.checks.find((c) => c.name === 'attention_has_rescale_pattern');
    expect(rescale?.status).toBe('fail');
    const exp = result.v2_correctness.checks.find((c) => c.name === 'attention_uses_exp');
    expect(exp?.status).toBe('fail');
  });

  it('skips perf gate when V1 fails', async () => {
    const result = await runVerification({
      code: badSkeletonCuda,
      language: 'cuda-cpp',
      op: 'matmul',
      target_arch: 'hopper',
    });
    expect(result.v3_perf.status).toBe('skipped');
    expect(result.v3_perf.message).toMatch(/Earlier gate failed/i);
  });

  it('summary_md is well-formed Markdown with status icons', async () => {
    const result = await runVerification({
      code: goodAttentionCuda,
      language: 'cuda-cpp',
      op: 'attention',
      target_arch: 'hopper',
    });
    expect(result.summary_md).toMatch(/^# Verification/);
    expect(result.summary_md).toContain('| V1 — Build |');
    expect(result.summary_md).toContain('| V2 — Correctness |');
    expect(result.summary_md).toContain('| V3 — Perf |');
    expect(result.summary_md).toContain('✅');
  });

  it('detects collective-op invariants for allreduce', async () => {
    const allreduceCode = `
#include <nccl.h>
void launch_ar(float* buf, size_t N, ncclComm_t comm, cudaStream_t s) {
    ncclAllReduce(buf, buf, N, ncclFloat32, ncclSum, comm, s);
}
__global__ void noop() {}
`;
    const result = await runVerification({
      code: allreduceCode,
      language: 'cuda-cpp',
      op: 'allreduce',
      target_arch: 'hopper',
    });
    const collectiveCheck = result.v2_correctness.checks.find((c) => c.name === 'collective_call_present');
    expect(collectiveCheck?.status).toBe('pass');
  });

  it('returns retry_diagnostic when overall fails', async () => {
    const result = await runVerification({
      code: badSkeletonCuda,
      language: 'cuda-cpp',
      op: 'matmul',
      target_arch: 'hopper',
    });
    expect(result.retry_diagnostic).toBeDefined();
    // Diagnostic should be useful for Layer G retry
    expect(result.retry_diagnostic?.length).toBeGreaterThan(20);
  });
});
