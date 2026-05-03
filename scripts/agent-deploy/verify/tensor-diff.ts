/**
 * v3.27 -- Tensor diff utility for cross-arch numerical comparison.
 *
 * The v3.26 cross-arch-compare.ts ships the PLAN ("run reference on
 * arch A, run new impl on arch B, diff outputs"). v3.27 adds the diff
 * step: given two binary tensor files dumped from each side, compute
 * max abs diff + max rel diff + mean abs error + a verdict against
 * the technique's tolerance.
 *
 * Format expected (lowest-common-denominator across CUDA / Ascend / HIP /
 * BANG-C kernel runners): raw fp32 binary blob (header-less). Each test
 * harness writes its output tensor as `fwrite(data, sizeof(float),
 * n_elements, fp)` so the same parser works regardless of the kernel's
 * internal dtype. Layer V's per-arch test harness (v3.28+) dequantizes
 * to fp32 before writing.
 *
 * This works locally (no remote execution required) so we can fixture-
 * test the diff logic. The end-to-end "pull tensor from remote → diff →
 * verdict" flow is wired by remote-target.ts in v3.27.
 */

import { readFile } from 'node:fs/promises';

export interface TensorDiffInput {
  /** Path to reference tensor (FP32 binary). */
  reference_path: string;
  /** Path to new-impl tensor (FP32 binary). */
  new_impl_path: string;
  /** Tolerance gates from technique YAML. */
  tolerance: {
    max_abs_diff: number;
    max_rel_diff: number;
  };
  /** Optional element-count hint (sanity-check both files match). */
  expected_elements?: number;
}

export interface TensorDiffResult {
  /** Whether the diff is within tolerance. */
  passed: boolean;
  /** Max absolute diff across all elements. */
  max_abs_diff: number;
  /** Max relative diff (|a-b| / max(|a|, |b|, eps)) across all elements. */
  max_rel_diff: number;
  /** Mean absolute error across all elements. */
  mean_abs_error: number;
  /** Number of elements compared. */
  n_elements: number;
  /** Number of elements that exceed max_abs_diff (sanity for outlier rate). */
  n_outliers_abs: number;
  /** Single-line summary for logs / agent-learning. */
  summary: string;
  /** Diagnostic if NOT passed (which threshold tripped, where). */
  diagnostic?: string;
}

/**
 * Diff two FP32 tensor binary files. Returns structured result with
 * pass/fail + per-metric values. NEVER throws on numerical issues —
 * only on file IO / shape mismatch.
 *
 * The relative diff uses |a-b| / max(|a|, |b|, eps) which is the standard
 * "useful when both values are tiny" form. eps = 1e-12 to avoid div-by-0.
 */
export async function diffTensors(input: TensorDiffInput): Promise<TensorDiffResult> {
  const ref_buf = await readFile(input.reference_path);
  const new_buf = await readFile(input.new_impl_path);

  if (ref_buf.length !== new_buf.length) {
    return {
      passed: false,
      max_abs_diff: Infinity,
      max_rel_diff: Infinity,
      mean_abs_error: Infinity,
      n_elements: 0,
      n_outliers_abs: 0,
      summary: `tensor size mismatch: reference=${ref_buf.length}B, new_impl=${new_buf.length}B`,
      diagnostic: `Cannot diff tensors of different sizes. Likely cause: kernel-runner dimensions differ between reference and new impl (check input shapes match exactly).`,
    };
  }

  if (ref_buf.length % 4 !== 0) {
    return {
      passed: false,
      max_abs_diff: Infinity,
      max_rel_diff: Infinity,
      mean_abs_error: Infinity,
      n_elements: 0,
      n_outliers_abs: 0,
      summary: `tensor file size ${ref_buf.length}B not divisible by sizeof(float)=4`,
      diagnostic: `Expected raw FP32 binary; got file size that isn't a multiple of 4 bytes.`,
    };
  }

  const n = ref_buf.length / 4;
  if (input.expected_elements != null && n !== input.expected_elements) {
    return {
      passed: false,
      max_abs_diff: Infinity,
      max_rel_diff: Infinity,
      mean_abs_error: Infinity,
      n_elements: n,
      n_outliers_abs: 0,
      summary: `expected ${input.expected_elements} elements, got ${n}`,
      diagnostic: `Element-count mismatch — kernel-runner produced wrong-sized output.`,
    };
  }

  // Read as little-endian Float32 (the universal raw-binary convention
  // for x86 + ARM + most accelerator dump formats).
  const ref = new Float32Array(ref_buf.buffer, ref_buf.byteOffset, n);
  const newt = new Float32Array(new_buf.buffer, new_buf.byteOffset, n);

  let max_abs = 0;
  let max_abs_idx = -1;
  let max_rel = 0;
  let sum_abs = 0;
  let n_outliers = 0;
  const eps = 1e-12;

  for (let i = 0; i < n; i++) {
    const a = ref[i];
    const b = newt[i];
    const abs = Math.abs(a - b);
    if (abs > max_abs) {
      max_abs = abs;
      max_abs_idx = i;
    }
    const denom = Math.max(Math.abs(a), Math.abs(b), eps);
    const rel = abs / denom;
    if (rel > max_rel) max_rel = rel;
    sum_abs += abs;
    if (abs > input.tolerance.max_abs_diff) n_outliers++;
  }

  const mean_abs_error = sum_abs / n;
  const passed = max_abs <= input.tolerance.max_abs_diff && max_rel <= input.tolerance.max_rel_diff;

  const summary =
    `n=${n} max_abs=${max_abs.toExponential(3)} max_rel=${(max_rel * 100).toFixed(2)}% ` +
    `mean_abs=${mean_abs_error.toExponential(3)} outliers=${n_outliers}/${n} (${((n_outliers / n) * 100).toFixed(2)}%) ` +
    `→ ${passed ? 'PASS' : 'FAIL'}`;

  let diagnostic: string | undefined;
  if (!passed) {
    if (max_abs > input.tolerance.max_abs_diff) {
      diagnostic =
        `max_abs_diff ${max_abs.toExponential(3)} > tolerance ${input.tolerance.max_abs_diff.toExponential(3)} ` +
        `at element [${max_abs_idx}] (ref=${ref[max_abs_idx].toExponential(3)}, new=${newt[max_abs_idx].toExponential(3)}). ` +
        `Likely cause: numerical drift in the new impl — check accumulator dtype, reduction order, or quantization scales.`;
    } else {
      diagnostic =
        `max_rel_diff ${(max_rel * 100).toFixed(2)}% > tolerance ${(input.tolerance.max_rel_diff * 100).toFixed(2)}%. ` +
        `Even though absolute differences are small, relative drift exceeds the technique's per-element threshold. ` +
        `Likely cause: signed-zero / denormal handling differences between reference and new arch.`;
    }
  }

  return {
    passed,
    max_abs_diff: max_abs,
    max_rel_diff: max_rel,
    mean_abs_error,
    n_elements: n,
    n_outliers_abs: n_outliers,
    summary,
    diagnostic,
  };
}

/**
 * Convenience helper: dump a Float32Array to a binary file in the format
 * diffTensors expects. Used by tests + by the kernel-runner harness
 * scaffolds.
 */
export async function writeTensorBinary(path: string, values: Float32Array): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  // Float32Array's underlying buffer is already little-endian on x86 + ARM
  // (the only platforms the harness runs on). Write the raw bytes.
  await writeFile(path, Buffer.from(values.buffer, values.byteOffset, values.byteLength));
}
