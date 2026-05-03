/**
 * v3.23 -- msprof (Huawei CANN Profiler) output parser.
 *
 * msprof has 3 output flavors:
 *   1. summary.csv     -- per-op aggregated time + bandwidth
 *   2. op_summary.csv  -- per-kernel timing
 *   3. ai_core_metric.csv -- per-AI-core hardware counter snapshot
 *
 * For perf-gate purposes we want ai_core_metric.csv columns:
 *   Cube Utilization (%)        -- compute throughput proxy (matmul units)
 *   Vector Utilization (%)      -- compute throughput proxy (vector units)
 *   UB Read Bandwidth (GB/s)    -- on-chip memory bandwidth
 *   UB Write Bandwidth (GB/s)
 *   GM Read Bandwidth (GB/s)    -- HBM bandwidth proxy
 *   GM Write Bandwidth (GB/s)
 *
 * Real msprof CSV header (op_summary):
 *   Op Name,OP Type,Task Type,Task Start Time(us),Task Duration(us),
 *   Task Wait Time(us),Block Dim,Mix Block Dim,Input Shapes,Input Data Types,
 *   Input Formats,Output Shapes,Output Data Types,Output Formats,
 *   Cube Utilization,Vector Utilization,...
 *
 * Reference: https://www.hiascend.com/document/detail/zh/canncommercial/
 *
 * Note: bandwidth GB/s values need normalization to peak — Ascend 910B peak
 * is ~1.6 TB/s HBM and ~50 TB/s UB. We approximate "pct of peak" as
 * value_GB/s / peak_GB/s * 100 with hardcoded peaks (per ARCH).
 */

import {
  type ProfilerParseResult,
  assessPct,
  emptyProfilerResult,
  weightedScore,
  parseCsvRow,
} from './profiler-shared';

// Hardcoded peak bandwidths per Ascend generation (used to normalize GB/s
// readings to pct-of-peak for assessment). Conservative approximations
// from vendor whitepapers.
const ASCEND_PEAK_GBS: Record<string, { hbm: number; ub: number }> = {
  '910b': { hbm: 1600, ub: 50000 },
  '910c': { hbm: 1900, ub: 60000 },
  '910d': { hbm: 2200, ub: 70000 },
  '950': { hbm: 2400, ub: 80000 },
  default: { hbm: 1600, ub: 50000 },
};

interface ParseOptions {
  /** Override Ascend gen for peak normalization. Default: '910b'. */
  ascend_gen?: string;
}

const HEADERS = {
  cube: 'Cube Utilization',
  vector: 'Vector Utilization',
  ub_read: 'UB Read Bandwidth(GB/s)',
  ub_read_alt: 'UB Read Bandwidth',
  gm_read: 'GM Read Bandwidth(GB/s)',
  gm_read_alt: 'GM Read Bandwidth',
};

export function parseMsprofCsv(csv: string, opts: ParseOptions = {}): ProfilerParseResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  // msprof CSVs use the first row as header (no metadata rows like NCU)
  const header_idx = lines.findIndex((l) => l.includes('Cube Utilization') || l.includes('Vector Utilization'));
  if (header_idx === -1) {
    return emptyProfilerResult('msprof', 'No msprof CSV header detected (expected "Cube Utilization" or "Vector Utilization" column).');
  }
  const headers = parseCsvRow(lines[header_idx]);
  const findIdx = (...candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c) => h === c || h.startsWith(c)));

  const cube_col = findIdx(HEADERS.cube);
  const vector_col = findIdx(HEADERS.vector);
  const ub_read_col = findIdx(HEADERS.ub_read, HEADERS.ub_read_alt);
  const gm_read_col = findIdx(HEADERS.gm_read, HEADERS.gm_read_alt);

  const cube_vals: number[] = [];
  const vector_vals: number[] = [];
  const ub_read_vals: number[] = [];
  const gm_read_vals: number[] = [];
  let launches = 0;

  for (let i = header_idx + 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    if (cells.length < headers.length / 2) continue;
    launches++;
    const push = (col: number, sink: number[]) => {
      if (col < 0) return;
      const v = parseFloat(cells[col]);
      if (!Number.isNaN(v)) sink.push(v);
    };
    push(cube_col, cube_vals);
    push(vector_col, vector_vals);
    push(ub_read_col, ub_read_vals);
    push(gm_read_col, gm_read_vals);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
  const cube_avg = avg(cube_vals);
  const vector_avg = avg(vector_vals);
  const ub_read_avg = avg(ub_read_vals);
  const gm_read_avg = avg(gm_read_vals);

  // Compute throughput: max(Cube, Vector) — Cube is the matmul accelerator,
  // Vector handles non-MM ops. A kernel that's heavily on one OR the other
  // should still register as compute-busy.
  const compute_throughput = cube_avg != null && vector_avg != null
    ? Math.max(cube_avg, vector_avg)
    : (cube_avg ?? vector_avg);

  // Bandwidth normalization: GM is HBM. UB is on-chip; we use it as a
  // secondary signal for "are we hitting the fast memory tier?" gate.
  const peaks = ASCEND_PEAK_GBS[opts.ascend_gen ?? 'default'] ?? ASCEND_PEAK_GBS.default;
  const gm_pct = gm_read_avg != null ? Math.min(100, (gm_read_avg / peaks.hbm) * 100) : null;
  const ub_pct = ub_read_avg != null ? Math.min(100, (ub_read_avg / peaks.ub) * 100) : null;

  const per_metric = [
    { name: 'compute_throughput', value: compute_throughput, assessment: assessPct(compute_throughput, 60, 30) },
    { name: 'gm_bandwidth_pct', value: gm_pct, assessment: assessPct(gm_pct, 70, 40) },
    { name: 'ub_bandwidth_pct', value: ub_pct, assessment: assessPct(ub_pct, 50, 20) },
  ] as const;

  const perf_score = weightedScore([
    { value: compute_throughput, weight: 0.5 },
    { value: gm_pct, weight: 0.35 },
    { value: ub_pct, weight: 0.15 },
  ]);

  const fmtPct = (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(1)}%`);
  const summary = perf_score === 0
    ? 'No measurable msprof metrics captured.'
    : `Compute ${fmtPct(compute_throughput)} (Cube=${fmtPct(cube_avg)} Vec=${fmtPct(vector_avg)}) · GM ${fmtPct(gm_pct)} · UB ${fmtPct(ub_pct)} -- score ${(perf_score * 100).toFixed(0)}/100`;

  return {
    vendor: 'msprof',
    per_metric: per_metric.map((m) => ({ ...m })),
    perf_score,
    summary,
    launches_captured: launches,
  };
}
