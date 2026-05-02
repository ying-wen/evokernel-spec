/**
 * v3.22 -- agent:watch + NCU CSV parser tests.
 *
 * Covers:
 *   - isPairAffected: which (model, hw) pairs care about which file changes
 *   - agent:watch CLI: --help, missing-args validation
 *   - parseNcuCsv: realistic NCU --csv shape -> metrics + perf_score
 *   - perf gate consumes EVOKERNEL_NCU_INPUT_CSV when set
 */

import { describe, expect, it, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { isPairAffected } from '../agent-deploy/watch';
import { parseNcuCsv } from '../agent-deploy/verify/ncu-parser';
import { runPerfGate } from '../agent-deploy/verify/perf';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-22-ncu');

afterEach(async () => {
  delete process.env.EVOKERNEL_NCU_INPUT_CSV;
  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// agent:watch -- isPairAffected
// ---------------------------------------------------------------------------

describe('isPairAffected (v3.22)', () => {
  const pair = { model: 'llama-3.3-70b', hardware: 'h100-sxm5' };

  it('returns true when changed file is the model YAML', () => {
    expect(isPairAffected('/repo/data/models/meta/llama-3.3-70b.yaml', pair)).toBe(true);
  });

  it('returns true when changed file is the hardware YAML', () => {
    expect(isPairAffected('/repo/data/hardware/nvidia/h100-sxm5.yaml', pair)).toBe(true);
  });

  it('returns true when changed file is in dsl-examples (could be cited)', () => {
    expect(isPairAffected('/repo/data/dsl-examples/cuda-flash-attention-hopper.yaml', pair)).toBe(true);
  });

  it('returns true when changed file is in operators/', () => {
    expect(isPairAffected('/repo/data/operators/matmul.yaml', pair)).toBe(true);
  });

  it('returns true when changed file is in fused-kernels/', () => {
    expect(isPairAffected('/repo/data/fused-kernels/fused-rope-qkv.yaml', pair)).toBe(true);
  });

  it('returns false for unrelated model YAML', () => {
    expect(isPairAffected('/repo/data/models/openai/gpt-oss.yaml', pair)).toBe(false);
  });

  it('returns false for unrelated hardware YAML', () => {
    expect(isPairAffected('/repo/data/hardware/nvidia/h200-sxm.yaml', pair)).toBe(false);
  });

  it('returns false for non-data file changes', () => {
    expect(isPairAffected('/repo/scripts/agent-deploy/index.ts', pair)).toBe(false);
    expect(isPairAffected('/repo/CHANGELOG.md', pair)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// agent:watch CLI smoke
// ---------------------------------------------------------------------------

describe('agent:watch CLI (v3.22)', () => {
  const SCRIPT = path.join(REPO_ROOT, 'scripts/agent-deploy/watch.ts');

  it('--help prints usage + exits 0', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', SCRIPT, '--help'], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.toString()).toContain('agent:watch');
    expect(r.stdout.toString()).toContain('USAGE');
    expect(r.stdout.toString()).toContain('--pairs');
    expect(r.stdout.toString()).toContain('FORWARDED FLAGS');
  });

  it('errors when no pairs specified', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(r.status).toBe(2);
    expect(r.stderr.toString()).toMatch(/at least one .* pair/i);
  });
});

// ---------------------------------------------------------------------------
// NCU parser
// ---------------------------------------------------------------------------

const SAMPLE_NCU_CSV = `==PROF== Connected to process 12345
==PROF== Profiling "gemm_kernel" - 0: 0%....50%....100%
==PROF== Disconnected from process 12345
==PROF== Report saved to bench.ncu-rep
"ID","Process ID","Process Name","Host Name","Kernel Name","Block Size","Grid Size","Device","Metric Name","Metric Unit","Metric Value"
"0","12345","./bench","host","gemm_kernel","256","[1024,1,1]","0","sm__throughput.avg.pct_of_peak_sustained_elapsed","%","78.4"
"0","12345","./bench","host","gemm_kernel","256","[1024,1,1]","0","dram__throughput.avg.pct_of_peak_sustained_elapsed","%","65.2"
"0","12345","./bench","host","gemm_kernel","256","[1024,1,1]","0","sm__warps_active.avg.pct_of_peak_sustained_elapsed","%","52.1"
"1","12345","./bench","host","gemm_kernel","256","[1024,1,1]","0","sm__throughput.avg.pct_of_peak_sustained_elapsed","%","79.1"
"1","12345","./bench","host","gemm_kernel","256","[1024,1,1]","0","dram__throughput.avg.pct_of_peak_sustained_elapsed","%","67.8"
"1","12345","./bench","host","gemm_kernel","256","[1024,1,1]","0","sm__warps_active.avg.pct_of_peak_sustained_elapsed","%","53.4"
`;

describe('parseNcuCsv (v3.22)', () => {
  it('extracts SM throughput / DRAM throughput / occupancy from realistic CSV', () => {
    const r = parseNcuCsv(SAMPLE_NCU_CSV);
    expect(r.metrics.sm_throughput_pct).not.toBeNull();
    expect(r.metrics.sm_throughput_pct!).toBeCloseTo(78.75, 0); // (78.4 + 79.1)/2
    expect(r.metrics.dram_throughput_pct!).toBeCloseTo(66.5, 0);
    expect(r.metrics.warp_occupancy_pct!).toBeCloseTo(52.75, 0);
    expect(r.metrics.launches_captured).toBe(2);
  });

  it('computes a perf_score in [0, 1] reflecting weighted metrics', () => {
    const r = parseNcuCsv(SAMPLE_NCU_CSV);
    expect(r.perf_score).toBeGreaterThan(0);
    expect(r.perf_score).toBeLessThanOrEqual(1);
    // SM 78.75 * 0.5 + DRAM 66.5 * 0.35 + Occ 52.75 * 0.15 = ~70.5/100
    expect(r.perf_score).toBeCloseTo(0.704, 1);
  });

  it('per-metric assessment uses good/ok/warn thresholds', () => {
    const r = parseNcuCsv(SAMPLE_NCU_CSV);
    const sm = r.per_metric.find((m) => m.name === 'sm_throughput')!;
    const dram = r.per_metric.find((m) => m.name === 'dram_throughput')!;
    const occ = r.per_metric.find((m) => m.name === 'warp_occupancy')!;
    expect(sm.assessment).toBe('good'); // 78.75 >= 60
    expect(dram.assessment).toBe('ok');  // 66.5 in [40, 70)
    expect(occ.assessment).toBe('good'); // 52.75 >= 50
  });

  it('summary is human-readable with metric values', () => {
    const r = parseNcuCsv(SAMPLE_NCU_CSV);
    expect(r.summary).toMatch(/SM 78/);
    expect(r.summary).toMatch(/DRAM 66/);
    expect(r.summary).toMatch(/score \d+/);
  });

  it('returns empty result with reason when CSV header is missing', () => {
    const r = parseNcuCsv('this is not a real ncu csv\nrandom text');
    expect(r.metrics.sm_throughput_pct).toBeNull();
    expect(r.perf_score).toBe(0);
    expect(r.summary).toMatch(/No NCU CSV header/);
  });

  it('returns empty result for required-column-missing CSV', () => {
    const csv = '"Wrong","Header","Names"\n"1","2","3"';
    const r = parseNcuCsv(csv);
    expect(r.summary).toMatch(/No NCU CSV header detected/);
  });

  it('handles CSV with only one launch', () => {
    const csv =
      '"ID","Metric Name","Metric Unit","Metric Value"\n' +
      '"0","sm__throughput.avg.pct_of_peak_sustained_elapsed","%","45.0"\n' +
      '"0","dram__throughput.avg.pct_of_peak_sustained_elapsed","%","30.0"\n';
    const r = parseNcuCsv(csv);
    expect(r.metrics.launches_captured).toBe(1);
    expect(r.metrics.sm_throughput_pct).toBe(45);
    expect(r.metrics.dram_throughput_pct).toBe(30);
    expect(r.metrics.warp_occupancy_pct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runPerfGate consumes EVOKERNEL_NCU_INPUT_CSV
// ---------------------------------------------------------------------------

describe('runPerfGate -- NCU CSV ingestion (v3.22)', () => {
  it('parses CSV from EVOKERNEL_NCU_INPUT_CSV and returns pass on high perf_score', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const csv_path = path.join(FIXTURE_DIR, 'good.csv');
    await writeFile(csv_path, SAMPLE_NCU_CSV);
    process.env.EVOKERNEL_NCU_INPUT_CSV = csv_path;
    process.env.EVOKERNEL_PROFILER_NCU = '/usr/bin/ncu'; // pretend ncu available

    const result = await runPerfGate({
      code: '__global__ void kernel() { __shared__ float smem[256]; mma_sync(...); }',
      language: 'cuda-cpp',
      target_arch: 'hopper',
      op: 'matmul',
      mode: 'execution',
    });

    expect(result.status).toBe('pass');
    expect(result.message).toMatch(/NCU CSV parsed/);
    // expect metric checks added
    const ncuChecks = result.checks.filter((c) => c.name.startsWith('ncu_'));
    expect(ncuChecks.length).toBeGreaterThanOrEqual(3);
    delete process.env.EVOKERNEL_PROFILER_NCU;
  });

  it('returns fail when perf_score below 0.5', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const low_csv =
      '"ID","Metric Name","Metric Unit","Metric Value"\n' +
      '"0","sm__throughput.avg.pct_of_peak_sustained_elapsed","%","18.0"\n' +
      '"0","dram__throughput.avg.pct_of_peak_sustained_elapsed","%","15.0"\n' +
      '"0","sm__warps_active.avg.pct_of_peak_sustained_elapsed","%","8.0"\n';
    const csv_path = path.join(FIXTURE_DIR, 'low.csv');
    await writeFile(csv_path, low_csv);
    process.env.EVOKERNEL_NCU_INPUT_CSV = csv_path;
    process.env.EVOKERNEL_PROFILER_NCU = '/usr/bin/ncu';

    const result = await runPerfGate({
      code: 'naive_kernel()',
      language: 'cuda-cpp',
      target_arch: 'hopper',
      op: 'matmul',
      mode: 'execution',
    });
    expect(result.status).toBe('fail');
    delete process.env.EVOKERNEL_PROFILER_NCU;
  });
});
