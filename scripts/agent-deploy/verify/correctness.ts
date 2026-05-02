/**
 * v3.5 — Layer V Gate 2 (Correctness): structural + execution mode.
 *
 * Structural mode (CI-safe, always runs):
 *   Static analysis of generated code vs formal_semantics + numerical_rules.
 *   Checks that the code MENTIONS / IMPLEMENTS the documented invariants.
 *   Examples per op-class:
 *     - online-softmax: must contain (m, s, acc) state with FP32 dtype
 *     - allreduce SUM: must use FP32 accumulator with BF16/FP16 inputs
 *     - rmsnorm: must compute square-sum in FP32
 *     - GEMM: must use FP32 accumulator with tensor-core inputs
 *
 * Execution mode (requires target hardware):
 *   Compile + run on small fixture, compare output to PyTorch reference_impl.
 *   Tolerance derived from formal_semantics.numerical_rules per library.
 *   v3.5 ships the API + structural checks; v3.6 wires the actual subprocess
 *   invocation with tolerance comparison.
 */

export interface CorrectnessGateInput {
  code: string;
  language: string;
  op: string;
  target_arch: string;
  numerical_rules?: Array<{ aspect: string; per_library: Record<string, string>; notes?: string }>;
  reference_impl_python?: string;
  mode: 'structural' | 'execution';
  /** If set, gate auto-skips with this reason (e.g., "V1 build failed"). */
  skip_reason?: string;
}

export interface CorrectnessGateResult {
  status: 'pass' | 'fail' | 'skipped';
  message: string;
  /** Per-rule structural checks. */
  checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }>;
  /** Execution-mode delta vs PyTorch reference (filled when mode=execution and ran). */
  execution_delta?: { max_abs: number; max_rel: number; tolerance: number; passed: boolean };
  duration_ms: number;
}

export async function runCorrectnessGate(input: CorrectnessGateInput): Promise<CorrectnessGateResult> {
  const start = Date.now();

  if (input.skip_reason) {
    return {
      status: 'skipped',
      message: input.skip_reason,
      checks: [],
      duration_ms: Date.now() - start,
    };
  }

  // Always run structural checks
  const checks = runStructuralChecks(input);
  const failed = checks.filter((c) => c.status === 'fail');

  if (input.mode === 'structural') {
    if (failed.length > 0) {
      return {
        status: 'fail',
        message: `${failed.length} structural correctness check(s) failed.`,
        checks,
        duration_ms: Date.now() - start,
      };
    }
    return {
      status: 'pass',
      message: `All ${checks.length} structural correctness check(s) passed (structural mode; no execution).`,
      checks,
      duration_ms: Date.now() - start,
    };
  }

  // Execution mode: structural must pass first
  if (failed.length > 0) {
    return {
      status: 'fail',
      message: `Structural correctness checks failed; skipping execution.`,
      checks,
      duration_ms: Date.now() - start,
    };
  }

  // v3.5 placeholder for execution mode — full impl in v3.6 will:
  //   1. Compile the kernel (calls runBuildGate execution mode)
  //   2. Generate small fixture inputs (deterministic seed, [B=1, S=128, D=512] etc.)
  //   3. Run kernel on target hardware (via target's runtime: cudaLaunch / aclrt / etc.)
  //   4. Run reference_impl_python on CPU (PyTorch)
  //   5. Compare with tolerance from numerical_rules
  // For now: report skip with explanation
  return {
    status: 'skipped',
    message:
      'Execution mode requested but v3.5 ships structural checks only. v3.6 will wire actual subprocess execution + PyTorch tolerance comparison. Structural checks above all passed.',
    checks,
    duration_ms: Date.now() - start,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Structural checks per op-class + per numerical rule
// ─────────────────────────────────────────────────────────────────────────

// Strip C/C++ style comments before structural analysis. Critical: without this,
// a comment like "// FP32 not used here" would falsely satisfy a "uses FP32" check.
// Handles "//" line comments, slash-star block comments, and "#" line comments (Triton/Python).
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/[^\n]*/g, '')         // line comments
    .replace(/^\s*#[^\n]*/gm, '');      // python-style line comments
}

function runStructuralChecks(input: CorrectnessGateInput): Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }> {
  const checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }> = [];
  // Strip comments — analyze only the actual code, not text in comments
  const codeNoComments = stripComments(input.code);

  // Op-class-specific invariants
  const opClass = classifyOpForCorrectness(input.op);
  switch (opClass) {
    case 'attention':
      checkAttentionInvariants(codeNoComments, checks);
      break;
    case 'norm':
      checkNormInvariants(codeNoComments, checks);
      break;
    case 'gemm':
      checkGemmInvariants(codeNoComments, checks);
      break;
    case 'collective':
      checkCollectiveInvariants(codeNoComments, input.op, checks);
      break;
    case 'scatter-permute':
      checkScatterInvariants(codeNoComments, checks);
      break;
    case 'default':
      checks.push({
        name: 'op_class_recognized',
        status: 'skipped',
        message: `Op "${input.op}" not in known op-classes; structural correctness checks skipped. Add to classifyOpForCorrectness if a known invariant applies.`,
      });
  }

  // Numerical-rule-driven checks (cross-cutting)
  if (input.numerical_rules) {
    for (const rule of input.numerical_rules) {
      if (rule.aspect.toLowerCase().includes('fp32') ||
          rule.aspect.toLowerCase().includes('partial_sum') ||
          rule.aspect.toLowerCase().includes('accumulator')) {
        const requiresFp32 = JSON.stringify(rule.per_library).toLowerCase().includes('fp32');
        if (requiresFp32) {
          const hasFp32 = /\b(float|FP32|fp32|f32)\b/.test(codeNoComments);
          checks.push({
            name: `numerical_rule_${rule.aspect.replace(/\s+/g, '_')}`,
            status: hasFp32 ? 'pass' : 'fail',
            message: hasFp32
              ? `formal_semantics requires FP32 for "${rule.aspect}" — code mentions float/FP32.`
              : `formal_semantics requires FP32 for "${rule.aspect}" but code does not reference float/FP32 dtype. Likely correctness bug.`,
          });
        }
      }
    }
  }

  return checks;
}

