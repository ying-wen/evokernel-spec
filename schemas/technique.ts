/**
 * v3.25 -- Technique entity (NEW).
 *
 * A "technique" is a research method or library that can be APPLIED TO an
 * (op, model, hardware) combination, distinct from being one of those
 * things itself. Examples:
 *   - SageAttention: an attention-optimization library that can be ported
 *     to multiple hardware archs
 *   - FlashAttention: same — has reference impl on Hopper, ports exist on
 *     CDNA / Ascend in different states of completeness
 *   - PagedAttention: a KV-cache layout strategy, not a model or op per se
 *   - SmoothQuant: a quantization technique
 *
 * Why this entity exists (per the v3.24 spec at
 * docs/superpowers/specs/2026-05-04-real-productized-agent.md):
 *
 * Pre-v3.25, the corpus had models, hardware, ops, fused-kernels — but no
 * way to express "port THIS RESEARCH LIBRARY to the target arch". The user
 * scenario "port SageAttention to Ascend-C, validate with CogVideoX" only
 * makes sense once SageAttention is a first-class entity the agent can
 * reason about (its reference impl, applicable ops, port status, numerical
 * rules inherited from the technique paper).
 *
 * The agent CLI gains `--technique <id>` which:
 *   - Loads the technique's reference impl as a baseline for cross-arch
 *     verify (V2 in Layer V)
 *   - Surfaces the technique's `port_targets` to plan which kernels to
 *     synthesize
 *   - Inherits the technique's `numerical_rules` into the formal_semantics
 *     consumed by V2
 */

import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * Categories of techniques. Each maps to a different Layer G strategy:
 *   - attention-optimization: replace baseline attention with a faster impl
 *     (FlashAttention, SageAttention, PagedAttention)
 *   - quantization: apply a quantization scheme (SmoothQuant, AWQ, GPTQ)
 *   - fused-kernel: a specific fusion recipe (FusedRoPE-QKV, etc.)
 *   - scheduling: a serving-side scheduler (continuous batching variants)
 *   - parallelism: a parallelism strategy (sequence-parallel, EP, etc.)
 *   - kv-cache-layout: KV cache management (PagedAttention's blocks)
 */
export const TechniqueKindSchema = z.enum([
  'attention-optimization',
  'quantization',
  'fused-kernel',
  'scheduling',
  'parallelism',
  'kv-cache-layout',
  'mixed',
]);

const PortStatusSchema = z.enum([
  'reference-impl',     // The original (e.g. CUDA for SageAttention)
  'production-ready',   // Port exists + verified + benchmarked
  'experimental',       // Port exists but not verified end-to-end
  'planned',            // Targeted by this corpus, not yet attempted
  'blocked',            // Port attempted, hit a hard blocker
]);

/**
 * A single "this technique runs / could run on this arch" entry. Multi-arch
 * techniques accumulate one entry per (arch_family, status) pair.
 */
const PortTargetSchema = z.object({
  arch_family: z.string().min(1),                  // e.g. 'hopper', 'ascend-da-vinci-3', 'cdna3'
  status: PortStatusSchema,
  /** Where to find the port (or where it should live once written). */
  reference_url: z.string().url().optional(),
  /** Notes on porting complexity / known gotchas for this arch. */
  notes: z.string().optional(),
  /** Linked agent-learning ids that documented attempts on this arch. */
  agent_learning_ids: z.array(Slug).default([]),
});

const NumericalRuleSchema = z.object({
  aspect: z.string().min(1),          // 'accumulator_dtype', 'overflow_handling', etc.
  per_library: z.record(z.string(), z.string()),
  notes: z.string().optional(),
});

const ReferenceImplSchema = z.object({
  framework: z.string().min(1),        // 'cuda-cpp', 'triton', 'pytorch'
  repo: z.string().url(),
  /** Path inside the repo, e.g. 'csrc/sageattention.cu'. */
  entry: z.string().optional(),
  /** Optional inline snippet for the most-cited core function. */
  snippet: z.string().optional(),
});

export const TechniqueSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  technique_kind: TechniqueKindSchema,

  // Provenance
  reference_url: z.string().url(),
  reference_paper: z.string().url().optional(),
  /** Seminal release / publication year. */
  origin_year: z.number().int().min(2010).max(2100).optional(),
  authors_or_org: z.string().optional(),

  // Where it applies
  applicable_to: z.object({
    /** Model archetypes (transformer-decoder, diffusion, asr, etc.) */
    model_archetypes: z.array(z.string()).default([]),
    /** Op ids in the corpus this technique replaces or augments. */
    ops: z.array(Slug).default([]),
    /** Arch families where this technique was ORIGINALLY developed. */
    hardware_arch_families: z.array(z.string()).default([]),
  }),

  /** Per-arch port status — drives the agent's planning + verify chain. */
  port_targets: z.array(PortTargetSchema).default([]),

  /** Reference implementation (the original, used as cross-arch verify baseline). */
  reference_impl: ReferenceImplSchema,

  /** Numerical rules the technique IMPOSES on its use sites. */
  numerical_rules: z.array(NumericalRuleSchema).default([]),

  /**
   * Heuristic complexity rating for porting to a new arch family. Used by
   * the agent's planner to surface "this is an easy port" vs "this is a
   * 2-week project" expectation.
   */
  port_complexity: z.enum(['low', 'medium', 'high', 'research-grade']).default('medium'),

  /** Long-form notes / caveats / gotchas. */
  notes: z.string().optional(),

  /** Aliases users might type (e.g. 'sageattn', 'sage-attn'). */
  aliases: z.array(z.string()).default([]),
});

export type Technique = z.infer<typeof TechniqueSchema>;
export type PortTarget = z.infer<typeof PortTargetSchema>;
export type TechniqueKind = z.infer<typeof TechniqueKindSchema>;
