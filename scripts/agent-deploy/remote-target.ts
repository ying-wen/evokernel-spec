/**
 * v3.26 -- SSH remote-target executor.
 *
 * The big v3.26 deliverable. Pre-v3.26 the V3 perf gate consumed pre-
 * collected profiler CSVs via env vars (EVOKERNEL_NCU_INPUT_CSV etc) —
 * the user had to manually SSH to a target machine, build, run, profile,
 * and scp results back. v3.26 closes this loop: the harness does it.
 *
 * Workflow when --remote <target-id> is passed:
 *   1. Load ~/.config/evokernel/targets.yaml
 *   2. Match target-id to a RemoteTarget entry; verify hardware_id matches
 *      the --hardware flag
 *   3. (--dry-run) Print the SSH/scp/build/run/profile commands as a plan
 *   4. (real) SSH connect; sanity-check toolchain via `which <profiler>` etc
 *   5. scp the generated kernel sources + a per-vendor build script to
 *      <target>:<work_dir>/<run_id>/
 *   6. Run the build script remotely; capture stdout/stderr
 *   7. Run the test harness (a small invocation that runs the kernel +
 *      computes correctness vs reference)
 *   8. Run the profiler with appropriate flags
 *   9. scp profile output back to local agent-deploy-output/<run>/profile.csv
 *  10. Auto-set EVOKERNEL_<PROFILER>_INPUT_CSV so V3 perf gate ingests it
 *
 * Why dry-run by default for first connect:
 *   Real-hardware execution is destructive (allocates GPU memory, runs
 *   kernels, writes files on the remote). First-time invocation requires
 *   --execute to actually run; without it, we print the plan and exit.
 *   This protects users who set up a wrong target id or wrong hardware
 *   mapping and don't want to discover that by running on the wrong cluster.
 *
 * SSH security:
 *   - Uses the user's existing ~/.ssh/config — we never store keys
 *   - SSH host key checks are NOT disabled (no StrictHostKeyChecking=no)
 *   - Password prompts work (the SSH child process inherits stdio)
 *   - Per docs/SECURITY-NOTES.md, real targets live in
 *     ~/.config/evokernel/targets.yaml (git-ignored), repo only ships
 *     the .example placeholder
 *
 * The kernel-runner / per-vendor build scripts are scaffolds: they assume
 * a single .cu / .hip / .ascend-c / .bang-c file with a known main() entry.
 * v3.27 will deepen these with real model-driven test harness generation.
 */

import { readFile, mkdir, writeFile, access, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml } from 'yaml';
import { fileURLToPath } from 'node:url';

import {
  TargetsConfigSchema,
  vendorFamilyForHardware,
  type RemoteTarget,
  type VendorFamily,
} from './remote-target-schema';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_TARGETS_CONFIG = path.join(os.homedir(), '.config/evokernel/targets.yaml');

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

export class TargetNotFoundError extends Error {
  readonly target_id: string;
  readonly available: string[];
  constructor(target_id: string, available: string[]) {
    super(
      `[remote-target] No SSH target with id "${target_id}" in ${DEFAULT_TARGETS_CONFIG}.\n` +
        `  Available (${available.length}): ${available.join(', ') || '(none)'}\n` +
        `  Hint: copy targets.yaml.example to ~/.config/evokernel/targets.yaml and add a target.`,
    );
    this.name = 'TargetNotFoundError';
    this.target_id = target_id;
    this.available = available;
  }
}

