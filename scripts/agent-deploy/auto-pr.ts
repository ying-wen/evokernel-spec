/**
 * v3.9 — Auto-PR generator: aggregate accumulated agent-learnings into
 * corpus PR drafts.
 *
 * Closes the "feedback → corpus update" automation loop. Reads
 * `data/agent-learnings/*.yaml` entries, clusters observations by similarity,
 * and emits PR-style Markdown describing what corpus updates would land if
 * the cluster were merged.
 *
 * Use case: a contributor runs `pnpm tsx scripts/agent-deploy/auto-pr.ts`
 * weekly to see "what corpus PRs are emerging from real deployments?". Output
 * is Markdown suitable for pasting into GitHub PR description.
 *
 * Anti-pattern (avoided): auto-OPENING PRs from agent runs. v3.9 ships PR
 * draft generation only — human still reviews + opens. v3.10+ may automate
 * with safety rails (CODEOWNERS approval, draft-PR-only, etc.).
 *
 * See docs/superpowers/specs/2026-05-03-productized-agent.md § Layer F.
 */

export interface AgentLearning {
  id: string;
  agent_run_at: string;
  model_id: string;
  hardware_id: string;
  engine_id: string;
  outcome: 'shipped' | 'partial' | 'kernel-gap-blocked' | 'compile-failed' | 'precision-regression' | 'oom-or-fits-failure';
  observations: Array<{
    kind: 'kernel-gap' | 'perf-cliff' | 'numerical-mismatch' | 'version-skew' | 'config-drift' | 'success-pattern' | 'missing-primitive' | 'fusion-opportunity';
    op_or_kernel?: string;
    isa_primitive?: string;
    description: string;
    evidence?: string;
    proposed_corpus_update?: string;
  }>;
  perf_delta?: {
    decode_tok_per_s_predicted?: number;
    decode_tok_per_s_actual?: number;
    worst_delta_pct?: number;
  };
  triage_status: 'open' | 'merged' | 'wont-fix';
  notes?: string;
}

export interface PRDraftCluster {
  /** Auto-generated cluster id like "ascend-rope-fp32-fallback". */
  id: string;
  /** What kind of corpus update this cluster proposes. */
  kind: 'isa-primitive-add' | 'dsl-example-add' | 'fused-kernel-add' | 'formal-semantics-update' | 'playbook-update' | 'mixed';
  /** All learnings contributing to this cluster. */
  contributing_learnings: string[];
  /** Suggested PR title. */
  title: string;
  /** Markdown PR body describing the update, evidence, files-to-add. */
  body_md: string;
  /** Number of independent agent runs that observed this. Higher = stronger signal. */
  signal_strength: number;
}

