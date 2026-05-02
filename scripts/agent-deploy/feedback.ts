/**
 * v3.6 — Layer F (Feedback): automated writeback + Layer G retry loop.
 *
 * Closes the spec → plan → dev → test → FEEDBACK → spec cycle:
 *
 *   1. After V1/V2/V3 verification (Layer V), this module synthesizes a
 *      structured agent-learning entry mapping the verification result into
 *      observations that the corpus consumes.
 *
 *   2. If verification failed, the retry loop calls Layer G again with the
 *      retry_diagnostic baked into the prompt — the LLM regenerates with the
 *      specific bug to address. Bounded to MAX_RETRIES (default 3) to avoid
 *      runaway costs.
 *
 *   3. On success, emits a success-pattern observation. On failure-after-retries,
 *      emits a kernel-gap observation flagging the (op, target_arch) pair as
 *      blocked + the diagnostic chain across attempts.
 *
 * Output is a YAML stub matching schemas/agent-learning.ts. The human reviewer
 * fills actuals (perf delta from real deployment) and commits to data/agent-learnings/.
 *
 * See docs/superpowers/specs/2026-05-03-productized-agent.md § Layer F.
 */

import { generateProductionKernel, type ProductionKernelInput, type ProductionKernelOutput } from './llm-orchestrator';
import { runVerification, type VerifyResult, type VerifyInput } from './verify';

export const MAX_RETRIES = 3;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface GenerateAndVerifyInput {
  /** Layer G input — the bundle, op, target arch. */
  generation: ProductionKernelInput;
  /** Layer V input — formal_semantics rules, reference impl, mode. */
  verification: Omit<VerifyInput, 'code' | 'language' | 'op' | 'target_arch'>;
  /** Optional max retry count override (default MAX_RETRIES). */
  max_retries?: number;
  /**
   * v3.9 — perf-cliff retry trigger threshold (percent).
   * When measured perf delta vs predicted exceeds this, also retry Layer G
   * with a "perf-cliff" diagnostic. Default: 30 (i.e., 30% slower than
   * predicted triggers regeneration). Set to 0 to disable; set to high
   * value (e.g., 1000) to effectively disable.
   *
   * Note: only meaningful in execution mode where measured_tok_s is available.
   * In structural mode, perf-cliff cannot be detected and this is a no-op.
   */
  perf_threshold_pct?: number;
  /**
   * v3.9 — predicted decode tok/s (from agent plan). Only used for perf-cliff
   * trigger. Without this, perf-cliff retry is disabled even in execution mode.
   */
  predicted_decode_tok_s?: number;
}

