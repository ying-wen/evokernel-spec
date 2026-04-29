import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const PatternCategorySchema = z.enum([
  'quantization', 'parallel', 'kv-cache', 'communication',
  'kernel-fusion', 'scheduling', 'disaggregation', 'misc'
]);

/**
 * Speedup expressed as a range (typical 1.5–2.5×). Both bounds are >= 1.0
 * for "speedup" patterns, but a pattern can also be neutral or quality-
 * trading — `metric` clarifies what the multiplier applies to.
 */
const SpeedupRangeSchema = z.object({
  metric: z.enum(['decode-throughput', 'prefill-throughput', 'ttft', 'memory-footprint', 'cost-per-token', 'quality']),
  multiplier_min: z.number().positive(),
  multiplier_max: z.number().positive(),
  notes: z.string().optional()
});

/**
 * Reference (paper, blog, or implementation). Helps users dig deeper
 * after spotting a pattern they want to apply.
 */
const ReferenceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  source_type: z.enum(['paper', 'blog', 'implementation', 'docs', 'talk', 'other']).default('other')
});

export const PatternSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  category: PatternCategorySchema,
  description_md: z.string().min(1),

  // Existing
  applies_when: z.array(z.string()).default([]),
  related_operators: z.array(Slug).default([]),
  supporting_cases_min: z.number().int().nonnegative().default(0),

  // New: cross-cutting fitness — what makes this pattern usable
  // ----------------------------------------------------------
  /** Engine IDs that natively support this pattern. References engines/. */
  engines_supporting: z.array(Slug).default([]),

  /** Hardware capability prerequisites (free-form tags, not refs). */
  hardware_requires: z.array(z.string()).default([]),

  /** Architectural shapes this pattern targets. */
  model_archetypes: z.array(z.enum([
    'dense-llm', 'moe-llm', 'long-context', 'multi-modal',
    'diffusion', 'scientific', 'reasoning', 'speculative-target'
  ])).default([]),

  /** Expected speedup ranges (a pattern can affect multiple metrics). */
  speedup: z.array(SpeedupRangeSchema).default([]),

  /** Negative side-effects (quality regression, memory cost, etc.). */
  trade_offs: z.array(z.string()).default([]),

  /** External references. Always cite ≥1 paper/impl for reproducibility. */
  references: z.array(ReferenceSchema).default([])
});

export type Pattern = z.infer<typeof PatternSchema>;
export type PatternCategory = z.infer<typeof PatternCategorySchema>;
export type SpeedupRange = z.infer<typeof SpeedupRangeSchema>;