function classifyOpForCorrectness(opId: string): 'attention' | 'norm' | 'gemm' | 'collective' | 'scatter-permute' | 'default' {
  const ATTENTION = ['attention', 'mla-attention', 'scaled-dot-product-attention', 'paged-attention-decode', 'online-softmax', 'flash-decoding', 'flash-mla', 'flash-attention-v3', 'fused-attn-sliding-window', 'fused-quantized-attention', 'fused-radix-attention'];
  const NORM = ['rmsnorm', 'layer-norm', 'group-norm', 'softmax', 'fused-rmsnorm-residual', 'fused-rmsnorm-residual-quantize'];
  const GEMM = ['matmul', 'grouped-matmul', 'lora-bgmv', 'fused-allgather-gemm', 'fused-grouped-gemm', 'fused-dequant-gemm'];
  const COLLECTIVE = ['allreduce', 'all-gather', 'all2all', 'reduce-scatter', 'memcpy-async', 'fused-allreduce-residual', 'fused-tp-allreduce-residual'];
  const SCATTER = ['expert-permute', 'index-put', 'embedding-lookup', 'repeat-interleave'];

  if (ATTENTION.includes(opId)) return 'attention';
  if (NORM.includes(opId)) return 'norm';
  if (GEMM.includes(opId)) return 'gemm';
  if (COLLECTIVE.includes(opId)) return 'collective';
  if (SCATTER.includes(opId)) return 'scatter-permute';
  return 'default';
}

