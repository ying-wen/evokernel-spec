/**
 * v3.26 -- tests for --technique loading + SSH remote-target plan +
 * cross-arch verify scaffold + per-vendor build script presence.
 *
 * Tests are designed to NOT require real SSH or remote hardware. The
 * remote-target executor is tested via dry-run plan generation only;
 * actual SSH execution is gated behind an EVOKERNEL_REMOTE_INTEGRATION_TEST
 * env (not set in CI).
 */

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadTechnique,
  describeTechniquePortStatus,
  listAvailableTechniques,
  TechniqueNotFoundError,
} from '../agent-deploy/load-technique';
import {
  loadTargetsConfig,
  resolveTarget,
  buildExecutionPlan,
  formatPlanForDryRun,
  TargetNotFoundError,
  TargetMismatchError,
} from '../agent-deploy/remote-target';
import { vendorFamilyForHardware } from '../agent-deploy/remote-target-schema';
import { planCrossArchCompare } from '../agent-deploy/verify/cross-arch-compare';
import type { Technique } from '@evokernel/schemas';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-26-targets');

afterEach(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// load-technique
// ─────────────────────────────────────────────────────────────────────────

describe('loadTechnique (v3.26)', () => {
  it('loads SageAttention from data/techniques/sageattention.yaml', async () => {
    const tech = await loadTechnique('sageattention');
    expect(tech.id).toBe('sageattention');
    expect(tech.name).toBe('SageAttention');
    expect(tech.technique_kind).toBe('attention-optimization');
    expect(tech.port_targets.length).toBeGreaterThanOrEqual(4);
  });

  it('throws TechniqueNotFoundError with available list when slug missing', async () => {
    try {
      await loadTechnique('nonexistent-technique-xyz');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TechniqueNotFoundError);
      expect((e as TechniqueNotFoundError).available).toContain('sageattention');
    }
  });

  it('listAvailableTechniques returns slugs of all data/techniques/*.yaml', async () => {
    const techs = await listAvailableTechniques();
    expect(techs).toContain('sageattention');
  });

  describe('describeTechniquePortStatus', () => {
    it('matched arch family with planned status → "greenfield port" summary', async () => {
      const tech = await loadTechnique('sageattention');
      const ctx = describeTechniquePortStatus(tech, 'ascend-da-vinci-3');
      expect(ctx.matched_port_target?.status).toBe('planned');
      expect(ctx.summary).toMatch(/planned port \(greenfield\)/i);
    });

    it('matched arch family with reference-impl status → "reference impl" summary', async () => {
      const tech = await loadTechnique('sageattention');
      const ctx = describeTechniquePortStatus(tech, 'hopper');
      expect(ctx.matched_port_target?.status).toBe('reference-impl');
      expect(ctx.summary).toMatch(/reference impl/);
    });

    it('matched arch family with experimental status → "experimental" summary', async () => {
      const tech = await loadTechnique('sageattention');
      const ctx = describeTechniquePortStatus(tech, 'ampere');
      expect(ctx.matched_port_target?.status).toBe('experimental');
      expect(ctx.summary).toMatch(/experimental port/i);
    });

    it('unmatched arch family → "no port_target" greenfield summary', async () => {
      const tech = await loadTechnique('sageattention');
      const ctx = describeTechniquePortStatus(tech, 'some-novel-arch');
      expect(ctx.matched_port_target).toBeUndefined();
      expect(ctx.summary).toMatch(/no port_target/i);
      expect(ctx.summary).toMatch(/greenfield port/i);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// remote-target schema + resolution
// ─────────────────────────────────────────────────────────────────────────

describe('vendorFamilyForHardware (v3.26)', () => {
  it('NVIDIA hardware ids map to nvidia', () => {
    expect(vendorFamilyForHardware('h100-sxm5')).toBe('nvidia');
    expect(vendorFamilyForHardware('h200-sxm')).toBe('nvidia');
    expect(vendorFamilyForHardware('b200-sxm')).toBe('nvidia');
    expect(vendorFamilyForHardware('rtx-5090')).toBe('nvidia');
    expect(vendorFamilyForHardware('jetson-thor')).toBe('nvidia');
  });
  it('AMD hardware ids map to amd', () => {
    expect(vendorFamilyForHardware('mi300x')).toBe('amd');
    expect(vendorFamilyForHardware('mi355x')).toBe('amd');
    expect(vendorFamilyForHardware('rx-9070-xt')).toBe('amd');
  });
  it('Ascend hardware ids map to ascend', () => {
    expect(vendorFamilyForHardware('ascend-910b')).toBe('ascend');
    expect(vendorFamilyForHardware('ascend-950')).toBe('ascend');
    expect(vendorFamilyForHardware('atlas-900-superpod-a2')).toBe('ascend');
  });
  it('Cambricon MLU ids map to cambricon', () => {
    expect(vendorFamilyForHardware('mlu590')).toBe('cambricon');
    expect(vendorFamilyForHardware('mlu370-x8')).toBe('cambricon');
  });
  it('unknown hardware ids map to unknown', () => {
    expect(vendorFamilyForHardware('mystery-card-xyz')).toBe('unknown');
  });
});

describe('loadTargetsConfig + resolveTarget (v3.26)', () => {
  it('returns empty array when targets.yaml is absent', async () => {
    const targets = await loadTargetsConfig({ config_path: '/tmp/definitely-does-not-exist.yaml' });
    expect(targets).toEqual([]);
  });

  it('parses and validates a fixture targets.yaml', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const fixture = path.join(FIXTURE_DIR, 'targets.yaml');
    await writeFile(fixture, `
schema_version: '0.1'
targets:
  - id: ascend-test
    hardware: ascend-910b
    ssh: <ASCEND_910B_HOST>
    toolchain:
      cann_version: '8.0.RC1'
      profiler: msprof
      work_dir: /root/evokernel-work
  - id: h100-test
    hardware: h100-sxm5
    ssh: <H100_HOST>
    toolchain:
      cuda_version: '12.6'
      profiler: ncu
`);
    const targets = await loadTargetsConfig({ config_path: fixture });
    expect(targets.length).toBe(2);
    expect(targets[0].id).toBe('ascend-test');
    expect(targets[0].hardware).toBe('ascend-910b');
    expect(targets[1].toolchain.profiler).toBe('ncu');
  });

  it('throws when targets.yaml is malformed', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const fixture = path.join(FIXTURE_DIR, 'bad.yaml');
    await writeFile(fixture, `targets:\n  - id: BAD-ID-with-uppercase\n    hardware: h100-sxm5\n    ssh: x\n`);
    await expect(loadTargetsConfig({ config_path: fixture })).rejects.toThrow(/TargetsConfigSchema/);
  });

  it('resolveTarget throws TargetNotFoundError for unknown id', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const fixture = path.join(FIXTURE_DIR, 'targets.yaml');
    await writeFile(fixture, `targets:\n  - id: only-target\n    hardware: h100-sxm5\n    ssh: <H100_HOST>\n`);
    await expect(
      resolveTarget('missing-id', 'h100-sxm5', { config_path: fixture }),
    ).rejects.toBeInstanceOf(TargetNotFoundError);
  });

  it('resolveTarget throws TargetMismatchError when target hardware != --hardware', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const fixture = path.join(FIXTURE_DIR, 'targets.yaml');
    await writeFile(fixture, `targets:\n  - id: my-target\n    hardware: h100-sxm5\n    ssh: <H100_HOST>\n`);
    await expect(
      resolveTarget('my-target', 'ascend-910b', { config_path: fixture }),
    ).rejects.toBeInstanceOf(TargetMismatchError);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildExecutionPlan + formatPlanForDryRun
// ─────────────────────────────────────────────────────────────────────────

describe('buildExecutionPlan (v3.26)', () => {
  const fakeTarget = {
    id: 'h100-test',
    hardware: 'h100-sxm5',
    ssh: '<H100_HOST>',
    toolchain: { cuda_version: '12.6', profiler: 'ncu' as const, work_dir: '/tmp/evokernel-work' },
  };

  it('emits a plan with 7 steps (ssh-check / mkdir / scp-up / build / run / profile / scp-down)', () => {
    const plan = buildExecutionPlan({
      target: fakeTarget,
      kernel_files: [{ filename: 'attn_hopper.cu', content: '__global__ void kernel() {}' }],
      local_output_dir: '/tmp/local-out',
      run_id: 'test-run-123',
    });
    expect(plan.commands.length).toBe(7);
    const kinds = plan.commands.map((c) => c.kind);
    expect(kinds).toEqual(['ssh-check', 'mkdir', 'scp-up', 'remote-build', 'remote-run', 'remote-profile', 'scp-down']);
  });

  it('uses correct profiler per vendor (NVIDIA → ncu)', () => {
    const plan = buildExecutionPlan({
      target: fakeTarget,
      kernel_files: [{ filename: 'k.cu', content: 'x' }],
      local_output_dir: '/tmp/o',
      run_id: 'r',
    });
    expect(plan.commands.find((c) => c.kind === 'remote-profile')!.cmd).toMatch(/ncu --csv/);
  });

  it('uses msprof for Ascend targets', () => {
    const plan = buildExecutionPlan({
      target: { ...fakeTarget, hardware: 'ascend-910b' },
      kernel_files: [{ filename: 'k.cce', content: 'x' }],
      local_output_dir: '/tmp/o',
      run_id: 'r',
    });
    expect(plan.commands.find((c) => c.kind === 'remote-profile')!.cmd).toMatch(/msprof/);
    expect(plan.vendor).toBe('ascend');
  });

  it('uses rocprof for AMD targets', () => {
    const plan = buildExecutionPlan({
      target: { ...fakeTarget, hardware: 'mi300x' },
      kernel_files: [{ filename: 'k.hip', content: 'x' }],
      local_output_dir: '/tmp/o',
      run_id: 'r',
    });
    expect(plan.commands.find((c) => c.kind === 'remote-profile')!.cmd).toMatch(/rocprof/);
    expect(plan.vendor).toBe('amd');
  });

  it('uses cnperf for Cambricon targets', () => {
    const plan = buildExecutionPlan({
      target: { ...fakeTarget, hardware: 'mlu590' },
      kernel_files: [{ filename: 'k.mlu', content: 'x' }],
      local_output_dir: '/tmp/o',
      run_id: 'r',
    });
    expect(plan.commands.find((c) => c.kind === 'remote-profile')!.cmd).toMatch(/cnperf/);
    expect(plan.vendor).toBe('cambricon');
  });

  it('throws on unknown hardware (no vendor mapping)', () => {
    expect(() =>
      buildExecutionPlan({
        target: { ...fakeTarget, hardware: 'unknown-vendor-xyz' },
        kernel_files: [{ filename: 'k.cu', content: 'x' }],
        local_output_dir: '/tmp/o',
        run_id: 'r',
      }),
    ).toThrow(/Cannot determine vendor family/);
  });
});

describe('formatPlanForDryRun (v3.26)', () => {
  it('produces human-readable plan text with target id + 7 commands + execute hint', () => {
    const plan = buildExecutionPlan({
      target: { id: 't', hardware: 'h100-sxm5', ssh: '<H100_HOST>', toolchain: { work_dir: '/w' } },
      kernel_files: [{ filename: 'k.cu', content: 'x' }],
      local_output_dir: '/o',
      run_id: 'r',
    });
    const text = formatPlanForDryRun(plan);
    expect(text).toContain('remote-target dry-run');
    expect(text).toContain('hardware: h100-sxm5 (vendor: nvidia)');
    expect(text).toContain('--execute');
    // Counts: 7 numbered commands (each lines start with "  [N]")
    const numbered = text.match(/^\s*\[\d+\]/gm) ?? [];
    expect(numbered.length).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// per-vendor build script presence
// ─────────────────────────────────────────────────────────────────────────

describe('per-vendor build scripts (v3.26)', () => {
  const expected = ['nvidia', 'amd', 'ascend', 'cambricon'];
  for (const vendor of expected) {
    it(`scripts/agent-deploy/remote/${vendor}/build.sh exists + is executable`, async () => {
      const file = path.join(REPO_ROOT, `scripts/agent-deploy/remote/${vendor}/build.sh`);
      expect(existsSync(file)).toBe(true);
      // chmod +x checked via fs (executability bit; not perfect across OSes but
      // sufficient for the v3.26 scaffold).
      const { statSync } = await import('node:fs');
      const stat = statSync(file);
      // Owner-execute bit set
      expect((stat.mode & 0o100) !== 0).toBe(true);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// cross-arch-compare scaffold
// ─────────────────────────────────────────────────────────────────────────

describe('planCrossArchCompare (v3.26)', () => {
  it('produces plan with 4 pre-checks + 2 comparison steps for SageAttention → Ascend', async () => {
    const tech: Technique = await loadTechnique('sageattention');
    const plan = planCrossArchCompare({
      technique: tech,
      target_arch_family: 'ascend-da-vinci-3',
      generated_code: '__kernel__ void ascend_attention() {' + 'X'.repeat(500) + '}',
      generated_language: 'ascend-c',
    });
    expect(plan.pre_checks.length).toBe(4);
    expect(plan.comparison_steps?.length).toBe(2);
    expect(plan.comparison_steps![0].side).toBe('reference');
    expect(plan.comparison_steps![1].side).toBe('new-impl');
    expect(plan.comparison_steps![1].arch_family).toBe('ascend-da-vinci-3');
    expect(plan.tolerance?.max_abs_diff).toBe(1e-2);
  });

  it('marks ready_to_execute=false (v3.26 ships plan only; v3.27 executes)', async () => {
    const tech: Technique = await loadTechnique('sageattention');
    const plan = planCrossArchCompare({
      technique: tech,
      target_arch_family: 'cdna3',
      generated_code: 'X'.repeat(500),
      generated_language: 'hip',
    });
    expect(plan.ready_to_execute).toBe(false);
    expect(plan.summary).toMatch(/v3.27 will execute/);
  });

  it('fails generated-code check when code is empty/stub', async () => {
    const tech: Technique = await loadTechnique('sageattention');
    const plan = planCrossArchCompare({
      technique: tech,
      target_arch_family: 'hopper',
      generated_code: '// TODO',
      generated_language: 'cuda-cpp',
    });
    expect(plan.ready_to_execute).toBe(false);
    expect(plan.pre_checks.find((c) => c.name === 'generated-code-non-empty')?.status).toBe('fail');
  });

  it('warns when target arch is not in port_targets', async () => {
    const tech: Technique = await loadTechnique('sageattention');
    const plan = planCrossArchCompare({
      technique: tech,
      target_arch_family: 'some-novel-arch',
      generated_code: 'X'.repeat(500),
      generated_language: 'unknown',
    });
    const archCheck = plan.pre_checks.find((c) => c.name === 'target-arch-in-port-targets');
    expect(archCheck?.status).toBe('warn');
  });
});