export interface AutoPRResult {
  /** All emergent clusters. */
  clusters: PRDraftCluster[];
  /** Summary of input. */
  input_summary: { total_learnings: number; open: number; merged: number; wont_fix: number };
  /** Combined Markdown report — concat of all cluster bodies + a header. */
  report_md: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry: aggregate learnings → PR drafts
// ─────────────────────────────────────────────────────────────────────────

/**
 * Aggregate a list of AgentLearning entries into PR draft clusters.
 *
 * Clustering strategy: group observations by (kind, op_or_kernel, target_arch_family).
 * Clusters with signal_strength >= MIN_SIGNAL (default 2) are emitted.
 *
 * Single-occurrence observations are filtered out by default — they may be
 * noise or one-off bugs. Set min_signal=1 to include them.
 */
export function aggregateLearnings(
  learnings: AgentLearning[],
  options: { min_signal?: number; only_open?: boolean } = {}
): AutoPRResult {
  const minSignal = options.min_signal ?? 2;
  const onlyOpen = options.only_open ?? true;

  const filtered = onlyOpen ? learnings.filter((l) => l.triage_status === 'open') : learnings;
  const summary = computeSummary(learnings);

  // Group observations by (kind, op_or_kernel, arch_family)
  type ClusterKey = string;
  const groups = new Map<ClusterKey, { learnings: AgentLearning[]; observations: AgentLearning['observations'] }>();

  for (const learning of filtered) {
    const archFamily = inferArchFamily(learning.hardware_id);
    for (const obs of learning.observations) {
      // Skip success-pattern from clustering — not a corpus-update signal
      if (obs.kind === 'success-pattern') continue;

      const key = clusterKey(obs.kind, obs.op_or_kernel ?? obs.isa_primitive ?? '', archFamily);
      const existing = groups.get(key) ?? { learnings: [], observations: [] };
      if (!existing.learnings.find((l) => l.id === learning.id)) {
        existing.learnings.push(learning);
      }
      existing.observations.push(obs);
      groups.set(key, existing);
    }
  }

  // Convert groups → clusters, filter by signal strength
  const clusters: PRDraftCluster[] = [];
  for (const [key, group] of groups) {
    if (group.learnings.length < minSignal) continue;

    const [kind, opOrKernel, archFamily] = key.split('::');
    const clusterId = slugify(`${kind}-${opOrKernel}-${archFamily}`);

    clusters.push({
      id: clusterId,
      kind: classifyClusterKind(kind as AgentLearning['observations'][number]['kind']),
      contributing_learnings: group.learnings.map((l) => l.id),
      title: synthesizeTitle(kind, opOrKernel, archFamily, group.learnings.length),
      body_md: synthesizeBody(kind, opOrKernel, archFamily, group),
      signal_strength: group.learnings.length,
    });
  }

  // Sort by signal strength desc
  clusters.sort((a, b) => b.signal_strength - a.signal_strength);

  // Build combined report
  const report_md = synthesizeReport(clusters, summary, minSignal, onlyOpen);

  return { clusters, input_summary: summary, report_md };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function clusterKey(kind: string, opOrKernel: string, archFamily: string): string {
  return `${kind}::${opOrKernel}::${archFamily}`;
}

function inferArchFamily(hardwareId: string): string {
  // Best-effort: extract arch from hardware_id naming. Real implementation
  // would use the corpus hardware.generation field; this is a static
  // fallback for the auto-PR generator.
  if (hardwareId.startsWith('h100') || hardwareId.startsWith('h200')) return 'hopper';
  if (hardwareId.startsWith('b200') || hardwareId.startsWith('b300') || hardwareId.startsWith('gb')) return 'blackwell';
  if (hardwareId.startsWith('rtx-50')) return 'blackwell';
  if (hardwareId.startsWith('rtx-40') || hardwareId.startsWith('l40')) return 'ada';
  if (hardwareId.startsWith('a100')) return 'ampere';
  if (hardwareId.startsWith('mi300') || hardwareId.startsWith('mi32') || hardwareId.startsWith('mi35')) return 'cdna3-or-cdna4';
  if (hardwareId.startsWith('rx-7')) return 'rdna3';
  if (hardwareId.startsWith('rx-9')) return 'rdna4';
  if (hardwareId.startsWith('ascend-')) return 'ascend';
  if (hardwareId.startsWith('mlu')) return 'cambricon-mlu';
  if (hardwareId.startsWith('m3') || hardwareId.startsWith('m4') || hardwareId.startsWith('m5')) return 'apple-m';
  return hardwareId.split('-')[0];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function classifyClusterKind(kind: AgentLearning['observations'][number]['kind']): PRDraftCluster['kind'] {
  switch (kind) {
    case 'missing-primitive': return 'isa-primitive-add';
    case 'kernel-gap': return 'dsl-example-add';
    case 'fusion-opportunity': return 'fused-kernel-add';
    case 'numerical-mismatch': return 'formal-semantics-update';
    case 'perf-cliff': return 'playbook-update';
    case 'config-drift': return 'playbook-update';
    case 'version-skew': return 'playbook-update';
    default: return 'mixed';
  }
}

function synthesizeTitle(kind: string, opOrKernel: string, archFamily: string, signalStrength: number): string {
  const target = opOrKernel || archFamily;
  switch (kind) {
    case 'missing-primitive':
      return `Add ISA primitive: ${target} (${signalStrength} agent runs flagged missing)`;
    case 'kernel-gap':
      return `Add DSL example: ${opOrKernel} on ${archFamily} (${signalStrength} kernel-gap reports)`;
    case 'fusion-opportunity':
      return `Add fused-kernel: ${opOrKernel} on ${archFamily} (${signalStrength} runs found benefit)`;
    case 'numerical-mismatch':
      return `Update formal_semantics for ${opOrKernel} (${signalStrength} numerical-mismatch reports)`;
    case 'perf-cliff':
      return `Update playbook: ${opOrKernel} on ${archFamily} perf below prediction (${signalStrength} runs)`;
    case 'config-drift':
      return `Update playbook: ${opOrKernel} engine config drift (${signalStrength} runs)`;
    case 'version-skew':
      return `Update playbook: ${opOrKernel} version skew between engine + driver (${signalStrength} runs)`;
    default:
      return `Corpus update: ${kind} on ${opOrKernel}/${archFamily}`;
  }
}

function synthesizeBody(
  kind: string,
  opOrKernel: string,
  archFamily: string,
  group: { learnings: AgentLearning[]; observations: AgentLearning['observations'] }
): string {
  const lines = [
    `## Summary`,
    '',
    `**Cluster signal**: ${group.learnings.length} agent runs reported the same observation kind \`${kind}\`${opOrKernel ? ` for op/kernel \`${opOrKernel}\`` : ''}${archFamily ? ` on \`${archFamily}\` arch` : ''}.`,
    '',
    `## Evidence — agent runs`,
    '',
  ];

  for (const learning of group.learnings) {
    lines.push(`### \`${learning.id}\``);
    lines.push(`**Model:** ${learning.model_id}  ·  **Hardware:** ${learning.hardware_id}  ·  **Engine:** ${learning.engine_id}  ·  **Outcome:** ${learning.outcome}`);
    lines.push('');
    const matchingObs = learning.observations.filter((o) => o.kind === kind && (o.op_or_kernel === opOrKernel || o.isa_primitive === opOrKernel));
    for (const obs of matchingObs) {
      lines.push(`- ${obs.description.split('\n')[0].slice(0, 200)}`);
      if (obs.proposed_corpus_update) {
        lines.push(`  - **Proposed update:** ${obs.proposed_corpus_update.split('\n')[0].slice(0, 200)}`);
      }
    }
    lines.push('');
  }

  lines.push('## Suggested files to add/modify');
  lines.push('');
  switch (kind) {
    case 'missing-primitive':
      lines.push(`- New file: \`data/isa-primitives/${slugify(opOrKernel)}.yaml\``);
      lines.push(`  - Document instruction class, cross-vendor equivalents, used_by_kernels references`);
      break;
    case 'kernel-gap':
      lines.push(`- New file: \`data/dsl-examples/<lang>-${slugify(opOrKernel)}-on-${slugify(archFamily)}.yaml\``);
      lines.push(`  - Structural reference DSL example (CUDA-cpp / Ascend-C / BANG-C / etc.)`);
      lines.push(`- Optionally: update \`data/coverage-matrix-overrides.ts\` to mark cell covered`);
      break;
    case 'fusion-opportunity':
      lines.push(`- New file: \`data/fused-kernels/fused-${slugify(opOrKernel)}-${slugify(archFamily)}.yaml\``);
      lines.push(`  - Document fused operator, fusion_lifecycle, formal_semantics, references`);
      break;
    case 'numerical-mismatch':
      lines.push(`- Update: \`data/operators/${slugify(opOrKernel)}.yaml\` or \`data/fused-kernels/${slugify(opOrKernel)}.yaml\``);
      lines.push(`  - Add new \`numerical_rules\` entry for the per-library divergence`);
      break;
    case 'perf-cliff':
    case 'config-drift':
    case 'version-skew':
      lines.push(`- Update: \`data/playbooks/${slugify(`${opOrKernel}-${archFamily}`)}.yaml\``);
      lines.push(`  - Document the gotcha + recommended config / version pin`);
      break;
  }
  lines.push('');

  lines.push('## Auto-generated by `scripts/agent-deploy/auto-pr.ts` (v3.9)');
  lines.push('');
  lines.push('Reviewer: validate the proposed update is correct + open as a real PR. Mark contributing agent-learnings as `triage_status: merged` when this lands.');
  return lines.join('\n');
}

function synthesizeReport(
  clusters: PRDraftCluster[],
  summary: AutoPRResult['input_summary'],
  minSignal: number,
  onlyOpen: boolean
): string {
  const header = [
    `# Auto-PR Drafts — Generated ${new Date().toISOString().split('T')[0]}`,
    '',
    `From **${summary.total_learnings}** total agent-learnings (open: ${summary.open}, merged: ${summary.merged}, wont-fix: ${summary.wont_fix}).`,
    `Filter: ${onlyOpen ? 'open only' : 'all triage statuses'}, min signal strength: ${minSignal}.`,
    '',
    `**${clusters.length}** PR draft cluster${clusters.length === 1 ? '' : 's'} emerging from real deployments.`,
    '',
  ];

  if (clusters.length === 0) {
    header.push('_No clusters met the signal-strength threshold. Either there are not enough agent-learnings yet, or the existing observations are too one-off (single-run patterns) to drive corpus updates._');
    return header.join('\n');
  }

  header.push('---', '');
  for (const cluster of clusters) {
    header.push(`## [Signal ${cluster.signal_strength}] ${cluster.title}`);
    header.push('');
    header.push(`**Kind:** ${cluster.kind}  ·  **Cluster id:** \`${cluster.id}\``);
    header.push('');
    header.push(cluster.body_md);
    header.push('');
    header.push('---', '');
  }
  return header.join('\n');
}

function computeSummary(learnings: AgentLearning[]): AutoPRResult['input_summary'] {
  return {
    total_learnings: learnings.length,
    open: learnings.filter((l) => l.triage_status === 'open').length,
    merged: learnings.filter((l) => l.triage_status === 'merged').length,
    wont_fix: learnings.filter((l) => l.triage_status === 'wont-fix').length,
  };
}
