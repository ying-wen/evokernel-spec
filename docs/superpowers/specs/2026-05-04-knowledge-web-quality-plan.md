# Knowledge Base + Web Quality Plan (v3.31 → v3.33)

> Status: Spec, 2026-05-04. Updated after v3.32 added the first automated
> API/audit quality gates.
> Scope: knowledge base, website/API surfaces, documentation, and security
> guardrails. Out of scope: agent harness implementation files, which are being
> advanced separately.

## Current State

The v3.32 baseline is structurally healthy:

- `pnpm exec tsx scripts/validate-data.ts` passes with 424 entities across 24 entity types.
- `pnpm audit:data` reports 0 warnings / 60 informational coverage gaps.
- `pnpm --filter @evokernel/web test` passes with 51 web tests.
- `pnpm --filter @evokernel/web build` builds 613 SSG pages.
- v3.30 expanded `data/techniques/` from 1 to 4 entries: SageAttention, FlashAttention, PagedAttention, and RingAttention.
- v3.31 aligns README/ROADMAP/HARNESS/homepage/Agents/API descriptors/security notes with the v3.30 state.

The main issue is not schema validity. It is agent-readiness and public surface
coherence: the corpus has enough structure to drive the harness, but several
data areas remain too sparse for the "any model × any hardware" claim, and
route/link/security checks need to become automated gates rather than manual
inspection.

## Findings

### Data gaps

- `pnpm audit:data` no longer reports warning-level findings after edge-tier and wafer-scale BF16 heuristics were made explicit.
- Coverage gaps are material: many hardware entries lack measured cases; many non-LLM models lack model graphs; reference implementations are still concentrated around FlashAttention.
- Engine compile workflows exist for 4/7 engines; `sglang`, `mori`, and `hanguang-engine` need coverage for agent planning.
- Technique YAMLs are useful but should be hardened with cross-reference checks, verification input shapes, and explicit tolerance fields for cross-arch tensor diff.
- `zai-org/CogVideoX1.5-5B` can now synthesize in memory, but a successful run should produce reviewed corpus stubs so the next run uses durable data.

### Web/API issues

- v3.31 fixed the most visible stale v3.23/v3.27 language across README, ROADMAP, HARNESS, homepage, and `/agents/`.
- v3.32 makes `/api/index.json` and `/api/openapi.json` match the actual API route inventory through a unit-test gate.
- v3.32 restored the missing `/api/quantizations.json` route that the public descriptors already advertised.
- v3.31 exposes `/techniques/` from nav/homepage discovery.
- English pages are partial mirrors. `hreflang` and nav generation must stop emitting `/en/*` links for pages that do not actually exist.
- Build-time link integrity is not enforced, so missing internal links can survive green unit tests.

### Security/robustness issues

- Generated deploy output can contain remote host references, profiler captures, generated kernels, or run logs. `out/`, `agent-deploy-output/`, and local worktrees must remain ignored and local-only.
- Several Astro pages render trusted repo Markdown via `marked.parse(...); set:html`. That is acceptable only while data is reviewed repo content; if agent-learning or public contribution paths become user-generated, add sanitizer coverage before accepting raw Markdown.
- Real SSH hosts, API keys, profile dumps, and private model artifacts must never be committed; examples should use placeholder shapes only.

## v3.33 Plan

1. **Data audit hardening**
   - Keep `pnpm audit:data --strict` at 0 warning-level findings.
   - Add technique cross-reference checks for `applicable_to.ops`, `port_targets.arch_family`, and reference URLs.
   - Add coverage dashboards/checks for no-case hardware, no-case models, missing model graphs, missing engine workflows, and reference impl scarcity.

2. **North-star corpus persistence**
   - After a successful synthesized run, emit PR-ready `data/models/<slug>.yaml` and `data/model-graphs/<slug>.yaml` stubs with provenance and caveats.
   - Prioritize CogVideoX1.5-5B + SageAttention + Ascend 910B/910C so the north-star path becomes durable corpus knowledge.

3. **Web/API parity**
   - Keep `/api/index.json`, `/api/health.json`, and `/api/openapi.json` aligned with actual API routes through the parity test.
   - Keep `/techniques/` visible from navigation and homepage discovery as the catalog expands.
   - Convert stale agent/demo pages into either current v3.32+ pages or clearly archived legacy examples.
   - Add a build-time internal link checker for generated `dist/` HTML, including `hreflang` targets.

4. **Security gate**
   - Keep generated outputs ignored.
   - Add or document a local secret scan before release.
   - Sanitize or constrain Markdown rendering before accepting any unreviewed user/agent-supplied Markdown into public pages.

## Acceptance Criteria

- `pnpm exec tsx scripts/validate-data.ts` passes.
- `pnpm audit:data` has 0 warnings, or every warning has an explicit evidence-backed waiver.
- `pnpm --filter @evokernel/web test` and `pnpm --filter @evokernel/web build` pass.
- Generated internal links and `hreflang` links resolve.
- API descriptor, OpenAPI, and health counts cover every public JSON route.
- `/techniques/` is discoverable from nav/homepage/API and returns SageAttention context.
- The CogVideoX1.5-5B/SageAttention/Ascend path has either durable corpus entries or a documented synthesized-only caveat.
- Secret scan finds no real API key, private SSH host, target config, or generated deploy artifact in tracked files.
