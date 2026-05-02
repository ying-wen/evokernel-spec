/**
 * v3.5 — Layer V Gate 3 (Perf): placeholder.
 *
 * Full implementation in v3.6+. v3.5 provides the API + a structural
 * "is the code likely to be perf-friendly" check (e.g., uses async copy /
 * tensor cores rather than naive scalar loops).
 *
 * v3.6 will wire actual profiler invocation:
 *   - cuda-cpp → ncu --set full → parse SM-utilization, mem bandwidth, occupancy
 *   - hip      → rocprof
 *   - ascend-c → msprof (CubeUtilization, VectorUtilization, UbDmaBandwidth)
 *   - bang-c   → cnperf
 *   - musa-c   → suprof
 * Compare measured perf to the agent's prediction (decode_tok_per_s_predicted
 * from the deployment plan); fail if delta_pct > 30%.
 */

export interface PerfGateInput {
  code: string;
  language: string;
  target_arch: string;
  op: string;
  mode: 'structural' | 'execution';
  /** If set, gate auto-skips with this reason. */
  skip_reason?: string;
}

export interface PerfGateResult {
  status: 'pass' | 'fail' | 'skipped';
  message: string;
  /** Static perf-friendliness checks (always run, even structural mode). */
  checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }>;
  /** Profiler output (execution mode, v3.6+). */
  profiler_output?: string;
  /** Predicted vs measured perf delta (execution mode, v3.6+). */
  delta?: { predicted_tok_s: number; measured_tok_s: number; delta_pct: number; passed: boolean };
  duration_ms: number;
}

