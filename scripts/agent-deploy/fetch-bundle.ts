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

// ─────────────────────────────────────────────────────────────────────────
// resolveBundleId — fuzzy-match user input to canonical bundle slug
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// v3.25 — synthesizeTemporaryBundle for unknown HF models
// ─────────────────────────────────────────────────────────────────────────

/**
 * When `resolveBundleId` returns `none` and the user explicitly opts in
 * (via `--allow-synthesize` flag), `synthesizeTemporaryBundle` builds an
 * AgentContextBundle in memory by:
 *
 *   1. Fetching the model's HuggingFace `config.json`
 *   2. Heuristically classifying the architecture (transformer-decoder,
 *      diffusion, etc.) from `architectures[]` field
 *   3. Picking applicable_ops from corpus by archetype
 *   4. Combining with the corpus hardware entry (must already exist —
 *      hardware bundles are still real corpus entities, only the model
 *      is unknown)
 *
 * Returns a bundle marked `synthesized: true` so the agent surfaces a
 * "this is best-effort, landing the model in corpus would improve
 * recommendations" notice in deploy output.
 *
 * What this is NOT: it doesn't run model inference, doesn't decompose the
 * actual operator graph (existing `scripts/decompose-operators.ts` does
 * that for known model archetypes). It's the v3.25 first step toward
 * "unknown models work without manual corpus PR" — v3.26+ will deepen
 * the operator graph synthesis.
 */
export interface SynthesizeBundleInput {
  /** HF id or kebab slug of an unknown model. */
  model: string;
  /** Hardware id — MUST exist in corpus. */
  hardware: string;
  /** Override dist path for hardware bundle lookup. */
  dist_path?: string;
  /** Override HF API base (default: https://huggingface.co). */
  hf_base?: string;
}

export interface SynthesizedBundle {
  /** The synthesized AgentContextBundle (subset of full bundle that
   * llm-orchestrator consumes). */
  bundle: import('./llm-orchestrator').AgentContextBundle;
  /** Source of the synthesis — useful for provenance + debugging. */
  source: 'hf-config-only';
  /** What HF returned. */
  hf_config?: Record<string, unknown>;
  /** Heuristic classification used. */
  inferred_archetype: string;
  /** Caveats the agent should surface to the user. */
  caveats: string[];
}

const HF_BASE_DEFAULT = 'https://huggingface.co';

export async function synthesizeTemporaryBundle(
  input: SynthesizeBundleInput,
): Promise<SynthesizedBundle> {
  // 1. Try to fetch the hardware bundle for ANY model — we use it to
  // crib the hardware/vendor portion of the bundle. We pick the first
  // available bundle on this hardware as a template.
  const all = await listBundles(input.dist_path);
  const for_hw = all.filter((p) => p.hardware === input.hardware);
  if (for_hw.length === 0) {
    throw new Error(
      `[synthesizeTemporaryBundle] Hardware "${input.hardware}" has no bundles. ` +
        `Add the hardware to data/hardware/ + rebuild before synthesizing.`,
    );
  }
  // Use the first bundle as a hardware-info template
  const template = await fetchBundle({
    model: for_hw[0].model,
    hardware: input.hardware,
    dist_path: input.dist_path,
  });

  // 2. Fetch HF config (best-effort; degrade if unreachable / offline)
  const hf_base = input.hf_base ?? HF_BASE_DEFAULT;
  const slug = normalizeModelId(input.model);
  let hf_config: Record<string, unknown> | undefined;
  if (process.env.EVOKERNEL_OFFLINE_ONLY !== 'true') {
    try {
      const url = `${hf_base}/${input.model}/raw/main/config.json`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        hf_config = (await res.json()) as Record<string, unknown>;
      }
    } catch {
      // Network failure — degrade gracefully; bundle synthesis still works
      // with archetype-only inference.
    }
  }

  // 3. Heuristically classify the archetype.
  const archetype = inferArchetypeFromHfConfig(hf_config, input.model);

  // 4. Build the synthesized bundle. Reuse the template's hardware/vendor
  // /isa_primitives/dsl_examples (those are arch-specific, not model-specific)
  // and substitute in a placeholder model entry derived from HF config.
  const bundle = {
    ...template.bundle,
    model: {
      id: slug,
      name: (hf_config?.['_name_or_path'] as string | undefined) ?? input.model,
    },
    // Filter applicable_ops to ones likely relevant given the archetype
    applicable_ops: filterOpsForArchetype(template.bundle.applicable_ops, archetype),
    applicable_fused_kernels: filterFusedForArchetype(
      template.bundle.applicable_fused_kernels ?? [],
      archetype,
    ),
    // Prior learnings don't apply to an unknown model
    prior_learnings: [],
  };

  return {
    bundle,
    source: 'hf-config-only',
    hf_config,
    inferred_archetype: archetype,
    caveats: [
      `Bundle for "${input.model}" was SYNTHESIZED from HuggingFace config + ${input.hardware} corpus hardware entry.`,
      `Inferred archetype: ${archetype}.`,
      `Operator graph is heuristic (not decomposed from model code) — generated kernels may target the wrong ops.`,
      `Consider landing "${input.model}" in data/models/ for a real bundle (run \`pnpm --filter @evokernel/web build\` after).`,
    ],
  };
}

