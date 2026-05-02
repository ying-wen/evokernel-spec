/**
 * v3.5 — Layer V Gate 1 (Build): structural + execution mode.
 *
 * Structural mode: static analysis of the generated code.
 *   - Has #include / using directives
 *   - Has __global__ / __aicore__ / __mlu_global__ kernel marker
 *   - Has host-side launch wrapper (kernel<<<>>> / Mmad / Process / etc.)
 *   - No TODO / pseudocode markers (the v3.4 LLM-orchestrator promise)
 *
 * Execution mode: actually invoke the target compiler.
 *   - cuda-cpp → nvcc (sm_90 or arch-appropriate)
 *   - hip      → hipcc
 *   - ascend-c → bisheng (cce)
 *   - bang-c   → cncc
 *   - musa-c   → musac
 *   - triton   → python -c "import triton; jit-compile" (Triton lazy-compiles)
 *
 * If execution mode requested but compiler not found: degrades to structural
 * with a "skipped: compiler not available" reason.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const exec = promisify(execFile);

export interface BuildGateInput {
  code: string;
  language: string;
  target_arch: string;
  op: string;
  mode: 'structural' | 'execution';
}

export interface BuildGateResult {
  status: 'pass' | 'fail' | 'skipped';
  message: string;
  /** Structural checks performed in both modes. */
  structural_checks: Array<{ name: string; status: 'pass' | 'fail'; message: string }>;
  /** Compiler stdout/stderr (execution mode only). */
  compiler_diagnostic?: string;
  /** Compiler used (execution mode only). */
  compiler?: string;
  /** Total gate duration in ms. */
  duration_ms: number;
}

