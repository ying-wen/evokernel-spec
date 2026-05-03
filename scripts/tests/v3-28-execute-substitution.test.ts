/**
 * v3.28 -- regression tests for Finding #9 (executor `<local>` placeholder
 * was never substituted → scp-up always halted with "bash: local: No such
 * file or directory") and Finding #10 (build.sh CANN flag mismatches).
 *
 * These tests run the real executeRemoteRun against fake-SSH plans (using
 * `bash -c true` style commands) so we can assert substitution + plumbing
 * without needing a live SSH target.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  executeRemoteRun,
  type RemoteExecutionPlan,
} from '../agent-deploy/remote-target';

function makeFakePlan(commands: RemoteExecutionPlan['commands'], local_profile_output: string): RemoteExecutionPlan {
  return {
    target: {
      id: 'fake-test-target',
      hardware: 'h100-sxm5',
      ssh: 'fake@localhost',
      toolchain: { work_dir: '/tmp/fake-evokernel' },
    },
    vendor: 'nvidia',
    remote_work_dir: '/tmp/fake-evokernel/test-run',
    kernel_files: [
      { filename: 'k.cu', content: 'KERNEL_CONTENT_MARKER_v3_28' },
    ],
    build_script_local: '/tmp/fake-build.sh',
    build_script_remote: '/tmp/fake-evokernel/test-run/build.sh',
    remote_profile_output: '/tmp/fake-evokernel/test-run/profile.csv',
    local_profile_output,
    commands,
  };
}

describe('executeRemoteRun substitution (v3.28 / Finding #9 regression)', () => {
  it('substitutes <local> with a real tmpdir before running bash', async () => {
    const work = await mkdtemp(path.join(tmpdir(), 'v3-28-test-'));
    try {
      const sentinel = path.join(work, 'sentinel.txt');
      // The command uses <local> — pre-fix this would error with
      // "bash: local: No such file or directory" because bash sees
      // < followed by `local`.
      const plan = makeFakePlan(
        [
          {
            kind: 'ssh-check',
            description: 'verify <local> is a real path with our kernel inside',
            cmd: `cat <local>/k.cu > ${JSON.stringify(sentinel)}`,
          },
        ],
        path.join(work, 'profile.csv'),
      );
      const result = await executeRemoteRun(plan);
      expect(result.exit_code).toBe(0);
      const captured = await readFile(sentinel, 'utf-8');
      expect(captured).toBe('KERNEL_CONTENT_MARKER_v3_28');
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('halts on first failure (preserves halt-on-error semantics)', async () => {
    const work = await mkdtemp(path.join(tmpdir(), 'v3-28-test-'));
    try {
      const plan = makeFakePlan(
        [
          { kind: 'ssh-check', description: 'first step succeeds', cmd: 'true' },
          { kind: 'remote-build', description: 'second step fails', cmd: 'false' },
          { kind: 'remote-run', description: 'third step never runs', cmd: 'echo SHOULD_NOT_RUN' },
        ],
        path.join(work, 'profile.csv'),
      );
      const result = await executeRemoteRun(plan);
      expect(result.exit_code).not.toBe(0);
      expect(result.step).toBe('remote-build');
      expect(result.output).not.toContain('SHOULD_NOT_RUN');
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('multiple <local> references in same command all substitute', async () => {
    const work = await mkdtemp(path.join(tmpdir(), 'v3-28-test-'));
    try {
      const sentinel = path.join(work, 'sentinel.txt');
      const plan = makeFakePlan(
        [
          {
            kind: 'scp-up',
            description: 'two <local> tokens in one cmd',
            // The redirection trick: write substituted dir paths to the sentinel.
            cmd: `printf '%s|%s\\n' <local> <local> > ${JSON.stringify(sentinel)}`,
          },
        ],
        path.join(work, 'profile.csv'),
      );
      const result = await executeRemoteRun(plan);
      expect(result.exit_code).toBe(0);
      const captured = (await readFile(sentinel, 'utf-8')).trim();
      const [a, b] = captured.split('|');
      expect(a).toBe(b);
      // Both occurrences resolved to a real existing path, not the literal '<local>'
      expect(a).not.toContain('<local>');
      expect(a).toMatch(/evokernel-kernels-/);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});

describe('build.sh ascend (v3.28 / Finding #10 regression)', () => {
  it('does NOT contain the broken --target Ascend910B flag in code (comments OK)', async () => {
    const buildSh = await readFile(
      path.join(__dirname, '..', 'agent-deploy/remote/ascend/build.sh'),
      'utf-8',
    );
    // Pre-v3.28 used `--target ${NPU_SERIES}` which bisheng rejects.
    // Strip comment lines + heredoc bodies before testing the actual code.
    const codeOnly = buildSh
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    expect(codeOnly).not.toMatch(/ccec[^\n]*--target\s+[A-Z]/);
  });

  it('does NOT contain the ccel typo fallback', async () => {
    const buildSh = await readFile(
      path.join(__dirname, '..', 'agent-deploy/remote/ascend/build.sh'),
      'utf-8',
    );
    // Pre-v3.28 had `ccel -O2 ...` — there is no `ccel` binary.
    expect(buildSh).not.toMatch(/^[^#]*\bccel\s/m);
  });

  it('uses the v3.28 --cce-aicore-arch flag form', async () => {
    const buildSh = await readFile(
      path.join(__dirname, '..', 'agent-deploy/remote/ascend/build.sh'),
      'utf-8',
    );
    expect(buildSh).toMatch(/--cce-aicore-arch=/);
  });

  it('has a graceful fallback for non-aicore inputs (g++ or stub)', async () => {
    const buildSh = await readFile(
      path.join(__dirname, '..', 'agent-deploy/remote/ascend/build.sh'),
      'utf-8',
    );
    // Either g++ for .cpp or a stub bench script
    expect(buildSh).toMatch(/g\+\+/);
    expect(buildSh).toMatch(/stub|fallback/i);
  });
});