function checkAttentionInvariants(code: string, checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }>) {
  // Online softmax invariants: (m, s, acc) state must exist + be FP32
  // Use \b on lhs only; m_old / s_old etc. are word-extended (underscores)
  const hasMaxState = /\b(m_old|m_new|max_|row_max|partial_max|m_chunk)\b/.test(code);
  const hasSumState = /\b(s_old|s_new|partial_sum|row_sum|s_total|sum_p)\b/.test(code);
  const hasFp32 = /\b(float|FP32|fp32|f32)\b/.test(code);
  const hasExp = /\bexp[fl]?\(|\.exp\(|expf/.test(code);
  const hasRescale = /\brescale\b|exp\s*\(\s*m_old\s*-\s*m_new\)|exp\s*\(\s*m_new\s*-\s*m_old\)/i.test(code);

  checks.push({
    name: 'attention_has_max_state',
    status: hasMaxState ? 'pass' : 'fail',
    message: hasMaxState ? 'Found per-row max state (m_old/m_new/max_).' : 'Online softmax requires per-row max state (m_old/m_new). Not found.',
  });
  checks.push({
    name: 'attention_has_sum_state',
    status: hasSumState ? 'pass' : 'fail',
    message: hasSumState ? 'Found per-row partial sum state (s_).' : 'Online softmax requires per-row partial sum state (s_old/s_new). Not found.',
  });
  checks.push({
    name: 'attention_state_is_fp32',
    status: hasFp32 ? 'pass' : 'fail',
    message: hasFp32 ? 'FP32 dtype referenced (required for (m, s, acc) state).' : 'FP32 dtype not referenced — online softmax state must be FP32 even with BF16/FP16 inputs.',
  });
  checks.push({
    name: 'attention_uses_exp',
    status: hasExp ? 'pass' : 'fail',
    message: hasExp ? 'exp() / expf() found.' : 'Online softmax must use exp() — not found.',
  });
  checks.push({
    name: 'attention_has_rescale_pattern',
    status: hasRescale ? 'pass' : 'fail',
    message: hasRescale ? 'Online-softmax rescale pattern detected.' : 'Online softmax across K-tile pairs requires rescale = exp(m_old - m_new) trick. Not detected.',
  });
}

function checkNormInvariants(code: string, checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }>) {
  // \bfloat\b matches `<float>`, `(float)`, etc. but NOT `bfloat16_t` (which has
  // no word boundary before the `f`). Validated empirically.
  const hasFp32Cast = /(\.float\(\)|\bfloat\b|\bcast\s*<\s*float\s*>|\bto\s*\(\s*torch\.float32|\bFP32\b|\bfp32\b|\bf32\b)/.test(code);
  const hasReduction = /(reduce|partial_sum|sq_sum|mean|amean|squareSum|ReduceSum)/i.test(code);
  const hasRsqrt = /\brsqrt[fl]?\(|\binvsqrt\(|1\s*\.?\s*0?[fF]?\s*\/\s*sqrt|1\s*\/\s*sqrt/.test(code);

  checks.push({
    name: 'norm_uses_fp32_partial_sum',
    status: hasFp32Cast ? 'pass' : 'fail',
    message: hasFp32Cast ? 'FP32 cast / dtype reference present.' : 'Norm partial-sum must be FP32 even with BF16 inputs (mantissa loss otherwise). FP32 cast not detected.',
  });
  checks.push({
    name: 'norm_has_reduction',
    status: hasReduction ? 'pass' : 'fail',
    message: hasReduction ? 'Reduction primitive present.' : 'Norm requires row reduction (sum / mean). Not detected.',
  });
  checks.push({
    name: 'norm_has_rsqrt_or_div',
    status: hasRsqrt ? 'pass' : 'fail',
    message: hasRsqrt ? 'rsqrt / 1/sqrt detected.' : 'Norm requires rsqrt(variance + eps) — not found.',
  });
}

function checkGemmInvariants(code: string, checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }>) {
  const hasMma = /(wgmma|mma_sync|mma\.async|mfma|m_load_matrix|tl\.dot|MmaOp|Mmad)/i.test(code);
  const hasFp32Acc = /(float|FP32|f32|fp32|accumulator|acc\[)/i.test(code);
  const hasTileLoop = /(for\s*\(\s*int\s*k|for\s+k\s+in|range\(0,\s*K)/i.test(code);

  checks.push({
    name: 'gemm_uses_tensor_core_or_mma',
    status: hasMma ? 'pass' : 'fail',
    message: hasMma ? 'Tensor-core / MMA primitive detected.' : 'GEMM should use tensor-core MMA (WGMMA / MFMA / mma_sync / Mmad / tl.dot). Not detected.',
  });
  checks.push({
    name: 'gemm_uses_fp32_accumulator',
    status: hasFp32Acc ? 'pass' : 'fail',
    message: hasFp32Acc ? 'FP32 accumulator referenced.' : 'GEMM must use FP32 accumulator with BF16/FP16 inputs. Not detected.',
  });
  checks.push({
    name: 'gemm_has_k_loop',
    status: hasTileLoop ? 'pass' : 'fail',
    message: hasTileLoop ? 'K-tile loop present.' : 'GEMM requires K-dim tile loop. Not found.',
  });
}

function checkCollectiveInvariants(code: string, opId: string, checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }>) {
  const collectivePatterns: Record<string, RegExp> = {
    allreduce: /\b(ncclAllReduce|HcclAllReduce|all_reduce|allReduce|AllReduce)\b/,
    'all-gather': /\b(ncclAllGather|HcclAllGather|all_gather|allGather|AllGather)\b/,
    all2all: /\b(ncclSend|ncclRecv|all_to_all|allToAll|HcclAlltoAllV|AllToAll)\b/,
    'reduce-scatter': /\b(ncclReduceScatter|HcclReduceScatter|reduce_scatter|ReduceScatter)\b/,
    'memcpy-async': /\b(cudaMemcpyAsync|cp\.async|TMA|aclrtMemcpyAsync)\b/,
  };
  const re = collectivePatterns[opId];
  if (!re) {
    checks.push({
      name: 'collective_call_present',
      status: 'skipped',
      message: `No specific pattern registered for collective op "${opId}".`,
    });
    return;
  }
  const found = re.test(code);
  checks.push({
    name: 'collective_call_present',
    status: found ? 'pass' : 'fail',
    message: found ? `Collective primitive for "${opId}" found.` : `Expected collective primitive for "${opId}" not found in code.`,
  });
}

function checkScatterInvariants(code: string, checks: Array<{ name: string; status: 'pass' | 'fail' | 'skipped'; message: string }>) {
  const hasAtomic = /\batomicAdd|atomic_add|atomic_inc|__atomic/i.test(code);
  const hasGather = /\bindex|gather|scatter|permute/i.test(code);

  checks.push({
    name: 'scatter_has_atomic_or_radix_sort',
    status: hasAtomic ? 'pass' : 'fail',
    message: hasAtomic ? 'atomicAdd or atomic primitive detected.' : 'Scatter / permute typically requires atomicAdd for destination counter. Consider warp-level radix sort if avoiding atomics.',
  });
  checks.push({
    name: 'scatter_has_index_handling',
    status: hasGather ? 'pass' : 'fail',
    message: hasGather ? 'Index / gather / scatter / permute reference present.' : 'Expected index-driven gather/scatter pattern. Not detected.',
  });
}