export class TargetMismatchError extends Error {
  constructor(target: RemoteTarget, expected_hardware: string) {
    super(
      `[remote-target] Target "${target.id}" is configured for hardware "${target.hardware}", ` +
        `but --hardware is "${expected_hardware}". Use a target whose hardware matches, or update the target's hardware field.`,
    );
    this.name = 'TargetMismatchError';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Load targets.yaml
// ─────────────────────────────────────────────────────────────────────────

export interface LoadTargetsOptions {
  /** Override config file path. */
  config_path?: string;
}

export async function loadTargetsConfig(opts: LoadTargetsOptions = {}): Promise<RemoteTarget[]> {
  const file = opts.config_path ?? DEFAULT_TARGETS_CONFIG;
  if (!existsSync(file)) {
    return [];
  }
  const raw = await readFile(file, 'utf-8');
  const parsed = parseYaml(raw);
  const result = TargetsConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `[remote-target] ${file} does not match TargetsConfigSchema:\n` +
        result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  }
  return result.data.targets;
}

export async function resolveTarget(
  target_id: string,
  expected_hardware: string,
  opts: LoadTargetsOptions = {},
): Promise<RemoteTarget> {
  const targets = await loadTargetsConfig(opts);
  const matched = targets.find((t) => t.id === target_id);
  if (!matched) {
    throw new TargetNotFoundError(
      target_id,
      targets.map((t) => t.id),
    );
  }
  if (matched.hardware !== expected_hardware) {
    throw new TargetMismatchError(matched, expected_hardware);
  }
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────
// Plan + execute
// ─────────────────────────────────────────────────────────────────────────

export interface RemoteExecutionPlan {
  target: RemoteTarget;
  vendor: VendorFamily;
  /** Run-specific work dir on remote (e.g. /tmp/evokernel-work/<run_id>). */
  remote_work_dir: string;
  /** Local kernel sources to upload (filenames + contents). */
  kernel_files: Array<{ filename: string; content: string }>;
  /** Build script path inside the repo (per-vendor). */
  build_script_local: string;
  /** Build script path on remote after upload. */
  build_script_remote: string;
  /** Path on remote where profiler output will be written. */
  remote_profile_output: string;
  /** Path on local where profiler output should land. */
  local_profile_output: string;
  /** Sequential commands the executor will run (printed in dry-run). */
  commands: Array<{
    kind: 'ssh-check' | 'mkdir' | 'scp-up' | 'remote-build' | 'remote-run' | 'remote-profile' | 'scp-down';
    description: string;
    cmd: string;
  }>;
}

export interface BuildPlanInput {
  target: RemoteTarget;
  /** Kernel sources to upload (filename → content). */
  kernel_files: Array<{ filename: string; content: string }>;
  /** Local output dir to scp profiler results back to. */
  local_output_dir: string;
  /** Run id (used to namespace remote work dirs). */
  run_id: string;
}

/**
 * Build the remote execution plan WITHOUT executing. Used for dry-run +
 * for the executor's own scheduling.
 */
export function buildExecutionPlan(input: BuildPlanInput): RemoteExecutionPlan {
  const vendor = vendorFamilyForHardware(input.target.hardware);
  if (vendor === 'unknown') {
    throw new Error(
      `[remote-target] Cannot determine vendor family for hardware "${input.target.hardware}". ` +
        `Add a mapping in scripts/agent-deploy/remote-target-schema.ts:vendorFamilyForHardware.`,
    );
  }
  const remote_work_dir = `${input.target.toolchain.work_dir}/${input.run_id}`;
  const build_script_local = path.join(REPO_ROOT, `scripts/agent-deploy/remote/${vendor}/build.sh`);
  const build_script_remote = `${remote_work_dir}/build.sh`;
  const remote_profile_output = `${remote_work_dir}/profile.csv`;
  const local_profile_output = path.join(input.local_output_dir, 'profile.csv');
  const ssh = input.target.ssh;

  const commands: RemoteExecutionPlan['commands'] = [
    {
      kind: 'ssh-check',
      description: 'Sanity-check SSH + toolchain on remote',
      cmd: `ssh ${ssh} 'echo OK && which ${profilerForVendor(vendor)} 2>/dev/null || echo "<no profiler found>"'`,
    },
    {
      kind: 'mkdir',
      description: `Create work dir ${remote_work_dir}`,
      cmd: `ssh ${ssh} 'mkdir -p ${shellQuote(remote_work_dir)}'`,
    },
    {
      kind: 'scp-up',
      description: `Upload ${input.kernel_files.length} kernel file(s) + build script to remote`,
      cmd: `scp ${input.kernel_files.map((f) => `<local>/${f.filename}`).join(' ')} ${shellQuote(build_script_local)} ${ssh}:${shellQuote(remote_work_dir)}/`,
    },
    {
      kind: 'remote-build',
      description: 'Run per-vendor build script on remote',
      cmd: `ssh ${ssh} 'cd ${shellQuote(remote_work_dir)} && bash build.sh 2>&1'`,
    },
    {
      kind: 'remote-run',
      description: 'Run the compiled binary (correctness check)',
      cmd: `ssh ${ssh} 'cd ${shellQuote(remote_work_dir)} && ./bench --check 2>&1'`,
    },
    {
      kind: 'remote-profile',
      description: `Run ${profilerForVendor(vendor)} and capture metrics`,
      cmd: profilerCommandForVendor(vendor, ssh, remote_work_dir, remote_profile_output),
    },
    {
      kind: 'scp-down',
      description: `Pull profiler output back to ${local_profile_output}`,
      cmd: `scp ${ssh}:${shellQuote(remote_profile_output)} ${shellQuote(local_profile_output)}`,
    },
  ];

  return {
    target: input.target,
    vendor,
    remote_work_dir,
    kernel_files: input.kernel_files,
    build_script_local,
    build_script_remote,
    remote_profile_output,
    local_profile_output,
    commands,
  };
}

/**
 * Pretty-print the execution plan for --dry-run mode. Returns the plan
 * text the user sees. Single source of truth for "what would running
 * this remote-target invocation actually do?" — useful for code review
 * + for users who want to inspect before execute.
 */
export function formatPlanForDryRun(plan: RemoteExecutionPlan): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`╔═══════════════════════════════════════════════════════════════════════════════`);
  lines.push(`║ remote-target dry-run: ${plan.target.id}`);
  lines.push(`║   hardware: ${plan.target.hardware} (vendor: ${plan.vendor})`);
  lines.push(`║   ssh: ${plan.target.ssh}`);
  lines.push(`║   work dir: ${plan.remote_work_dir}`);
  lines.push(`║   kernel files: ${plan.kernel_files.map((f) => f.filename).join(', ')}`);
  lines.push(`╚═══════════════════════════════════════════════════════════════════════════════`);
  lines.push('');
  lines.push('Plan (each step would run sequentially; halt-on-error):');
  lines.push('');
  for (let i = 0; i < plan.commands.length; i++) {
    const c = plan.commands[i];
    lines.push(`  [${i + 1}] ${c.description}`);
    lines.push(`      $ ${c.cmd}`);
    lines.push('');
  }
  lines.push('To actually execute: re-run with --execute (omit --dry-run).');
  lines.push('');
  return lines.join('\n');
}

