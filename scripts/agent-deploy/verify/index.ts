/**
 * v3.5 — Layer V (Verification) orchestrator.
 *
 * Wraps V1 (build) → V2 (correctness) → V3 (perf) into one entry point.
 * Each gate has 2 modes:
 *   - structural: static analysis only (works everywhere, CI-safe)
 *   - execution:  real compile/run/profile (requires target hardware)
 *
 * Contribution flow:
 *   - Structural gates BLOCK PRs (always run in CI)
 *   - Execution gates REPORT-ONLY (run when contributor has target hw)
 *
 * Used by:
 *   - scripts/agent-deploy/index.ts Stage 6 (auto-runs after Layer G generates code)
 *   - Layer F retry loop (v3.6+: regenerate with diagnostic if V fails)
 *   - Plugin surfaces (v3.7+: Codex / Claude Code agents call verify directly)
 *
 * See docs/superpowers/specs/2026-05-03-productized-agent.md § Layer V.
 */

import { runBuildGate, type BuildGateInput, type BuildGateResult } from './build';
import { runCorrectnessGate, type CorrectnessGateInput, type CorrectnessGateResult } from './correctness';
import { runPerfGate, type PerfGateInput, type PerfGateResult } from './perf';

export type VerifyMode = 'structural' | 'execution';
export type VerifyOverallStatus = 'pass' | 'fail' | 'partial' | 'skipped';

export interface VerifyInput {
  /** The generated kernel code to verify. */
  code: string;
  /** Source language (cuda-cpp / hip / ascend-c / bang-c / triton / etc.). */
  language: string;
  /** Op id (matmul / attention / rmsnorm / etc.) — drives correctness fixture selection. */
  op: string;
  /** Target arch — drives compiler selection. */
  target_arch: string;
  /**
   * Optional: numerical_rules from formal_semantics. Drives correctness tolerance.
   * If absent, defaults to FP16/BF16 default tolerance (1e-3 absolute, 1e-2 relative).
   */
  numerical_rules?: Array<{ aspect: string; per_library: Record<string, string>; notes?: string }>;
  /**
   * Reference PyTorch impl from formal_semantics. Used by V2 correctness for shadow execution.
   * If absent, V2 falls back to structural-only.
   */
  reference_impl_python?: string;
  /**
   * If true: run all execution-mode gates (requires target hardware + compilers).
   * If false: structural mode only (safe for CI without hardware).
   */
  execution_mode?: boolean;
}

export interface VerifyResult {
  overall: VerifyOverallStatus;
  mode: VerifyMode;
  v1_build: BuildGateResult;
  v2_correctness: CorrectnessGateResult;
  v3_perf: PerfGateResult;
  /** Markdown summary suitable for printing in agent-deploy CLI / PR comments. */
  summary_md: string;
  /**
   * Diagnostic for Layer G retry (v3.6+) — present only when overall === 'fail'.
   * Contains the most actionable failure reason for the LLM to address on retry.
   */
  retry_diagnostic?: string;
  /** Total wall-clock time across all gates (ms). */
  duration_ms: number;
}

export async function runVerification(input: VerifyInput): Promise<VerifyResult> {
  const start = Date.now();
  const mode: VerifyMode = input.execution_mode === true ? 'execution' : 'structural';

  // V1 — Build gate (compile if compiler available; structural otherwise)
  const v1: BuildGateResult = await runBuildGate({
    code: input.code,
    language: input.language,
    target_arch: input.target_arch,
    op: input.op,
    mode,
  });

  // V2 — Correctness gate
  // If V1 failed in structural mode, V2 still runs (structural-only checks
  // independent of build success). In execution mode, V2 requires V1 to pass.
  const v2: CorrectnessGateResult = await runCorrectnessGate({
    code: input.code,
    language: input.language,
    op: input.op,
    target_arch: input.target_arch,
    numerical_rules: input.numerical_rules,
    reference_impl_python: input.reference_impl_python,
    mode,
    skip_reason: mode === 'execution' && v1.status === 'fail' ? 'V1 build failed; cannot run V2 execution.' : undefined,
  });

  // V3 — Perf gate (always optional; placeholder in v3.5)
  const v3: PerfGateResult = await runPerfGate({
    code: input.code,
    language: input.language,
    target_arch: input.target_arch,
    op: input.op,
    mode,
    skip_reason: v1.status === 'fail' || v2.status === 'fail' ? 'Earlier gate failed; perf measurement skipped.' : undefined,
  });

  const overall = computeOverallStatus(v1, v2, v3);
  const retry_diagnostic = overall === 'fail' ? buildRetryDiagnostic(v1, v2, v3) : undefined;
  const summary_md = buildSummaryMarkdown(input, mode, v1, v2, v3, overall);

  return {
    overall,
    mode,
    v1_build: v1,
    v2_correctness: v2,
    v3_perf: v3,
    summary_md,
    retry_diagnostic,
    duration_ms: Date.now() - start,
  };
}