export async function runPerfGate(input: PerfGateInput): Promise<PerfGateResult> {
  const start = Date.now();

  if (input.skip_reason) {
    return {
      status: 'skipped',
      message: input.skip_reason,
      checks: [],
      duration_ms: Date.now() - start,
    };
  }

  // Structural perf-friendliness checks
  const checks = runPerfStructuralChecks(input);
  const failed = checks.filter((c) => c.status === 'fail');

  if (input.mode === 'structural') {
    // Structural failures are warnings, not blockers (perf is graded, not boolean)
    return {
      status: failed.length === 0 ? 'pass' : 'fail',
      message:
        failed.length === 0
          ? `All ${checks.length} structural perf-friendliness checks passed.`
          : `${failed.length} perf-friendliness warning(s). Code may run but likely below predicted throughput.`,
      checks,
      duration_ms: Date.now() - start,
    };
  }

  // v3.21 — execution mode auto-detection. Real profiler invocation will
  // come in v3.22+; v3.21 detects which profiler is available on PATH and
  // reports it so users (and the agent) know whether full execution-mode
  // verification is feasible on the current machine.
  const profiler = detectProfilerForArch(input.target_arch);
  if (!profiler.available) {
    return {
      status: 'skipped',
      message:
        `Execution-mode V3 perf measurement requires ${profiler.binary} on PATH (target ${input.target_arch}). ` +
        `Not detected on this machine. Either install ${profiler.binary} (${profiler.install_hint}) ` +
        `or fall back to structural-only with --no-profile.`,
      checks,
      duration_ms: Date.now() - start,
    };
  }

  // Profiler detected but actual invocation/parsing not yet wired (v3.22+).
  // Report detection success so the agent + CI can log feasibility.
  return {
    status: 'skipped',
    message:
      `${profiler.binary} detected at ${profiler.path}. v3.21 reports profiler availability; ` +
      `actual invocation + measured-tok/s parsing wires in v3.22 (target-arch-specific). ` +
      `Existing structural checks (${checks.length}) ran successfully.`,
    checks,
    profiler_output: `[v3.21 stub] ${profiler.binary} ready at ${profiler.path}`,
    duration_ms: Date.now() - start,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// v3.21 — profiler auto-detection
// ─────────────────────────────────────────────────────────────────────────

interface ProfilerInfo {
  /** Binary name expected for the target arch family. */
  binary: string;
  /** Human-readable install hint. */
  install_hint: string;
  /** True if found on PATH (or via env override). */
  available: boolean;
  /** Resolved absolute path when available. */
  path?: string;
}

/**
 * Map target arch family → expected profiler binary, then check PATH.
 *
 * Architecture → profiler reference (per perf.ts header comment):
 *   hopper / blackwell / ada / ampere → ncu (NVIDIA Nsight Compute)
 *   cdna3 / cdna2 / rdna4             → rocprof (AMD ROCm Profiler)
 *   ascend-da-vinci / ascend-310      → msprof (Huawei CANN Profiler)
 *   cambricon-mlu                      → cnperf (Cambricon Neuware Profiler)
 *   musa-3 / mtt                       → suprof (Moore Threads SUPA Profiler)
 *   apple-m / apple-neural-engine     → instruments (Xcode Instruments)
 *
 * Override via EVOKERNEL_PROFILER_<ARCH>=path/to/binary env vars for unusual
 * install locations (e.g. /usr/local/cuda/bin/ncu).
 */
export function detectProfilerForArch(target_arch: string): ProfilerInfo {
  const arch = target_arch.toLowerCase();
  const map: Array<{ match: (a: string) => boolean; binary: string; install_hint: string; env_key: string }> = [
    { match: (a) => /^(hopper|blackwell|ampere|ada|nvidia)/.test(a), binary: 'ncu', install_hint: 'NVIDIA Nsight Compute (CUDA Toolkit) — typically /usr/local/cuda/bin/ncu', env_key: 'EVOKERNEL_PROFILER_NCU' },
    { match: (a) => /^(cdna|rdna|amd)/.test(a), binary: 'rocprof', install_hint: 'AMD ROCm — sudo apt install rocm-profiler', env_key: 'EVOKERNEL_PROFILER_ROCPROF' },
    { match: (a) => /^ascend|^da-vinci/.test(a), binary: 'msprof', install_hint: 'Huawei CANN Toolkit — typically /usr/local/Ascend/ascend-toolkit/latest/tools/profiler/bin/msprof', env_key: 'EVOKERNEL_PROFILER_MSPROF' },
    { match: (a) => /^cambricon|^mlu|^bang/.test(a), binary: 'cnperf', install_hint: 'Cambricon Neuware SDK — typically /usr/local/neuware/bin/cnperf', env_key: 'EVOKERNEL_PROFILER_CNPERF' },
    { match: (a) => /^musa|^mtt|^moore/.test(a), binary: 'suprof', install_hint: 'Moore Threads MUSA SDK — typically /usr/local/musa/bin/suprof', env_key: 'EVOKERNEL_PROFILER_SUPROF' },
    { match: (a) => /^apple|^m[1-5]|^neural-engine/.test(a), binary: 'instruments', install_hint: 'Xcode Command Line Tools — xcode-select --install', env_key: 'EVOKERNEL_PROFILER_INSTRUMENTS' },
  ];

  const matched = map.find((m) => m.match(arch))
    ?? { binary: 'unknown', install_hint: 'no profiler mapping', env_key: 'EVOKERNEL_PROFILER_UNKNOWN' };

  // Env override beats PATH lookup
  const env_path = process.env[matched.env_key];
  if (env_path) {
    return { binary: matched.binary, install_hint: matched.install_hint, available: true, path: env_path };
  }

  // PATH lookup via `which` (sync, fast)
  const path = lookupOnPath(matched.binary);
  return {
    binary: matched.binary,
    install_hint: matched.install_hint,
    available: path != null,
    path: path ?? undefined,
  };
}

function lookupOnPath(binary: string): string | null {
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const out = execSync(`command -v ${binary}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function runPerfStructuralChecks(input: PerfGateInput): Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }> {
  const checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }> = [];
  const code = input.code;

  // Async copy / TMA / cp_async usage (cuda-cpp on Hopper+)
  if (input.language === 'cuda-cpp' && (input.target_arch === 'hopper' || input.target_arch === 'blackwell' || input.target_arch.startsWith('hopper') || input.target_arch.startsWith('blackwell'))) {
    const hasAsyncCopy = /(cp\.async|cp_async|cudaMemcpyAsync|TMA|cp\.async\.bulk)/i.test(code);
    checks.push({
      name: 'hopper_async_copy_usage',
      status: hasAsyncCopy ? 'pass' : 'fail',
      message: hasAsyncCopy ? 'Async copy / TMA detected — good for Hopper+ pipelining.' : 'Hopper+ kernels should use cp.async / TMA for memory pipelining. Synchronous loads will leave SMs idle.',
    });
  }

  // Tensor core MMA usage (any arch with tensor cores)
  if (input.language === 'cuda-cpp' || input.language === 'hip') {
    const hasMma = /(wgmma|mma_sync|mma\.async|mfma|tcgen05)/i.test(code);
    checks.push({
      name: 'tensor_core_mma_usage',
      status: hasMma ? 'pass' : 'fail',
      message: hasMma ? 'Tensor-core MMA primitive detected.' : 'No tensor-core MMA detected. CUDA-cores-only path is much slower than tensor-core path for matmul workloads.',
    });
  }

  // SMEM / shared / TBuf usage (avoid global memory only)
  const hasFastMem = /(__shared__|extern\s+__shared__|TQue|TBuf|smem|__nram__|__wram__|GROUP_MEMORY)/i.test(code);
  checks.push({
    name: 'fast_memory_usage',
    status: hasFastMem ? 'pass' : 'fail',
    message: hasFastMem ? 'Fast memory (SMEM / NRAM / WRAM / TBuf) usage detected.' : 'No fast-memory tile staging detected — likely global-memory-only kernel, will be bandwidth-bound.',
  });

  // No naive serial scan / unrolled loops over global memory
  const hasNaiveSerialPattern = /for\s*\([^)]*\)\s*\{\s*[^\}]*\bglobal_/i.test(code) && !hasFastMem;
  if (hasNaiveSerialPattern) {
    checks.push({
      name: 'no_naive_global_memory_loop',
      status: 'fail',
      message: 'Detected naive loop directly over global memory — likely bandwidth-bound.',
    });
  }

  return checks;
}
