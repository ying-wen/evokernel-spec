import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9.-]+$/);

/**
 * Workload profile — how this playbook expects to be used.
 * Distinct dimensions: latency-vs-throughput, prefill-vs-decode focus, multi-turn
 * vs single-turn, batch-size scale, context-length regime.
 */
export const WorkloadProfileSchema = z.enum([
  'low-latency-chat',
  'high-throughput-batch',
  'long-context-rag',
  'agent-multi-turn',
  'streaming-decode',
  'offline-evaluation',
  'cost-optimized',
  'reasoning-tot'
]);

/**
 * Hardware class — abstraction across vendor-specific cards. A playbook recipe
 * applies to a class (e.g. "hopper-cluster-8-to-128") not a single card SKU.
 */
export const HardwareClassSchema = z.enum([
  'blackwell-cluster',
  'blackwell-superpod',
  'hopper-single-node',
  'hopper-cluster',
  'ampere-single-node',
  'ada-single-node',
  'cdna3-single-node',
  'cdna3-cluster',
  'ascend-cluster',
  'cambricon-cluster',
  'gaudi-cluster',
  'tpu-pod',
  'trainium-instance',
  'edge-single-card',
  'wafer-scale',
  'on-die-sram-only'
]);

/**
 * Model archetype — abstraction across specific model checkpoints. Playbook
 * applies to "moe-llm-large" not "deepseek-v3-671b" — recipe parameters scale
 * with archetype + size class.
 */
export const ModelArchetypeSchema = z.enum([
  'dense-llm-small',
  'dense-llm-medium',
  'dense-llm-large',
  'moe-llm-medium',
  'moe-llm-large',
  'reasoning-llm',
  'multi-modal',
  'long-context',
  'diffusion',
  'ssm-mamba',
  'speculative-target'
]);

const ParallelismRecipeSchema = z.object({
  tp: z.string().min(1),
  ep: z.string().optional(),
  pp: z.string().optional(),
  sp: z.string().optional(),
  notes: z.string().optional(),
  disaggregated: z.boolean().default(false)
});

const ExpectedPerfSchema = z.object({
  decode_tok_s_per_gpu_min: z.number().nonnegative().optional(),
  decode_tok_s_per_gpu_max: z.number().nonnegative().optional(),
  prefill_throughput_min: z.number().nonnegative().optional(),
  prefill_throughput_max: z.number().nonnegative().optional(),
  ttft_ms_p50_min: z.number().nonnegative().optional(),
  ttft_ms_p50_max: z.number().nonnegative().optional(),
  cost_per_million_tokens_usd_min: z.number().nonnegative().optional(),
  cost_per_million_tokens_usd_max: z.number().nonnegative().optional(),
  notes: z.string().optional()
});

const RecipeSchema = z.object({
  parallelism: ParallelismRecipeSchema,
  quantization: z.string().min(1),
  /** Engine choice — primary then alternatives. */
  engine_primary: Slug,
  engine_alternates: z.array(Slug).default([]),
  /** Fused-kernel ids that this playbook leverages. */
  kernels: z.array(Slug).default([]),
  /** Cross-cutting patterns that this playbook composes. */
  patterns: z.array(Slug).default([]),
  /** Expected perf range — informs calculator + buyer expectations. */
  expected_perf: ExpectedPerfSchema
});

const DecisionPointSchema = z.object({
  scale: z.string().min(1),
  guidance: z.string().min(1)
});

export const PlaybookSchema = z.object({
  id: Slug,
  name: z.string().min(1),

  /** Which model archetype + hardware class this playbook covers. */
  model_archetype: ModelArchetypeSchema,
  hardware_class: HardwareClassSchema,
  /** What workload profile this playbook is tuned for. */
  workload_profile: z.array(WorkloadProfileSchema).min(1),

  /** Markdown summary describing why this recipe — 2-4 sentences. */
  summary_md: z.string().min(1),

  /** The actual recipe — actionable parameters. */
  recipe: RecipeSchema,

  /** Decision points across deployment scale (e.g. 8 GPU, 32 GPU, 128 GPU). */
  decision_points: z.array(DecisionPointSchema).min(1),

  /** Trade-offs / when this playbook is NOT the right choice. */
  not_for: z.array(z.string()).default([]),

  /** Concrete supporting cases that exemplify this playbook. */
  related_cases: z.array(Slug).default([]),
  /** Pipeline stages most affected by this playbook. */
  affects_stages: z.array(Slug).default([]),

  /** Status: stable / experimental / deprecated. */
  status: z.enum(['stable', 'experimental', 'deprecated']).default('stable'),

  evidence: z.array(EvidenceSchema).default([]),
  disclaimers: z.array(z.string()).default([])
});

export type Playbook = z.infer<typeof PlaybookSchema>;
export type WorkloadProfile = z.infer<typeof WorkloadProfileSchema>;
export type HardwareClass = z.infer<typeof HardwareClassSchema>;
export type ModelArchetype = z.infer<typeof ModelArchetypeSchema>;