export interface GenerateAndVerifyResult {
  /** Final outcome of the generate+verify+retry cycle. */
  outcome: 'shipped' | 'partial' | 'kernel-gap-blocked';
  /** Final kernel output (last attempt). */
  kernel: ProductionKernelOutput;
  /** Final verification result (last attempt). */
  verification: VerifyResult;
  /** All attempts in order — useful for debugging which retry fixed what. */
  attempts: Array<{
    attempt_number: number;
    kernel_source: string;          // generation source (llm-generated / cache-hit / etc.)
    verify_status: string;
    diagnostic: string | undefined;
  }>;
  /**
   * Pre-filled agent-learning YAML (matches schemas/agent-learning.ts).
   * Human reviewer fills perf actuals + commits to data/agent-learnings/.
   */
  agent_learning_yaml: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry: generate → verify → retry-on-fail → emit feedback
// ─────────────────────────────────────────────────────────────────────────

export async function generateAndVerify(input: GenerateAndVerifyInput): Promise<GenerateAndVerifyResult> {
  const maxRetries = input.max_retries ?? MAX_RETRIES;
  const attempts: GenerateAndVerifyResult['attempts'] = [];

  let currentInput = { ...input.generation };
  let lastKernel: ProductionKernelOutput | null = null;
  let lastVerify: VerifyResult | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Layer G — generate
    const kernel = await generateProductionKernel(currentInput);

    // Layer V — verify
    const verify = await runVerification({
      code: kernel.code,
      language: kernel.language,
      op: input.generation.op,
      target_arch: input.generation.target_arch,
      ...input.verification,
    });

    attempts.push({
      attempt_number: attempt,
      kernel_source: kernel.source,
      verify_status: verify.overall,
      diagnostic: verify.retry_diagnostic,
    });

    lastKernel = kernel;
    lastVerify = verify;

    // v3.9 — perf-cliff trigger: even on V pass, retry if measured perf is way
    // below prediction. Only fires when:
    //   - Layer V ran in execution mode AND v3 measured tok/s
    //   - Caller provided predicted_decode_tok_s
    //   - perf_threshold_pct is meaningful (default 30 = retry if 30%+ slower)
    const perfThreshold = input.perf_threshold_pct ?? 30;
    const perfCliffDiagnostic = detectPerfCliff(verify, input.predicted_decode_tok_s, perfThreshold);

    if (verify.overall === 'pass' && !perfCliffDiagnostic) {
      // Clean pass, no perf cliff — exit loop
      break;
    }
    if ((verify.overall === 'partial' || verify.overall === 'skipped') && !perfCliffDiagnostic) {
      // Partial / skipped (likely structural-only mode) — accept, exit loop
      break;
    }

    // Determine retry trigger: V failure OR perf cliff
    const retryDiagnostic = verify.retry_diagnostic ?? perfCliffDiagnostic;

    if (attempt < maxRetries && retryDiagnostic) {
      // Annotate the attempt to flag perf-cliff retries explicitly
      if (perfCliffDiagnostic && !verify.retry_diagnostic) {
        attempts[attempts.length - 1].diagnostic = perfCliffDiagnostic;
      }
      currentInput = {
        ...currentInput,
        prior_attempt_diagnostic: retryDiagnostic,
      };
      // Loop continues; Layer G regenerates with the diagnostic in the prompt
    } else {
      // Out of retries
      break;
    }
  }

  if (!lastKernel || !lastVerify) {
    // Should never happen — we always make at least 1 attempt
    throw new Error('feedback.ts: generateAndVerify made 0 attempts');
  }

  // Synthesize outcome
  const outcome: GenerateAndVerifyResult['outcome'] =
    lastVerify.overall === 'pass'
      ? 'shipped'
      : lastVerify.overall === 'partial' || lastVerify.overall === 'skipped'
        ? 'partial'
        : 'kernel-gap-blocked';

  // Emit agent-learning YAML stub
  const agent_learning_yaml = synthesizeAgentLearning({
    input,
    finalKernel: lastKernel,
    finalVerify: lastVerify,
    attempts,
    outcome,
  });

