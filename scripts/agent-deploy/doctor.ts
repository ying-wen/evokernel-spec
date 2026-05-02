#!/usr/bin/env tsx
/**
 * v3.19 — `pnpm agent:doctor` setup-diagnosis command.
 *
 * The user opens a fresh repo or installs the binary somewhere new and
 * something doesn't work. Pre-v3.19 they'd hit a cryptic error and have to
 * read 200 lines of CHANGELOG to figure out which env var or build step
 * they missed. agent:doctor inspects every prerequisite the harness needs
 * and reports each as PASS / WARN / FAIL with an actionable fix.
 *
 * Exit codes:
 *   0  — all checks PASS or only WARNs
 *   1  — at least one FAIL (harness will not work as-is)
 *
 * Checks (each reports check_id, title, status, detail, fix):
 *
 *   ENV-NODE-VERSION       Node.js >= 22 (required by package.json engines)
 *   ENV-PNPM-VERSION       pnpm >= 9
 *   REPO-INSTALL           pnpm install has been run (node_modules present)
 *   REPO-DIST-BUILT        agent-context bundles built (apps/web/dist/api/agent-context/)
 *   REPO-DIST-FRESH        Bundles not stale relative to data/ (heuristic)
 *   REPO-CHANGELOG         CHANGELOG.md parses with no version drops (regression check)
 *   API-ANTHROPIC-KEY      ANTHROPIC_API_KEY set (warn only — optional for skeleton mode)
 *   FS-AGENT-LEARNINGS     data/agent-learnings/ exists + has parseable entries
 *   PLUGIN-CODEX-BIN       plugins/codex-productized/bin/evokernel-deploy is executable
 *   PLUGIN-CC-COMMAND      .claude/commands/agent-deploy.md exists
 *   INSTALL-CODEX          ~/.local/bin/evokernel-deploy symlink resolves correctly
 *   INSTALL-CC             ~/.claude/commands/agent-deploy.md symlink (or copy) exists
 */
import { access, stat, readdir, readFile, lstat } from 'node:fs/promises';
import { existsSync, constants as fsConstants } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { listBundles } from './fetch-bundle';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

type Status = 'PASS' | 'WARN' | 'FAIL';

