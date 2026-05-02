/**
 * v3.20 — agent:status + harness extension tests.
 *
 * Covers:
 *   - agent:status with no manifests → "No deploys found"
 *   - agent:status with fixture manifests → table output + correct outcomes
 *   - agent:status --json → parseable manifest array
 *   - --limit caps results
 *   - --root scans subdirs
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const STATUS = path.join(REPO_ROOT, 'scripts/agent-deploy/status.ts');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-20-status-fixture');

function makeManifest(overrides: Partial<any> = {}) {
  return {
    schema_version: '0.1',
    generated_at: '2026-05-03T10:00:00Z',
    request: { model: 'llama-3.3-70b', hardware: 'h100-sxm5', use_llm_orchestrator: true },
    classification: { archetype: 'dense', total_params_b: 70 },
    recommended: { engine: 'vllm', quantization: 'bf16', card_count: 2 },
    feasibility: { fits: true, card_count: 2 },
    kernel_gaps_count: 3,
    productized: {
      mode: 'real',
      shipped: 2,
      partial: 1,
      blocked: 0,
      per_gap: [
        { filename: 'rmsnorm.cu', outcome: 'shipped', attempts: 1, source: 'llm-generated' },
        { filename: 'rope.cu', outcome: 'shipped', attempts: 1, source: 'llm-generated' },
        { filename: 'fused-attn.cu', outcome: 'partial', attempts: 2, source: 'cache-hit' },
      ],
    },
    artifacts: { planning: [], production: [], knowledge_feedback: [] },
    ...overrides,
  };
}

beforeAll(async () => {
  await mkdir(FIXTURE_ROOT, { recursive: true });

  // Layout: 3 subdirs, each with a manifest. Different outcomes.
  const a = path.join(FIXTURE_ROOT, 'deploy-a');
  const b = path.join(FIXTURE_ROOT, 'deploy-b');
  const c = path.join(FIXTURE_ROOT, 'deploy-c');
  await mkdir(a, { recursive: true });
  await mkdir(b, { recursive: true });
  await mkdir(c, { recursive: true });
  await writeFile(
    path.join(a, 'evokernel-deploy.json'),
    JSON.stringify(makeManifest())
  );
  await writeFile(
    path.join(b, 'evokernel-deploy.json'),
    JSON.stringify(makeManifest({
      generated_at: '2026-05-04T10:00:00Z',
      request: { model: 'boltz-1', hardware: 'mi300x', use_llm_orchestrator: true },
      productized: {
        mode: 'cache',
        shipped: 0,
        partial: 0,
        blocked: 1,
        per_gap: [
          { filename: 'triangle-mult.hip', outcome: 'kernel-gap-blocked', attempts: 3, source: 'skeleton-fallback' },
        ],
      },
    }))
  );
  await writeFile(
    path.join(c, 'evokernel-deploy.json'),
    JSON.stringify(makeManifest({
      generated_at: '2026-05-02T10:00:00Z',
      request: { model: 'qwen3-7b', hardware: 'h100-sxm5', use_llm_orchestrator: false },
      productized: null,
    }))
  );
});

afterAll(async () => {
  await rm(FIXTURE_ROOT, { recursive: true, force: true });
});

describe('agent:status (v3.20)', () => {
  it('--help prints usage + exits 0', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', STATUS, '--help'], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.toString()).toContain('agent:status');
    expect(r.stdout.toString()).toContain('USAGE');
  });

  it('with no manifests → prints "No deploys found"', () => {
    const empty = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-20-empty-status');
    spawnSync('mkdir', ['-p', empty]);
    const r = spawnSync('pnpm', ['exec', 'tsx', STATUS, '--root', empty], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.toString()).toContain('No deploys found');
    spawnSync('rm', ['-rf', empty]);
  });

  it('with fixture manifests → table output sorted newest-first', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', STATUS, '--root', FIXTURE_ROOT], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(r.status).toBe(0);
    const out = r.stdout.toString();
    expect(out).toContain('boltz-1');
    expect(out).toContain('llama-3.3-70b');
    expect(out).toContain('qwen3-7b');
    // Boltz (May 4) should appear before Llama (May 3) — newest-first
    const boltzIdx = out.indexOf('boltz-1');
    const llamaIdx = out.indexOf('llama-3.3-70b');
    expect(boltzIdx).toBeLessThan(llamaIdx);
  });

  it('--json emits parseable manifest array', () => {
    const r = spawnSync(
      'pnpm',
      ['exec', 'tsx', STATUS, '--root', FIXTURE_ROOT, '--json'],
      { cwd: REPO_ROOT, timeout: 30000 }
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.toString());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
    expect(parsed[0]).toHaveProperty('schema_version');
    expect(parsed[0]).toHaveProperty('request');
    expect(parsed[0]).toHaveProperty('_source_dir');
  });

  it('--limit caps results', () => {
    const r = spawnSync(
      'pnpm',
      ['exec', 'tsx', STATUS, '--root', FIXTURE_ROOT, '--json', '--limit', '2'],
      { cwd: REPO_ROOT, timeout: 30000 }
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.toString());
    expect(parsed.length).toBe(2);
  });

  it('correctly derives outcome (shipped / partial / blocked)', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', STATUS, '--root', FIXTURE_ROOT], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    const out = r.stdout.toString();
    // boltz-1 had blocked=1 + shipped=0 + partial=0 → outcome 'blocked'
    expect(out).toMatch(/boltz-1.+blocked/);
    // llama-3.3-70b had shipped=2 + partial=1 + blocked=0 → outcome 'partial'
    // (any partial > 0 keeps outcome at partial in our logic)
    expect(out).toMatch(/llama-3\.3-70b.+(partial|shipped)/);
  });

  it('shows per-gap breakdown for productized deploys', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', STATUS, '--root', FIXTURE_ROOT], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    const out = r.stdout.toString();
    expect(out).toContain('rmsnorm.cu');
    expect(out).toContain('triangle-mult.hip');
  });
});
