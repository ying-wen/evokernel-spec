/**
 * v3.22 -- NCU (NVIDIA Nsight Compute) profiler output parser.
 * v3.23 -- refactored to use profiler-shared.ts helpers (parseCsvRow,
 *          weightedScore, assessPct, emptyProfilerResult). Also returns
 *          the unified ProfilerParseResult shape so perf.ts can dispatch
 *          across all 4 vendors without vendor-specific result handling.
 *
 * Pre-v3.22 the V3 perf gate detected ncu on PATH (v3.21) but never invoked
 * it -- "available" status reported but no measured perf produced. v3.22
 * wires actual invocation + JSON output parsing for the most common case:
 * CUDA kernel + NVIDIA Hopper/Blackwell/Ampere/Ada target.
 *
 * Why NCU first (not rocprof / msprof / cnperf): NCU has the most stable
 * JSON output format, the largest install base, and the most direct map
 * from "kernel ran -- here are the metrics" to a tok/s prediction. v3.23
 * brings rocprof + msprof + cnperf to parity, all using the same shared
 * shape.
 *
 * Real ncu invocation (in v3.22+, gated behind --profile + ncu available):
 *   ncu --csv --metrics sm__throughput.avg.pct_of_peak_sustained_elapsed,
 *              dram__throughput.avg.pct_of_peak_sustained_elapsed,
 *              sm__warps_active.avg.pct_of_peak_sustained_elapsed
 *       --target-processes all --kernel-name-base regex:<op_name>
 *       --launch-skip 5 --launch-count 10 -- <test_harness>
 */

import {
  type ProfilerParseResult,
  assessPct,
  emptyProfilerResult,
  weightedScore,
  parseCsvRow,
} from './profiler-shared';

const METRIC_HEADERS = {
  sm: 'sm__throughput.avg.pct_of_peak_sustained_elapsed',
  dram: 'dram__throughput.avg.pct_of_peak_sustained_elapsed',
  occupancy: 'sm__warps_active.avg.pct_of_peak_sustained_elapsed',
};

/**
 * Parse ncu --csv output. NCU CSV is documented at
 * https://docs.nvidia.com/nsight-compute/NsightComputeCli/index.html#csv-export
 */
export function parseNcuCsv(csv: string): ProfilerParseResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);

  const header_idx = lines.findIndex((l) => l.includes('"Metric Name"') || l.includes('Metric Name'));
  if (header_idx === -1) {
    return emptyProfilerResult('ncu', 'No NCU CSV header detected -- profiler output may be from a different format.');
  }

  const header_cells = parseCsvRow(lines[header_idx]);
  const name_col = header_cells.findIndex((c) => c === 'Metric Name');
  const value_col = header_cells.findIndex((c) => c === 'Metric Value');
  if (name_col === -1 || value_col === -1) {
    return emptyProfilerResult('ncu', 'NCU CSV header missing required Metric Name / Metric Value columns.');
  }

  const collected: Record<string, number[]> = { sm: [], dram: [], occupancy: [] };
  let launches = 0;
  let last_kernel_id = '';

  for (let i = header_idx + 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    if (cells.length <= Math.max(name_col, value_col)) continue;
    const name = cells[name_col];
    const value_raw = cells[value_col];
    const id = cells[0] ?? '';
    if (id !== last_kernel_id) {
      last_kernel_id = id;
      launches++;
    }
    const value = parseFloat(value_raw);
    if (Number.isNaN(value)) continue;
    if (name === METRIC_HEADERS.sm) collected.sm.push(value);
    else if (name === METRIC_HEADERS.dram) collected.dram.push(value);
    else if (name === METRIC_HEADERS.occupancy) collected.occupancy.push(value);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
  const sm_avg = avg(collected.sm);
  const dram_avg = avg(collected.dram);
  const occupancy_avg = avg(collected.occupancy);

  const per_metric = [
    { name: 'sm_throughput', value: sm_avg, assessment: assessPct(sm_avg, 60, 30) },
    { name: 'dram_throughput', value: dram_avg, assessment: assessPct(dram_avg, 70, 40) },
    { name: 'warp_occupancy', value: occupancy_avg, assessment: assessPct(occupancy_avg, 50, 20) },
  ];

  // Perf score: SM throughput is the dominant signal for compute-bound kernels;
  // DRAM matters for bandwidth-bound (attention, reduction); occupancy is a
  // secondary gate (high occupancy doesn't guarantee perf, but very low is bad).
  const perf_score = weightedScore([
    { value: sm_avg, weight: 0.5 },
    { value: dram_avg, weight: 0.35 },
    { value: occupancy_avg, weight: 0.15 },
  ]);

  const fmtPct = (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(1)}%`);
  const summary = perf_score === 0
    ? 'No measurable NCU metrics captured.'
    : `SM ${fmtPct(sm_avg)} · DRAM ${fmtPct(dram_avg)} · Occ ${fmtPct(occupancy_avg)} -- score ${(perf_score * 100).toFixed(0)}/100`;

  return {
    vendor: 'ncu',
    per_metric,
    perf_score,
    summary,
    launches_captured: launches,
  };
}

/**
 * Backwards-compat type alias for v3.22 callers that imported NcuParseResult.
 * v3.23+ should consume ProfilerParseResult directly.
 *
 * @deprecated -- use ProfilerParseResult from ./profiler-shared.
 */
export type NcuParseResult = ProfilerParseResult;