interface CheckResult {
  id: string;
  title: string;
  status: Status;
  detail: string;
  fix?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────────────────

async function checkNodeVersion(): Promise<CheckResult> {
  const ver = process.versions.node;
  const major = parseInt(ver.split('.')[0], 10);
  if (major >= 22) {
    return { id: 'ENV-NODE-VERSION', title: 'Node.js >= 22', status: 'PASS', detail: `node v${ver}` };
  }
  return {
    id: 'ENV-NODE-VERSION',
    title: 'Node.js >= 22',
    status: 'FAIL',
    detail: `Detected node v${ver}. package.json requires >=22.`,
    fix: 'Install via nvm: `nvm install 22 && nvm use 22`. Or update your system Node.',
  };
}

async function checkPnpmVersion(): Promise<CheckResult> {
  try {
    const out = execSync('pnpm --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    const major = parseInt(out.split('.')[0], 10);
    if (major >= 9) {
      return { id: 'ENV-PNPM-VERSION', title: 'pnpm >= 9', status: 'PASS', detail: `pnpm v${out}` };
    }
    return {
      id: 'ENV-PNPM-VERSION',
      title: 'pnpm >= 9',
      status: 'FAIL',
      detail: `Detected pnpm v${out}. Repo specifies >=9.`,
      fix: 'Upgrade: `npm i -g pnpm@latest` (or `corepack enable pnpm`).',
    };
  } catch (e) {
    return {
      id: 'ENV-PNPM-VERSION',
      title: 'pnpm >= 9',
      status: 'FAIL',
      detail: `pnpm not installed: ${(e as Error).message}`,
      fix: 'Install: `npm i -g pnpm` or `corepack enable pnpm`.',
    };
  }
}

async function checkRepoInstall(): Promise<CheckResult> {
  const node_modules = path.join(REPO_ROOT, 'node_modules');
  if (existsSync(node_modules)) {
    return { id: 'REPO-INSTALL', title: 'pnpm install ran', status: 'PASS', detail: `${node_modules} present` };
  }
  return {
    id: 'REPO-INSTALL',
    title: 'pnpm install ran',
    status: 'FAIL',
    detail: `${node_modules} missing.`,
    fix: 'Run `pnpm install` in repo root.',
  };
}

async function checkDistBuilt(): Promise<CheckResult> {
  const dist = path.join(REPO_ROOT, 'apps/web/dist/api/agent-context');
  if (!existsSync(dist)) {
    return {
      id: 'REPO-DIST-BUILT',
      title: 'agent-context bundles built',
      status: 'FAIL',
      detail: `${dist} missing.`,
      fix: 'Run `pnpm --filter @evokernel/web build` to generate bundles.',
    };
  }
  const bundles = await listBundles(dist);
  if (bundles.length < 100) {
    return {
      id: 'REPO-DIST-BUILT',
      title: 'agent-context bundles built',
      status: 'WARN',
      detail: `${bundles.length} bundles found. Expected 1000+ in a complete corpus.`,
      fix: 'Run `pnpm --filter @evokernel/web build` to rebuild bundles.',
    };
  }
  return {
    id: 'REPO-DIST-BUILT',
    title: 'agent-context bundles built',
    status: 'PASS',
    detail: `${bundles.length} bundles available`,
  };
}

async function checkDistFresh(): Promise<CheckResult> {
  // Heuristic: compare newest data/**/*.yaml mtime vs newest dist bundle mtime.
  // If data is materially newer (>5 min), suggest rebuild.
  const dist = path.join(REPO_ROOT, 'apps/web/dist/api/agent-context');
  if (!existsSync(dist)) {
    return {
      id: 'REPO-DIST-FRESH',
      title: 'bundles not stale vs data/',
      status: 'FAIL',
      detail: 'dist/ missing — cannot check freshness.',
      fix: 'Run `pnpm --filter @evokernel/web build`.',
    };
  }
  try {
    let dataNewest = 0;
    let distNewest = 0;
    const dataDir = path.join(REPO_ROOT, 'data');
    const walk = async (dir: string, agg: { newest: number }) => {
      const items = await readdir(dir, { withFileTypes: true });
      for (const it of items) {
        const full = path.join(dir, it.name);
        if (it.isDirectory()) await walk(full, agg);
        else if (it.name.endsWith('.yaml')) {
          const s = await stat(full);
          if (s.mtimeMs > agg.newest) agg.newest = s.mtimeMs;
        }
      }
    };
    const agg1 = { newest: 0 };
    await walk(dataDir, agg1);
    dataNewest = agg1.newest;
    const distFiles = await readdir(dist);
    for (const f of distFiles) {
      if (!f.endsWith('.json')) continue;
      const s = await stat(path.join(dist, f));
      if (s.mtimeMs > distNewest) distNewest = s.mtimeMs;
    }
    const lag_min = (dataNewest - distNewest) / 1000 / 60;
    if (lag_min > 5) {
      return {
        id: 'REPO-DIST-FRESH',
        title: 'bundles not stale vs data/',
        status: 'WARN',
        detail: `data/ is ${lag_min.toFixed(1)} min newer than dist/ — bundles may be stale.`,
        fix: 'Rebuild: `pnpm --filter @evokernel/web build`.',
      };
    }
    return { id: 'REPO-DIST-FRESH', title: 'bundles not stale vs data/', status: 'PASS', detail: `dist/ within 5 min of data/` };
  } catch (e) {
    return {
      id: 'REPO-DIST-FRESH',
      title: 'bundles not stale vs data/',
      status: 'WARN',
      detail: `Could not compare timestamps: ${(e as Error).message}`,
    };
  }
}

async function checkChangelog(): Promise<CheckResult> {
  // Cheap regression check that the changelog parser bug from v3.17 isn't back.
  const changelog = path.join(REPO_ROOT, 'CHANGELOG.md');
  if (!existsSync(changelog)) {
    return {
      id: 'REPO-CHANGELOG',
      title: 'CHANGELOG.md parses (regression guard)',
      status: 'WARN',
      detail: 'CHANGELOG.md missing.',
    };
  }
  const raw = await readFile(changelog, 'utf-8');
  const headerRegex = /^##\s+\[([^\]]+)\](?:\s*[—\-–]\s*(\d{4}-\d{2}-\d{2}))?[^\n]*$/gm;
  let count = 0;
  for (const _ of raw.matchAll(headerRegex)) count++;
  if (count < 20) {
    return {
      id: 'REPO-CHANGELOG',
      title: 'CHANGELOG.md parses (regression guard)',
      status: 'FAIL',
      detail: `Only ${count} versions parsed. Pre-v3.17 regex bug may have regressed.`,
      fix: 'Inspect apps/web/src/lib/changelog.ts and ensure regex allows trailing themed-name.',
    };
  }
  return { id: 'REPO-CHANGELOG', title: 'CHANGELOG.md parses (regression guard)', status: 'PASS', detail: `${count} versions parsed` };
}

async function checkAnthropicKey(): Promise<CheckResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    const masked = process.env.ANTHROPIC_API_KEY.slice(0, 8) + '...';
    return {
      id: 'API-ANTHROPIC-KEY',
      title: 'ANTHROPIC_API_KEY set',
      status: 'PASS',
      detail: `present (${masked})`,
    };
  }
  return {
    id: 'API-ANTHROPIC-KEY',
    title: 'ANTHROPIC_API_KEY set',
    status: 'WARN',
    detail: 'Not set — productized real-mode unavailable; skeleton fallback will be used.',
    fix: 'Export: `export ANTHROPIC_API_KEY=sk-ant-...` (only needed for --use-llm-orchestrator real mode).',
  };
}

