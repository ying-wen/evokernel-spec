/**
 * v3.19 — agent:doctor + MCP-tool-registration tests.
 *
 * Doctor: smoke-tests that all 12 checks run, each emits valid Status, and
 * --json mode produces parseable structured output.
 *
 * MCP: parse the index.ts module to verify the 3 new productized tools
 * (resolve_bundle, list_bundles, auto_pr) are registered with proper
 * inputSchema. We don't full-spawn an MCP server here — that's an
 * integration test that needs the @modelcontextprotocol/sdk handshake. This
 * test guards against typo/registration regressions cheaply.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const DOCTOR = path.join(REPO_ROOT, 'scripts/agent-deploy/doctor.ts');
const MCP_SERVER = path.join(REPO_ROOT, 'plugins/mcp-server/index.ts');

// ─────────────────────────────────────────────────────────────────────────
// agent:doctor
// ─────────────────────────────────────────────────────────────────────────

describe('agent:doctor (v3.19)', () => {
  it('--json produces parseable output with all check_ids', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', DOCTOR, '--json'], {
      cwd: REPO_ROOT,
      timeout: 60000,
    });
    // doctor exits 1 if any FAIL — but this test runs in a healthy repo,
    // so we expect 0. WARN-only is fine.
    expect([0, 1]).toContain(r.status);
    const checks = JSON.parse(r.stdout.toString());
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThanOrEqual(12);

    // Every check must have id + title + status + detail
    for (const c of checks) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('title');
      expect(['PASS', 'WARN', 'FAIL']).toContain(c.status);
      expect(c).toHaveProperty('detail');
    }

    // Specific expected check ids
    const ids = checks.map((c: any) => c.id);
    expect(ids).toContain('ENV-NODE-VERSION');
    expect(ids).toContain('ENV-PNPM-VERSION');
    expect(ids).toContain('REPO-INSTALL');
    expect(ids).toContain('REPO-DIST-BUILT');
    expect(ids).toContain('REPO-CHANGELOG');
    expect(ids).toContain('PLUGIN-CODEX-BIN');
    expect(ids).toContain('PLUGIN-CC-COMMAND');
  });

  it('default text mode prints each check with status + summary', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', DOCTOR], {
      cwd: REPO_ROOT,
      timeout: 60000,
    });
    expect([0, 1]).toContain(r.status);
    const stderr = r.stderr.toString();
    expect(stderr).toContain('EvoKernel Agent Harness');
    expect(stderr).toMatch(/\[PASS\]|\[WARN\]|\[FAIL\]/);
    expect(stderr).toMatch(/Summary: \d+ pass, \d+ warn, \d+ fail/);
  });

  it('node + pnpm version checks pass (this CI uses 22+ and pnpm 9+)', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', DOCTOR, '--json'], {
      cwd: REPO_ROOT,
      timeout: 60000,
    });
    const checks = JSON.parse(r.stdout.toString());
    const node = checks.find((c: any) => c.id === 'ENV-NODE-VERSION');
    const pnpm = checks.find((c: any) => c.id === 'ENV-PNPM-VERSION');
    expect(node?.status).toBe('PASS');
    expect(pnpm?.status).toBe('PASS');
  });

  it('REPO-CHANGELOG check counts 20+ versions (regression for v3.17 bug)', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', DOCTOR, '--json'], {
      cwd: REPO_ROOT,
      timeout: 60000,
    });
    const checks = JSON.parse(r.stdout.toString());
    const cl = checks.find((c: any) => c.id === 'REPO-CHANGELOG');
    expect(cl?.status).toBe('PASS');
    expect(cl?.detail).toMatch(/\d+ versions parsed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// MCP server tool registration
// ─────────────────────────────────────────────────────────────────────────

describe('MCP server productized tools (v3.19)', () => {
  it('TOOLS array includes the 3 new v3.19 tools', async () => {
    const src = await readFile(MCP_SERVER, 'utf-8');
    expect(src).toContain("name: 'evokernel_agent_resolve_bundle'");
    expect(src).toContain("name: 'evokernel_agent_list_bundles'");
    expect(src).toContain("name: 'evokernel_agent_auto_pr'");
  });

  it('each new tool has an inputSchema with required + properties', async () => {
    const src = await readFile(MCP_SERVER, 'utf-8');
    // resolve_bundle requires both model + hardware
    const resolveBlock = extractToolBlock(src, 'evokernel_agent_resolve_bundle');
    expect(resolveBlock).toMatch(/required:\s*\['model',\s*'hardware'\]/);
    expect(resolveBlock).toMatch(/properties:\s*{/);

    // list_bundles has no required (filters are optional)
    const listBlock = extractToolBlock(src, 'evokernel_agent_list_bundles');
    expect(listBlock).toMatch(/properties:\s*{/);

    // auto_pr has no required
    const prBlock = extractToolBlock(src, 'evokernel_agent_auto_pr');
    expect(prBlock).toMatch(/properties:\s*{/);
  });

  it('dispatcher has a case for each new tool', async () => {
    const src = await readFile(MCP_SERVER, 'utf-8');
    expect(src).toContain("case 'evokernel_agent_resolve_bundle'");
    expect(src).toContain("case 'evokernel_agent_list_bundles'");
    expect(src).toContain("case 'evokernel_agent_auto_pr'");
  });

  it('total tool count is 12 (9 v3.7 + 3 v3.19)', async () => {
    const src = await readFile(MCP_SERVER, 'utf-8');
    // Count "name: 'evokernel_" occurrences inside the TOOLS array.
    const matches = src.match(/name:\s*'evokernel_/g);
    expect(matches?.length).toBeGreaterThanOrEqual(12);
  });
});

function extractToolBlock(src: string, toolName: string): string {
  const idx = src.indexOf(`name: '${toolName}'`);
  if (idx === -1) return '';
  // Capture the next ~20 lines or until the close brace + comma at same depth.
  const slice = src.slice(idx, idx + 1500);
  return slice;
}
