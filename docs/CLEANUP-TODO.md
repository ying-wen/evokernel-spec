# Site Cleanup + UI Optimization + Productized-Agent Gaps

> Tracking incremental fixes for stale content, duplicated pages, UX issues,
> AND the v3.24+ "real productized agent" gaps called out by the user
> (May 2026 — see [`docs/superpowers/specs/2026-05-04-real-productized-agent.md`](superpowers/specs/2026-05-04-real-productized-agent.md)).
>
> Each item is independently shippable in a v3.x patch release. Group by
> theme so each release has a coherent narrative. Triage tags:
> - **CRIT** — visible bug, fix in next release
> - **HIGH** — affects core UX, target within 2 releases
> - **MED**  — quality-of-life, opportunistic
> - **LOW**  — nice-to-have, no rush

## v3.24+ "Real productized agent" gaps (HIGH priority)

These are the concrete deliverables for v3.25-v3.30 per the spec at
[`docs/superpowers/specs/2026-05-04-real-productized-agent.md`](superpowers/specs/2026-05-04-real-productized-agent.md)
+ the v3.27+ extension capturing the broader Ralph-Loop vision (richer
input types: code, repos, papers, pseudocode + uncertainty resolution).

| Item | Status | Target |
|---|---|---|
| Host-LLM execution mode (`--use-host-llm`) | ✅ Done | v3.25 |
| Technique entity (`data/techniques/`) + zod schema + first SageAttention YAML | ✅ Done | v3.25 |
| Unknown-model HF auto-import (`synthesizeTemporaryBundle`) | ✅ Done | v3.25 |
| `--technique <id>` CLI flag wired in `index.ts` | ✅ Done | v3.26 |
| Remote-target SSH executor (`remote-target.ts`) + dry-run plan emission | ✅ Done | v3.26 |
| `~/.config/evokernel/targets.yaml` schema + .example file + .gitignore protection | ✅ Done | v3.26 |
| Per-vendor build scripts (nvidia/amd/ascend/cambricon) | ✅ Done | v3.26 |
| Cross-arch numerical verify scaffold (`verify/cross-arch-compare.ts`) | ✅ Done | v3.26 |
| `ralph_loop_iterations[]` manifest extension (every step recorded) | ✅ Done | v3.26 |
| `--execute` for remote-target (SSH connect + build + run + profile + scp back) | ✅ Done | v3.27 |
| Tensor-diff utility for cross-arch numerical compare (`verify/tensor-diff.ts`) | ✅ Done | v3.27 |
| `--description "natural language intent"` flag + clarifying-Q host-LLM loop | ✅ Done | v3.27 |
| `docs/RUNBOOK-SAGEATTENTION-910B.md` (10-step end-to-end walkthrough) | ✅ Done | v3.27 |
| Cross-arch numerical verify EXECUTION (use tensor-diff via remote-target) | TODO | v3.28 |
| End-to-end serving on north-star (`--serve` flag + client test template) | TODO | v3.28 |
| Real run against private Ascend 910B SSH host (per RUNBOOK) | Awaiting user execution | v3.27 |
| `--from-repo https://github.com/X/Y` (clone + scan + plan port) | TODO | v3.28 |
| `--from-code path/to/model.py` (parse + decompose op graph) | TODO | v3.28 |
| `--from-paper https://arxiv.org/abs/X` (LLM extracts claims + comparisons) | TODO | v3.29 |
| First-class user requirement flags (`--target-tok-s` / `--target-latency-ms` / `--target-accuracy` / `--dtype`) | TODO | v3.29 |
| Uncertainty resolution loops + auto-emit `agent-run-summary.md` at end of each deploy | TODO | v3.30 |
| `/agents/runs/` web dashboard (browse past runs from `agent:status` data) | TODO | v3.31 |

## Hardware / Model page UI

### Timeline component — overlapping labels (HIGH)

**Symptom**: On `/hardware/` and `/models/` the time-axis chart at the top
crowds release labels when ≥3 chips share the same release_year. Text
visually overlaps and becomes unreadable.

**Files**:
- `apps/web/src/components/charts/HardwareTimeline.astro` (or similar)
- check `*Timeline*.{astro,svelte}` under `apps/web/src/components/`

**Fix direction**:
- Stagger labels vertically when within 8% of x-axis distance
- Or: introduce per-year stack groups + small "+N" overflow chip when
  more than 4 entries share a year, expanding on hover
- Target: zero overlapping bounding boxes at 1280px viewport

### Filter panel — limited classification (HIGH)

**Symptom**: Hardware filter panel only filters by vendor + form-factor.
Users can't filter by:
- Process node (5nm / 7nm / 3nm / 16nm)
- Memory type (HBM3e / HBM3 / HBM2e / GDDR7 / LPDDR5X / unified)
- Compute tier (frontier / datacenter / consumer / edge / auto)
- Use case (LLM training / LLM inference / image-gen / bio / ADAS)
- TDP range (0-50W / 50-300W / 300-700W / 700W+)
- Price tier (consumer <$2K / pro <$10K / datacenter <$30K / frontier $30K+)
- Country/origin (国产 vs international)