async function checkAgentLearnings(): Promise<CheckResult> {
  const dir = path.join(REPO_ROOT, 'data/agent-learnings');
  if (!existsSync(dir)) {
    return {
      id: 'FS-AGENT-LEARNINGS',
      title: 'data/agent-learnings/ exists',
      status: 'WARN',
      detail: 'directory missing — F-loop has no input yet.',
      fix: 'Created automatically by `pnpm agent:deploy --use-llm-orchestrator` once you triage your first deploy.',
    };
  }
  const items = await readdir(dir);
  const yamls = items.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (yamls.length === 0) {
    return {
      id: 'FS-AGENT-LEARNINGS',
      title: 'data/agent-learnings/ has entries',
      status: 'WARN',
      detail: 'directory empty — no F-loop signal yet.',
    };
  }
  return { id: 'FS-AGENT-LEARNINGS', title: 'data/agent-learnings/ has entries', status: 'PASS', detail: `${yamls.length} learning${yamls.length !== 1 ? 's' : ''}` };
}

async function checkCodexBinary(): Promise<CheckResult> {
  const bin = path.join(REPO_ROOT, 'plugins/codex-productized/bin/evokernel-deploy');
  if (!existsSync(bin)) {
    return {
      id: 'PLUGIN-CODEX-BIN',
      title: 'Codex binary present + executable',
      status: 'FAIL',
      detail: `${bin} missing.`,
      fix: 'Restore from git: `git checkout HEAD -- plugins/codex-productized/bin/`.',
    };
  }
  try {
    await access(bin, fsConstants.X_OK);
    return { id: 'PLUGIN-CODEX-BIN', title: 'Codex binary present + executable', status: 'PASS', detail: bin };
  } catch {
    return {
      id: 'PLUGIN-CODEX-BIN',
      title: 'Codex binary present + executable',
      status: 'FAIL',
      detail: `${bin} not executable.`,
      fix: `chmod +x ${bin}`,
    };
  }
}

async function checkClaudeCommandFile(): Promise<CheckResult> {
  const cmd = path.join(REPO_ROOT, '.claude/commands/agent-deploy.md');
  if (!existsSync(cmd)) {
    return {
      id: 'PLUGIN-CC-COMMAND',
      title: 'Claude Code slash command present',
      status: 'FAIL',
      detail: `${cmd} missing.`,
      fix: 'Restore from git: `git checkout HEAD -- .claude/commands/`.',
    };
  }
  return { id: 'PLUGIN-CC-COMMAND', title: 'Claude Code slash command present', status: 'PASS', detail: cmd };
}

