import { z } from 'zod';

/**
 * End-to-end deployment tour — walks one concrete (model × hardware × engine
 * × quant) deployment through all 7 pipeline stages with hand-curated
 * stage-level decisions, involved operators / kernels / patterns, and
 * per-stage pitfalls.
 *
 * Tours are content (not auto-generated) — each tour is a YAML file at
 * data/tours/<slug>.yaml. The dynamic route /learn/tours/<slug>/ renders any
 * tour given its slug.
 *
 * Tours close gap-3 ("deployment optimization chain unclear") by giving
 * concrete narratives where decision trees give abstract matrices.
 */

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * Per-stage narrative for a single pipeline stage of a tour.
 */
const StageNarrativeSchema = z.object({
  /** Pipeline stage id; must match a stage in data/pipeline/. */
  stage_id: z.enum(['acquire', 'convert', 'quantize', 'compile', 'shard', 'serve', 'observe']),

  /**
   * The actual decision made at this stage — short, concrete, copy-pasteable
   * (e.g. "TP=8 + EP=72 + disagg (24 prefill + 48 decode)").
   */
  decision: z.string().min(1),

  /**
   * Why this decision in 1-3 sentences. Should reference hardware specifics
   * + measured numbers from the case where possible.
   */
  rationale: z.string().min(1),

  /** Operator slugs touched at this stage. */
  involves_operators: z.array(Slug).default([]),

  /** Fused-kernel slugs at this stage. */
  involves_kernels: z.array(Slug).default([]),

  /** Pattern slugs at this stage. */
  involves_patterns: z.array(Slug).default([]),

  /**
   * Optional pitfall — a real production gotcha specific to this stage. Often
   * pulled from the case's `issues_encountered`. Surfaces as a warning callout.
   */
  pitfall: z.string().optional()
});

export type StageNarrative = z.infer<typeof StageNarrativeSchema>;

export const TourSchema = z.object({
  /**
   * URL slug (becomes /learn/tours/<id>/). Should match the case_id closely
   * for discoverability — e.g. "llama4-scout-h100x8-vllm-fp8".
   */
  id: Slug,

  /** Display title — short, concrete (e.g. "Llama 4 Scout × 8×H200"). */
  title: z.string().min(1),

  /**
   * Tour subtitle / one-line context (e.g. "国央企 reasoning",
   * "frontier multi-modal"). Surfaces in cards + headers.
   */
  context_zh: z.string().min(1),

  /**
   * Mandatory case_id — every tour walks an existing case from data/cases/.
   * Validation cross-references this in the renderer; here it's just a slug.
   */
  case_id: Slug,

  /**
   * Optional matched playbook id — if set, tour displays "matches playbook X"
   * link. Most tours match a playbook but it's not required.
   */
  playbook_id: Slug.optional(),

  /**
   * Why this tour matters — surfaces in the index card. 1-2 sentences.
   */
  why_it_matters: z.string().min(1),

  /**
   * Display order on the index page. Lower = earlier. Default 100.
   */
  display_order: z.number().int().nonnegative().default(100),

  /**
   * 7 stage narratives. Should cover all 7 stages — renderer handles missing
   * stages gracefully but tours should be complete.
   */
  stages: z.array(StageNarrativeSchema).min(1)
});

export type Tour = z.infer<typeof TourSchema>;
