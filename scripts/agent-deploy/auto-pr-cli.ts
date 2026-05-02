#!/usr/bin/env tsx
/**
 * v3.18 — `pnpm agent:auto-pr` CLI entry.
 *
 * Reads every YAML in `data/agent-learnings/`, runs `aggregateLearnings`
 * (the v3.9 clustering algorithm), and emits a PR-draft Markdown report.
 * This closes the F → corpus side of the productized loop:
 *
 *   deploy → agent-learning.yaml (per-deploy) → data/agent-learnings/ (corpus)
 *      → agent:auto-pr (this) → PR draft → human review → merge
 *
 * Pre-v3.18 the auto-pr functions existed in scripts/agent-deploy/auto-pr.ts
 * but had no CLI entry — only unit-tested from feedback tests. v3.18 makes
 * the F-loop end-to-end runnable from one command.
 *
 * Usage:
 *   pnpm agent:auto-pr                          # default: open + signal>=2 → stdout
 *   pnpm agent:auto-pr -- --output ./pr.md      # write to file
 *   pnpm agent:auto-pr -- --min-signal 1        # include single-occurrence obs
 *   pnpm agent:auto-pr -- --include-merged      # include merged learnings (rare)
 *   pnpm agent:auto-pr -- --json                # machine-readable output
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { aggregateLearnings, type AgentLearning } from './auto-pr';

const LEARNINGS_DIR = path.resolve(process.cwd(), 'data/agent-learnings');

function parseFlags(argv: string[]) {
  const out: {
    output?: string;
    min_signal?: number;
    include_merged?: boolean;
    json?: boolean;
    learnings_dir?: string;
  } = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output' && argv[i + 1]) out.output = argv[++i];
    else if (a === '--min-signal' && argv[i + 1]) out.min_signal = parseInt(argv[++i], 10);
    else if (a === '--include-merged') out.include_merged = true;
    else if (a === '--json') out.json = true;
    else if (a === '--learnings-dir' && argv[i + 1]) out.learnings_dir = argv[++i];
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp() {
  console.log(`agent:auto-pr — aggregate agent-learnings into PR drafts

USAGE
  pnpm agent:auto-pr [-- --output <path>] [--min-signal N] [--include-merged] [--json]

FLAGS
  --output <path>       Write report to file (default: stdout).
  --min-signal N        Min independent runs per cluster (default: 2).
                        Set to 1 to include single-occurrence observations.
  --include-merged      Include already-merged learnings (default: open only).
  --json                Output AutoPRResult as JSON (default: Markdown).
  --learnings-dir <dir> Override data/agent-learnings/ (for testing).

EXAMPLES
  pnpm agent:auto-pr -- --output ./pr-drafts.md
  pnpm agent:auto-pr -- --min-signal 1 --json | jq .
`);
}

/**
 * Minimal YAML parser for the agent-learning format. Real corpus uses zod
 * schema validation in @evokernel/schemas, but this file ships in scripts/
 * which doesn't depend on the schema package. We support enough YAML to
 * round-trip the official agent-learning shape: scalars, arrays, nested
 * objects, multi-line strings via "|".
 *
 * For full schema validation use `pnpm validate` after triage.
 */
async function parseLearningYaml(yaml: string, file: string): Promise<AgentLearning> {
  // Defer to a tiny implementation rather than pull in js-yaml: keeps
  // scripts/ dependency-free per project convention.
  const lines = yaml.split('\n');
  const root: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.startsWith('#')) { i++; continue; }
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) { i++; continue; }
    const [, key, rest] = m;
    if (rest === '|' || rest === '|-' || rest === '|+') {
      // Multi-line block scalar
      const body: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
        body.push(lines[i].slice(2));
        i++;
      }
      root[key] = body.join('\n').trimEnd();
    } else if (rest === '') {
      // Nested object or array — collect indented block as raw text and
      // parse recursively (poor-man's, sufficient for our shape).
      const block: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
        block.push(lines[i].slice(2));
        i++;
      }
      const blockText = block.join('\n');
      if (block.some((l) => l.trimStart().startsWith('- '))) {
        root[key] = parseListBlock(blockText);
      } else {
        root[key] = await parseLearningYaml(blockText, file);
      }
    } else {
      root[key] = parseScalar(rest);
      i++;
    }
  }
  return root as unknown as AgentLearning;
}

function parseScalar(raw: string): unknown {
  const v = raw.trim().replace(/^['"](.*)['"]$/, '$1');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

function parseListBlock(text: string): unknown[] {
  const items: unknown[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trimStart().startsWith('- ')) { i++; continue; }
    const indent = line.indexOf('-');
    const firstKv = line.slice(indent + 2);
    const item: Record<string, unknown> = {};
    // Inline first key
    const m1 = firstKv.match(/^([a-z_]+):\s*(.*)$/i);
    if (m1) item[m1[1]] = parseScalar(m1[2]);
    i++;
    while (i < lines.length && lines[i].startsWith(' '.repeat(indent + 2)) && !lines[i].trimStart().startsWith('- ')) {
      const sub = lines[i].slice(indent + 2);
      const m2 = sub.match(/^([a-z_]+):\s*(.*)$/i);
      if (m2) item[m2[1]] = parseScalar(m2[2]);
      i++;
    }
    items.push(item);
  }
  return items;
}

async function loadAllLearnings(dir: string): Promise<AgentLearning[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: AgentLearning[] = [];
  for (const f of files) {
    if (!f.endsWith('.yaml') && !f.endsWith('.yml')) continue;
    const text = await readFile(path.join(dir, f), 'utf-8');
    try {
      const learning = await parseLearningYaml(text, f);
      // Defensive: agent-learnings without an id are not valid corpus input.
      if (!learning.id) {
        process.stderr.write(`[warn] skipping ${f}: missing id\n`);
        continue;
      }
      out.push(learning);
    } catch (e) {
      process.stderr.write(`[warn] failed to parse ${f}: ${(e as Error).message}\n`);
    }
  }
  return out;
}

async function main() {
  const flags = parseFlags(process.argv);
  const dir = flags.learnings_dir ?? LEARNINGS_DIR;
  const learnings = await loadAllLearnings(dir);

  if (learnings.length === 0) {
    process.stderr.write(
      `[agent:auto-pr] No agent-learnings found in ${dir}.\n` +
        `  Hint: run \`pnpm agent:deploy --use-llm-orchestrator\` first to produce learnings,\n` +
        `        then move them into data/agent-learnings/ for triage.\n`
    );
    process.exit(0);
  }

  const result = aggregateLearnings(learnings, {
    min_signal: flags.min_signal ?? 2,
    only_open: !flags.include_merged,
  });

  const out = flags.json ? JSON.stringify(result, null, 2) : result.report_md;
  if (flags.output) {
    await writeFile(flags.output, out);
    process.stderr.write(
      `✓ Wrote ${result.clusters.length} cluster${result.clusters.length === 1 ? '' : 's'} to ${flags.output}\n` +
        `  (from ${result.input_summary.total_learnings} learnings: ${result.input_summary.open} open, ${result.input_summary.merged} merged, ${result.input_summary.wont_fix} wont-fix)\n`
    );
  } else {
    process.stdout.write(out);
    if (!flags.json) process.stdout.write('\n');
  }
}

main().catch((err) => {
  process.stderr.write(`agent:auto-pr failed: ${err.message}\n`);
  process.exit(1);
});