async function checkCodexInstalled(): Promise<CheckResult> {
  const link = path.join(os.homedir(), '.local/bin/evokernel-deploy');
  if (!existsSync(link)) {
    return {
      id: 'INSTALL-CODEX',
      title: 'Codex binary installed (~/.local/bin)',
      status: 'WARN',
      detail: 'not installed.',
      fix: 'Run `pnpm agent:install -- --target codex`.',
    };
  }
  try {
    const s = await lstat(link);
    if (s.isSymbolicLink()) {
      return { id: 'INSTALL-CODEX', title: 'Codex binary installed (~/.local/bin)', status: 'PASS', detail: `symlink → repo` };
    }
    return { id: 'INSTALL-CODEX', title: 'Codex binary installed (~/.local/bin)', status: 'PASS', detail: 'present (not a symlink — manually placed)' };
  } catch (e) {
    return {
      id: 'INSTALL-CODEX',
      title: 'Codex binary installed (~/.local/bin)',
      status: 'WARN',
      detail: `cannot stat link: ${(e as Error).message}`,
    };
  }
}

async function checkClaudeCodeInstalled(): Promise<CheckResult> {
  const link = path.join(os.homedir(), '.claude/commands/agent-deploy.md');
  if (!existsSync(link)) {
    return {
      id: 'INSTALL-CC',
      title: 'Claude Code slash command installed',
      status: 'WARN',
      detail: 'not installed.',
      fix: 'Run `pnpm agent:install -- --target claude-code`.',
    };
  }
  return { id: 'INSTALL-CC', title: 'Claude Code slash command installed', status: 'PASS', detail: link };
}

// ─────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────

const ICONS: Record<Status, string> = { PASS: '✓', WARN: '⚠', FAIL: '✗' };

async function main() {
  const args = process.argv.slice(2);
  const json_mode = args.includes('--json');
  const verbose = args.includes('--verbose') || args.includes('-v');

  const checks: CheckResult[] = await Promise.all([
    checkNodeVersion(),
    checkPnpmVersion(),
    checkRepoInstall(),
    checkDistBuilt(),
    checkDistFresh(),
    checkChangelog(),
    checkAnthropicKey(),
    checkAgentLearnings(),
    checkCodexBinary(),
    checkClaudeCommandFile(),
    checkCodexInstalled(),
    checkClaudeCodeInstalled(),
  ]);

  if (json_mode) {
    process.stdout.write(JSON.stringify(checks, null, 2) + '\n');
  } else {
    process.stderr.write('\nEvoKernel Agent Harness — Setup Diagnosis\n');
    process.stderr.write(`Repo: ${REPO_ROOT}\n\n`);
    for (const c of checks) {
      process.stderr.write(`  ${ICONS[c.status]} [${c.status}] ${c.id} — ${c.title}\n`);
      if (c.status !== 'PASS' || verbose) {
        process.stderr.write(`        ${c.detail}\n`);
        if (c.fix) process.stderr.write(`        Fix: ${c.fix}\n`);
      }
    }
    const fails = checks.filter((c) => c.status === 'FAIL').length;
    const warns = checks.filter((c) => c.status === 'WARN').length;
    const passes = checks.filter((c) => c.status === 'PASS').length;
    process.stderr.write(`\nSummary: ${passes} pass, ${warns} warn, ${fails} fail\n\n`);
    if (fails === 0) {
      process.stderr.write('Harness is ready to use.\n');
      process.stderr.write('Try: `pnpm agent:list-bundles -- --hardware h100-sxm5`\n\n');
    } else {
      process.stderr.write('Harness will not work until FAILs are resolved.\n\n');
    }
  }

  const fails = checks.filter((c) => c.status === 'FAIL').length;
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`agent:doctor failed: ${err.message}\n`);
  process.exit(2);
});
