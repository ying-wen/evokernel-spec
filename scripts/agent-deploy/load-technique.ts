/**
 * v3.26 -- Load + validate a technique YAML from data/techniques/<id>.yaml.
 *
 * Pre-v3.26, the v3.25 technique entity existed in corpus but was not
 * loadable from the agent CLI. This file is the bridge: takes a technique
 * id (slug) and returns the parsed + schema-validated Technique object,
 * or throws a clear error with available technique ids when the slug
 * doesn't match.
 *
 * The CLI uses this when `--technique <id>` is passed. The loaded
 * technique then influences:
 *   - Which arch family the agent targets (port_targets[].arch_family
 *     filtered to the user's --hardware)
 *   - Which ops the agent considers in scope (technique.applicable_to.ops)
 *   - Which numerical_rules Layer V inherits when verifying generated
 *     kernels
 *   - Which port status the agent reports (reference-impl, planned,
 *     experimental, blocked) so the user knows whether they're doing a
 *     greenfield port or running an existing one
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { TechniqueSchema, type Technique } from '@evokernel/schemas';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface LoadTechniqueOptions {
  /** Repo root override. Default: 4 levels up from this file. */
  repo_root?: string;
}

export class TechniqueNotFoundError extends Error {
  readonly technique_id: string;
  readonly available: string[];
  constructor(technique_id: string, available: string[]) {
    super(
      `[load-technique] No technique with id "${technique_id}" in data/techniques/.\n` +
        `  Available (${available.length}): ${available.slice(0, 10).join(', ')}${available.length > 10 ? ', ...' : ''}\n` +
        `  Hint: add a YAML at data/techniques/${technique_id}.yaml or pick from the list above.`,
    );
    this.name = 'TechniqueNotFoundError';
    this.technique_id = technique_id;
    this.available = available;
  }
}

/**
 * Locate the repo root containing data/techniques/. Walks up from the
 * importing module's directory looking for the data/ tree.
 */
function locateRepoRoot(override?: string): string {
  if (override) return override;
  // This file is scripts/agent-deploy/load-technique.ts → repo is 2 levels up
  return path.resolve(HERE, '..', '..');
}

/**
 * Synchronous-friendly enum of available techniques (for error messages).
 */
export async function listAvailableTechniques(opts: LoadTechniqueOptions = {}): Promise<string[]> {
  const repo = locateRepoRoot(opts.repo_root);
  const dir = path.join(repo, 'data/techniques');
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => f.replace(/\.ya?ml$/, ''))
    .sort();
}

/**
 * Load + validate a technique by id. Throws TechniqueNotFoundError when
 * the slug doesn't match an available file.
 */
export async function loadTechnique(
  technique_id: string,
  opts: LoadTechniqueOptions = {},
): Promise<Technique> {
  const repo = locateRepoRoot(opts.repo_root);
  const file = path.join(repo, 'data/techniques', `${technique_id}.yaml`);
  if (!existsSync(file)) {
    const available = await listAvailableTechniques(opts);
    throw new TechniqueNotFoundError(technique_id, available);
  }
  const raw = await readFile(file, 'utf-8');
  const parsed = parseYaml(raw);
  // Schema validation surfaces malformed YAMLs as a real error rather than
  // letting the agent operate on a half-shaped object later.
  const result = TechniqueSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `[load-technique] data/techniques/${technique_id}.yaml does not match TechniqueSchema:\n` +
        result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  }
  return result.data;
}

/**
 * Given a loaded technique + the user's target hardware, return the
 * port_target entry (if any) and a short status descriptor. Used by the
 * planner to decide whether we're generating greenfield code (planned),
 * iterating on an experimental port (experimental), or just running an
 * existing reference impl (reference-impl / production-ready).
 */
export interface TechniquePortContext {
  technique: Technique;
  target_arch_family: string;
  matched_port_target: Technique['port_targets'][number] | undefined;
  /**
   * v3.28 (F4) — every arch label we tried before either matching or
   * giving up. Surfaced in dry-run output so users with hardware whose
   * microarchitecture isn't yet annotated can see exactly which alias
   * to add. e.g. for ascend-910b before the v3.28 schema update this
   * was `['ascend']` and the technique declared `ascend-da-vinci-3` —
   * the gap was invisible to the user.
   */
  arch_family_candidates: string[];
  /** Plain-English summary the CLI prints to the user. */
  summary: string;
}

