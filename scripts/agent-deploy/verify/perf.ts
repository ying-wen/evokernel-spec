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

  // Execution mode placeholder — v3.6 wires real profiler
  return {
    status: 'skipped',
    message:
      'Execution-mode perf measurement is v3.6+. v3.5 ships structural checks only. To run real profiling: wait for v3.6 or invoke target profiler manually (NCU / rocprof / msprof / cnperf / suprof).',
    checks,
    duration_ms: Date.now() - start,
  };
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
