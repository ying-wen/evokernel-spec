import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * The canonical 7-stage deployment pipeline. From "I have a HuggingFace model
 * checkpoint" to "The service is live and observable". Every other piece of
 * knowledge in the corpus (engines, patterns, operators, quantizations) maps
 * onto exactly one of these stages. This gives the deployment engineer a
 * mental scaffold for "where am I, what's next, what can break here".
 *
 * Order matters: changes to upstream stages invalidate downstream artifacts.
 * E.g. switching quantization (stage 3) requires re-running compile (4).
 */
export const PipelineStageIdSchema = z.enum([
  'acquire',    // 1. Get weights — HF, ModelScope, mirrors, license dance
  'convert',    // 2. Format normalization — safetensors / GGUF / engine fmt
  'quantize',   // 3. Quantization + calibration (AWQ/GPTQ/FP8)
  'compile',    // 4. Graph capture / engine compile (TRT engine, MindIE compile)
  'shard',      // 5. TP / PP / EP / SP plan + parallelization layout
  'serve',      // 6. Runtime config: KV pool, scheduler, OpenAI-compat API
  'observe'     // 7. Metrics, traces, drift, capacity, retune trigger
]);
export type PipelineStageId = z.infer<typeof PipelineStageIdSchema>;

/**
 * A discrete decision the operator makes inside a stage. Capturing these
 * surfaces what the engineer is actually choosing between (vs hiding it
 * behind framework defaults).
 */
const StageDecisionSchema = z.object({
  /** Concise name of the decision: "Pick weight quantization scheme". */
  question: z.string().min(1),
  /** Common options surfaced; not exhaustive. */
  options: z.array(z.string()).default([]),
  /** Default behavior most engines/users land on. */
  common_default: z.string().optional(),
  /** Heuristic: when does the answer flip? */
  guidance: z.string().optional()
});

/**
 * A specific tool / API / command used to execute the stage. Shows the
 * engineer what they'll actually type.
 */
const StageToolSchema = z.object({
  /** Tool name (`vllm serve`, `trtllm-build`, `huggingface-cli`). */
  name: z.string().min(1),
  /** Engine slug if engine-specific; otherwise null = universal. */
  engine_id: Slug.optional(),
  /** What it does in this stage. */
  role: z.string().min(1),
  /** Optional URL to docs / repo. */
  url: z.string().url().optional()
});

const FailureModeSchema = z.object({
  symptom: z.string().min(1),
  cause: z.string().min(1),
  fix: z.string().min(1)
});

export const PipelineStageSchema = z.object({
  id: PipelineStageIdSchema,
  /** Pretty name in zh + en. */
  name_zh: z.string().min(1),
  name_en: z.string().min(1),
  /** 1-indexed display order (matches enum order but explicit). */
  order: z.number().int().min(1).max(7),
  /** Single-paragraph "what happens here". */
  summary_zh: z.string().min(1),
  summary_en: z.string().min(1),
  /** Markdown body for the detail page. */
  description_md: z.string().min(1),
  /** Decisions the engineer makes at this stage. */
  decisions: z.array(StageDecisionSchema).default([]),
  /** Tools / commands that execute the stage. */
  tools: z.array(StageToolSchema).default([]),
  /** What can go wrong here, and how to recover. */
  failure_modes: z.array(FailureModeSchema).default([]),
  /** Pattern slugs that apply at this stage — cross-link into /patterns/<slug>/. */
  related_patterns: z.array(Slug).default([]),
  /** Operator slugs whose choices live in this stage. */
  related_operators: z.array(Slug).default([]),
  /** Engine slugs that have first-class support for the typical work in this stage. */
  primary_engines: z.array(Slug).default([]),
  /** Stages that depend on the output of this one — change propagation map. */
  invalidates_downstream: z.array(PipelineStageIdSchema).default([])
});

export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type StageDecision = z.infer<typeof StageDecisionSchema>;
export type StageTool = z.infer<typeof StageToolSchema>;
export type FailureMode = z.infer<typeof FailureModeSchema>;
