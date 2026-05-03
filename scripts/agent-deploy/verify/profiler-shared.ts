/**
 * v3.23 -- shared profiler parse-result shape.
 *
 * NCU (v3.22), rocprof, msprof, cnperf, suprof, instruments — each emits
 * a different output format, but the V3 perf gate needs a uniform shape
 * to consume. This file defines the common contract; each parser file
 * (ncu-parser.ts, rocprof-parser.ts, msprof-parser.ts, cnperf-parser.ts,
 * etc) maps its vendor-specific format into this shape.
 *
 * Score normalization: every parser produces a perf_score in [0, 1] using
 * weighted vendor-specific metrics that approximate the same three things:
 *   - compute throughput vs peak  (the "are we using the math units?" gate)
 *   - memory throughput vs peak    (the "are we using the bandwidth?" gate)
 *   - occupancy vs peak             (the "are we keeping the units busy?" gate)
 *
 * Each metric maps to good/ok/warn/unknown via vendor-specific thresholds
 * (compute units differ — Hopper SMs are not Ascend AI Cores). The pass
 * threshold for the gate is a uniform perf_score >= 0.5.
 */

export interface ProfilerMetric {
  /** Canonical metric name -- vendor-specific but consistent within a parser. */
  name: string;
  /** Measured value (typically pct of peak, 0-100). null = not present in output. */
  value: number | null;
  /** Health classification. */
  assessment: 'good' | 'ok' | 'warn' | 'unknown';
}

export interface ProfilerParseResult {
  /** Which vendor profiler produced this (display only). */
  vendor: 'ncu' | 'rocprof' | 'msprof' | 'cnperf' | 'suprof' | 'instruments';
  /** Vendor-specific metrics extracted. */
  per_metric: ProfilerMetric[];
  /** Combined perf_score in [0, 1]. >=0.5 passes the V3 gate. */
  perf_score: number;
  /** Single-line human-readable summary. */
  summary: string;
  /** Number of kernel launches captured (post --launch-skip). */
  launches_captured: number;
}

/** Shared assessment helper -- all parsers can re-use these thresholds. */
export function assessPct(value: number | null, good: number, warn: number): ProfilerMetric['assessment'] {
  if (value == null) return 'unknown';
  if (value >= good) return 'good';
  if (value >= warn) return 'ok';
  return 'warn';
}

/** Shared empty-result builder for "header missing / unparseable" cases. */
export function emptyProfilerResult(vendor: ProfilerParseResult['vendor'], reason: string): ProfilerParseResult {
  return {
    vendor,
    per_metric: [],
    perf_score: 0,
    summary: reason,
    launches_captured: 0,
  };
}

/**
 * Compute weighted average across present (non-null) metrics. Each pair is
 * (value, weight) where value is pct (0-100). Returns score in [0, 1].
 *
 * Used by every parser so the score-computation logic is identical across
 * vendors — only the choice of metrics + weights differs.
 */
export function weightedScore(components: Array<{ value: number | null; weight: number }>): number {
  const present = components.filter((c) => c.value != null);
  if (present.length === 0) return 0;
  const total_weight = present.reduce((a, c) => a + c.weight, 0);
  if (total_weight === 0) return 0;
  const sum = present.reduce((a, c) => a + (c.value as number) * c.weight, 0);
  return sum / (total_weight * 100);
}

/** Parse a CSV row (handles quoted strings; NOT escaped quotes / multi-line). */
export function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    let cell = '';
    if (line[i] === '"') {
      i++;
      while (i < line.length && line[i] !== '"') {
        cell += line[i];
        i++;
      }
      i++; // closing quote
    } else {
      while (i < line.length && line[i] !== ',') {
        cell += line[i];
        i++;
      }
    }
    out.push(cell);
    if (line[i] === ',') i++;
  }
  return out;
}
