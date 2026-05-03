/**
 * v3.23 -- rocprof (AMD ROCm Profiler) output parser.
 *
 * rocprof emits two flavors:
 *   1. results.csv  -- per-kernel rows with KernelName, Calls, TotalDurationNs,
 *                      AverageNs, Percentage, plus optional --hsa-trace metrics
 *   2. results.stats.csv -- aggregated stats per kernel (durations only, no
 *                           counters)
 *
 * For perf-gate purposes we want HARDWARE COUNTERS, which require:
 *   rocprof --hip-trace --hsa-trace -i input.txt --output-dir runs/
 * with input.txt listing the metrics:
 *   pmc: SQ_WAVES SQ_INSTS_VALU SQ_INSTS_VALU_ADD_F32 ...
 *   pmc: GRBM_GUI_ACTIVE GRBM_COUNT
 *
 * This parser handles the merged CSV that rocprof produces when given a
 * pmc-list. Metrics we extract:
 *
 *   VALUUtilization  -> compute throughput proxy
 *   GRBM_COUNT       -> memory bandwidth proxy (when divided by peak)
 *   GUI_ACTIVE %     -> occupancy proxy
 *
 * Real rocprof CSV header (post-process):
 *   "KernelName","gpu-id","queue-id","queue-index","pid","tid","grd","wgr",
 *   "lds","scr","arch_vgpr","accum_vgpr","sgpr","wave_size","sig",
 *   "DispatchNs","BeginNs","EndNs","CompleteNs","DurationNs",
 *   "VALUUtilization","SALUUtilization","GRBM_COUNT", ...
 *
 * Reference: https://rocm.docs.amd.com/projects/rocprofiler/en/latest/
 */

import {
  type ProfilerParseResult,
  assessPct,
  emptyProfilerResult,
  weightedScore,
  parseCsvRow,
} from './profiler-shared';

const ROCPROF_METRIC_HEADERS = {
  valu_util: 'VALUUtilization',
  salu_util: 'SALUUtilization',
  // GRBM_COUNT is raw cycles; we approximate "% of duration spent active"
  grbm_count: 'GRBM_COUNT',
  duration_ns: 'DurationNs',
  // GFXBUSY / MemBusy are higher-level summaries available with --basenames on
  mem_unit_busy: 'MemUnitBusy',
  fetch_size: 'FetchSize', // bytes/launch from L2; bandwidth proxy
};

export function parseRocprofCsv(csv: string): ProfilerParseResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  // rocprof CSVs always start with the column header row.
  const header_idx = lines.findIndex((l) =>
    l.includes('"KernelName"') || l.startsWith('KernelName,') || l.includes(',VALUUtilization')
  );
  if (header_idx === -1) {
    return emptyProfilerResult('rocprof', 'No rocprof CSV header detected (expected KernelName / VALUUtilization column).');
  }
  const headers = parseCsvRow(lines[header_idx]);
  const idx = (name: string) => headers.findIndex((h) => h === name);
  const valu_col = idx(ROCPROF_METRIC_HEADERS.valu_util);
  const salu_col = idx(ROCPROF_METRIC_HEADERS.salu_util);
  const mem_busy_col = idx(ROCPROF_METRIC_HEADERS.mem_unit_busy);

  const valu_vals: number[] = [];
  const salu_vals: number[] = [];
  const mem_vals: number[] = [];
  let launches = 0;

  for (let i = header_idx + 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    if (cells.length < headers.length / 2) continue;
    launches++;
    if (valu_col >= 0) {
      const v = parseFloat(cells[valu_col]);
      if (!Number.isNaN(v)) valu_vals.push(v);
    }
    if (salu_col >= 0) {
      const v = parseFloat(cells[salu_col]);
      if (!Number.isNaN(v)) salu_vals.push(v);
    }
    if (mem_busy_col >= 0) {
      const v = parseFloat(cells[mem_busy_col]);
      if (!Number.isNaN(v)) mem_vals.push(v);
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
  const valu_avg = avg(valu_vals);
  const salu_avg = avg(salu_vals);
  const mem_avg = avg(mem_vals);

  // Compute throughput: VALU is the dominant signal; SALU rarely high
  // unless the kernel is mostly scalar control. Cap at "compute_throughput
  // = max(VALU, SALU)" as a rough proxy.
  const compute_throughput = valu_avg != null && salu_avg != null
    ? Math.max(valu_avg, salu_avg)
    : (valu_avg ?? salu_avg);

  const per_metric = [
    { name: 'compute_throughput', value: compute_throughput, assessment: assessPct(compute_throughput, 60, 30) },
    { name: 'mem_unit_busy', value: mem_avg, assessment: assessPct(mem_avg, 70, 40) },
    { name: 'valu_util', value: valu_avg, assessment: assessPct(valu_avg, 50, 20) },
  ] as const;

  const perf_score = weightedScore([
    { value: compute_throughput, weight: 0.5 },
    { value: mem_avg, weight: 0.35 },
    { value: valu_avg, weight: 0.15 },
  ]);

  const fmtPct = (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(1)}%`);
  const summary = perf_score === 0
    ? 'No measurable rocprof metrics captured.'
    : `Compute ${fmtPct(compute_throughput)} · Mem ${fmtPct(mem_avg)} · VALU ${fmtPct(valu_avg)} -- score ${(perf_score * 100).toFixed(0)}/100`;

  return {
    vendor: 'rocprof',
    per_metric: per_metric.map((m) => ({ ...m })),
    perf_score,
    summary,
    launches_captured: launches,
  };
}
