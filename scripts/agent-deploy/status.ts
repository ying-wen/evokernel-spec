#!/usr/bin/env tsx
/**
 * v3.20 — `pnpm agent:status` — list recent productized deploys.
 *
 * The harness writes deploy artifacts to `agent-deploy-output/` (or the user's
 * `--output <dir>` choice). After several runs the user wants to know:
 *
 *   - "What did I deploy recently?"
 *   - "Which runs shipped vs got blocked?"
 *   - "Which gaps still need work?"
 *
 * Pre-v3.20 the user had to cat each evokernel-deploy.json by hand.
 * agent:status is the one-command answer.
 *
 * Discovery strategy:
 *   1. Default output dir is ./agent-deploy-output -- manifest at
 *      <dir>/evokernel-deploy.json
 *   2. If the user has run multiple deploys with different --output dirs,
 *      pass --root <dir> to scan a parent directory (recurses 1 level).
 *   3. Each manifest is the v3.18 schema 0.1 -- we read request + productized
 *      + classification fields.
 *
 * Output:
 *   - Default: human-readable table sorted by generated_at desc.
 *   - --json: array of manifests (machine-consumable).
 *
 * Exit code: 0 always (status, not validation).
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

interface DeployManifest {
  schema_version: string;
  generated_at: string;
  request: {
    model: string;
    hardware: string;
    workload?: string;
    use_llm_orchestrator?: boolean;
  };
  classification?: { archetype?: string; total_params_b?: number };
  recommended?: { engine?: string; quantization?: string; card_count?: number };
  feasibility?: { fits?: boolean; card_count?: number };
  kernel_gaps_count?: number;
  productized?: {
    mode?: string;
    shipped?: number;
    partial?: number;
    blocked?: number;
    per_gap?: Array<{ filename: string; outcome: string; attempts: number; source: string }>;
  } | null;
  // For convenience: source dir of the manifest (added by status.ts).
  _source_dir?: string;
}

function parseFlags(argv: string[]) {
  const out: { root?: string; json?: boolean; limit?: number } = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' && argv[i + 1]) out.root = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--limit' && argv[i + 1]) out.limit = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp() {
  const lines = [
    'agent:status -- list recent productized deploys',
    '',
    'USAGE',
    '  pnpm agent:status                       # scan ./agent-deploy-output/',
    '  pnpm agent:status -- --root ./outputs   # scan sub-dirs of ./outputs/',
    '  pnpm agent:status -- --json             # machine-readable',
    '  pnpm agent:status -- --limit 5          # cap recent entries',
    '',
    'OUTPUT (default text mode):',
    '  date          model                  hardware    outcome   gaps   mode',
    '  2026-05-03    llama-3.3-70b          h100-sxm5   shipped   3/3    real',
    '  2026-05-03    boltz-1                mi300x      partial   2/3    cache',
  ];
  console.log(lines.join('\n'));
}

async function findManifests(root: string): Promise<DeployManifest[]> {
  const out: DeployManifest[] = [];
  // Look for evokernel-deploy.json directly under root, or in subdirs (depth 1)
  const candidates: string[] = [];
  const direct = path.join(root, 'evokernel-deploy.json');
  if (existsSync(direct)) candidates.push(direct);
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const sub = path.join(root, e.name, 'evokernel-deploy.json');
        if (existsSync(sub)) candidates.push(sub);
      }
    }
  } catch {
    // Root dir doesn't exist — return empty.
    return out;
  }

  for (const c of candidates) {
    try {
      const raw = await readFile(c, 'utf-8');
      const manifest = JSON.parse(raw) as DeployManifest;
      manifest._source_dir = path.relative(process.cwd(), path.dirname(c));
      out.push(manifest);
    } catch (e) {
      process.stderr.write(`[warn] could not parse ${c}: ${(e as Error).message}\n`);
    }
  }
  return out;
}

function deriveOutcome(m: DeployManifest): string {
  if (m.productized) {
    const { shipped = 0, partial = 0, blocked = 0 } = m.productized;
    if (blocked > 0 && shipped === 0 && partial === 0) return 'blocked';
    if (blocked > 0) return 'partial';
    if (partial > 0 && shipped === 0) return 'partial';
    if (shipped > 0) return 'shipped';
    return 'no-gaps';
  }
  return m.kernel_gaps_count === 0 ? 'no-gaps' : 'skeleton-mode';
}

function formatTable(manifests: DeployManifest[]): string {
  if (manifests.length === 0) {
    return 'No deploys found. Run `pnpm agent:deploy --model <id> --hardware <id>` first.';
  }

  const headers = ['date', 'model', 'hardware', 'outcome', 'gaps', 'mode', 'dir'];
  const rows = manifests.map((m) => {
    const date = (m.generated_at ?? '').slice(0, 10);
    const model = m.request?.model ?? '?';
    const hw = m.request?.hardware ?? '?';
    const outcome = deriveOutcome(m);
    const gaps = m.productized
      ? `${m.productized.shipped ?? 0}+${m.productized.partial ?? 0}+${m.productized.blocked ?? 0}/${m.kernel_gaps_count ?? 0}`
      : `0/${m.kernel_gaps_count ?? 0}`;
    const mode = m.productized?.mode ?? (m.request?.use_llm_orchestrator ? 'productized' : 'skeleton');
    const dir = m._source_dir ?? '.';
    return [date, model, hw, outcome, gaps, mode, dir];
  });

  // Compute column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ');

  const out: string[] = [];
  out.push(fmt(headers));
  out.push(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) out.push(fmt(r));

  // Per-deploy gap detail
  out.push('');
  for (const m of manifests) {
    if (!m.productized?.per_gap?.length) continue;
    out.push(`${m.request?.model} on ${m.request?.hardware} — ${m.productized.per_gap.length} gap${m.productized.per_gap.length === 1 ? '' : 's'}:`);
    for (const g of m.productized.per_gap) {
      const icon = g.outcome === 'shipped' ? '✓' : g.outcome === 'partial' ? '~' : '✗';
      out.push(`  ${icon} ${g.outcome.padEnd(9)} ${g.filename.padEnd(40)} ${g.attempts}× ${g.source}`);
    }
    out.push('');
  }

  return out.join('\n');
}

async function main() {
  const flags = parseFlags(process.argv);
  const root = flags.root ?? path.resolve(process.cwd(), 'agent-deploy-output');
  let manifests = await findManifests(root);
  manifests.sort((a, b) => (b.generated_at ?? '').localeCompare(a.generated_at ?? ''));
  if (flags.limit) manifests = manifests.slice(0, flags.limit);

  if (flags.json) {
    process.stdout.write(JSON.stringify(manifests, null, 2) + '\n');
    return;
  }

  process.stderr.write(`\nEvoKernel — ${manifests.length} deploy${manifests.length === 1 ? '' : 's'} found in ${root}\n\n`);
  process.stdout.write(formatTable(manifests) + '\n');
}

main().catch((err) => {
  process.stderr.write(`agent:status failed: ${err.message}\n`);
  process.exit(1);
});
