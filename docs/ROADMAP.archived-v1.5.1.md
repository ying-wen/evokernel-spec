# Roadmap

> What we're building next, why, and roughly when. Items move between
> versions as priorities shift; PRs welcome on anything not yet started.
>
> **Last updated:** 2026-04-30 (post v1.5.1 hotfix)

## Versioning philosophy

- **v1.x** — incremental data + UX improvements with backward-compatible
  schemas. Releases roughly weekly during the active build-out phase.
- **v2.x** — schema-breaking changes (evidence-tier overhaul, multi-tenant
  data sources, etc.). Major announcement first.

---

## ✅ Shipped (v1.0 → v1.5.1)

Completed iterations along the three user-flagged gaps. See [CHANGELOG.md](../CHANGELOG.md) for full per-release detail.

| Version | Theme | Key shipped |
|---|---|---|
| v1.0 | MVP | 28 vendors / 30 hardware / 14 models / 14 cases / Tier 0+1 calculator |
| v1.1 | Production deploy | `launch.sh`, /api/healthz, manifest, pack:dist tarball, deployment-smoke CI |
| v1.2 | **Pipeline + operators + fusion + contribute** | 7-stage `/pipeline/` with 26 decisions, OperatorSchema rich (14 fields), FusedKernelSchema, 4 fused kernels, `/contribute/` 3-track |
| v1.3 | **Hardware + cluster internal** | `architecture.memory_hierarchy`, tensor_core_specs, Server.switch_chips/oversubscription/power_distribution, MemoryHierarchy renderer, NVL72 + CloudMatrix 384 deep-filled |
| v1.4 | Data density + visualization | 8 fused kernels (RMSNorm+Residual / Mooncake / DeepEP / AllReduce+Residual), 7 cards deep-filled, SwitchFabric SVG topology |
| v1.5 | **🎯 Convergence: Model → Recommended Hardware** | 3-leaderboard widget on every model page (throughput / cost / verified), reuses Roofline+calibration+TCO into one ranked answer |
| v1.5.1 | Hotfix | React island base-path bug on GH Pages — 5 spots fixed, regression probe added |

**Cumulative state:** 12 entity types · 176 entities · 287 pages · 137 E2E + 36 unit tests · CI 6 jobs · GitHub Pages live at https://yingwen.io/evokernel-spec/

**Three user-flagged gaps:** all three closed.
1. ✅ 后续部署优化链路 — `/pipeline/` 7-stage + per-stage decisions/tools/failure-modes
2. ✅ 算子层面及融合 — 9 ops rich + 8 fused kernels + double fusion graph
3. ✅ 硬件 + 超节点 + 集群内部 — memory_hierarchy on 7 cards + cluster-internals on 2 super-pods + SwitchFabric SVG

---

## v1.6 — "Symmetric reverse recommendations + data density push" (proposed; pending user confirmation)

Theme: Mirror v1.5 onto the hardware page (so users with a card already in hand can see "what should I run on this") + thicken the long-tail data so the recommendation engine has solid foundations across all 39 cards.

### High priority

- [ ] **Reverse recommendation widget** on `/hardware/<slug>/`
  - Algorithm helper (`recommendModelsForHardware`) already shipped in v1.5.0; just needs the `RecommendedModels.astro` component + page wiring (zh + en)
  - Same 3 leaderboards: 🚀 highest decode tok/s / 💰 lowest $/M tokens / ✅ verified by measured cases
  - Each row deep-links to `/calculator/?model=...&hw=...` with scenario preset
  - Estimated effort: 1 day

- [ ] **Memory hierarchy backfill** for 5 more cards
  - Top targets by inbound traffic: B300, Trainium 2, Cambricon MLU590, Hygon DCU Z100, Moore Threads MTT S5000
  - Each ~30 min from vendor whitepaper / public datasheets
  - Brings deep-filled cards from 7 → 12 (~30% coverage)

