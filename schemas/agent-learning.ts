import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * Agent Learning (v2.20+ — Layer F: feedback loop).
 *
 * Captures what an agent discovered during a deployment run. This is the
 * "knowledge accumulation back to the corpus" surface — every agent run can
 * write back observations, perf cliffs, kernel gaps, version skews. Over time,
 * the next agent run starts smarter because previous runs' learnings flowed
 * into the coverage matrix and ROADMAP.
 *
 * Distinct from `data/agent-validations.json` (run log) — that's "did it ship"
 * boolean + perf numbers. AgentLearning is "what did it teach us" structured
 * observations that map to corpus updates.
 *
 * The agent CLI in `scripts/agent-deploy/` will write entries here on every
 * run (v2.24 wires the writeback). The site exposes them at `/agents/learnings/`.
 */

export const AgentLearningOutcomeSchema = z.enum([
  'shipped',                  // Agent delivered a working deployment
  'kernel-gap-blocked',        // Missing kernel; agent emitted skeleton, human review needed
  'compile-failed',            // Build broke; logged for diagnosis
  'precision-regression',      // Output quality regressed vs reference
  'oom-or-fits-failure',       // Memory budget exceeded
  'partial',                   // Worked but with caveats (perf cliff, fallback path used)
]);

export const AgentLearningObservationKindSchema = z.enum([
  'kernel-gap',                // Op exists in source corpus but no kernel on target arch
  'perf-cliff',                // Significant gap between predicted and measured perf
  'numerical-mismatch',        // Output diverged from reference (likely formal_semantics gap)
  'version-skew',              // Engine/library version mismatch caused issue
  'config-drift',              // Engine config silently used a different path than expected
  'success-pattern',           // What worked — captured for reuse
  'missing-primitive',         // ISA primitive (Layer A) needed but absent on target arch
  'fusion-opportunity',        // Identified a profitable fusion not in current corpus
]);

export const AgentLearningObservationSchema = z.object({
  kind: AgentLearningObservationKindSchema,
  /** Op or fused-kernel ID, if applicable. */
  op_or_kernel: z.string().optional(),
  /** ISA primitive ID, if applicable. */
  isa_primitive: z.string().optional(),
  /** Pattern ID, if applicable. */
  pattern: z.string().optional(),
  /** What was learned, in plain prose. */
  description: z.string().min(1),
  /** Evidence — log excerpt, NCU report snippet, error message, perf delta. */
  evidence: z.string().optional(),
  /** PR-style proposal: which corpus file should be updated and how. */
  proposed_corpus_update: z.string().optional(),
});

export const AgentLearningPerfDeltaSchema = z.object({
  decode_tok_per_s_predicted: z.number().optional(),
  decode_tok_per_s_actual: z.number().optional(),
  ttft_ms_predicted: z.number().optional(),
  ttft_ms_actual: z.number().optional(),
  cost_per_m_tokens_predicted: z.number().optional(),
  cost_per_m_tokens_actual: z.number().optional(),
  /** Worst-case delta percentage across all metrics; positive means actual is worse. */
  worst_delta_pct: z.number().optional(),
});

export const AgentLearningSchema = z.object({
  id: Slug,
  /** When the agent run completed (ISO 8601). */
  agent_run_at: z.string().datetime(),
  /** What model the agent was deploying. */
  model_id: z.string().min(1),
  /** What hardware the agent was deploying to. */
  hardware_id: z.string().min(1),
  /** Engine the agent picked (vllm / sglang / mindie / trtllm / etc.). */
  engine_id: z.string().min(1),
  /** Final outcome category. */
  outcome: AgentLearningOutcomeSchema,
  /**
   * Structured observations — each maps (eventually) to a corpus update.
   * Empty array allowed for trivial successes that taught nothing new.
   */
  observations: z.array(AgentLearningObservationSchema),
  /** Quantitative perf delta vs the agent's prediction. */
  perf_delta: AgentLearningPerfDeltaSchema.optional(),
  /** Free-form notes. */
  notes: z.string().optional(),
  /**
   * Whether the observations have been processed into corpus PRs.
   * 'open' = needs review; 'merged' = at least one PR opened/merged;
   * 'wont-fix' = reviewed but not actionable.
   */
  triage_status: z.enum(['open', 'merged', 'wont-fix']).default('open'),
});

export type AgentLearning = z.infer<typeof AgentLearningSchema>;
export type AgentLearningOutcome = z.infer<typeof AgentLearningOutcomeSchema>;
export type AgentLearningObservation = z.infer<typeof AgentLearningObservationSchema>;
export type AgentLearningObservationKind = z.infer<typeof AgentLearningObservationKindSchema>;
