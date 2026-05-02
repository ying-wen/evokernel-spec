/**
 * v3.22 -- NCU (NVIDIA Nsight Compute) profiler output parser.
 *
 * Pre-v3.22 the V3 perf gate detected ncu on PATH (v3.21) but never invoked
 * it -- "available" status reported but no measured perf produced. v3.22
 * wires actual invocation + JSON output parsing for the most common case:
 * CUDA kernel + NVIDIA Hopper/Blackwell/Ampere/Ada target.
 *
 * Why NCU first (not rocprof / msprof / cnperf): NCU has the most stable
 * JSON output format, the largest install base, and the most direct map
 * from "kernel ran -- here are the metrics" to a tok/s prediction. Other
 * profilers land in subsequent micro-releases (v3.23+) once we have NCU
 * reference output to compare against.
 *
 * Scope of this parser:
 *   - Parse ncu --csv (preferred over JSON for stability across versions)
 *   - Extract SM utilization, memory bandwidth, achieved occupancy
 *   - Convert to a perf-friendliness score [0, 1] for V3 gate
 *
 * Real ncu invocation (in v3.22, gated behind --profile + ncu available):
 *   ncu --csv --metrics sm__throughput.avg.pct_of_peak_sustained_elapsed,
 *              dram__throughput.avg.pct_of_peak_sustained_elapsed,
 *              sm__warps_active.avg.pct_of_peak_sustained_elapsed
 *       --target-processes all --kernel-name-base regex:<op_name>
 *       --launch-skip 5 --launch-count 10 -- <test_harness>
 *
 * Test harness wiring (the kernel-runner that invokes the generated code)
 * is a separate concern; this file is the OUTPUT parser, agnostic to how
 * ncu was invoked.
 */

export interface NcuMetrics {
  /** SM throughput as pct of peak sustained elapsed (0-100). */
  sm_throughput_pct: number | null;
  /** DRAM throughput as pct of peak sustained elapsed (0-100). */
  dram_throughput_pct: number | null;
  /** Warp occupancy as pct of peak sustained elapsed (0-100). */
  warp_occupancy_pct: number | null;
  /** Number of kernel launches captured (after --launch-skip). */
  launches_captured: number;
}

export interface NcuParseResult {
  /** Parsed metrics; null if section was missing in the CSV. */
  metrics: NcuMetrics;
  /** Heuristic perf-friendliness score [0, 1]. Higher is better. */
  perf_score: number;
  /** Single-line human-readable summary. */
  summary: string;
  /** Per-metric pass/warn assessment. */
  per_metric: Array<{ name: string; value: number | null; assessment: 'good' | 'ok' | 'warn' | 'unknown' }>;
}

const METRIC_HEADERS = {
  sm: 'sm__throughput.avg.pct_of_peak_sustained_elapsed',
  dram: 'dram__throughput.avg.pct_of_peak_sustained_elapsed',
  occupancy: 'sm__warps_active.avg.pct_of_peak_sustained_elapsed',
};

/**
 * Parse ncu --csv output. NCU CSV is documented at
 * https://docs.nvidia.com/nsight-compute/NsightComputeCli/index.html#csv-export
 *
 * Real CSV shape (after stripping NCU headers):
 *
 *   "ID","Process ID","Process Name","Host Name","Kernel Name","Block Size", ...
 *   "Metric Name","Metric Unit","Metric Value"
 *   "0","12345","./bench","localhost","gemm_kernel","256",...,
 *     "sm__throughput.avg.pct_of_peak_sustained_elapsed","%","78.4"
 *
 * We don't try to support every NCU CSV variant -- we look for known metric
 * rows and average their values across all captured kernel launches.
 */
export function parseNcuCsv(csv: string): NcuParseResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);

  // Find header row (contains "Metric Name" column)
  const header_idx = lines.findIndex((l) => l.includes('"Metric Name"') || l.includes('Metric Name'));
  if (header_idx === -1) {
    return emptyResult('No NCU CSV header detected -- profiler output may be from a different format.');
  }

  const header_cells = parseCsvRow(lines[header_idx]);
  const name_col = header_cells.findIndex((c) => c === 'Metric Name');
  const unit_col = header_cells.findIndex((c) => c === 'Metric Unit');
  const value_col = header_cells.findIndex((c) => c === 'Metric Value');
  if (name_col === -1 || value_col === -1) {
    return emptyResult('NCU CSV header missing required Metric Name / Metric Value columns.');
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
  const metrics: NcuMetrics = {
    sm_throughput_pct: avg(collected.sm),
    dram_throughput_pct: avg(collected.dram),
    warp_occupancy_pct: avg(collected.occupancy),
    launches_captured: launches,
  };
  const per_metric = [
    { name: 'sm_throughput', value: metrics.sm_throughput_pct, assessment: assess(metrics.sm_throughput_pct, 60, 30) },
    { name: 'dram_throughput', value: metrics.dram_throughput_pct, assessment: assess(metrics.dram_throughput_pct, 70, 40) },
    { name: 'warp_occupancy', value: metrics.warp_occupancy_pct, assessment: assess(metrics.warp_occupancy_pct, 50, 20) },
  ] as const;

  // Perf score: weighted average. SM throughput is the most direct signal
  // for compute-bound kernels (matmul/conv); DRAM matters for bandwidth-bound
  // (attention, reduction); occupancy is a secondary gate (high occupancy
  // doesn't guarantee perf, but very low occupancy is almost always bad).
  const score_components: Array<{ value: number | null; weight: number }> = [
    { value: metrics.sm_throughput_pct, weight: 0.5 },
    { value: metrics.dram_throughput_pct, weight: 0.35 },
    { value: metrics.warp_occupancy_pct, weight: 0.15 },
  ];
  const present = score_components.filter((c) => c.value != null);
  const total_weight = present.reduce((a, c) => a + c.weight, 0);
  const perf_score = total_weight === 0
    ? 0
    : present.reduce((a, c) => a + (c.value as number) * c.weight, 0) / (total_weight * 100);

  const summary = perf_score === 0
    ? 'No measurable metrics captured.'
    : `SM ${pct(metrics.sm_throughput_pct)} · DRAM ${pct(metrics.dram_throughput_pct)} · Occ ${pct(metrics.warp_occupancy_pct)} -- score ${(perf_score * 100).toFixed(0)}/100`;

  return {
    metrics,
    perf_score,
    summary,
    per_metric: per_metric.map((m) => ({ ...m })),
  };
}

function pct(v: number | null): string {
  return v == null ? 'n/a' : `${v.toFixed(1)}%`;
}

function assess(value: number | null, good: number, warn: number): 'good' | 'ok' | 'warn' | 'unknown' {
  if (value == null) return 'unknown';
  if (value >= good) return 'good';
  if (value >= warn) return 'ok';
  return 'warn';
}

function emptyResult(reason: string): NcuParseResult {
  return {
    metrics: { sm_throughput_pct: null, dram_throughput_pct: null, warp_occupancy_pct: null, launches_captured: 0 },
    perf_score: 0,
    summary: reason,
    per_metric: [],
  };
}

/**
 * Naive CSV row parser. Handles quoted strings with embedded commas; does
 * NOT handle embedded escaped quotes or multi-line cells (NCU output never
 * has those in practice).
 */
function parseCsvRow(line: string): string[] {
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
