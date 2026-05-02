/**
 * Kernel codegen module (v2.16).
 *
 * Takes the kernel_gaps detected by the planning agent and emits actual
 * compileable kernel skeleton code for the target hardware ISA, using:
 *   - ISA primitive cross_vendor_equivalents (which target-arch primitive
 *     replaces the source-arch one, with the documented mapping ratio)
 *   - DSL examples (target arch's programming model, e.g. Ascend-C TPipe/TQue)
 *   - Operator formal_semantics (numerical rules + edge case handling)
 *
 * The output is a starting-point kernel skeleton — NOT production-ready code.
 * It captures the structural pattern (memory hierarchy staging, async primitives,
 * tile shapes, edge case guards) and leaves TODO_OPTIMIZE markers where
 * autotuning is required. An LLM agent + human engineer iterates on this base.
 *
 * This is the "missing piece" between coverage-matrix gap detection and a
 * runnable kernel. Without this, the agent can flag what's missing but
 * cannot generate code.
 */

interface KernelGap {
  op: string;
  missing_on: string;
  suggestion: string;
}

interface IsaPrimitive {
  id: string;
  vendor: string;
  arch_family: string;
  class: string;
  cross_vendor_equivalents: Array<{
    vendor: string;
    arch_family: string;
    primitive_id: string;
    mapping_ratio?: string;
    notes?: string;
  }>;
}

interface DslExample {
  id: string;
  language: string;
  vendor: string;
  arch_family: string;
  category: string;
  code: string;
  arch_idioms: string[];
}

interface Operator {
  id: string;
  name: string;
  category: string;
  formal_semantics?: {
    signature?: string;
    edge_cases?: Array<{ input: string; behaviors: Record<string, string>; mitigation?: string }>;
    numerical_rules?: Array<{ aspect: string; per_library: Record<string, string> }>;
  };
}

/** Map a target hardware arch to (DSL language, recommended ISA primitive class). */
function archToDsl(arch_family: string): { language: string; example_id_prefix: string } {
  if (arch_family === 'hopper' || arch_family === 'blackwell' || arch_family === 'ampere' || arch_family === 'ada') {
    return { language: 'cuda-cpp', example_id_prefix: 'cuda-' };
  }
  if (arch_family === 'cdna3' || arch_family === 'cdna4' || arch_family === 'rdna3') {
    return { language: 'hip', example_id_prefix: 'hip-' };
  }
  if (arch_family.startsWith('ascend-')) return { language: 'ascend-c', example_id_prefix: 'ascend-c-' };
  if (arch_family.startsWith('cambricon')) return { language: 'bang-c', example_id_prefix: 'bang-c-' };
  if (arch_family.startsWith('moore-threads')) return { language: 'musa-c', example_id_prefix: 'musa-c-' };
  if (arch_family.startsWith('biren')) return { language: 'br-cuda', example_id_prefix: 'br-' };
  if (arch_family.startsWith('hygon')) return { language: 'hip', example_id_prefix: 'hip-' };
  if (arch_family.startsWith('apple')) return { language: 'metal', example_id_prefix: 'metal-' };
  return { language: 'unknown', example_id_prefix: '' };
}

/** Find best primitive equivalent for porting from source arch to target arch. */
function findEquivalent(
  primitives: IsaPrimitive[],
  source_arch: string,
  target_arch: string,
  preferred_class: string = 'tensor-mma'
): { source: IsaPrimitive; target: IsaPrimitive; mapping_ratio?: string; notes?: string } | null {
  const sources = primitives.filter((p) => p.arch_family === source_arch && p.class === preferred_class);
  for (const src of sources) {
    const eq = src.cross_vendor_equivalents.find((e) => e.arch_family === target_arch);
    if (eq) {
      const tgt = primitives.find((p) => p.id === eq.primitive_id);
      if (tgt) return { source: src, target: tgt, mapping_ratio: eq.mapping_ratio, notes: eq.notes };
    }
  }
  return null;
}