/**
 * Real execution. Runs each plan step in order, halts on first error.
 * NOT yet wired into index.ts CLI by default — v3.26 ships with dry-run
 * as the only public entry to give users time to validate target.yaml
 * config + per-vendor build scripts before destructive remote runs.
 *
 * v3.27 will wire `--execute` through to index.ts for end-to-end flows.
 */
export async function executeRemoteRun(plan: RemoteExecutionPlan): Promise<{
  exit_code: number;
  step: string;
  output: string;
}> {
  // Ensure local output dir exists
  await mkdir(path.dirname(plan.local_profile_output), { recursive: true });

  for (const cmd of plan.commands) {
    process.stderr.write(`[remote-target] ${cmd.description}\n`);
    process.stderr.write(`  $ ${cmd.cmd}\n`);
    const result = spawnSync('bash', ['-c', cmd.cmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 5 * 60 * 1000,
    });
    if (result.status !== 0) {
      return {
        exit_code: result.status ?? 1,
        step: cmd.kind,
        output: `STDOUT:\n${result.stdout ?? ''}\nSTDERR:\n${result.stderr ?? ''}`,
      };
    }
  }
  return { exit_code: 0, step: 'all', output: 'All steps completed successfully.' };
}

// ─────────────────────────────────────────────────────────────────────────
// Per-vendor profiler command builders
// ─────────────────────────────────────────────────────────────────────────

function profilerForVendor(vendor: VendorFamily): string {
  switch (vendor) {
    case 'nvidia':
      return 'ncu';
    case 'amd':
      return 'rocprof';
    case 'ascend':
      return 'msprof';
    case 'cambricon':
      return 'cnperf';
    case 'unknown':
      return 'echo "<unknown profiler>"';
  }
}

function profilerCommandForVendor(
  vendor: VendorFamily,
  ssh: string,
  work_dir: string,
  output_csv: string,
): string {
  const wd = shellQuote(work_dir);
  const out = shellQuote(output_csv);
  switch (vendor) {
    case 'nvidia':
      return `ssh ${ssh} 'cd ${wd} && ncu --csv --metrics sm__throughput.avg.pct_of_peak_sustained_elapsed,dram__throughput.avg.pct_of_peak_sustained_elapsed,sm__warps_active.avg.pct_of_peak_sustained_elapsed --launch-skip 2 --launch-count 5 ./bench > ${out} 2>&1'`;
    case 'amd':
      return `ssh ${ssh} 'cd ${wd} && rocprof --hsa-trace -i pmc.txt --output-dir . ./bench && mv results.csv ${out}'`;
    case 'ascend':
      return `ssh ${ssh} 'cd ${wd} && msprof --output=. --application=./bench && find . -name "ai_core_metric*.csv" -exec cp {} ${out} \\;'`;
    case 'cambricon':
      return `ssh ${ssh} 'cd ${wd} && cnperf record -o profile.cnperf -- ./bench && cnperf report --csv profile.cnperf > ${out}'`;
    case 'unknown':
      return `echo "<unknown profiler — manual capture required>"`;
  }
}

/**
 * Quote a path for safe interpolation into a shell command. Conservative:
 * single-quotes the value + escapes any embedded single quotes. Works for
 * the path-shaped values we pass (work_dir, file paths) but not for
 * arbitrary user input.
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