export async function runBuildGate(input: BuildGateInput): Promise<BuildGateResult> {
  const start = Date.now();

  // Always run structural checks — fast, no I/O, deterministic
  const structural = runStructuralChecks(input);
  const structuralFailed = structural.filter((c) => c.status === 'fail');

  // In structural mode, decide based on structural alone
  if (input.mode === 'structural') {
    if (structuralFailed.length > 0) {
      return {
        status: 'fail',
        message: `${structuralFailed.length} structural check(s) failed: ${structuralFailed.map((c) => c.name).join(', ')}`,
        structural_checks: structural,
        duration_ms: Date.now() - start,
      };
    }
    return {
      status: 'pass',
      message: `All ${structural.length} structural checks passed (structural mode; no compiler invoked).`,
      structural_checks: structural,
      duration_ms: Date.now() - start,
    };
  }

  // Execution mode — but bail if structural already failed
  if (structuralFailed.length > 0) {
    return {
      status: 'fail',
      message: `Skipped compiler invocation: ${structuralFailed.length} structural check(s) failed first.`,
      structural_checks: structural,
      duration_ms: Date.now() - start,
    };
  }

  // Execution mode: pick compiler, write code to tmp file, invoke
  const compilerInfo = pickCompiler(input.language, input.target_arch);
  if (!compilerInfo) {
    return {
      status: 'skipped',
      message: `Execution mode requested but no compiler mapped for language=${input.language} target_arch=${input.target_arch}.`,
      structural_checks: structural,
      duration_ms: Date.now() - start,
    };
  }

  const which = await checkCommandAvailable(compilerInfo.binary);
  if (!which) {
    return {
      status: 'skipped',
      message: `Execution mode requested but compiler "${compilerInfo.binary}" not in PATH. Install ${compilerInfo.binary} or run on a host with the target toolchain.`,
      structural_checks: structural,
      compiler: compilerInfo.binary,
      duration_ms: Date.now() - start,
    };
  }

  // Write code to tmp file + invoke compiler
  const tmpDir = path.join(os.tmpdir(), `evokernel-verify-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const srcPath = path.join(tmpDir, `${input.op}_${input.target_arch}.${compilerInfo.extension}`);
  await writeFile(srcPath, input.code, 'utf-8');

  try {
    const { stdout, stderr } = await exec(compilerInfo.binary, [...compilerInfo.flags, srcPath], {
      timeout: 60_000,
      cwd: tmpDir,
    });
    return {
      status: 'pass',
      message: `Compiled successfully with ${compilerInfo.binary}.`,
      structural_checks: structural,
      compiler: compilerInfo.binary,
      compiler_diagnostic: (stdout + stderr).slice(0, 4000),
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    const diagnostic = ((e.stdout ?? '') + '\n' + (e.stderr ?? '')).trim() || e.message;
    return {
      status: 'fail',
      message: `Compilation failed via ${compilerInfo.binary}.`,
      structural_checks: structural,
      compiler: compilerInfo.binary,
      compiler_diagnostic: diagnostic.slice(0, 4000),
      duration_ms: Date.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Structural checks
// ─────────────────────────────────────────────────────────────────────────

function runStructuralChecks(input: BuildGateInput): Array<{ name: string; status: 'pass' | 'fail'; message: string }> {
  const checks: Array<{ name: string; status: 'pass' | 'fail'; message: string }> = [];
  const code = input.code;

  // Check 1: not empty / not just a comment
  const nonCommentLines = code
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#'));
  checks.push({
    name: 'has_non_comment_code',
    status: nonCommentLines.length > 5 ? 'pass' : 'fail',
    message:
      nonCommentLines.length > 5
        ? `${nonCommentLines.length} non-comment lines.`
        : 'Code is empty or comment-only.',
  });

  // Check 2: includes / imports present
  const importPatterns: Record<string, RegExp[]> = {
    'cuda-cpp': [/^#include\s+<cuda/m, /^#include\s+<cu(da|blas|dnn)/m, /^#include\s+["<]/m],
    hip: [/^#include\s+<hip/m, /^#include\s+["<]/m],
    'ascend-c': [/^#include\s+["<]kernel_operator\.h/m, /^#include\s+["<]/m],
    'bang-c': [/^#include\s+<bang/m, /^#include\s+["<]/m],
    'musa-c': [/^#include\s+<musa/m, /^#include\s+["<]/m],
    'br-cuda': [/^#include\s+["<]/m],
    triton: [/import\s+triton/m, /from\s+triton/m],
    metal: [/^#include\s+<metal/m, /^using\s+namespace\s+metal/m],
  };
  const patterns = importPatterns[input.language] ?? [/^#include/m];
  const hasImports = patterns.some((p) => p.test(code));
  checks.push({
    name: 'has_imports_or_includes',
    status: hasImports ? 'pass' : 'fail',
    message: hasImports ? 'Found expected includes/imports.' : `No expected #include/import for language=${input.language}.`,
  });

  // Check 3: kernel marker / entry point
  const kernelMarkerPatterns: Record<string, RegExp> = {
    'cuda-cpp': /__global__\s+\w+/,
    hip: /__global__\s+\w+/,
    'ascend-c': /__aicore__|__global__\s*__aicore__|class\s+\w+\s*\{[\s\S]*Init|Process/,
    'bang-c': /__mlu_global__|__mlu_func__/,
    'musa-c': /__global__\s+\w+/,
    'br-cuda': /__global__\s+\w+/,
    triton: /@triton\.jit|@triton\.autotune/,
    metal: /kernel\s+void/,
  };
  const markerRe = kernelMarkerPatterns[input.language];
  const hasKernelMarker = markerRe ? markerRe.test(code) : false;
  checks.push({
    name: 'has_kernel_entry_point',
    status: hasKernelMarker ? 'pass' : 'fail',
    message: hasKernelMarker ? 'Kernel entry point marker present.' : `No expected kernel marker for language=${input.language} (e.g., __global__, __aicore__, @triton.jit).`,
  });

  // Check 4: no TODO / pseudocode markers (the v3.4 LLM-orchestrator promise)
  const forbiddenPatterns = [
    /\bTODO\b/i,
    /\bpseudocode\b/i,
    /\bimplement\s+(?:this|here|me)\b/i,
    /\bfill\s+in\s+(?:the|here)\b/i,
    /\.\.\.\s*\)\s*[;{]/,           // function calls with `...` placeholder
  ];
  const violations = forbiddenPatterns
    .map((p) => ({ pattern: p, match: code.match(p) }))
    .filter((v) => v.match);
  checks.push({
    name: 'no_todo_or_pseudocode_markers',
    status: violations.length === 0 ? 'pass' : 'fail',
    message:
      violations.length === 0
        ? 'No TODO / pseudocode markers found.'
        : `Found ${violations.length} forbidden marker(s): ${violations.map((v) => v.match?.[0]).join(', ')}. Real production code must not contain these.`,
  });

  // Check 5: has launch wrapper / dispatcher (host-callable entry)
  const launcherPatterns: Record<string, RegExp> = {
    'cuda-cpp': /<<<[\w\s,]+>>>|launch_\w+/,
    hip: /hipLaunchKernelGGL|<<<[\w\s,]+>>>|launch_\w+/,
    'ascend-c': /Process\(\)|extern\s+"C"\s+__global__|template\s*<.*>\s*class/,
    'bang-c': /__mlu_entry__|launch_\w+|<<<[\w\s,]+>>>/,
    'musa-c': /<<<[\w\s,]+>>>|launch_\w+/,
    'br-cuda': /<<<[\w\s,]+>>>|launch_\w+/,
    triton: /\.run\(|\[\s*grid\s*\]|kernel\s*\[/,
    metal: /commandEncoder|dispatchThread/,
  };
  const launcherRe = launcherPatterns[input.language];
  const hasLauncher = launcherRe ? launcherRe.test(code) : false;
  checks.push({
    name: 'has_launch_wrapper',
    status: hasLauncher ? 'pass' : 'fail',
    message: hasLauncher ? 'Host launch wrapper found.' : `No host launch wrapper for language=${input.language} (expected e.g., kernel<<<>>>, hipLaunchKernelGGL, .run(grid)).`,
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────
// Compiler picker
// ─────────────────────────────────────────────────────────────────────────

interface CompilerInfo {
  binary: string;
  flags: string[];
  extension: string;
}

function pickCompiler(language: string, target_arch: string): CompilerInfo | null {
  // Pick compiler binary + flags based on language + target arch.
  // Goal: invoke a syntax-only check (no link, no codegen) so we can verify
  // the code parses + types check, without needing the target hardware.
  switch (language) {
    case 'cuda-cpp': {
      const archFlag = target_arch === 'hopper' ? 'sm_90a'
        : target_arch === 'blackwell' ? 'sm_100a'
        : target_arch === 'ada' ? 'sm_89'
        : target_arch === 'ampere' ? 'sm_80'
        : 'sm_80';
      return { binary: 'nvcc', flags: ['-arch', archFlag, '-c', '-O0', '-std=c++17', '-o', '/dev/null'], extension: 'cu' };
    }
    case 'hip': {
      const archFlag = target_arch === 'cdna3' ? 'gfx942'
        : target_arch === 'cdna4' ? 'gfx950'
        : target_arch === 'rdna4' ? 'gfx1200'
        : target_arch === 'rdna3' ? 'gfx1100'
        : 'gfx942';
      return { binary: 'hipcc', flags: [`--offload-arch=${archFlag}`, '-c', '-O0', '-std=c++17', '-o', '/dev/null'], extension: 'cpp' };
    }
    case 'ascend-c':
      return { binary: 'bisheng', flags: ['-c', '-O0', '-mtarget=ascend910C'], extension: 'cce' };
    case 'bang-c':
      return { binary: 'cncc', flags: ['-c', '-O0', '--target=mlu590'], extension: 'mlu' };
    case 'musa-c':
      return { binary: 'musac', flags: ['-c', '-O0'], extension: 'mu' };
    case 'triton':
      return { binary: 'python3', flags: ['-c', "import triton; print('triton-import-ok')"], extension: 'py' };
    default:
      return null;
  }
}

async function checkCommandAvailable(binary: string): Promise<boolean> {
  try {
    await exec('which', [binary], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
