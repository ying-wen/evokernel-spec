/**
 * v3.18 — harness extension tests.
 *
 * Covers:
 *  - resolveBundleId (fuzzy slug match): exact, normalized, substring, ambiguous
 *  - normalizeModelId (HF prefix strip + suffix strip + underscore→hyphen)
 *  - install-plugin.ts dry-run: prints expected actions, takes no fs effect
 *  - auto-pr-cli.ts: smoke-runs against a fixture learnings dir
 *  - evokernel-deploy.json manifest schema v0.1 shape (placeholder; full
 *    integration test would require an end-to-end run with API)
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

import {
  normalizeModelId,
  resolveBundleId,
  listBundles,
} from '../agent-deploy/fetch-bundle';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const FIXTURE_DIST = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-18-bundles');
const FIXTURE_LEARNINGS = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-18-learnings');

const SAMPLE_BUNDLE = {
  license: 'CC-BY-4.0',
  generated: '2026-05-03T00:00:00Z',
  schema_version: '0.16',
  request: {},
  bundle: {
    model: { id: 'x' },
    hardware: { id: 'y' },
    vendor: { id: 'z' },
    applicable_ops: [],
    applicable_fused_kernels: [],
    dsl_examples: [],
    isa_primitives: [],
    prior_learnings: [],
  },
};

beforeAll(async () => {
  // Set up bundle fixtures: 4 models on h100-sxm5 + 1 on mi300x
  await mkdir(FIXTURE_DIST, { recursive: true });
  for (const slug of [
    'llama-3.3-70b-on-h100-sxm5',
    'llama-3.3-70b-on-mi300x',
    'llama-4-scout-on-h100-sxm5',
    'qwen3-7b-on-h100-sxm5',
    'gpt-oss-on-h100-sxm5',
    'boltz-1-on-h100-sxm5',
  ]) {
    await writeFile(path.join(FIXTURE_DIST, `${slug}.json`), JSON.stringify(SAMPLE_BUNDLE));
  }

  // Set up agent-learnings fixtures (2 with the same kind/op for clustering)
  await mkdir(FIXTURE_LEARNINGS, { recursive: true });
  await writeFile(
    path.join(FIXTURE_LEARNINGS, 'one.yaml'),
    [
      'id: run-one',
      'agent_run_at: 2026-05-03T10:00:00Z',
      'model_id: llama-3.3-70b',
      'hardware_id: h100-sxm5',
      'engine_id: vllm',
      'outcome: shipped',
      'observations:',
      '  - kind: kernel-gap',
      '    op_or_kernel: rmsnorm',
      '    description: missing rmsnorm DSL for hopper',
      'triage_status: open',
      '',
    ].join('\n')
  );
  await writeFile(
    path.join(FIXTURE_LEARNINGS, 'two.yaml'),
    [
      'id: run-two',
      'agent_run_at: 2026-05-03T11:00:00Z',
      'model_id: llama-3.3-70b',
      'hardware_id: h100-sxm5',
      'engine_id: sglang',
      'outcome: partial',
      'observations:',
      '  - kind: kernel-gap',
      '    op_or_kernel: rmsnorm',
      '    description: another rmsnorm gap on hopper',
      'triage_status: open',
      '',
    ].join('\n')
  );
});

afterAll(async () => {
  await rm(FIXTURE_DIST, { recursive: true, force: true });
  await rm(FIXTURE_LEARNINGS, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// normalizeModelId
// ─────────────────────────────────────────────────────────────────────────

describe('normalizeModelId (v3.18)', () => {
  it('strips HuggingFace org prefix', () => {
    expect(normalizeModelId('meta-llama/Llama-3.3-70B-Instruct')).toBe('llama-3.3-70b');
  });
  it('lowercases', () => {
    expect(normalizeModelId('Llama-3.3-70B')).toBe('llama-3.3-70b');
  });
  it('strips -instruct / -chat / -base suffix', () => {
    expect(normalizeModelId('llama-3.3-70b-instruct')).toBe('llama-3.3-70b');
    expect(normalizeModelId('vicuna-13b-chat')).toBe('vicuna-13b');
    expect(normalizeModelId('llama-3-base')).toBe('llama-3');
  });
  it('converts underscore to hyphen', () => {
    expect(normalizeModelId('Llama_3_3_70B')).toBe('llama-3-3-70b');
  });
  it('returns canonical slug unchanged', () => {
    expect(normalizeModelId('llama-3.3-70b')).toBe('llama-3.3-70b');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// resolveBundleId
// ─────────────────────────────────────────────────────────────────────────

describe('resolveBundleId (v3.18)', () => {
  it('exact slug match — returns strategy "exact"', async () => {
    const r = await resolveBundleId({
      model: 'llama-3.3-70b',
      hardware: 'h100-sxm5',
      dist_path: FIXTURE_DIST,
    });
    expect(r.strategy).toBe('exact');
    expect(r.resolved?.model).toBe('llama-3.3-70b');
  });

  it('HF id (with org + suffix) — returns strategy "normalized"', async () => {
    const r = await resolveBundleId({
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      hardware: 'h100-sxm5',
      dist_path: FIXTURE_DIST,
    });
    expect(r.strategy).toBe('normalized');
    expect(r.resolved?.model).toBe('llama-3.3-70b');
    expect(r.normalized_model).toBe('llama-3.3-70b');
  });

  it('substring match (single candidate) — returns strategy "substring"', async () => {
    const r = await resolveBundleId({
      model: 'boltz', // matches only boltz-1-on-h100-sxm5
      hardware: 'h100-sxm5',
      dist_path: FIXTURE_DIST,
    });
    expect(r.strategy).toBe('substring');
    expect(r.resolved?.model).toBe('boltz-1');
  });

  it('ambiguous substring — returns null + candidates', async () => {
    const r = await resolveBundleId({
      model: 'llama', // matches llama-3.3-70b AND llama-4-scout
      hardware: 'h100-sxm5',
      dist_path: FIXTURE_DIST,
    });
    expect(r.strategy).toBe('none');
    expect(r.resolved).toBeNull();
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
    expect(r.candidates.map((c) => c.model)).toContain('llama-3.3-70b');
    expect(r.candidates.map((c) => c.model)).toContain('llama-4-scout');
  });

  it('no match — returns null + falls back to per-hardware list', async () => {
    const r = await resolveBundleId({
      model: 'nonexistent-model-xyz',
      hardware: 'h100-sxm5',
      dist_path: FIXTURE_DIST,
    });
    expect(r.resolved).toBeNull();
    expect(r.strategy).toBe('none');
    // candidates fall back to general per-hw list (top-8) when no substring match
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it('exact match on different hardware does not leak across', async () => {
    const r = await resolveBundleId({
      model: 'gpt-oss',
      hardware: 'mi300x', // gpt-oss is only on h100-sxm5 in fixture
      dist_path: FIXTURE_DIST,
    });
    expect(r.resolved).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// install-plugin.ts (dry-run only — no real fs side-effect)
// ─────────────────────────────────────────────────────────────────────────

describe('install-plugin.ts (v3.18)', () => {
  const SCRIPT = path.join(REPO_ROOT, 'scripts/agent-deploy/install-plugin.ts');

  it('--help prints usage + exits 0', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', SCRIPT, '--help'], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(r.status).toBe(0);
    const out = r.stdout.toString();
    expect(out).toContain('agent:install');
    expect(out).toContain('--target');
    expect(out).toContain('--dry-run');
  });

  it('--dry-run --target both prints expected ln + write actions, no fs effect', async () => {
    const sandbox_bin = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-18-sandbox-bin');
    const sandbox_cmd = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-18-sandbox-cmd');
    const r = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        SCRIPT,
        '--target',
        'both',
        '--dry-run',
        '--bin-dir',
        sandbox_bin,
        '--cc-commands-dir',
        sandbox_cmd,
      ],
      { cwd: REPO_ROOT, timeout: 30000 }
    );
    expect(r.status).toBe(0);
    const stderr = r.stderr.toString();
    expect(stderr).toMatch(/\[dry-run\] would mkdir -p/);
    expect(stderr).toMatch(/\[dry-run\] would ln -sf/);
    expect(stderr).toMatch(/Installed Codex binary/);
    expect(stderr).toMatch(/Installed Claude Code/);
    // No filesystem effect:
    await expect(access(sandbox_bin)).rejects.toBeDefined();
    await expect(access(sandbox_cmd)).rejects.toBeDefined();
  });

  it('rejects unknown --target value', () => {
    const r = spawnSync(
      'pnpm',
      ['exec', 'tsx', SCRIPT, '--target', 'something-else'],
      { cwd: REPO_ROOT, timeout: 30000 }
    );
    expect(r.status).toBe(2);
    expect(r.stderr.toString()).toMatch(/--target must be/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// auto-pr-cli.ts
// ─────────────────────────────────────────────────────────────────────────

describe('auto-pr-cli.ts (v3.18)', () => {
  const SCRIPT = path.join(REPO_ROOT, 'scripts/agent-deploy/auto-pr-cli.ts');

  it('--help prints usage + exits 0', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', SCRIPT, '--help'], {
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.toString()).toContain('agent:auto-pr');
  });

  it('produces a Markdown report from fixture learnings', () => {
    const r = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        SCRIPT,
        '--learnings-dir',
        FIXTURE_LEARNINGS,
        '--min-signal',
        '2',
      ],
      { cwd: REPO_ROOT, timeout: 30000 }
    );
    expect(r.status).toBe(0);
    const out = r.stdout.toString();
    expect(out).toContain('# Auto-PR Drafts');
    // Two open learnings, both kind=kernel-gap op=rmsnorm hw=h100-sxm5 → cluster signal 2
    expect(out).toMatch(/Signal 2/);
    expect(out).toMatch(/rmsnorm/i);
  });

  it('--json emits parseable JSON', () => {
    const r = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        SCRIPT,
        '--learnings-dir',
        FIXTURE_LEARNINGS,
        '--min-signal',
        '1',
        '--json',
      ],
      { cwd: REPO_ROOT, timeout: 30000 }
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.toString());
    expect(parsed).toHaveProperty('clusters');
    expect(parsed).toHaveProperty('input_summary');
    expect(parsed.input_summary.total_learnings).toBe(2);
    expect(parsed.input_summary.open).toBe(2);
  });

  it('emits "no clusters" message when no learnings exist', () => {
    const empty_dir = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-18-empty-learnings');
    spawnSync('mkdir', ['-p', empty_dir]);
    const r = spawnSync(
      'pnpm',
      ['exec', 'tsx', SCRIPT, '--learnings-dir', empty_dir],
      { cwd: REPO_ROOT, timeout: 30000 }
    );
    expect(r.status).toBe(0);
    expect(r.stderr.toString()).toContain('No agent-learnings found');
    spawnSync('rm', ['-rf', empty_dir]);
  });
});