export interface KernelCodegenInput {
  gaps: KernelGap[];
  target_arch: string;
  primitives: IsaPrimitive[];
  dsl_examples: DslExample[];
  operators: Operator[];
}

export interface GeneratedKernel {
  op: string;
  filename: string;
  language: string;
  code: string;
  /** Notes for the human / agent reviewing the generated code. */
  review_notes: string[];
}

export function generateKernels(input: KernelCodegenInput): GeneratedKernel[] {
  const { gaps, target_arch, primitives, dsl_examples, operators } = input;
  const { language, example_id_prefix } = archToDsl(target_arch);

  const generated: GeneratedKernel[] = [];

  for (const gap of gaps) {
    const op = operators.find((o) => o.id === gap.op);
    // Try to find a matching DSL example for the same op-class on target arch
    const example = dsl_examples.find(
      (d) => d.arch_family === target_arch && (d.id.startsWith(example_id_prefix))
    ) ?? dsl_examples.find((d) => d.language === language) ?? dsl_examples[0];

    // Find a primitive cross-vendor mapping (Hopper → target_arch typically)
    const equiv = findEquivalent(primitives, 'hopper', target_arch)
      ?? findEquivalent(primitives, 'cdna3', target_arch)
      ?? findEquivalent(primitives, 'ampere', target_arch);

    generated.push({
      op: gap.op,
      filename: `${gap.op}_${target_arch}.${extension(language)}`,
      language,
      code: emitKernelSkeleton(gap, op, target_arch, language, example, equiv),
      review_notes: [
        `Generated from kernel_gaps for op "${gap.op}" on ${target_arch}.`,
        equiv ? `Source primitive: ${equiv.source.id} → target primitive: ${equiv.target.id} (${equiv.mapping_ratio ?? 'no ratio doc'}).` : `No cross-vendor primitive equivalence found — base template is generic.`,
        op?.formal_semantics?.numerical_rules?.length
          ? `Critical numerical rules: ${op.formal_semantics.numerical_rules.map((r) => r.aspect).join(', ')}. See /operators/${gap.op}/ formal_semantics block.`
          : `No formal_semantics documented yet for ${gap.op} — review source kernel for invariants.`,
        example
          ? `Reference DSL example: /dev-toolkit/dsl-examples/${example.id}/`
          : `No DSL example matched — see /dev-toolkit/ for general patterns.`,
        `TODO: tile shape autotuning. Output skeleton uses M=128 N=128 K=64 placeholder.`,
        `TODO: numerical edge cases. Verify behavior matches /operators/${gap.op}/ formal_semantics.edge_cases against unit tests.`,
        `TODO: profile with target-arch profiler (NCU / rocprof / msprof / cnperf / suprof) before shipping.`
      ]
    });
  }

  return generated;
}

function extension(language: string): string {
  switch (language) {
    case 'cuda-cpp': return 'cu';
    case 'hip': return 'cpp';
    case 'ascend-c': return 'cce';
    case 'bang-c': return 'mlu';
    case 'musa-c': return 'mu';
    case 'br-cuda': return 'br.cu';
    case 'metal': return 'metal';
    default: return 'cpp';
  }
}