- [ ] **Cluster-internal backfill** for 3 more super-pods
  - HGX-H100, GB300-NVL72, Atlas 800T-A3
  - Adds switch_chips + power_distribution + cabinet_layout_md so SwitchFabric SVG renders for them too

- [ ] **More fused kernels** (8 → 12)
  - Candidates: FusedSelectiveScan (Mamba/SSD), FusedSpecDecode draft model, FusedQuantizedAttention (FP4), FusedKVQuant
  - Each ~1 hour authoring

### Medium priority

- [ ] **Hardware × Workload heatmap on /china/ matrix**
  - Currently `/china/` has hw × model (compatibility heatmap). Extend to hw × workload-archetype (scientific / multimodal / RL etc.)
- [ ] **Calculator "scan all hardware" button**
  - One-click trigger of recommendHardwareForModel inside the calculator React island (so users can run the recommendation without leaving /calculator)
- [ ] **`/api/v1/` versioned API directory**
  - Today's `/api/{index,hardware,...}.json` is unversioned. v1 prefix lets us add v2 cleanly when schema breaks.
  - `/api/v1/recommendations/<modelId>` and `/api/v1/recommendations/hw/<hwId>` machine endpoints
- [ ] **Lighthouse-on-PR for frontend changes** (path-filtered) — currently weekly cron + manual
- [ ] **`/api/health.json` SSR option** for proper 503 status code (build-flag gated)

### Low priority

- [ ] **CHANGELOG.md auto-generated** by release workflow (today: hand-curated)
- [ ] **Operator decomposition** for the 5 models still missing it
- [ ] **Compatibility matrix** /compat page — model × hardware × engine × precision combinations across the corpus

---

## v1.7+ — "Community contributions + data trust"

Theme: Lower the bar for adding cases / corrections, surface vendor-vs-measured drift.

- [ ] **Hosted "Submit a deployment case" form** at `/contribute/case/`
  - Form → generates a YAML diff → opens a PR (GitHub OAuth + content-addressed)
  - Skips the "fork + clone + edit YAML" toll for one-off contributors
- [ ] **Vendor-claimed-vs-measured drift dashboard** on `/quality/`
  - Per-vendor "credibility score": when measured cases land, compute gap to vendor claim
- [ ] **Bilingual issue/PR templates** with auto-detect routing
- [ ] **Dependabot + auto-merge for patch updates** (Astro/React/Tailwind/zod patches)

---

## v2.0 — "Multi-source, multi-locale, queryable" (target: 2026 Q4)

Theme: From "static knowledge base" to "queryable knowledge graph".

- [ ] **GraphQL endpoint** (`/api/graphql`) for relational queries
  - Pre-compute SQLite at build time (~1 MB), query client-side via sql.js
  - Without abandoning static deployment
- [ ] **Localization beyond zh/en**
  - Japanese (large H100/Grace user community)
  - Korean (Samsung Foundry / SK Hynix HBM ecosystem)
- [ ] **Time-series of vendor specs** sourced from git history of YAML files
- [ ] **Trust-tier reputation system**
  - `tier: measured` cases gain weight if reproduced ≥2× across submitters
  - Calibration map weights by reproduction count

---

## Stretch / "maybe never"

These are good ideas in tension with the project's "stay simple" thesis:

- **User accounts** — implies auth, session storage, GDPR concerns; hard "no" unless we hit a compelling use case
- **Inference benchmark runner SaaS** — too far from our "knowledge base" lane; better to point at MLPerf or BentoML
- **PDF / report generation** — print-stylesheet on case-detail is enough
- **Real-time price scraping** — would require maintained scrapers; out of scope but third parties could build on top of `/api/`

---

## How to influence the roadmap

- 👍 react on a roadmap issue to vote
- Open a discussion at https://github.com/ying-wen/evokernel-spec/discussions
- Submit a PR for any not-yet-started item — most v1.x work is contributor-friendly with clear acceptance criteria

The roadmap is a living document. We update it after each release based on what landed, what slipped, and what new pressures emerged.