function computeOverallStatus(
  v1: BuildGateResult,
  v2: CorrectnessGateResult,
  v3: PerfGateResult
): VerifyOverallStatus {
  // Hard fail: any blocking gate failed
  if (v1.status === 'fail' || v2.status === 'fail') return 'fail';

  // V3 perf failure is degraded but not blocking (perf cliff != correctness bug)
  if (v3.status === 'fail') return 'partial';

  // All-skipped is "skipped" (e.g., structural mode + no compiler available)
  if (v1.status === 'skipped' && v2.status === 'skipped' && v3.status === 'skipped') return 'skipped';

  // Some passed, some skipped: partial
  if (v1.status === 'skipped' || v2.status === 'skipped' || v3.status === 'skipped') return 'partial';

  return 'pass';
}

function buildRetryDiagnostic(
  v1: BuildGateResult,
  v2: CorrectnessGateResult,
  _v3: PerfGateResult
): string {
  const parts: string[] = [];
  if (v1.status === 'fail') {
    parts.push(`V1 build failed: ${v1.message}`);
    if (v1.compiler_diagnostic) parts.push(`Compiler output:\n${v1.compiler_diagnostic.slice(0, 2000)}`);
  }
  if (v2.status === 'fail') {
    parts.push(`V2 correctness failed: ${v2.message}`);
    if (v2.checks?.length) {
      const failed = v2.checks.filter((c) => c.status === 'fail');
      if (failed.length) parts.push(`Failed checks:\n${failed.map((f) => `- ${f.name}: ${f.message}`).join('\n')}`);
    }
  }
  return parts.join('\n\n');
}

function buildSummaryMarkdown(
  input: VerifyInput,
  mode: VerifyMode,
  v1: BuildGateResult,
  v2: CorrectnessGateResult,
  v3: PerfGateResult,
  overall: VerifyOverallStatus
): string {
  const icon = (s: string) => (s === 'pass' ? '✅' : s === 'fail' ? '❌' : s === 'skipped' ? '⏭️' : '⚠️');
  const lines = [
    `# Verification — ${input.op} on ${input.target_arch}`,
    '',
    `**Overall:** ${icon(overall)} ${overall.toUpperCase()}  ·  **Mode:** ${mode}`,
    '',
    '## Gates',
    '',
    `| Gate | Status | Detail |`,
    `|---|---|---|`,
    `| V1 — Build | ${icon(v1.status)} ${v1.status} | ${v1.message} |`,
    `| V2 — Correctness | ${icon(v2.status)} ${v2.status} | ${v2.message} |`,
    `| V3 — Perf | ${icon(v3.status)} ${v3.status} | ${v3.message} |`,
    '',
  ];
  if (v2.checks?.length) {
    lines.push('## V2 structural checks', '');
    for (const c of v2.checks) lines.push(`- ${icon(c.status)} **${c.name}**: ${c.message}`);
    lines.push('');
  }
  if (overall === 'partial' || overall === 'skipped') {
    lines.push('## Notes', '');
    lines.push('Some gates were skipped — typically because the corresponding compiler / target hardware was not available.');
    lines.push('Structural checks ran where possible. Run again on a host with the target compiler + hardware for full execution-mode verification.');
    lines.push('');
  }
  return lines.join('\n');
}
