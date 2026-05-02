import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * DSL Example (v2.7 / Layer B made concrete).
 *
 * Hello-world / canonical examples in each kernel programming language
 * (CUDA / Ascend-C / HIP / BANG-C / MUSA-C / Triton / Metal / WMMA).
 * Shows what a "real" kernel looks like in each DSL — explicit memory
 * orchestration on Ascend / wave-level on AMD / template-heavy in
 * CUTLASS / etc.
 *
 * The point: an agent that knows "use Ascend-C for Huawei" still needs
 * to see what valid Ascend-C kernel STRUCTURE looks like. These examples
 * are the structural reference.
 */

export const DslExampleSchema = z.object({
  id: Slug,
  language: z.string().min(1),         // 'cuda-cpp' | 'ascend-c' | 'hip' | 'bang-c' | 'musa-c' | 'triton' | 'metal' | 'rocwmma'
  vendor: Slug,
  arch_family: z.string().min(1),
  title: z.string().min(1),
  /** What category this example illustrates. */
  category: z.enum([
    'hello-world',           // simplest possible kernel for the DSL
    'tiled-gemm',            // tiled MMA-based GEMM
    'flash-attention',       // attention with online softmax
    'reduction',             // tree / butterfly reduction
    'async-copy',            // TMA / DMA / async data movement
    'fused-epilogue',        // matmul + activation fused
    'softmax',               // standalone softmax kernel
    'memory-pipeline',       // explicit GM/UB/L1 staging (Ascend-style)
    'wave-level-mma',        // wave-level MFMA on AMD
    'warp-group-mma',        // warp-group WGMMA on Hopper
    'other'
  ]),

  /** The actual code — kept short (~50-100 lines) to show structure not full impl. */
  code: z.string().min(1),
  /** Number of lines in the example (for display). */
  loc: z.number().int().positive().optional(),

  /** Step-by-step explanation of the structure. */
  walkthrough: z.array(z.object({
    step: z.string().min(1),
    explanation: z.string().min(1)
  })).default([]),

  /** Idioms / things that look unusual to CUDA developers. */
  arch_idioms: z.array(z.string()).default([]),

  /** Build / run command for the example. */
  build_command: z.string().optional(),
  run_command: z.string().optional(),

  /** Cross-links. */
  related_isa_primitives: z.array(Slug).default([]),
  related_kernel_libraries: z.array(Slug).default([]),

  /** Source — github / docs URL. */
  source_url: z.string().url().optional(),
  /** Free-form notes. */
  notes: z.string().optional(),

  evidence: z.array(EvidenceSchema).default([])
});

export type DslExample = z.infer<typeof DslExampleSchema>;

/**
 * Reference Implementation (v2.7).
 *
 * Concrete production-grade implementation of a high-impact operator
 * (GEMM / attention / MoE / etc.) on a specific hardware arch. Different
 * from operator entries (which describe the math) — these are real,
 * runnable links to the actual code that ships in production engines.
 *
 * The point: a developer or agent can click through to see "what does
 * a real, working FlashAttention-3 on Hopper look like in source?" and
 * compare it to "what does the equivalent on Ascend look like?" — the
 * structural diff is where the arch personality lives.
 */
export const ReferenceImplementationSchema = z.object({
  id: Slug,
  /** Which operator class this implements. */
  operator_class: z.enum([
    'gemm', 'attention', 'flash-attention', 'paged-attention',
    'fused-attention-quant', 'moe-gate', 'moe-routing',
    'rms-norm', 'fused-rmsnorm-residual', 'softmax',
    'kv-cache-quant', 'speculative-verify', 'rope', 'fused-mlp',
    'all-reduce', 'all-gather', 'reduce-scatter',
    'mamba-selective-scan'
  ]),
  /** Display name for this reference impl. */
  name: z.string().min(1),
  vendor: Slug,
  arch_family: z.string().min(1),

  /** Where the code lives. */
  source_url: z.string().url(),
  /** Specific file or directory. */
  source_file: z.string().optional(),
  /** Specific commit / tag for stable reference. */
  source_ref: z.string().optional(),

  /** Engine / library it ships in. */
  ships_in: z.array(Slug).default([]),  // engine ids or kernel-library ids

  /** Approximate LOC for the core kernel (excluding wrapper / boilerplate). */
  core_loc: z.number().int().positive().optional(),
  /** Languages used. */
  languages: z.array(z.string()).default([]),

  /** What makes this implementation interesting / canonical. */
  highlights: z.array(z.string()).default([]),

  /** Performance characterization — known measured throughput. */
  performance_notes: z.string().optional(),

  /** Cross-links. */
  uses_isa_primitives: z.array(Slug).default([]),
  uses_kernel_libraries: z.array(Slug).default([]),
  related_dsl_examples: z.array(Slug).default([]),

  notes: z.string().optional(),
  evidence: z.array(EvidenceSchema).default([])
});

export type ReferenceImplementation = z.infer<typeof ReferenceImplementationSchema>;

/**
 * Profiling Tool (v2.7).
 *
 * Per-vendor profiling tool registry — without these, agents can codegen
 * kernels but cannot verify they're fast. Production-grade kernel work
 * is profiler-driven.
 */
export const ProfilingToolSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  vendor: Slug,

  /** Tool category. */
  category: z.enum([
    'low-level-counter',     // PMU / hardware counter access (NCU / rocprof / ...)
    'kernel-trace',          // per-kernel timeline trace (nsight-systems / ...)
    'system-trace',          // OS-level + kernel timeline (nsight-systems-os / ...)
    'memory-trace',          // memory access pattern (compute-sanitizer / ...)
    'graph-trace',           // engine-level / serving-level (vllm-trace / ...)
    'roofline-analysis',     // arch-specific roofline overlay
    'numerical-debug',       // NaN / overflow detection
    'mixed'
  ]),

  target_archs: z.array(z.string()).min(1),
  /** Operating modes — counters / interactive / hot-path / sampled. */
  modes: z.array(z.string()).default([]),

  /** Install command (apt / pip / vendor-installer). */
  install: z.string().optional(),
  /** CLI invocation example. */
  invocation_example: z.string().optional(),

  /** What it can measure (FLOPS achieved, memory BW utilization, occupancy, etc.) */
  measures: z.array(z.string()).default([]),
  /** Output format — json / sqlite / qdrep / text. */
  output_formats: z.array(z.string()).default([]),

  /** Cross-vendor equivalence — the "what is the rocprof-equivalent of NCU?" map. */
  cross_vendor_equivalents: z.array(z.object({
    vendor: Slug,
    tool_id: Slug,
    notes: z.string().optional()
  })).default([]),

  docs_url: z.string().url().optional(),
  source_url: z.string().url().optional(),
  /** Open-source vs vendor-binary. */
  license: z.enum(['open-source', 'vendor-binary', 'mixed']).optional(),
  notes: z.string().optional(),

  evidence: z.array(EvidenceSchema).default([])
});

export type ProfilingTool = z.infer<typeof ProfilingToolSchema>;
