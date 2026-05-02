#!/usr/bin/env tsx
/**
 * v3.22 -- pnpm agent:watch continuous-mode auto-redeploy.
 *
 * The user's directive includes "持续根据部署情况持续自动优化闭环" -- continuous
 * automatic optimization loop. Pre-v3.22 each deploy was one-shot: type a
 * command, get artifacts, done. agent:watch closes the missing piece by
 * making the harness reactive to corpus changes:
 *
 *   1. Watch data/ for YAML mutations (chokidar-free; native fs.watch).
 *   2. When a model or hardware YAML changes, look up which (model, hw)
 *      pairs depend on it.
 *   3. For each affected pair (capped to N concurrent), re-run agent:deploy
 *      with the same flags as the original watch invocation.
 *   4. Emit a per-pair status line so the user sees what re-deployed.
 *
 * Why this matters as a product: the loop's "feedback to corpus" promise
 * is incomplete without a mechanism that picks up corpus updates. Today a
 * contributor lands a new DSL example or fixes formal_semantics; users
 * have to know to re-run their deploy. agent:watch does it automatically.
 *
 * Reactivity scope (intentionally narrow):
 *   - Watch data/models/, data/hardware/, data/dsl-examples/, data/operators/
 *   - Debounce 2s (rapid edits batch together)
 *   - Filter to mutations the deploy actually depends on (parse YAML id)
 *
 * Usage:
 *   pnpm agent:watch -- --model llama-3.3-70b --hardware h100-sxm5
 *   pnpm agent:watch -- --pairs llama-3.3-70b:h100-sxm5,boltz-1:mi300x
 *   pnpm agent:watch -- --pairs ./pairs.txt           # one pair per line
 *   pnpm agent:watch -- --use-llm-orchestrator --profile  # forwarded
 */
import { watch as fsWatch } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const DATA_ROOTS = [
  'data/models',
  'data/hardware',
  'data/dsl-examples',
  'data/operators',
  'data/fused-kernels',
];
const DEBOUNCE_MS = 2000;
const MAX_CONCURRENT_DEPLOYS = 2;

interface DeployPair {
  model: string;
  hardware: string;
}

interface WatchFlags {
  pairs: DeployPair[];
  forwarded_args: string[];
  output_root: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

async function parseFlags(argv: string[]): Promise<WatchFlags> {
  const out: WatchFlags = { pairs: [], forwarded_args: [], output_root: './agent-watch-output' };
  let single_model: string | undefined;
  let single_hardware: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' && argv[i + 1]) single_model = argv[++i];
    else if (a === '--hardware' && argv[i + 1]) single_hardware = argv[++i];
    else if (a === '--pairs' && argv[i + 1]) {
      const raw = argv[++i];
      out.pairs = await resolvePairs(raw);
    } else if (a === '--output-root' && argv[i + 1]) out.output_root = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (a.startsWith('--')) {
      // Forward to underlying agent:deploy
      out.forwarded_args.push(a);
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        out.forwarded_args.push(argv[++i]);
      }
    }
  }

  if (single_model && single_hardware) {
    out.pairs.push({ model: single_model, hardware: single_hardware });
  }

  if (out.pairs.length === 0) {
    process.stderr.write('agent:watch: at least one --model+--hardware pair OR --pairs required.\n');
    printHelp();
    process.exit(2);
  }

  return out;
}

async function resolvePairs(raw: string): Promise<DeployPair[]> {
  // File or comma-separated
  if (existsSync(raw)) {
    const text = await readFile(raw, 'utf-8');
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .map(parsePairToken);
  }
  return raw.split(',').map((t) => parsePairToken(t.trim()));
}

function parsePairToken(token: string): DeployPair {
  const idx = token.indexOf(':');
  if (idx === -1) {
    throw new Error(`Invalid pair token "${token}" -- expected "model:hardware"`);
  }
  return { model: token.slice(0, idx), hardware: token.slice(idx + 1) };
}

