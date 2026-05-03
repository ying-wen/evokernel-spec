/**
 * v3.26 -- Cross-arch numerical verify scaffold.
 *
 * Pre-v3.26 the V2 (correctness) gate compared a generated kernel against
 * the op's per-library `formal_semantics.reference_impl` snippet (a
 * PyTorch reference). That works for vendor-agnostic correctness, but
 * doesn't catch *technique-specific* numerical drift.
 *
 * Example: SageAttention's CUDA kernel uses INT8 attention with FP8
 * outliers. A plausible-looking Ascend-C port that uses pure FP16 would
 * pass the op's per-library "FP32 accumulator" rule but FAIL to reproduce
 * SageAttention's specific numerical signature (3-5% MSE drift on
 * long-context attention scores).
 *
 * This file is the v3.26 scaffold for cross-arch verify:
 *   - Structural pre-check: does the technique have a reference_impl?
 *   - Plan emission: what would full numerical comparison look like
 *     (input shapes, tolerance, where each side runs)?
 *   - Skip with diagnostic when the new impl can't run yet
 *
 * Real numerical execution lands in v3.27 (requires the SSH remote-target
 * executor from this same release + a kernel-runner that produces tensor
 * outputs from both reference and generated kernels for diff).
 */

import type { Technique } from '@evokernel/schemas';

export interface CrossArchCompareInput {
  /** The technique entity loaded from data/techniques/<id>.yaml. */
  technique: Technique;
  /** Target arch family for the new port. */
  target_arch_family: string;
  /** The generated kernel code (text) — for structural pre-checks. */
  generated_code: string;
  /** Language of the generated kernel. */
  generated_language: string;
}

export interface CrossArchComparePlan {
  /** Whether full numerical compare is feasible right now. */
  ready_to_execute: boolean;
  /** Human-readable summary of why ready or why not. */
  summary: string;
  /** Structural pre-checks (run regardless of execution feasibility). */
  pre_checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn' | 'skipped';
    message: string;
  }>;
  /**
   * Plan for the numerical comparison if ready_to_execute is true. Each
   * step describes "run this code on this arch with these inputs, dump
   * tensor to this file, then diff against the other side". v3.27 wires
   * the remote-target executor to actually run these steps.
   */
  comparison_steps?: Array<{
    side: 'reference' | 'new-impl';
    arch_family: string;
    description: string;
    expected_output_path: string;
  }>;
  /** Tolerance the diff step would use (per technique's numerical_rules). */
  tolerance?: { max_abs_diff: number; max_rel_diff: number };
}

/**
 * Build a cross-arch compare plan. Pure function — no I/O, no execution.
 * v3.26 emits the plan as a structural step in the deploy manifest.
 * v3.27 wires the actual execution via remote-target.ts.
 */
export function planCrossArchCompare(input: CrossArchCompareInput): CrossArchComparePlan {
  const pre_checks: CrossArchComparePlan['pre_checks'] = [];

  // Pre-check 1: technique has a reference impl (else nothing to compare against).
  const ref = input.technique.reference_impl;
  if (!ref || !ref.repo) {
    pre_checks.push({
      name: 'technique-has-reference-impl',
      status: 'fail',
      message: `Technique "${input.technique.name}" has no reference_impl — cannot cross-arch verify.`,
    });
    return {
      ready_to_execute: false,
      summary: 'No reference impl on technique; cross-arch verify skipped.',
      pre_checks,
    };
  }
  pre_checks.push({
    name: 'technique-has-reference-impl',
    status: 'pass',
    message: `Reference impl: ${ref.framework} @ ${ref.repo}${ref.entry ? ` (${ref.entry})` : ''}`,
  });

  // Pre-check 2: technique declares numerical_rules (else nothing to gate against).
  if (!input.technique.numerical_rules || input.technique.numerical_rules.length === 0) {
    pre_checks.push({
      name: 'technique-has-numerical-rules',
      status: 'warn',
      message: `Technique declares no numerical_rules — comparison would only check shape, not numerics.`,
    });
  } else {
    pre_checks.push({
      name: 'technique-has-numerical-rules',
      status: 'pass',
      message: `${input.technique.numerical_rules.length} numerical rule(s) will gate the diff: ${input.technique.numerical_rules.map((r) => r.aspect).join(', ')}`,
    });
  }

  // Pre-check 3: target arch family is in the technique's port_targets
  // (otherwise we're doing a port the technique author hasn't anticipated).
  const port_target = input.technique.port_targets.find((p) => p.arch_family === input.target_arch_family);
  if (!port_target) {
    pre_checks.push({
      name: 'target-arch-in-port-targets',
      status: 'warn',
      message: `Target arch "${input.target_arch_family}" not in technique's port_targets — proceeding as greenfield (technique author hasn't pre-vetted this combination).`,
    });
  } else {
    pre_checks.push({
      name: 'target-arch-in-port-targets',
      status: 'pass',
      message: `Target arch "${input.target_arch_family}" present in port_targets (status: ${port_target.status}).`,
    });
  }

  // Pre-check 4: generated code is non-empty + has a recognizable kernel signature.
  if (!input.generated_code || input.generated_code.length < 100) {
    pre_checks.push({
      name: 'generated-code-non-empty',
      status: 'fail',
      message: `Generated code is too short (${input.generated_code.length} chars) — likely a stub or empty file.`,
    });
    return {
      ready_to_execute: false,
      summary: 'Generated code is empty/stub; cross-arch verify needs a real kernel.',
      pre_checks,
    };
  }
  pre_checks.push({
    name: 'generated-code-non-empty',
    status: 'pass',
    message: `Generated code: ${input.generated_code.length} chars in ${input.generated_language}.`,
  });

  // Build the plan (the SHAPE of comparison, not the execution).
  const ref_arch = input.technique.applicable_to.hardware_arch_families[0] ?? 'hopper';
  const comparison_steps: CrossArchComparePlan['comparison_steps'] = [
    {
      side: 'reference',
      arch_family: ref_arch,
      description: `Run technique reference impl (${ref.framework} @ ${ref.repo}${ref.entry ? ` / ${ref.entry}` : ''}) on a representative input shape; dump output tensor.`,
      expected_output_path: `agent-deploy-output/cross-arch-verify/reference-${ref_arch}.tensor`,
    },
    {
      side: 'new-impl',
      arch_family: input.target_arch_family,
      description: `Run new generated kernel (${input.generated_language}) on the SAME input shape via SSH remote-target; dump output tensor.`,
      expected_output_path: `agent-deploy-output/cross-arch-verify/new-${input.target_arch_family}.tensor`,
    },
  ];

  return {
    ready_to_execute: false,  // v3.26 ships the plan, v3.27 ships the execution
    summary:
      `Cross-arch verify plan ready: compare ${input.technique.name} reference (${ref_arch}) vs new ${input.target_arch_family} port. ` +
      `v3.26 emits the plan; v3.27 will execute via SSH remote-target + numerical diff.`,
    pre_checks,
    comparison_steps,
    tolerance: { max_abs_diff: 1e-2, max_rel_diff: 5e-2 },  // FP16-conservative defaults; v3.27 reads from technique
  };
}