/**
 * v3.28 (F4) — accept an array of candidate arch_family labels and
 * return the first technique port_target that matches any of them.
 *
 * The candidate list is built upstream from the user's hardware YAML:
 *   1. `microarchitecture` field (most specific; preferred — e.g.
 *      `ascend-da-vinci-3`, `hopper`, `cdna3`)
 *   2. full `generation` field (e.g. `ascend-910-gen2`, `hopper-gen1`)
 *   3. `generation.split('-')[0]` (heuristic prefix — what pre-v3.28
 *      used as its only label; kept for backwards compat)
 *   4. `vendor` (last-resort label — e.g. `huawei`, `nvidia`)
 *
 * We try each in order. This covers four scenarios cleanly:
 *   • Hardware has microarchitecture set + technique uses microarch labels (the
 *     SageAttention/Ascend case after v3.28 schema update).
 *   • Hardware lacks microarchitecture but technique uses the truncated
 *     generation prefix (the pre-v3.28 NVIDIA/Hopper accidental match).
 *   • Hardware lacks microarchitecture but technique uses the bare vendor name
 *     (some early techniques in the corpus do this).
 *   • Brand new vendor where the technique declares e.g. `tenstorrent` and the
 *     hardware YAML's `vendor: tenstorrent` matches.
 */
export function describeTechniquePortStatus(
  technique: Technique,
  target_arch_family: string | string[],
): TechniquePortContext {
  const candidates = Array.isArray(target_arch_family)
    ? Array.from(new Set(target_arch_family.filter(Boolean)))
    : [target_arch_family];

  let matched: Technique['port_targets'][number] | undefined;
  let matchedOn: string | undefined;
  for (const candidate of candidates) {
    const found = technique.port_targets.find((p) => p.arch_family === candidate);
    if (found) {
      matched = found;
      matchedOn = candidate;
      break;
    }
  }
  // Use the matched candidate (or the first candidate as fallback) as the
  // "canonical" target_arch_family in the returned context.
  const reported_arch_family = matchedOn ?? candidates[0] ?? '';
  let summary: string;
  if (!matched) {
    summary =
      `Technique "${technique.name}" has no port_target for arch "${reported_arch_family}". ` +
      `Existing port_targets: ${technique.port_targets.map((p) => `${p.arch_family} (${p.status})`).join(', ') || 'none'}. ` +
      `Treating as greenfield port (will write new kernel from reference impl + corpus DSL examples).`;
  } else {
    switch (matched.status) {
      case 'reference-impl':
        summary = `Technique "${technique.name}" → arch "${reported_arch_family}": reference impl (no porting needed; agent will surface the existing reference).`;
        break;
      case 'production-ready':
        summary = `Technique "${technique.name}" → arch "${reported_arch_family}": production-ready port already exists. Agent will verify it still works for your model + diff against latest reference.`;
        break;
      case 'experimental':
        summary = `Technique "${technique.name}" → arch "${reported_arch_family}": experimental port. Agent will iterate on the existing impl + run cross-arch verify.`;
        break;
      case 'planned':
        summary =
          `Technique "${technique.name}" → arch "${reported_arch_family}": planned port (greenfield). ` +
          `Agent will generate a first-pass kernel from the technique reference impl + corpus DSL examples for ${reported_arch_family}, ` +
          `then iterate via Layer V verify (target effort: ${technique.port_complexity}).`;
        break;
      case 'blocked':
        summary =
          `Technique "${technique.name}" → arch "${reported_arch_family}": port BLOCKED. ` +
          `Notes from prior attempt: ${matched.notes ?? '(none)'}. ` +
          `Agent will surface the blocker and exit; manual investigation required.`;
        break;
    }
  }
  return {
    technique,
    target_arch_family: reported_arch_family,
    matched_port_target: matched,
    arch_family_candidates: candidates,
    summary,
  };
}

/**
 * v3.28 (F4) — derive the candidate arch_family list for a hardware
 * record. Caller passes whatever optional fields the hardware YAML
 * carries (microarchitecture, generation, vendor) and we return them
 * in the priority order the resolver should try.
 *
 * Pure function so it's trivially testable and the agent CLI doesn't
 * have to know the priority order.
 */
export function deriveArchCandidates(input: {
  microarchitecture?: string;
  generation?: string;
  vendor?: string;
}): string[] {
  const out: string[] = [];
  if (input.microarchitecture) out.push(input.microarchitecture);
  if (input.generation) {
    out.push(input.generation);
    const truncated = input.generation.split('-')[0];
    if (truncated && truncated !== input.generation) out.push(truncated);
  }
  if (input.vendor) out.push(input.vendor);
  // Deduplicate while preserving order.
  return Array.from(new Set(out));
}