/**
 * Heuristic: classify a HF config into a corpus archetype string. Reads
 * `architectures` (HF convention), then falls back to model id substring
 * heuristics.
 *
 * Returns one of: transformer-decoder | diffusion | encoder-decoder-asr |
 * vision-transformer | unknown.
 *
 * This is intentionally simple — the v3.25 scope is "unknown models don't
 * crash"; v3.26+ will deepen with operator-graph synthesis from modeling
 * code.
 */
export function inferArchetypeFromHfConfig(
  config: Record<string, unknown> | undefined,
  model_id: string,
): string {
  const archs = ((config?.['architectures'] as unknown[] | undefined) ?? []).map(String);
  const lower_id = model_id.toLowerCase();
  const probe = (s: string) => archs.some((a) => a.toLowerCase().includes(s)) || lower_id.includes(s);

  if (probe('cogvideo') || probe('mochi') || probe('flux') || probe('stable-diffusion') || probe('sdxl')) {
    return 'diffusion';
  }
  if (probe('whisper') || probe('parakeet') || probe('asr')) {
    return 'encoder-decoder-asr';
  }
  if (probe('vit') || probe('clip')) {
    return 'vision-transformer';
  }
  if (probe('llama') || probe('qwen') || probe('mistral') || probe('phi') || probe('gemma') ||
      probe('deepseek') || probe('kimi') || probe('glm') || probe('yi') ||
      probe('forcausallm') || probe('formaskedlm')) {
    return 'transformer-decoder';
  }
  return 'unknown';
}

/**
 * Filter the applicable_ops list to ops likely relevant given the inferred
 * archetype. For unknown archetype, return all ops (don't over-filter).
 */
function filterOpsForArchetype<T extends { id: string; category?: string }>(
  ops: T[],
  archetype: string,
): T[] {
  if (archetype === 'unknown') return ops;
  const KEEP: Record<string, RegExp> = {
    'diffusion': /attention|matmul|norm|activation|sampler|flow-matching|mel-spec/i,
    'transformer-decoder': /attention|matmul|norm|activation|moe|embedding/i,
    'encoder-decoder-asr': /attention|matmul|norm|audio|mel-spec/i,
    'vision-transformer': /attention|matmul|norm|activation/i,
  };
  const re = KEEP[archetype];
  if (!re) return ops;
  return ops.filter((o) => re.test(o.id) || (o.category && re.test(o.category)));
}

function filterFusedForArchetype<T extends { id: string }>(
  fused: T[],
  archetype: string,
): T[] {
  if (archetype === 'unknown') return fused;
  const KEEP: Record<string, RegExp> = {
    'diffusion': /attention|flow-matching|sampler|mel-spec/i,
    'transformer-decoder': /attention|rope|qkv|moe|kv|spec-decode/i,
    'encoder-decoder-asr': /attention|mel-spec|spec-decode/i,
    'vision-transformer': /attention|matmul/i,
  };
  const re = KEEP[archetype];
  if (!re) return fused;
  return fused.filter((f) => re.test(f.id));
}