function printHelp() {
  const lines = [
    'agent:watch -- continuous-mode auto-redeploy',
    '',
    'USAGE',
    '  pnpm agent:watch -- --model <id> --hardware <id> [forwarded flags]',
    '  pnpm agent:watch -- --pairs llama-3.3-70b:h100-sxm5,boltz-1:mi300x',
    '  pnpm agent:watch -- --pairs ./pairs.txt',
    '',
    'FLAGS',
    '  --model <id>             Single-pair model id',
    '  --hardware <id>          Single-pair hardware id',
    '  --pairs <list|file>      Multi-pair: comma-sep tokens or path to file',
    '  --output-root <dir>      Where to write per-pair sub-dirs (default: ./agent-watch-output)',
    '',
    'FORWARDED FLAGS (passed through to agent:deploy)',
    '  --use-llm-orchestrator   v3.17 productized loop',
    '  --profile                v3.21 V3 execution-mode perf gate',
    '  --workload <kind>        chat|rag|code|math|long-context',
    '',
    'WATCH SCOPE',
    '  data/models/, data/hardware/, data/dsl-examples/,',
    '  data/operators/, data/fused-kernels/',
    '',
    'DEBOUNCE',
    '  2 seconds (rapid edits batch together)',
    '',
    'STOP',
    '  Ctrl-C -- per-pair sub-dirs persist for inspection.',
  ];
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Pair-affected detection
// ---------------------------------------------------------------------------

/**
 * Decide whether a YAML file change affects a (model, hardware) pair.
 * Conservative heuristic: if the changed file is the model's YAML,
 * the hardware's YAML, or any DSL/op/fused-kernel YAML (which could be
 * cited by the bundle), the pair is considered affected.
 *
 * Future tightening (v3.23+): parse the bundle's references_used field
 * after a deploy and only re-trigger when the changed file is in that set.
 */
export function isPairAffected(file: string, pair: DeployPair): boolean {
  const norm = file.replace(/\\/g, '/');
  // Model YAML: data/models/.../<model>.yaml
  if (norm.includes(`/data/models/`) && norm.endsWith(`/${pair.model}.yaml`)) return true;
  // Hardware YAML: data/hardware/.../<hardware>.yaml
  if (norm.includes(`/data/hardware/`) && norm.endsWith(`/${pair.hardware}.yaml`)) return true;
  // DSL / operator / fused-kernel: any change in these dirs affects all pairs
  // (because bundles can reference any of them via target_arch matching).
  if (norm.includes(`/data/dsl-examples/`)) return true;
  if (norm.includes(`/data/operators/`)) return true;
  if (norm.includes(`/data/fused-kernels/`)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Deploy spawn
// ---------------------------------------------------------------------------

interface DeployRun {
  pair: DeployPair;
  start_time: number;
  promise: Promise<{ exit_code: number; duration_ms: number }>;
}

function spawnDeploy(
  pair: DeployPair,
  forwarded: string[],
  output_root: string
): DeployRun {
  const out_dir = path.join(output_root, `${pair.model}-on-${pair.hardware}`);
  const start = Date.now();
  const args = [
    'tsx',
    'scripts/agent-deploy/index.ts',
    '--model',
    pair.model,
    '--hardware',
    pair.hardware,
    '--output',
    out_dir,
    ...forwarded,
  ];

  process.stderr.write(`[watch] deploy ${pair.model} -> ${pair.hardware} ...\n`);

  const promise = new Promise<{ exit_code: number; duration_ms: number }>((resolve) => {
    const child = spawn('pnpm', ['exec', ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: process.env,
    });
    child.on('exit', (code) => {
      resolve({ exit_code: code ?? 0, duration_ms: Date.now() - start });
    });
    child.on('error', () => {
      resolve({ exit_code: 1, duration_ms: Date.now() - start });
    });
  });

  return { pair, start_time: start, promise };
}

// ---------------------------------------------------------------------------
// Watcher
// ---------------------------------------------------------------------------

class WatchSession {
  private flags: WatchFlags;
  private debounce_timer: NodeJS.Timeout | null = null;
  private pending_changes = new Set<string>();
  private active_runs = 0;
  private queue: DeployPair[] = [];
  private session_started = Date.now();
  private deploys_total = 0;

  constructor(flags: WatchFlags) {
    this.flags = flags;
  }

  start() {
    process.stderr.write(`\nagent:watch -- watching ${DATA_ROOTS.length} dirs for ${this.flags.pairs.length} pair${this.flags.pairs.length === 1 ? '' : 's'}\n`);
    process.stderr.write(`  pairs: ${this.flags.pairs.map((p) => `${p.model}:${p.hardware}`).join(', ')}\n`);
    process.stderr.write(`  forwarded flags: ${this.flags.forwarded_args.join(' ') || '(none)'}\n`);
    process.stderr.write(`  output: ${this.flags.output_root}/<pair>/\n\n`);

    for (const root of DATA_ROOTS) {
      const abs = path.join(REPO_ROOT, root);
      if (!existsSync(abs)) continue;
      try {
        fsWatch(abs, { recursive: true }, (event, filename) => {
          if (!filename) return;
          if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) return;
          const full = path.join(abs, filename);
          this.pending_changes.add(full);
          this.scheduleFlush();
        });
        process.stderr.write(`[watch] watching ${root}/\n`);
      } catch (e) {
        process.stderr.write(`[watch] could not watch ${root}: ${(e as Error).message}\n`);
      }
    }

    // Print uptime / deploys-counter every 60s for liveness
    setInterval(() => {
      const uptime_min = Math.floor((Date.now() - this.session_started) / 60000);
      process.stderr.write(`[watch] uptime ${uptime_min}m  deploys triggered: ${this.deploys_total}  active: ${this.active_runs}  queued: ${this.queue.length}\n`);
    }, 60000).unref();

    process.on('SIGINT', () => {
      process.stderr.write(`\n[watch] stopped after ${this.deploys_total} deploys.\n`);
      process.exit(0);
    });
  }

  private scheduleFlush() {
    if (this.debounce_timer) clearTimeout(this.debounce_timer);
    this.debounce_timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  private flush() {
    const changed = [...this.pending_changes];
    this.pending_changes.clear();
    if (changed.length === 0) return;

    const affected: DeployPair[] = [];
    for (const pair of this.flags.pairs) {
      if (changed.some((f) => isPairAffected(f, pair))) {
        affected.push(pair);
      }
    }
    if (affected.length === 0) {
      process.stderr.write(`[watch] ${changed.length} change${changed.length === 1 ? '' : 's'} -- none affect watched pairs\n`);
      return;
    }
    process.stderr.write(`[watch] ${changed.length} change${changed.length === 1 ? '' : 's'} -- ${affected.length} pair${affected.length === 1 ? '' : 's'} affected\n`);

    for (const pair of affected) {
      // Skip if already in queue or running with same pair
      const same = (p: DeployPair) => p.model === pair.model && p.hardware === pair.hardware;
      if (this.queue.some(same)) continue;
      this.queue.push(pair);
    }
    this.drain();
  }

  private drain() {
    while (this.active_runs < MAX_CONCURRENT_DEPLOYS && this.queue.length > 0) {
      const pair = this.queue.shift()!;
      this.active_runs++;
      this.deploys_total++;
      const run = spawnDeploy(pair, this.flags.forwarded_args, this.flags.output_root);
      run.promise.then(({ exit_code, duration_ms }) => {
        this.active_runs--;
        const icon = exit_code === 0 ? '✓' : '✗';
        process.stderr.write(`[watch] ${icon} ${pair.model} -> ${pair.hardware} (${(duration_ms / 1000).toFixed(1)}s, exit ${exit_code})\n`);
        this.drain();
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function main() {
  const flags = await parseFlags(process.argv);
  const session = new WatchSession(flags);
  session.start();
  // Keep alive
  setInterval(() => { /* tick */ }, 60_000);
}

// Only run main() when this file is the entry point. Tests import
// `isPairAffected` directly from this module, so we MUST NOT auto-spawn
// main() on import (it would call parseFlags(process.argv) which exits on
// missing --pairs and crashes the test runner).
const argv1 = process.argv[1] ?? '';
const is_direct_run = argv1.endsWith('watch.ts') || argv1.endsWith('watch.js');
if (is_direct_run) {
  main().catch((err) => {
    process.stderr.write(`agent:watch failed: ${err.message}\n`);
    process.exit(1);
  });
}
