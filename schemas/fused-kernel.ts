import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * A FusedKernel is a named composition of N primitive operators executed as
 * one CUDA / Triton / AscendC kernel. Captured separately from individual
 * operators because the fusion itself has a name, paper, perf characteristics,
 * and engine-implementation matrix that's distinct from any of its parts.
 *
 * Example: FlashAttention-3 fuses {QK matmul, softmax, attention output @V}
 * into a single tiled kernel; canonical paper, ~75% Hopper peak utilization
 * on FP8, runs natively on Hopper+ via TMA.
 */

const KernelImplementationSchema = z.object({
  name: z.string().min(1),
  engine_id: Slug.optional(),
  hardware_arch: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  notes: z.string().optional()
});

const ReferenceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  source_type: z.enum(['paper', 'blog', 'implementation', 'docs', 'talk', 'other']).default('other')
});

const SpeedupSchema = z.object({
  /** What we're comparing against — the "naive" baseline. */
  baseline: z.string().min(1),
  /** Multiplier vs baseline. */
  multiplier_min: z.number().positive(),
  multiplier_max: z.number().positive(),
  notes: z.string().optional()
});

export const FusedKernelCategorySchema = z.enum([
  'attention', 'mlp', 'normalization', 'rope-attention',
  'moe', 'kv-cache-management', 'communication', 'misc'
]);

export const FusedKernelSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  category: FusedKernelCategorySchema,
  /** 1-3 sentence elevator pitch. */
  summary: z.string().min(1),
  /** Markdown body for the detail page. */
  description_md: z.string().min(1),

  /** The constituent operators that make up this fused kernel. */
  fuses_operators: z.array(Slug).min(2),

  /** Why fusion pays off here — what redundant memory traffic gets eliminated. */
  why_fuse: z.string().min(1),

  /** Speedup ranges vs the unfused baseline. */
  speedup: z.array(SpeedupSchema).default([]),

  /** Concrete kernel implementations across engines + hardware. */
  implementations: z.array(KernelImplementationSchema).default([]),

  /** Hardware capability prerequisites. */
  hardware_requires: z.array(z.string()).default([]),

  /** Patterns that this kernel is a primary mechanism of. */
  enables_patterns: z.array(Slug).default([]),

  /** Pipeline stage where this fusion lands (compile usually, sometimes serve). */
  applies_at_stage: z.enum(['compile', 'serve', 'shard', 'observe']).default('compile'),

  /** Trade-offs — what does fusion cost? */
  trade_offs: z.array(z.string()).default([]),

  /** External references. */
  references: z.array(ReferenceSchema).default([]),

  /**
   * v2.15 / Layer D for fused kernels: fusion-specific edge cases + numerical
   * rules that differ from the constituent unfused operators. Captures
   * gotchas like epilogue ordering, intermediate precision, runtime vs
   * compile-time fusion semantics.
   */
  formal_semantics: z.object({
    signature: z.string().optional(),
    edge_cases: z.array(z.object({
      input: z.string().min(1),
      behaviors: z.record(z.string(), z.string()),
      mitigation: z.string().optional()
    })).default([]),
    numerical_rules: z.array(z.object({
      aspect: z.string().min(1),
      per_library: z.record(z.string(), z.string())
    })).default([]),
    /** Compile-time vs runtime fusion semantics. */
    fusion_lifecycle: z.enum(['compile-time-template', 'jit-trace', 'runtime-graph', 'manual-kernel']).optional(),
    /** What happens if you DO NOT fuse (perf cliff vs slight slowdown). */
    unfused_penalty: z.string().optional()
  }).optional()
});

export type FusedKernel = z.infer<typeof FusedKernelSchema>;
export type FusedKernelCategory = z.infer<typeof FusedKernelCategorySchema>;