**Files**:
- `apps/web/src/pages/hardware/index.astro`
- `apps/web/src/components/filters/*.astro`

**Fix direction**: extend the filter store with the dimensions above. Each
should be derivable from existing YAML fields (no schema changes needed).
Add a "国产 only" toggle as the user explicitly asked.

### Hardware/Model cards — sparse metadata (MED)

**Symptom**: Each card shows only headline specs (TFLOPS / HBM / TDP). User
asked for "richer classification info" on cards.

**Add to card**:
- Process node + die area
- Memory type (concise badge)
- Compute tier badge (frontier/datacenter/consumer/edge/auto)
- Country flag for vendor
- Software stack badge (CUDA / ROCm / CANN / Neuware / MUSA / MLX)
- Quick-deploy hint (e.g. "✅ Llama 70B BF16" / "❌ no LLM stack")

**Files**: `apps/web/src/components/cards/HardwareCard.astro`

### Hardware sub-page time-axis (MED)

**Symptom**: Per-vendor pages (e.g. `/vendors/cambricon/`) don't have a
generational timeline showing edge → datacenter → frontier evolution.

**Add**: Generational timeline component using vendor's `generation` +
`release_year` fields, similar to corpus-wide hardware timeline.

## Stale / Duplicated content

### Duplicated Apple M-series entries (MED)

`data/hardware/apple/` has both `m4-max.yaml` AND `m4-max-npu.yaml`. The
latter is just the Neural Engine sub-component. Decide:
- Keep both but cross-link visibly
- Or: merge `m4-max-npu` data into `m4-max` as a sub-section
- Same may apply to m3-ultra, m5-pro/max

### Pre-v3.x roadmap docs (LOW)

`docs/ROADMAP.md` mentions v2.x targets that have all shipped. Prune the
"completed" section, focus on v3.18+ candidates.

### Outdated CLAUDE.md (LOW)

`CLAUDE.md` § "Decision rules for AI agents" still references the v2.x flow.
Update to acknowledge v3.17 productized loop is now the preferred path.

### Pre-v3.0 model entries (MED)

Some `data/models/*.yaml` entries pre-date the v3.10 ModelFamilySchema
extension and may have stale `family` values. Audit:
- Run `pnpm exec tsx scripts/audit-data.ts` and check for drift
- Fix any `family: hybrid` that should be a more specific v3.10+ enum

### Pre-v3.x kernel-codegen skeletons (LOW)

`scripts/agent-deploy/kernel-codegen.ts` is the v2.16 skeleton path. The
v3.17 productized loop supersedes it for users who pass
`--use-llm-orchestrator`. Keep skeleton path for offline/no-API users but
add a deprecation note pointing to the productized path as preferred.

### Old MCP server tools (LOW)

`plugins/mcp-server/index.ts` still exposes a `evokernel_deploy` tool that
emits skeletons. Check if it can route through the productized loop too.

## Site infra

### Fix CHANGELOG regression test in CI (DONE in v3.17)

Already shipped in v3.17 — `apps/web/tests/changelog.test.ts` covers
multi-segment headers + CJK + Unreleased placeholder.

### Add `agent:deploy` to docs/landing pages (HIGH)

Now that v3.17 wires the productized loop into the CLI, the landing page
should advertise it. Currently only `evokernel-spec` MCP tools are listed.

**Files**:
- `apps/web/src/pages/index.astro`
- `apps/web/src/pages/api-reference/index.astro`

### Per-language i18n for v3.17 harness docs (LOW)

`.claude/commands/agent-deploy.md` is English-only. Add zh equivalent so
Chinese users can use the slash command in their preferred language.

## Tracking

| Item | Status | Target Release |
|---|---|---|
| changelog.ts regex fix | ✅ Done | v3.17.0 |
| changelog regression test | ✅ Done | v3.17.0 |
| Timeline overlapping labels (hardware) | ✅ Done | v3.20.0 |
| Filter panel — classification (4 new dims) | ✅ Done | v3.20.0 |
| `agent:deploy` landing-page link | ✅ Done | v3.19.0 |
| Hardware card metadata richness | ✅ Done | v3.21.0 |
| Model timeline bento rebuild | ✅ Done | v3.21.0 |
| Apple m4-max-npu visible cross-link | ✅ Done | v3.22.0 |
| zh i18n for agent-deploy command | ✅ Done | v3.23.0 |
| Vendor sub-page timelines | TODO | v3.24.0 |
| ROADMAP.md prune | TODO | v3.24.0 |
| Pre-v3.x model family audit | TODO | v3.24.0 |
| suprof + instruments parsers (Moore Threads + Apple) | TODO | v3.24.0 |
| Kernel-runner harness (auto-invoke profilers, no env hook needed) | TODO | v3.25.0 |
