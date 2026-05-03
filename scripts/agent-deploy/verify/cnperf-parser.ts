/**
 * v3.23 -- cnperf (Cambricon Neuware Profiler) output parser.
 *
 * cnperf emits per-kernel performance data in CSV. Key metrics:
 *
 *   IpuUtilization (%)   -- IPU compute throughput (Cambricon's compute unit
 *                           is called an IPU; analogous to NVIDIA SM)
 *   NramReadBW (GB/s)    -- per-IPU NRAM read bandwidth
 *   NramWriteBW (GB/s)   -- per-IPU NRAM write bandwidth
 *   WramReadBW (GB/s)    -- per-IPU WRAM read bandwidth (weight RAM)
 *   GdramReadBW (GB/s)   -- HBM/LPDDR bandwidth (depends on SKU)
 *   MluLinkBW (GB/s)     -- inter-card scale-up bandwidth (multi-IPU only)
 *
 * For perf gating we focus on:
 *   IpuUtilization    -- compute throughput proxy
 *   GdramReadBW       -- HBM/LPDDR bandwidth proxy (normalized to peak)
 *   NramReadBW        -- on-chip memory utilization proxy
 *
 * Real cnperf CSV header:
 *   "KernelName","Calls","TotalDuration","AverageDuration","IpuUtilization",
 *   "NramReadBW","NramWriteBW","WramReadBW","GdramReadBW","MluLinkBW"
 *
 * Reference: https://www.cambricon.com/docs/sdk_1.x.x/cnperf/index.html
 *
 * Note: like msprof, bandwidth values are GB/s and need normalization to peak.
 * Cambricon peaks vary by gen: MLU220 (LPDDR4X 25.6 GB/s, NRAM ~2 TB/s),
 * MLU290 (HBM2 1.23 TB/s), MLU370 (HBM2e 0.614 TB/s), MLU590 (HBM3 2.4 TB/s).
 */

import {
  type ProfilerParseResult,
  assessPct,
  emptyProfilerResult,
  weightedScore,
  parseCsvRow,
} from './profiler-shared';

// Hardcoded peaks per Cambricon SKU; conservative approximations from
// vendor product-page disclosures.
const CAMBRICON_PEAK_GBS: Record<string, { gdram: number; nram_per_ipu: number }> = {
  mlu220: { gdram: 26, nram_per_ipu: 2000 },     // LPDDR4X edge
  mlu290: { gdram: 1230, nram_per_ipu: 2500 },   // HBM2 single-die
  mlu370: { gdram: 614, nram_per_ipu: 2200 },    // HBM2e chiplet
  mlu590: { gdram: 2400, nram_per_ipu: 4000 },   // HBM3 frontier
  default: { gdram: 1000, nram_per_ipu: 2000 },
};

interface ParseOptions {
  /** Override SKU for peak normalization. Default: 'mlu590'. */
  cambricon_sku?: string;
}

const HEADERS = {
  ipu_util: 'IpuUtilization',
  nram_read: 'NramReadBW',
  gdram_read: 'GdramReadBW',
  wram_read: 'WramReadBW',
};

export function parseCnperfCsv(csv: string, opts: ParseOptions = {}): ProfilerParseResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  const header_idx = lines.findIndex((l) => l.includes('IpuUtilization'));
  if (header_idx === -1) {
    return emptyProfilerResult('cnperf', 'No cnperf CSV header detected (expected "IpuUtilization" column).');
  }
  const headers = parseCsvRow(lines[header_idx]);
  const idx = (name: string) => headers.findIndex((h) => h === name);
  const ipu_col = idx(HEADERS.ipu_util);
  const nram_col = idx(HEADERS.nram_read);
  const gdram_col = idx(HEADERS.gdram_read);

  const ipu_vals: number[] = [];
  const nram_vals: number[] = [];
  const gdram_vals: number[] = [];
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
    push(ipu_col, ipu_vals);
    push(nram_col, nram_vals);
    push(gdram_col, gdram_vals);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
  const ipu_avg = avg(ipu_vals);
  const nram_avg = avg(nram_vals);
  const gdram_avg = avg(gdram_vals);

  const peaks = CAMBRICON_PEAK_GBS[opts.cambricon_sku ?? 'mlu590'] ?? CAMBRICON_PEAK_GBS.default;
  const gdram_pct = gdram_avg != null ? Math.min(100, (gdram_avg / peaks.gdram) * 100) : null;
  const nram_pct = nram_avg != null ? Math.min(100, (nram_avg / peaks.nram_per_ipu) * 100) : null;

  const per_metric = [
    { name: 'ipu_utilization', value: ipu_avg, assessment: assessPct(ipu_avg, 60, 30) },
    { name: 'gdram_bandwidth_pct', value: gdram_pct, assessment: assessPct(gdram_pct, 70, 40) },
    { name: 'nram_bandwidth_pct', value: nram_pct, assessment: assessPct(nram_pct, 50, 20) },
  ] as const;

  const perf_score = weightedScore([
    { value: ipu_avg, weight: 0.5 },
    { value: gdram_pct, weight: 0.35 },
    { value: nram_pct, weight: 0.15 },
  ]);

  const fmtPct = (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(1)}%`);
  const summary = perf_score === 0
    ? 'No measurable cnperf metrics captured.'
    : `IPU ${fmtPct(ipu_avg)} · GDRAM ${fmtPct(gdram_pct)} · NRAM ${fmtPct(nram_pct)} -- score ${(perf_score * 100).toFixed(0)}/100`;

  return {
    vendor: 'cnperf',
    per_metric: per_metric.map((m) => ({ ...m })),
    perf_score,
    summary,
    launches_captured: launches,
  };
}
