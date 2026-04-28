// Empirical efficiency calibration: ratio of measured decode throughput to
// theoretical roofline upper bound, averaged across all cases for a (hardware, precision)
// or (hardware) bucket. Falls back to the default 0.5 fudge when no cases exist.

import type { Hardware, Model, Case } from '@evokernel/schemas';
import type { Precision } from './types.ts';
import { computeRoofline } from './index.ts';

export interface EfficiencyEntry {
  /** Mean ratio of measured / theoretical (0..1, capped at 1.5 to absorb data noise). */
  factor: number;
  /** How many cases contributed. */
  sampleCount: number;
  /** Min and max observed ratios across the sample (signals confidence). */
  min: number;
  max: number;
  /** Population standard deviation of the ratios. >0.15 → high variance signal. */
  stddev: number;
}

const DEFAULT_FACTOR = 0.5;

const PEAK_BY_PRECISION = (h: Hardware, p: Precision): number | null => {
  const c = h.compute;
  switch (p) {
    case 'fp4': return c.fp4_tflops?.value ?? null;
    case 'fp8': return c.fp8_tflops?.value ?? null;
    case 'bf16': return c.bf16_tflops?.value ?? null;
    case 'fp16': return c.fp16_tflops?.value ?? null;
    case 'int8': return c.int8_tops?.value ?? null;
  }
};

const PRECISION_MAP: Record<string, Precision> = {
  bf16: 'bf16', fp16: 'fp16',
  'fp8-e4m3': 'fp8', 'fp8-e5m2': 'fp8',
  fp4: 'fp4',
  int8: 'int8',
  'int4-awq': 'int8', 'int4-gptq': 'int8', 'w4a16': 'int8'
};

function caseTheoreticalUpper(c: Case, hardware: Hardware[], models: Model[]): number | null {
  const hw = hardware.find((h) => h.id === c.stack.hardware.id);
  const m = models.find((mm) => mm.id === c.stack.model.id);
  if (!hw || !m) return null;

  const precision = PRECISION_MAP[c.stack.quantization] ?? 'bf16';
  const peak = PEAK_BY_PRECISION(hw, precision);
  const peakBw = hw.memory.bandwidth_gbps?.value;
  if (!peak || !peakBw) return null;

  const totalFlops = m.operator_decomposition.reduce((a, op) => a + op.flops_per_token, 0);
  const totalBytes = m.operator_decomposition.reduce((a, op) => a + op.bytes_per_token, 0);
  if (!totalFlops || !totalBytes) return null;

  const roofline = computeRoofline({
    flopsPerToken: totalFlops,
    bytesPerToken: totalBytes,
    peakComputeTflops: peak,
    peakMemoryBwGbps: peakBw,
    efficiencyFactor: 1.0 // measured ratio so we want raw upper bound
  });
  return roofline.decodeThroughputUpperBound;
}

/**
 * Build a (hardwareId → EfficiencyEntry) map from the corpus of cases.
 * Each case contributes (measured_decode / theoretical_upper) one ratio.
 * Results clamped to [0, 1.5] (anything above 1 is data noise; we keep some headroom).
 */
export function buildEfficiencyMap(
  cases: Case[],
  hardware: Hardware[],
  models: Model[]
): Map<string, EfficiencyEntry> {
  const buckets = new Map<string, number[]>();
  for (const c of cases) {
    const upper = caseTheoreticalUpper(c, hardware, models);
    if (upper === null || upper <= 0) continue;
    // Per-card measured throughput
    const perCard = c.results.throughput_tokens_per_sec.decode / Math.max(c.stack.hardware.count, 1);
    const ratio = Math.min(1.5, Math.max(0, perCard / upper));
    if (!Number.isFinite(ratio)) continue;
    const arr = buckets.get(c.stack.hardware.id) ?? [];
    arr.push(ratio);
    buckets.set(c.stack.hardware.id, arr);
  }
  const out = new Map<string, EfficiencyEntry>();
  for (const [hwId, ratios] of buckets) {
    const factor = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    // Population stddev (we treat the corpus as the entire universe of observations,
    // not a sample to extrapolate from)
    const variance = ratios.reduce((acc, r) => acc + (r - factor) ** 2, 0) / ratios.length;
    const stddev = Math.sqrt(variance);
    out.set(hwId, {
      factor,
      sampleCount: ratios.length,
      min: Math.min(...ratios),
      max: Math.max(...ratios),
      stddev
    });
  }
  return out;
}

/**
 * Return the calibrated efficiency for a given hardware id, or the default.
 * `isCalibrated` lets the UI flag "based on N cases" vs default.
 * `stddev` and `min`/`max` let the UI surface confidence: stddev > 0.15
 * usually means multiple workload regimes are mixed in the corpus.
 */
export function getEfficiency(
  hwId: string,
  map: Map<string, EfficiencyEntry>
): { factor: number; isCalibrated: boolean; sampleCount: number; stddev: number; min: number; max: number } {
  const entry = map.get(hwId);
  if (!entry) return { factor: DEFAULT_FACTOR, isCalibrated: false, sampleCount: 0, stddev: 0, min: 0, max: 0 };
  return {
    factor: entry.factor,
    isCalibrated: true,
    sampleCount: entry.sampleCount,
    stddev: entry.stddev,
    min: entry.min,
    max: entry.max
  };
}
