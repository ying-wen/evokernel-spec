import { z } from 'zod';
import { EvidenceSchema } from './evidence';

// Allow dots — model ids like "qwen3.6-plus" / "minimax-m2.7" use them
const Slug = z.string().regex(/^[a-z0-9.-]+$/);

/**
 * Model Execution Graph (v2.8).
 *
 * Bridges model-level (architecture / params) and operator-level (FLOPs/bytes
 * formulas). For each model × phase (prefill | decode), describes the ordered
 * sequence of operator calls with shape templates parameterized by
 * {batch, seq_len, layer_idx, ...}.
 *
 * This is what an autonomous agent needs to compute per-token resource
 * estimates (memory, FLOPs, bytes) without measured cases — by composing
 * operator formulas with concrete per-layer shapes.
 *
 * Distinct from operator decomposition (which tells you which ops a model
 * uses): execution graph tells you the ORDER + SHAPES + repetitions.
 */

export const PhaseSchema = z.enum(['prefill', 'decode', 'shared']);
export type Phase = z.infer<typeof PhaseSchema>;

/**
 * One op call in the execution graph. Shape template uses placeholders that
 * resolve at evaluation time given concrete (batch, seq, layer_idx, ...) values.
 *
 * Example shape template:
 *   { input: "[B, S, D]", weight: "[D, 3*D]", output: "[B, S, 3*D]" }
 *   where B=batch, S=seq, D=hidden_dim
 *
 * Parameterization placeholders are documented per-graph in the
 * `placeholder_definitions` field on the parent schema.
 */
const OpCallSchema = z.object({
  /** Order in the sequence — drives display + execution simulation. */
  order: z.number().int().nonnegative(),
  /** Operator slug (matches data/operators/<id>.yaml). */
  op_id: Slug,
  /** Optional human label for display ("Q projection", "Attention QK^T", etc.). */
  label: z.string().optional(),
  /** Shape template with placeholders. Evaluated at predict-fit time. */
  shape_template: z.record(z.string(), z.string()).default({}),
  /** How many times this op fires within one transformer block (e.g., GQA Q + K + V proj = 3 separate matmul calls). */
  repeat_per_layer: z.number().int().positive().default(1),
  /**
   * For ops that fire across all layers (most), this is empty.
   * For ops that fire only at specific layers (e.g., embedding fires once at layer 0,
   * lm_head fires once after final layer), specify the layer range.
   */
  layer_scope: z.enum(['all-layers', 'first-only', 'last-only', 'embedding-only', 'lm-head-only']).default('all-layers'),
  /**
   * Whether this op is fused with the next ones in the sequence into a
   * single kernel call at runtime. Helps agent know what to count as
   * separate kernel launches.
   */
  fused_with: z.array(Slug).default([]),
  notes: z.string().optional()
});

export const ModelExecutionGraphSchema = z.object({
  id: Slug,
  /** References data/models/<id>/. */
  model_id: Slug,
  /** Phase: prefill (long-prompt processing) vs decode (token-by-token) vs shared. */
  phase: PhaseSchema,

  /** Total layer count for this model (transformer blocks). */
  layer_count: z.number().int().positive(),

  /**
   * Definitions of placeholders used in shape_template fields.
   * E.g., { B: 'batch_size', S: 'seq_len', D: 'd_model', H: 'num_heads', ... }
   */
  placeholder_definitions: z.record(z.string(), z.string()).default({}),

  /**
   * Default values when not provided by user. Must satisfy all placeholders
   * referenced in op shapes.
   */
  default_dimensions: z.record(z.string(), z.number()).default({}),

  /** Ordered op call sequence within ONE transformer block. */
  per_layer_ops: z.array(OpCallSchema).min(1),

  /** Pre-loop ops (embedding, position encoding, etc.) — fire once. */
  pre_layer_ops: z.array(OpCallSchema).default([]),

  /** Post-loop ops (final LayerNorm, lm_head, sampling) — fire once. */
  post_layer_ops: z.array(OpCallSchema).default([]),

  /** Free-form notes describing characteristic patterns of this graph. */
  notes: z.string().optional(),
  /** Reference for verification — paper section / HuggingFace model card / source. */
  reference_url: z.string().url().optional(),

  evidence: z.array(EvidenceSchema).default([])
});

export type ModelExecutionGraph = z.infer<typeof ModelExecutionGraphSchema>;
export type OpCall = z.infer<typeof OpCallSchema>;
