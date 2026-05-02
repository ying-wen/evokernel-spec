/**
 * v3.21 — profiler auto-detection tests.
 *
 * Verifies that detectProfilerForArch maps each target arch family to the
 * correct profiler binary, and that env overrides take precedence over PATH
 * lookup. Real profiler invocation lands in v3.22+; v3.21 just guarantees
 * the detection mapping is right and the env-override surface works.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { detectProfilerForArch } from '../agent-deploy/verify/perf';

const ENV_KEYS = [
  'EVOKERNEL_PROFILER_NCU',
  'EVOKERNEL_PROFILER_ROCPROF',
  'EVOKERNEL_PROFILER_MSPROF',
  'EVOKERNEL_PROFILER_CNPERF',
  'EVOKERNEL_PROFILER_SUPROF',
  'EVOKERNEL_PROFILER_INSTRUMENTS',
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('detectProfilerForArch — arch → profiler mapping (v3.21)', () => {
  it('maps NVIDIA Hopper to NCU', () => {
    const r = detectProfilerForArch('hopper');
    expect(r.binary).toBe('ncu');
    expect(r.install_hint).toMatch(/NVIDIA Nsight Compute/);
  });

  it('maps Blackwell / Ampere / Ada to NCU (NVIDIA family)', () => {
    expect(detectProfilerForArch('blackwell').binary).toBe('ncu');
    expect(detectProfilerForArch('ampere').binary).toBe('ncu');
    expect(detectProfilerForArch('ada').binary).toBe('ncu');
  });

  it('maps AMD CDNA / RDNA to rocprof', () => {
    expect(detectProfilerForArch('cdna3').binary).toBe('rocprof');
    expect(detectProfilerForArch('cdna2').binary).toBe('rocprof');
    expect(detectProfilerForArch('rdna4').binary).toBe('rocprof');
    expect(detectProfilerForArch('amd-cdna3').binary).toBe('rocprof');
  });

  it('maps Huawei Ascend / da-vinci to msprof', () => {
    expect(detectProfilerForArch('ascend-da-vinci-3').binary).toBe('msprof');
    expect(detectProfilerForArch('ascend-310').binary).toBe('msprof');
    expect(detectProfilerForArch('da-vinci-3').binary).toBe('msprof');
  });

  it('maps Cambricon MLU / BANG-C to cnperf', () => {
    expect(detectProfilerForArch('cambricon-mlu').binary).toBe('cnperf');
    expect(detectProfilerForArch('mlu590').binary).toBe('cnperf');
    expect(detectProfilerForArch('bang-c').binary).toBe('cnperf');
  });

  it('maps Moore Threads MUSA / MTT to suprof', () => {
    expect(detectProfilerForArch('musa-3').binary).toBe('suprof');
    expect(detectProfilerForArch('mtt-s5000').binary).toBe('suprof');
    expect(detectProfilerForArch('moore-threads').binary).toBe('suprof');
  });

  it('maps Apple M-series / Neural Engine to instruments', () => {
    expect(detectProfilerForArch('apple-m').binary).toBe('instruments');
    expect(detectProfilerForArch('m4').binary).toBe('instruments');
    expect(detectProfilerForArch('neural-engine').binary).toBe('instruments');
  });

  it('returns binary "unknown" for unmapped arch', () => {
    const r = detectProfilerForArch('groq-lpu');
    expect(r.binary).toBe('unknown');
    expect(r.install_hint).toMatch(/no profiler mapping/);
  });

  it('case-insensitive arch matching', () => {
    expect(detectProfilerForArch('HOPPER').binary).toBe('ncu');
    expect(detectProfilerForArch('CDNA3').binary).toBe('rocprof');
  });
});

describe('detectProfilerForArch — env override beats PATH (v3.21)', () => {
  it('EVOKERNEL_PROFILER_NCU=/explicit/path → marks available + uses path', () => {
    process.env.EVOKERNEL_PROFILER_NCU = '/explicit/path/to/ncu';
    const r = detectProfilerForArch('hopper');
    expect(r.available).toBe(true);
    expect(r.path).toBe('/explicit/path/to/ncu');
  });

  it('EVOKERNEL_PROFILER_ROCPROF=/explicit/path → ROCm', () => {
    process.env.EVOKERNEL_PROFILER_ROCPROF = '/opt/rocm-6.2/bin/rocprof';
    const r = detectProfilerForArch('cdna3');
    expect(r.available).toBe(true);
    expect(r.path).toBe('/opt/rocm-6.2/bin/rocprof');
  });

  it('EVOKERNEL_PROFILER_MSPROF=/explicit/path → CANN', () => {
    process.env.EVOKERNEL_PROFILER_MSPROF =
      '/usr/local/Ascend/ascend-toolkit/latest/tools/profiler/bin/msprof';
    const r = detectProfilerForArch('ascend-910b');
    expect(r.available).toBe(true);
    expect(r.path).toBe('/usr/local/Ascend/ascend-toolkit/latest/tools/profiler/bin/msprof');
  });

  it('env override for unrelated arch does not leak', () => {
    process.env.EVOKERNEL_PROFILER_NCU = '/explicit/ncu';
    const r = detectProfilerForArch('cdna3');
    // rocprof is not on PATH in test env, and rocprof env not set
    expect(r.available).toBe(false);
  });
});

describe('detectProfilerForArch — PATH lookup (v3.21)', () => {
  it('returns available=false when binary not on PATH (most CI envs)', () => {
    // No env override; test env doesn't have ncu on PATH typically.
    delete process.env.EVOKERNEL_PROFILER_NCU;
    const r = detectProfilerForArch('hopper');
    // We can't assert this is always false (some dev machines have ncu),
    // but we can assert the API shape is well-formed.
    expect(typeof r.available).toBe('boolean');
    if (r.available) {
      expect(r.path).toBeDefined();
      expect(r.path?.length).toBeGreaterThan(0);
    }
  });
});