  return {
    outcome,
    kernel: lastKernel,
    verification: lastVerify,
    attempts,
    agent_learning_yaml,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// v3.9 — Perf-cliff detection
// ─────────────────────────────────────────────────────────────────────────

/**
 * Detect whether Layer V V3 reported a perf measurement that's significantly
 * below prediction, warranting a Layer G regeneration with a perf-cliff
 * diagnostic in the prompt.
 *
 * Returns null if no cliff (or no data); returns diagnostic string otherwise.
 *
 * Threshold interpretation:
 *   thresholdPct=30 → retry if (predicted - measured)/predicted * 100 > 30
 *   (i.e., measured is 30%+ slower than predicted)
 */
export function detectPerfCliff(
  verify: VerifyResult,
  predictedTokS: number | undefined,
  thresholdPct: number
): string | null {
  // No prediction → can't compute delta, no cliff
  if (predictedTokS === undefined || predictedTokS <= 0) return null;

  // No measurement → V3 was structural / skipped; can't detect
  const measured = verify.v3_perf.delta?.measured_tok_s;
  if (measured === undefined || measured <= 0) return null;

  // Compute delta percentage; positive = slower than predicted
  const deltaPct = ((predictedTokS - measured) / predictedTokS) * 100;

  if (deltaPct <= thresholdPct) return null; // within tolerance

  // Cliff detected — build diagnostic for Layer G prompt
  return [
    `PERF CLIFF DETECTED: measured throughput is ${deltaPct.toFixed(1)}% below prediction.`,
    `  Predicted: ${predictedTokS.toFixed(1)} tok/s/card`,
    `  Measured:  ${measured.toFixed(1)} tok/s/card`,
    `  Threshold: ${thresholdPct}%`,
    '',
    `Likely root causes (try to address ALL in your regeneration):`,
    `  1. Inefficient memory access pattern (uncoalesced loads, no async/TMA copy)`,
    `  2. Tensor cores unused or underused (no WGMMA/MFMA, falling back to CUDA cores)`,
    `  3. Synchronization overhead (excessive __syncthreads, unnecessary fences)`,
    `  4. Wrong tile size for this hardware (BM/BN/BK suboptimal)`,
    `  5. Missing kernel fusion opportunity (sequential elementwise kernels)`,
    `  6. Bandwidth-bound loop without prefetch/double-buffer`,
    '',
    `Profile output suggests:`,
    verify.v3_perf.profiler_output ? verify.v3_perf.profiler_output.slice(0, 500) : '(none — execution-mode profiling not available; consider raising threshold or running V3 manually)',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Agent-learning YAML synthesis
// ─────────────────────────────────────────────────────────────────────────

interface SynthInput {
  input: GenerateAndVerifyInput;
  finalKernel: ProductionKernelOutput;
  finalVerify: VerifyResult;
  attempts: GenerateAndVerifyResult['attempts'];
  outcome: GenerateAndVerifyResult['outcome'];
}

export function synthesizeAgentLearning(s: SynthInput): string {
  const date = new Date().toISOString().split('T')[0];
  const modelId = s.input.generation.bundle.model.id;
  const hwId = s.input.generation.bundle.hardware.id;
  const slugify = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const id = `${slugify(modelId)}-${s.input.generation.op}-on-${slugify(hwId)}-${date}`;

  // Build observations from V results + attempt history
  const observations: string[] = [];

  // Per-gate observation
  if (s.finalVerify.v1_build.status === 'fail') {
    observations.push(formatObservation({
      kind: 'kernel-gap',
      op_or_kernel: s.input.generation.op,
      description: `Layer V V1 build gate failed after ${s.attempts.length} attempt(s). Final compiler diagnostic:\n${(s.finalVerify.v1_build.compiler_diagnostic ?? s.finalVerify.v1_build.message).slice(0, 1000)}`,
      evidence: s.finalVerify.v1_build.message,
      proposed_corpus_update: 'Investigate whether DSL example or formal_semantics reference is missing for this (op, target_arch) — see /api/agent-context/<model>-on-<hardware>.json bundle.',
    }));
  }

  if (s.finalVerify.v2_correctness.status === 'fail') {
    const failedChecks = s.finalVerify.v2_correctness.checks.filter((c) => c.status === 'fail');
    observations.push(formatObservation({
      kind: 'numerical-mismatch',
      op_or_kernel: s.input.generation.op,
      description: `Layer V V2 correctness gate failed: ${failedChecks.length} structural check(s) flagged invariant violations. Most likely cause: formal_semantics rule not surfaced in agent-context bundle for this (op, target_arch) pair.`,
      evidence: failedChecks.map((c) => `${c.name}: ${c.message}`).join('; '),
      proposed_corpus_update: 'Review formal_semantics.numerical_rules for this op — likely needs a per_library entry for the target_arch.',
    }));
  }

  if (s.outcome === 'shipped' && s.attempts.length === 1) {
    observations.push(formatObservation({
      kind: 'success-pattern',
      op_or_kernel: s.input.generation.op,
      description: `Layer G generated working code for ${s.input.generation.op} on ${s.input.generation.target_arch} on first attempt — formal_semantics + DSL examples + prior learnings sufficed without retry. Source: ${s.finalKernel.source}.`,
      evidence: `references_used: ${s.finalKernel.references_used.join(', ')}`,
    }));
  }

  if (s.outcome === 'shipped' && s.attempts.length > 1) {
    observations.push(formatObservation({
      kind: 'success-pattern',
      op_or_kernel: s.input.generation.op,
      description: `Layer G generated working code after ${s.attempts.length} attempts — first attempt failed Layer V, retry with diagnostic produced passing code. This validates the retry loop architecture.`,
      evidence: `Attempts: ${s.attempts.map((a) => `${a.attempt_number}: ${a.verify_status}`).join(', ')}`,
    }));
  }

  if (s.outcome === 'kernel-gap-blocked') {
    observations.push(formatObservation({
      kind: 'kernel-gap',
      op_or_kernel: s.input.generation.op,
      description: `Layer G + retry loop EXHAUSTED at ${s.attempts.length} attempts. (${s.input.generation.op}, ${s.input.generation.target_arch}) blocked. Manual intervention needed.`,
      evidence: `Final retry diagnostic:\n${s.finalVerify.retry_diagnostic ?? '(none)'}`,
      proposed_corpus_update: `Add or improve DSL example / formal_semantics entry for (${s.input.generation.op}, ${s.input.generation.target_arch}). Likely missing context made all 3 LLM attempts fail.`,
    }));
  }

  // Compose YAML
  const yaml = `id: ${id}
agent_run_at: '${new Date().toISOString()}'
model_id: ${modelId}
hardware_id: ${hwId}
engine_id: TODO_REVIEWER_FILL
outcome: ${s.outcome === 'shipped' ? 'shipped' : s.outcome === 'partial' ? 'partial' : 'kernel-gap-blocked'}

observations:
${observations.length > 0 ? observations.join('\n\n') : `  - kind: success-pattern
    description: |
      Layer V verification produced no observations worth recording —
      either all checks were skipped (CI without target hardware) or all
      passed without surprises.`}

# Auto-generated by scripts/agent-deploy/feedback.ts (v3.6).
# Reviewer fills perf actuals after deployment + commits to data/agent-learnings/.

perf_delta:
  # TODO(reviewer): fill after running the actual deployment
  # decode_tok_per_s_predicted: <from agent plan>
  # decode_tok_per_s_actual: <measured>
  # cost_per_m_tokens_predicted: <from agent plan>
  # cost_per_m_tokens_actual: <measured>
  # worst_delta_pct: <max delta>

triage_status: open

notes: |
  Auto-generated by Layer F feedback writer (v3.6).
  Generation source: ${s.finalKernel.source}
  Attempts: ${s.attempts.length} (max ${MAX_RETRIES})
  Verification overall: ${s.finalVerify.overall} (mode: ${s.finalVerify.mode})

  Workflow:
    1. Reviewer runs the deployment — captures actual perf
    2. Edits this file: fills perf_delta + adds post-deploy observations
    3. Moves into data/agent-learnings/ + commits
    4. /agents/learnings/ page surfaces it on next build
    5. CI validates schema; PR opens for any proposed_corpus_update

  See /agents/learnings/ for examples and CONTRIBUTING.md § 5 for the full flow.
`;

  return yaml;
}

interface ObservationInput {
  kind: 'kernel-gap' | 'perf-cliff' | 'numerical-mismatch' | 'version-skew' | 'config-drift' | 'success-pattern' | 'missing-primitive' | 'fusion-opportunity';
  op_or_kernel?: string;
  description: string;
  evidence?: string;
  proposed_corpus_update?: string;
}

function formatObservation(obs: ObservationInput): string {
  const lines = [`  - kind: ${obs.kind}`];
  if (obs.op_or_kernel) lines.push(`    op_or_kernel: ${obs.op_or_kernel}`);
  lines.push('    description: |');
  lines.push(...obs.description.split('\n').map((l) => `      ${l}`));
  if (obs.evidence) {
    lines.push('    evidence: |');
    lines.push(...obs.evidence.split('\n').map((l) => `      ${l}`));
  }
  if (obs.proposed_corpus_update) {
    lines.push('    proposed_corpus_update: |');
    lines.push(...obs.proposed_corpus_update.split('\n').map((l) => `      ${l}`));
  }
  return lines.join('\n');
}