/**
 * v3.18 — resolve user input (HF id / partial slug / canonical slug) to the
 * canonical (model, hardware) ids that match a bundle in dist/.
 *
 * UX motivation: pre-v3.18 users had to know the exact kebab-case slug
 * (e.g. "llama-3.3-70b") — typing "Llama-3.3-70B-Instruct" or
 * "meta-llama/Llama-3.3-70B-Instruct" would fail. Now we accept all of:
 *
 *   meta-llama/Llama-3.3-70B-Instruct  → llama-3.3-70b
 *   Llama-3.3-70B                      → llama-3.3-70b
 *   llama-3.3                           → llama-3.3-70b (single-match) or null (ambiguous)
 *   nvidia/nemotron-340b               → nemotron-340b (strip vendor prefix)
 *
 * Resolution is greedy:
 *   1. Exact slug match → return as-is
 *   2. Normalize input (strip path, lowercase, strip "-instruct"/"-chat" suffix)
 *      → exact match against listBundles()
 *   3. Substring match — if exactly ONE bundle has the normalized input as a
 *      substring of its model id, return that bundle.
 *   4. Otherwise return { resolved: null, candidates: [...] } so the caller
 *      can surface the ambiguity to the user.
 */
export interface ResolveBundleInput {
  /** User-supplied model identifier (HF id, kebab slug, or partial). */
  model: string;
  /** Hardware id (we accept exact match only — hardware ids are well-known). */
  hardware: string;
  /** Override dist path. */
  dist_path?: string;
}

export interface ResolveBundleResult {
  /** Canonical (model, hardware) — null when no/ambiguous match. */
  resolved: { model: string; hardware: string; slug: string } | null;
  /** Candidates considered (empty when exact match found). */
  candidates: Array<{ model: string; hardware: string; slug: string }>;
  /** Match strategy that picked the resolved candidate (or 'none'). */
  strategy: 'exact' | 'normalized' | 'substring' | 'none';
  /** Normalized form of the input model id — useful for diagnostics. */
  normalized_model: string;
}

export function normalizeModelId(input: string): string {
  return input
    .split('/').pop()!                 // strip "meta-llama/" prefix
    .toLowerCase()
    .replace(/-instruct$/i, '')
    .replace(/-chat$/i, '')
    .replace(/-base$/i, '')
    .replace(/_/g, '-');
}

export async function resolveBundleId(
  input: ResolveBundleInput
): Promise<ResolveBundleResult> {
  const all = await listBundles(input.dist_path);
  const for_hw = all.filter((p) => p.hardware === input.hardware);
  const normalized = normalizeModelId(input.model);

  // 1. Exact slug match (user already used the canonical id).
  const exact = for_hw.find((p) => p.model === input.model);
  if (exact) {
    return { resolved: exact, candidates: [], strategy: 'exact', normalized_model: normalized };
  }

  // 2. Normalized exact match (e.g. "Llama-3.3-70B-Instruct" → "llama-3.3-70b").
  const normalized_exact = for_hw.find((p) => p.model === normalized);
  if (normalized_exact) {
    return {
      resolved: normalized_exact,
      candidates: [],
      strategy: 'normalized',
      normalized_model: normalized,
    };
  }

  // 3. Substring match — only resolves when EXACTLY ONE candidate matches.
  const substring_matches = for_hw.filter((p) => p.model.includes(normalized));
  if (substring_matches.length === 1) {
    return {
      resolved: substring_matches[0],
      candidates: [],
      strategy: 'substring',
      normalized_model: normalized,
    };
  }

  // 4. Ambiguous or zero matches — return candidates for surfacing.
  return {
    resolved: null,
    candidates: substring_matches.length > 0 ? substring_matches : for_hw.slice(0, 8),
    strategy: 'none',
    normalized_model: normalized,
  };
}
