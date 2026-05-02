/**
 * v3.17 — Layer R helper: fetch the pre-built agent-context bundle for a
 * (model, hardware) pair.
 *
 * Resolution order (most → least preferred):
 *   1. Local site build at apps/web/dist/api/agent-context/<model>-on-<hw>.json
 *      (zero-network — ideal for dev + CI + offline deployment.)
 *   2. Local Astro dev server at http://127.0.0.1:4321/api/agent-context/...
 *      (only if EVOKERNEL_DEV_SERVER=true; useful when iterating on the data
 *      and you want to skip rebuilding dist/.)
 *   3. Remote published site at https://yingwen.io/evokernel-spec/api/...
 *      (network-required; fallback for users who haven't built locally.)
 *
 * Returns the typed AgentContextBundle that llm-orchestrator expects.
 *
 * Why this file matters: pre-v3.17 the productized agent SKILL.md referenced
 * `./scripts/agent-deploy/fetch-bundle` but the file did not exist. Users
 * following the docs hit ImportError at the very first line. This file closes
 * that gap and is the canonical entry point for Layer R consumption.
 */

import { readFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import type { AgentContextBundle } from './llm-orchestrator';

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export interface FetchBundleInput {
  /** Model id, e.g. 'llama-3.3-70b' (kebab-case slug, NOT HF id). */
  model: string;
  /** Hardware id, e.g. 'h100-sxm5'. */
  hardware: string;
  /**
   * Optional override of the dist path. Default:
   *   apps/web/dist/api/agent-context/
   */
  dist_path?: string;
  /**
   * Override the remote base URL. Default:
   *   https://yingwen.io/evokernel-spec/api/agent-context
   */
  remote_base?: string;
}

export interface FetchBundleResult {
  /** Where the bundle came from — useful for logging + debugging. */
  source: 'local-dist' | 'dev-server' | 'remote';
  /** Resolved URL or filesystem path. */
  resolved_from: string;
  /** The typed bundle ready to feed into llm-orchestrator. */
  bundle: AgentContextBundle;
  /** Raw envelope (license, generated_at, etc.) — useful for provenance. */
  envelope: BundleEnvelope;
}

interface BundleEnvelope {
  license: string;
  generated: string;
  schema_version: string;
  notes?: string;
  request: { model: string; hardware: string };
  coverage_hints?: Record<string, unknown>;
  bundle: AgentContextBundle;
}

const DEFAULT_DIST_REL = 'apps/web/dist/api/agent-context';
const DEFAULT_REMOTE_BASE = 'https://yingwen.io/evokernel-spec/api/agent-context';
const DEV_SERVER_URL = 'http://127.0.0.1:4321/api/agent-context';

// ─────────────────────────────────────────────────────────────────────────
// fetchBundle
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fetch the agent-context bundle. Tries local dist → dev server → remote.
 * Throws with a structured BundleNotFoundError when the (model, hw) pair
 * is not in the corpus or the resolved-from sources are all unreachable.
 */
export async function fetchBundle(input: FetchBundleInput): Promise<FetchBundleResult> {
  const slug = `${input.model}-on-${input.hardware}.json`;

  // 1. Local dist (preferred — zero network).
  const dist_root = input.dist_path
    ?? path.resolve(process.cwd(), DEFAULT_DIST_REL);
  const local_path = path.join(dist_root, slug);
  const local_hit = await tryLocalFile(local_path);
  if (local_hit) {
    return {
      source: 'local-dist',
      resolved_from: local_path,
      envelope: local_hit,
      bundle: local_hit.bundle,
    };
  }

  // 2. Dev server (only if explicitly requested).
  if (process.env.EVOKERNEL_DEV_SERVER === 'true') {
    const dev_url = `${DEV_SERVER_URL}/${slug}`;
    const dev_hit = await tryRemote(dev_url);
    if (dev_hit) {
      return {
        source: 'dev-server',
        resolved_from: dev_url,
        envelope: dev_hit,
        bundle: dev_hit.bundle,
      };
    }
  }

  // 3. Remote published site.
  if (process.env.EVOKERNEL_OFFLINE_ONLY !== 'true') {
    const remote_base = input.remote_base ?? DEFAULT_REMOTE_BASE;
    const remote_url = `${remote_base}/${slug}`;
    const remote_hit = await tryRemote(remote_url);
    if (remote_hit) {
      return {
        source: 'remote',
        resolved_from: remote_url,
        envelope: remote_hit,
        bundle: remote_hit.bundle,
      };
    }
  }

  throw new BundleNotFoundError(input, dist_root);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function tryLocalFile(file_path: string): Promise<BundleEnvelope | null> {
  // File-existence misses fall through to the next resolver tier silently.
  try {
    await access(file_path, fsConstants.R_OK);
  } catch {
    return null;
  }
  // The file exists — any failure parsing it is a hard error. We do NOT
  // want a corrupt local bundle to silently degrade into a remote fetch:
  // that hides real bugs and produces unreproducible deploys.
  const raw = await readFile(file_path, 'utf-8');
  return parseEnvelope(raw, file_path);
}

async function tryRemote(url: string): Promise<BundleEnvelope | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const raw = await res.text();
    return parseEnvelope(raw, url);
  } catch {
    // Network errors (offline, DNS fail, etc.) — treat as miss; caller falls
    // through to the next resolver tier.
    return null;
  }
}

function parseEnvelope(raw: string, source_label: string): BundleEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `[fetch-bundle] Failed to parse JSON from ${source_label}: ${(e as Error).message}`
    );
  }

  // Defensive structural check — every published bundle has these keys.
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('bundle' in parsed) ||
    !('request' in parsed)
  ) {
    throw new Error(
      `[fetch-bundle] Bundle at ${source_label} missing required keys (bundle, request)`
    );
  }
  return parsed as BundleEnvelope;
}

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

export class BundleNotFoundError extends Error {
  readonly model: string;
  readonly hardware: string;
  readonly searched_local: string;
  constructor(input: FetchBundleInput, searched_local: string) {
    super(
      `[fetch-bundle] No agent-context bundle for (model="${input.model}", hardware="${input.hardware}").\n` +
        `  Searched: ${searched_local}\n` +
        `  Hint: run \`pnpm --filter @evokernel/web build\` to build local bundles, or\n` +
        `        ensure (model, hardware) ids exist in data/models/ and data/hardware/.`
    );
    this.name = 'BundleNotFoundError';
    this.model = input.model;
    this.hardware = input.hardware;
    this.searched_local = searched_local;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// listBundles — discovery helper for CLI/agent UX
// ─────────────────────────────────────────────────────────────────────────

/**
 * List all (model, hardware) pairs that have pre-built bundles in the local
 * dist/. Useful for agent UX ("which deploys are available?") and tests.
 */
export async function listBundles(
  dist_path?: string
): Promise<Array<{ model: string; hardware: string; slug: string }>> {
  const dist_root =
    dist_path ?? path.resolve(process.cwd(), DEFAULT_DIST_REL);

  const { readdir } = await import('node:fs/promises');
  let files: string[];
  try {
    files = await readdir(dist_root);
  } catch {
    return [];
  }

  const pairs: Array<{ model: string; hardware: string; slug: string }> = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const stem = f.slice(0, -'.json'.length);
    const sep = stem.lastIndexOf('-on-');
    if (sep === -1) continue;
    pairs.push({
      slug: stem,
      model: stem.slice(0, sep),
      hardware: stem.slice(sep + '-on-'.length),
    });
  }
  pairs.sort((a, b) => a.slug.localeCompare(b.slug));
  return pairs;
}