function emitKernelSkeleton(
  gap: KernelGap,
  op: Operator | undefined,
  target_arch: string,
  language: string,
  example: DslExample | undefined,
  equiv: { source: IsaPrimitive; target: IsaPrimitive; mapping_ratio?: string; notes?: string } | null
): string {
  const header = `// ============================================================
// Generated kernel skeleton: ${gap.op} on ${target_arch}
// Generated by evokernel-spec/scripts/agent-deploy/kernel-codegen
//
// THIS IS A STARTING POINT — NOT PRODUCTION-READY CODE.
// Your job: fill in the TODO markers, validate against
// formal_semantics edge cases, profile, then ship.
// ============================================================
//
// Source op: ${gap.op}${op ? ` (${op.name})` : ''}
${op?.formal_semantics?.signature ? '// Signature:\n//   ' + op.formal_semantics.signature.split('\n').join('\n//   ') : ''}
//
// Cross-vendor primitive mapping:
${equiv ? `//   ${equiv.source.id} → ${equiv.target.id}\n//   Mapping ratio: ${equiv.mapping_ratio ?? 'not documented'}\n//   Notes: ${equiv.notes ?? 'see /isa-primitives/' + equiv.target.id + '/'}` : '//   No cross-vendor mapping found — base template only'}
//
// DSL reference example: ${example ? '/dev-toolkit/dsl-examples/' + example.id + '/' : 'none — see /dev-toolkit/'}
//
// ============================================================

`;

  if (language === 'cuda-cpp') {
    return header + `#include <cuda_runtime.h>
#include <cuda_fp16.h>
#include <cuda/std/mma>
#include <cuda/barrier>

template<int BM=128, int BN=128, int BK=64>
__global__ void ${gap.op.replace(/-/g, '_')}_kernel(
    const __half* __restrict__ A,
    const __half* __restrict__ B,
    __half* __restrict__ C,
    int M, int N, int K
    /* TODO: add op-specific args (mask, scale, etc.) */) {
    // Shared memory tiles (TODO: tune sizes per Hopper L2 / Blackwell larger SMEM)
    __shared__ __align__(128) __half a_smem[2][BM][BK];
    __shared__ __align__(128) __half b_smem[2][BK][BN];
    __shared__ cuda::barrier<cuda::thread_scope_block> bar[2];

    int tile_m = blockIdx.y * BM;
    int tile_n = blockIdx.x * BN;

    // TODO: TMA descriptor loading (Hopper+) — see ${equiv?.target.id ?? 'isa-primitives'}
    if (threadIdx.x == 0) {
        init(&bar[0], blockDim.x);
        init(&bar[1], blockDim.x);
        // TODO: cp_async_bulk_tensor_2d_global_to_shared(&a_smem[0], ...);
    }
    __syncthreads();

    float acc[BM/64][BN/8] = {0};

    for (int k_tile = 0; k_tile < K; k_tile += BK) {
        bar[k_tile % 2].arrive_and_wait();

        // TODO: emit ${equiv?.target.id ?? 'WGMMA'} matmul here
        // Example: wgmma.mma_async.sync.aligned.m64n128k16 ...
        asm volatile("wgmma.fence.sync.aligned;");
        // ... mma instructions ...
        asm volatile("wgmma.commit_group.sync.aligned;");

        // TODO: pre-load next K-tile (double-buffered async pipelining)
        asm volatile("wgmma.wait_group.sync.aligned 0;");
    }

    // ============================================================
    // EPILOGUE — TODO: implement op-specific epilogue
    //   - For ${op?.category ?? 'unknown'} ops, this is where activation /
    //     normalization / quantization happens
    //   - Check formal_semantics.numerical_rules for accumulation_dtype
    //     ${op?.formal_semantics?.numerical_rules?.[0]?.aspect ? `(specifically: ${op.formal_semantics.numerical_rules[0].aspect})` : ''}
    // ============================================================

    // TODO: vectorized store back to C
}

// ============================================================
// Host-side dispatcher
// ============================================================

void launch_${gap.op.replace(/-/g, '_')}(
    const __half* A, const __half* B, __half* C,
    int M, int N, int K, cudaStream_t stream) {
    dim3 grid((N + 127) / 128, (M + 127) / 128);
    dim3 block(128 /* warp-group = 4 warps */);
    ${gap.op.replace(/-/g, '_')}_kernel<<<grid, block, 0, stream>>>(A, B, C, M, N, K);
}

// ============================================================
// Build:
//   nvcc -arch=sm_90a -O3 -std=c++17 ${gap.op.replace(/-/g, '_')}_${target_arch}.cu
// Profile:
//   ncu --set full --target-processes all -o report.ncu-rep ./test_kernel
// ============================================================
`;
  }

  if (language === 'ascend-c') {
    return header + `#include "kernel_operator.h"
using namespace AscendC;

// Ascend-C kernel skeleton for ${gap.op}
// Memory hierarchy: GM → UB → L1 → L0 (explicit DMA staging)
// Pipeline: TPipe + TQue<VECIN/VECOUT> orchestrates Cube + Vector + Scalar units

template <typename ATYPE, typename BTYPE, typename CTYPE>
class ${gap.op.replace(/[-]/g, '_')}_Kernel {
public:
    __aicore__ inline void Init(GM_ADDR a, GM_ADDR b, GM_ADDR c,
                                 uint32_t M, uint32_t N, uint32_t K) {
        aGm.SetGlobalBuffer((__gm__ ATYPE*)a, M * K);
        bGm.SetGlobalBuffer((__gm__ BTYPE*)b, K * N);
        cGm.SetGlobalBuffer((__gm__ CTYPE*)c, M * N);

        // Allocate UB buffers — double-buffered for Cube/Vector overlap
        pipe.InitBuffer(inQueueA, BUFFER_NUM, BM * BK * sizeof(ATYPE));
        pipe.InitBuffer(inQueueB, BUFFER_NUM, BK * BN * sizeof(BTYPE));
        pipe.InitBuffer(outQueueC, BUFFER_NUM, BM * BN * sizeof(CTYPE));
    }

    __aicore__ inline void Process(uint32_t M, uint32_t N, uint32_t K) {
        // TODO: replace WGMMA pattern with Cube unit ops
        //   Mapping: ${equiv?.mapping_ratio ?? '1× WGMMA m64n64k16 ≈ 4× Cube 16x16x16'}
        for (uint32_t m = 0; m < M; m += BM) {
            for (uint32_t n = 0; n < N; n += BN) {
                for (uint32_t k = 0; k < K; k += BK) {
                    // Stage 1: GM → UB (async DMA via TQue)
                    LocalTensor<ATYPE> aUB = inQueueA.AllocTensor<ATYPE>();
                    LocalTensor<BTYPE> bUB = inQueueB.AllocTensor<BTYPE>();
                    DataCopy(aUB, aGm[m * K + k], BM * BK);
                    DataCopy(bUB, bGm[k * N + n], BK * BN);
                    inQueueA.EnQue(aUB);
                    inQueueB.EnQue(bUB);

                    // Stage 2: Cube unit MMA — accumulate
                    LocalTensor<ATYPE> aL1 = inQueueA.DeQue<ATYPE>();
                    LocalTensor<BTYPE> bL1 = inQueueB.DeQue<BTYPE>();
                    LocalTensor<CTYPE> cReg = outQueueC.AllocTensor<CTYPE>();

                    // TODO: Cube MMA call — 16x16x16 base, accumulate K-tile
                    Mmad(cReg, aL1, bL1, BM, BN, BK);

                    outQueueC.EnQue(cReg);
                    inQueueA.FreeTensor(aL1);
                    inQueueB.FreeTensor(bL1);
                }
                // Stage 3: Vector unit epilogue (if needed)
                LocalTensor<CTYPE> cOut = outQueueC.DeQue<CTYPE>();
                // TODO: Vector unit applies activation / normalization here.
                //   Critical: ${op?.formal_semantics?.numerical_rules?.[0]?.aspect ?? 'check formal_semantics for FP32 accumulation rule'}
                DataCopy(cGm[m * N + n], cOut, BM * BN);
                outQueueC.FreeTensor(cOut);
            }
        }
    }

private:
    static constexpr uint32_t BM = 128, BN = 128, BK = 16;
    static constexpr uint32_t BUFFER_NUM = 2;
    TPipe pipe;
    TQue<QuePosition::VECIN, BUFFER_NUM> inQueueA, inQueueB;
    TQue<QuePosition::VECOUT, BUFFER_NUM> outQueueC;
    GlobalTensor<ATYPE> aGm;
    GlobalTensor<BTYPE> bGm;
    GlobalTensor<CTYPE> cGm;
};

// ============================================================
// Build:
//   cce_kernel_compile --soc=Ascend910C ${gap.op.replace(/[-]/g, '_')}.cpp -o ${gap.op}.kernel
// Profile:
//   msprof --aic-metrics=CubeUtilization,VectorUtilization --aiv=on --output=./prof ./test_kernel
//
// Cross-validate output against CUDA equivalent — see /operators/${gap.op}/
// formal_semantics.edge_cases and /isa-primitives/${equiv?.source.id ?? 'nvidia-hopper-wgmma'}/ for source.
// ============================================================
`;
  }

  if (language === 'hip') {
    return header + `#include <hip/hip_runtime.h>
#include <hip/hip_fp16.h>
#include <rocwmma/rocwmma.hpp>

using namespace rocwmma;

// HIP / CDNA3+ kernel skeleton for ${gap.op}
// Wave-level (64 threads) MFMA — sync, no async equivalent

template<int BM=128, int BN=128, int BK=32>
__global__ void ${gap.op.replace(/-/g, '_')}_kernel(
    const __half* __restrict__ A, const __half* __restrict__ B,
    float* __restrict__ C, int M, int N, int K) {
    __shared__ __half a_lds[2][BM * BK];
    __shared__ __half b_lds[2][BK * BN];

    int tile_m = blockIdx.y * BM;
    int tile_n = blockIdx.x * BN;

    // ${equiv?.source.id ?? 'WGMMA'} → ${equiv?.target.id ?? 'MFMA-32x32x16'}
    // ${equiv?.mapping_ratio ?? 'mapping ratio not documented'}
    // ${equiv?.notes ?? ''}

    // Use rocWMMA fragment API (CDNA3+)
    fragment<accumulator, 32, 32, 16, float> c_frag;
    fragment<matrix_a, 32, 32, 16, __half, row_major> a_frag;
    fragment<matrix_b, 32, 32, 16, __half, col_major> b_frag;
    fill_fragment(c_frag, 0.0f);

    for (int k_outer = 0; k_outer < K; k_outer += BK) {
        // TODO: LDS_DIRECT load via buffer_load_lds_dword
        int buf = (k_outer / BK) % 2;
        for (int i = threadIdx.x; i < BM * BK; i += blockDim.x) {
            a_lds[buf][i] = A[(tile_m + i / BK) * K + k_outer + i % BK];
        }
        __syncthreads();

        // Wave-level MFMA — sync, accumulates in c_frag
        load_matrix_sync(a_frag, a_lds[buf], BK);
        load_matrix_sync(b_frag, b_lds[buf], BN);
        mma_sync(c_frag, a_frag, b_frag, c_frag);
        __syncthreads();
    }

    // TODO: Epilogue — store c_frag back to C
    // Critical: ${op?.formal_semantics?.numerical_rules?.[0]?.aspect ?? 'check formal_semantics'}
}

// ============================================================
// Build:
//   amdclang++ --offload-arch=gfx942 -O3 -lrocwmma ${gap.op}_${target_arch}.cpp
// Profile:
//   rocprof --stats --hsa-trace -o trace.csv ./test_kernel
// ============================================================
`;
  }

  // Fallback for less-supported languages
  return header + `// ============================================================
// Generic kernel skeleton — ${language} on ${target_arch}
// Refer to DSL example: ${example?.id ?? 'see /dev-toolkit/dsl-examples/'}
// Cross-vendor primitive: ${equiv?.target.id ?? 'see /isa-primitives/'}
// ============================================================

// TODO: implement ${gap.op} for ${target_arch}
// Reference op signature:
${op?.formal_semantics?.signature ? '//   ' + op.formal_semantics.signature.split('\n').join('\n//   ') : '//   (no formal_semantics signature documented)'}

// TODO: tile shape, pipeline staging, edge cases (see formal_semantics.edge_cases)
`;
}
