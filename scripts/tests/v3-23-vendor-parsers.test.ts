/**
 * v3.23 -- vendor profiler parser tests (rocprof / msprof / cnperf) +
 * vendor-agnostic perf.ts dispatch + zh i18n surface existence.
 *
 * For each parser: realistic CSV header → averaged metrics + perf_score
 * + per-metric assessment + empty-result on missing header. Mirrors the
 * v3.22 NCU pattern exactly (same shape, same threshold semantics).
 *
 * For dispatch: each EVOKERNEL_<PROFILER>_INPUT_CSV env var routes to the
 * right parser without leaking across vendors.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRocprofCsv } from '../agent-deploy/verify/rocprof-parser';
import { parseMsprofCsv } from '../agent-deploy/verify/msprof-parser';
import { parseCnperfCsv } from '../agent-deploy/verify/cnperf-parser';
import { runPerfGate } from '../agent-deploy/verify/perf';
import { weightedScore, assessPct } from '../agent-deploy/verify/profiler-shared';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-23-csv');

const ENV_KEYS = [
  'EVOKERNEL_NCU_INPUT_CSV',
  'EVOKERNEL_ROCPROF_INPUT_CSV',
  'EVOKERNEL_MSPROF_INPUT_CSV',
  'EVOKERNEL_CNPERF_INPUT_CSV',
  'EVOKERNEL_PROFILER_NCU',
  'EVOKERNEL_PROFILER_ROCPROF',
  'EVOKERNEL_PROFILER_MSPROF',
  'EVOKERNEL_PROFILER_CNPERF',
];

afterEach(async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// rocprof
// ─────────────────────────────────────────────────────────────────────────

const ROCPROF_CSV = `"KernelName","gpu-id","queue-id","queue-index","pid","tid","grd","wgr","lds","scr","arch_vgpr","accum_vgpr","sgpr","wave_size","sig","DispatchNs","BeginNs","EndNs","CompleteNs","DurationNs","VALUUtilization","SALUUtilization","MemUnitBusy"
"gemm_kernel","0","0","0","12345","12346","65536","256","16384","0","64","0","32","64","0x0","0","100000","200000","210000","100000","72.4","12.1","58.3"
"gemm_kernel","0","0","1","12345","12346","65536","256","16384","0","64","0","32","64","0x0","0","210000","305000","315000","95000","74.8","11.5","61.2"
`;

describe('parseRocprofCsv (v3.23)', () => {
  it('extracts VALUUtilization + MemUnitBusy + computes perf_score', () => {
    const r = parseRocprofCsv(ROCPROF_CSV);
    expect(r.vendor).toBe('rocprof');
    expect(r.launches_captured).toBe(2);
    const findMetric = (name: string) => r.per_metric.find((m) => m.name === name);
    // compute_throughput = max(VALU, SALU) — VALU dominates at 72/74
    const compute = findMetric('compute_throughput');
    expect(compute?.value).not.toBeNull();
    expect(compute?.value!).toBeCloseTo(73.6, 0); // (72.4 + 74.8)/2
    expect(compute?.assessment).toBe('good');
    const mem = findMetric('mem_unit_busy');
    expect(mem?.value!).toBeCloseTo(59.75, 0);
    expect(mem?.assessment).toBe('ok'); // 59.75 in [40, 70)
    expect(r.perf_score).toBeGreaterThan(0.5);
    expect(r.summary).toMatch(/Compute/);
    expect(r.summary).toMatch(/score \d+/);
  });

  it('returns empty result with reason when header missing', () => {
    const r = parseRocprofCsv('garbage\nrandom text');
    expect(r.per_metric).toEqual([]);
    expect(r.perf_score).toBe(0);
    expect(r.summary).toMatch(/No rocprof CSV header/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// msprof
// ─────────────────────────────────────────────────────────────────────────

const MSPROF_CSV = `Op Name,OP Type,Task Type,Task Start Time(us),Task Duration(us),Cube Utilization,Vector Utilization,UB Read Bandwidth(GB/s),GM Read Bandwidth(GB/s)
matmul_op_1,MatMul,KERNEL_LAUNCH,1234567,250.5,68.4,12.3,18000,1100
matmul_op_2,MatMul,KERNEL_LAUNCH,1234817,248.1,71.2,14.1,19500,1180
`;

describe('parseMsprofCsv (v3.23)', () => {
  it('extracts Cube/Vector utilization + bandwidth normalization', () => {
    const r = parseMsprofCsv(MSPROF_CSV);
    expect(r.vendor).toBe('msprof');
    expect(r.launches_captured).toBe(2);
    const findMetric = (name: string) => r.per_metric.find((m) => m.name === name);
    const compute = findMetric('compute_throughput');
    // max(Cube avg 69.8, Vector avg 13.2) = 69.8
    expect(compute?.value!).toBeCloseTo(69.8, 0);
    expect(compute?.assessment).toBe('good');
    // GM avg = 1140 GB/s, default peak 1600 GB/s → ~71%
    const gm = findMetric('gm_bandwidth_pct');
    expect(gm?.value!).toBeGreaterThan(60);
    expect(gm?.assessment).toBe('good');
  });

  it('uses ascend_gen override for peak normalization', () => {
    // 950 has higher peak (2400 GB/s) so 1140 GB/s normalizes to ~47%
    const r = parseMsprofCsv(MSPROF_CSV, { ascend_gen: '950' });
    const gm = r.per_metric.find((m) => m.name === 'gm_bandwidth_pct')!;
    expect(gm.value!).toBeLessThan(50); // not "good" anymore
    expect(gm.assessment).toBe('ok');
  });

  it('returns empty result with reason when header missing', () => {
    const r = parseMsprofCsv('not a csv\nlots of text');
    expect(r.per_metric).toEqual([]);
    expect(r.perf_score).toBe(0);
    expect(r.summary).toMatch(/No msprof CSV header/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// cnperf
// ─────────────────────────────────────────────────────────────────────────

const CNPERF_CSV = `"KernelName","Calls","TotalDuration","AverageDuration","IpuUtilization","NramReadBW","NramWriteBW","WramReadBW","GdramReadBW"
"matmul_kernel","100","250000","2500","65.2","2200","1800","1500","1700"
"matmul_kernel","100","248000","2480","67.8","2400","1900","1600","1850"
`;

describe('parseCnperfCsv (v3.23)', () => {
  it('extracts IPU utilization + GDRAM/NRAM bandwidth pcts', () => {
    const r = parseCnperfCsv(CNPERF_CSV);
    expect(r.vendor).toBe('cnperf');
    expect(r.launches_captured).toBe(2);
    const findMetric = (name: string) => r.per_metric.find((m) => m.name === name);
    const ipu = findMetric('ipu_utilization');
    expect(ipu?.value!).toBeCloseTo(66.5, 0);
    expect(ipu?.assessment).toBe('good');
    // Default SKU mlu590 has peak gdram=2400 GB/s → 1775/2400 ≈ 74%
    const gdram = findMetric('gdram_bandwidth_pct');
    expect(gdram?.value!).toBeGreaterThan(70);
  });

  it('uses cambricon_sku override for SKU-specific peak', () => {
    // mlu220 (LPDDR4X edge) has peak gdram=26 GB/s — 1775 GB/s caps at 100%
    const r = parseCnperfCsv(CNPERF_CSV, { cambricon_sku: 'mlu220' });
    const gdram = r.per_metric.find((m) => m.name === 'gdram_bandwidth_pct')!;
    expect(gdram.value).toBe(100); // Math.min(100, ...) caps overshoot
    expect(gdram.assessment).toBe('good');
  });

  it('returns empty result with reason when header missing', () => {
    const r = parseCnperfCsv('garbage\nfoo\nbar');
    expect(r.per_metric).toEqual([]);
    expect(r.summary).toMatch(/No cnperf CSV header/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// shared helpers
// ─────────────────────────────────────────────────────────────────────────

describe('profiler-shared helpers (v3.23)', () => {
  it('weightedScore: returns 0 for all-null components', () => {
    expect(weightedScore([
      { value: null, weight: 0.5 },
      { value: null, weight: 0.5 },
    ])).toBe(0);
  });

  it('weightedScore: ignores null components when partial', () => {
    expect(weightedScore([
      { value: 80, weight: 0.5 },
      { value: null, weight: 0.5 },
    ])).toBe(0.8);
  });

  it('weightedScore: real weighted average', () => {
    expect(weightedScore([
      { value: 80, weight: 0.5 },
      { value: 60, weight: 0.5 },
    ])).toBe(0.7);
  });

  it('assessPct: thresholds map correctly', () => {
    expect(assessPct(80, 60, 30)).toBe('good');
    expect(assessPct(40, 60, 30)).toBe('ok');
    expect(assessPct(20, 60, 30)).toBe('warn');
    expect(assessPct(null, 60, 30)).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// vendor-agnostic dispatch in perf.ts
// ─────────────────────────────────────────────────────────────────────────

describe('runPerfGate -- vendor-agnostic dispatch (v3.23)', () => {
  it('routes EVOKERNEL_ROCPROF_INPUT_CSV → rocprof parser when target is CDNA', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const csv_path = path.join(FIXTURE_DIR, 'rocprof.csv');
    await writeFile(csv_path, ROCPROF_CSV);
    process.env.EVOKERNEL_ROCPROF_INPUT_CSV = csv_path;
    process.env.EVOKERNEL_PROFILER_ROCPROF = '/usr/bin/rocprof';
    const result = await runPerfGate({
      code: 'mfma_kernel()',
      language: 'hip',
      target_arch: 'cdna3',
      op: 'matmul',
      mode: 'execution',
    });
    expect(result.status).toBe('pass');
    expect(result.message).toMatch(/rocprof output parsed/);
    const rocChecks = result.checks.filter((c) => c.name.startsWith('rocprof_'));
    expect(rocChecks.length).toBeGreaterThanOrEqual(3);
  });

  it('routes EVOKERNEL_MSPROF_INPUT_CSV → msprof parser when target is Ascend', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const csv_path = path.join(FIXTURE_DIR, 'msprof.csv');
    await writeFile(csv_path, MSPROF_CSV);
    process.env.EVOKERNEL_MSPROF_INPUT_CSV = csv_path;
    process.env.EVOKERNEL_PROFILER_MSPROF = '/usr/bin/msprof';
    const result = await runPerfGate({
      code: 'cube_op()',
      language: 'ascend-c',
      target_arch: 'ascend-da-vinci-3',
      op: 'matmul',
      mode: 'execution',
    });
    expect(result.status).toBe('pass');
    expect(result.message).toMatch(/msprof output parsed/);
  });

  it('routes EVOKERNEL_CNPERF_INPUT_CSV → cnperf parser when target is Cambricon', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const csv_path = path.join(FIXTURE_DIR, 'cnperf.csv');
    await writeFile(csv_path, CNPERF_CSV);
    process.env.EVOKERNEL_CNPERF_INPUT_CSV = csv_path;
    process.env.EVOKERNEL_PROFILER_CNPERF = '/usr/bin/cnperf';
    const result = await runPerfGate({
      code: '__nram__ float buf[256]; mlu_op();',
      language: 'bang-c',
      target_arch: 'cambricon-mlu',
      op: 'matmul',
      mode: 'execution',
    });
    expect(result.status).toBe('pass');
    expect(result.message).toMatch(/cnperf output parsed/);
  });

  it('does not leak env vars across vendors (NCU env on Cambricon target = ignored)', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const ncu_csv = path.join(FIXTURE_DIR, 'ncu.csv');
    await writeFile(ncu_csv, '"Metric Name","Metric Value"\n"sm__throughput.avg.pct_of_peak_sustained_elapsed","85"\n');
    // NCU env is set, but target is Cambricon — gate should NOT route NCU CSV
    process.env.EVOKERNEL_NCU_INPUT_CSV = ncu_csv;
    process.env.EVOKERNEL_PROFILER_NCU = '/usr/bin/ncu';
    const result = await runPerfGate({
      code: '__nram__ float buf[256];',
      language: 'bang-c',
      target_arch: 'cambricon-mlu',
      op: 'matmul',
      mode: 'execution',
    });
    // Profiler for cambricon-mlu is cnperf; NCU env shouldn't affect this
    expect(result.message).not.toMatch(/ncu output parsed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// zh i18n surface existence (sanity check, not content)
// ─────────────────────────────────────────────────────────────────────────

describe('zh i18n /agent-deploy command surface (v3.23)', () => {
  it('exists at .claude/commands/zh/agent-deploy.md', async () => {
    const p = path.join(REPO_ROOT, '.claude/commands/zh/agent-deploy.md');
    expect(existsSync(p)).toBe(true);
  });

  it('mirrored into plugins/claude-code-productized/commands/zh/', async () => {
    const p = path.join(REPO_ROOT, 'plugins/claude-code-productized/commands/zh/agent-deploy.md');
    expect(existsSync(p)).toBe(true);
  });

  it('frontmatter has description in zh + argument-hint matching the en version', async () => {
    const { readFile } = await import('node:fs/promises');
    const md = await readFile(path.join(REPO_ROOT, '.claude/commands/zh/agent-deploy.md'), 'utf-8');
    expect(md).toMatch(/description: 通过/);
    expect(md).toMatch(/argument-hint: <model> <hardware>/);
    expect(md).toMatch(/--use-llm-orchestrator/);
    expect(md).toMatch(/--profile/);
  });
});
