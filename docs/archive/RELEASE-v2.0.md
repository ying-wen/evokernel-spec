# EvoKernel Spec — v2.0.0 GA Release Readiness Assessment

> **Date:** 2026-05-02
> **Promoting from:** v1.43.0
> **Target:** v2.0.0 — first stable public release

This is a structured readiness assessment, not a marketing document. It enumerates what's ready, what's known-incomplete, and the rationale for cutting GA now rather than continuing to iterate.

---

## TL;DR

EvoKernel Spec is ready to cut v2.0.0 GA. The original three "gaps" called out at project inception (cluster-internal info / operator + fusion info / deployment optimization chain) are all closed with evidence-backed coverage. Test gates are green (470 E2E + 36 unit), build is fast (~1 s for 451 pages), documentation is consistent and current, and the public surface has stabilized through 27 single-themed iterations.

**Going to 2.0** signals "stable public surface for downstream consumers" — anyone forking, scraping the JSON API, or linking to specific routes can rely on the current shape. **Post-2.0 work** continues but as community-driven content fill (citations, more memory_hierarchy backfill) and Tier 3 large bets (benchmark CI, multi-language), neither of which warrants holding the release.

---

## Readiness gates — all green

### ✅ Functional completeness

The original brief's three gaps are all closed:

| Gap | Status | Evidence |
|---|---|---|
| Hardware / cluster info granularity | ✅ Closed | All 14/14 super-pods filled across 3 architectural axes (host_cpu / network_topology / storage_architecture) · `/servers/cluster-internals/` unified view |
| Operator / fusion info | ✅ Closed | 34 operators × 24 fused kernels × 23 patterns · `/operators/fusion-graph/` SVG bipartite view · single-direction edges flagged as PR opportunities |
| Deployment optimization chain | ✅ Closed | 8-step `/learn/` chain (capacity-planning → picking-engine → quantization-decision-tree → parallelism-cheatsheet → deployment-failures → observability → production-lifecycle → troubleshooting) + 4 migration playbooks |

### ✅ Data quality

| Metric | Value |
|---|---|
| Total entities | 297 across 16 schema types |
| Tier breakdown | Mixed — `/quality` page surfaces real-time tier distribution |
| Evidence per claim | 1+ required (validate enforces) |
| Schema coverage | 100% — `pnpm validate` passes; cross-reference resolution clean |
| Linkrot probe | Weekly cron checks evidence URL reachability |

Specific entities:

- 39 accelerators × 28 vendors (saturated for known frontier silicon)
- 14 super-pods × 3 architectural axes (14/14)
- 20 models (LLM + scientific + diffusion + multimodal)
- 41 measured deployment cases (Tier 0)
- 24 playbooks · 23 patterns · 7 pipeline stages
- 7 inference engines × full capability matrix (60+ features × 6 axes)
- 11 tours (edge → super-pod spectrum)

### ✅ Test coverage

| Test type | Count | Status |
|---|---|---|
| E2E (Playwright + axe a11y) | 470 | All passing |
| Unit (Vitest) | 36 | All passing |
| Lighthouse | Weekly cron | Green (perf budget enforced) |
| Schema validation | 297 entities | All valid |
| Cross-reference | All entities | All resolve |
| Linkrot | Evidence URLs | Weekly cron |

### ✅ Build and deployment

| Surface | Status |
|---|---|
| `pnpm build` | ~1 s for 451 pages |
| Bundle size | Within budget (Pagefind dominates dist) |
| GitHub Pages deploy | Auto on tag push |
| Cloudflare Pages | Compatible (tested) |
| Offline tarball | `pnpm pack:dist` → 2.6 MB tar.gz + sha256 sidecar |
| Local production launcher | `./launch.sh` one-command (build + health-poll + smoke 12 routes) |

### ✅ Accessibility

| Standard | Status |
|---|---|
| WCAG 2 AA | Compliant (axe a11y E2E tests gate every route) |
| Keyboard navigation | Full coverage (nav, search, calculator, all data tables) |
| Color contrast | Verified across both light + dark themes |
| `prefers-reduced-motion` | Respected |
| Screen reader landmarks | All pages have `<main>` + descriptive headings |

### ✅ Documentation completeness

| Document | Status | Last refresh |
|---|---|---|
| README.md | Current — data counts match v1.43 corpus | 2026-05-02 |
| CHANGELOG.md | Keep-a-Changelog format · single-themed releases | 2026-05-02 |
| docs/ROADMAP.md | Refreshed to v2.0 baseline · post-2.0 work prioritized in 3 tiers | 2026-05-02 |
| docs/KNOWN_ISSUES.md | Severity-graded · resolved items dated · 2.0-current | 2026-05-02 |
| docs/DATA-TIERING.md | Tier definitions + reviewer rubric · stable since v1.0 | 2026-04 |
| docs/DEVELOPMENT.md | Architecture map · contribution path · stable | 2026-04 |
| docs/V1.2-VISION.md | Scope-broadening rationale · vision delivered | 2026-04 |
| CONTRIBUTING.md | 3 contribution tracks · DCO · evidence requirements | 2026-04 |
| DEPLOYMENT.md | Cloudflare / nginx / systemd / launchd · tarball workflow | 2026-04 |
| SECURITY.md | Disclosure policy · scope · supply-chain | 2026-04 |
| CONTRIBUTORS.md | Attribution log | 2026-04 |

### ✅ External surfaces stable

| Surface | Stability commitment for 2.x |
|---|---|
| `/api/{index,hardware,models,cases,openapi}.json` | Stable schema; additive changes only in 2.x |
| `/api/health.json` + `/api/healthz` | Stable response shape |
| Route paths (`/hardware/<slug>/`, `/models/<slug>/`, etc.) | Stable; redirects added if any moves |
| YAML schemas (`schemas/`) | Additive changes only in 2.x; breaking changes deferred to 3.0 |
| Tarball MANIFEST.json | Stable shape |
| Evidence ID format | Stable (`ev-<kebab>`) |

---

## Known gaps (intentional — not release blockers)

These are documented in `docs/KNOWN_ISSUES.md` and `docs/ROADMAP.md`. Each is either community-fill work, an opt-in Tier 3 bet, or an architectural decision deliberately deferred:

| Gap | Severity | Why not blocking |
|---|---|---|
| 21/39 cards missing deep memory_hierarchy | 🟡 | Recommendation engine works on headline fields; depth backfill is community work |
| 6/14 super-pods missing full cluster_internals | 🟡 | All 14/14 covered on the 3 architectural axes; missing detail is in switch-chip / cabinet level |
| EN translation lags ZH for new content | 🟡 | i18n fallback prevents 404; English-as-fallback acceptable for niche content |
| `/api/health.json` HTTP 200 (body says 503) | 🟡 | SSG limitation; fix requires hybrid runtime which breaks pure-static deploy |
| Lighthouse on weekly cron | 🟡 | Path-filter PR gate planned post-2.0 |
| 1 citation seed entry | 🟡 | Outreach is community work; infrastructure is in place |
| Compare > 8 cards readability | 🟢 | Soft warning + auto-suggestion to switch to table view |
| Calculator MoE expert-sharding off ~5–15% | 🟢 | Documented; back-of-envelope use case |
| 4 E2E tests skipped (Recharts gate) | 🟢 | Run in dev mode; preview gate is correct production realism |

---

## Why now and not later

### Reason 1 — All three gap closures landed

The original brief said the project should close (a) hardware/cluster details, (b) operator/fusion info, (c) deployment optimization chain. All three are now closed with verifiable artifacts:

- 14/14 super-pods × 3 axes (Gap 1)
- 34 ops + 24 fused kernels + fusion graph (Gap 2)
- 8-step learn chain + 4 migration playbooks (Gap 3)

Continuing to iterate adds depth (more memory_hierarchy data, more cases) but doesn't change the public surface shape — exactly the kind of work that should live behind a stable 2.0 release.

### Reason 2 — Public surface has stabilized

The site has been through 27 single-themed iterations (v1.17 → v1.43) without breaking changes to URL paths, JSON API schemas, or YAML schemas. New schema fields have been added optionally; no consumer of the v1.x API would break upgrading to v2.0.

### Reason 3 — Test gate matures faster than feature gate now

470 E2E + 36 unit tests gate every PR. Adding new content does NOT meaningfully grow test runtime (auto-discovery includes new routes). The cost of holding GA past now is paid in confused community contributors who don't know which version is stable.

### Reason 4 — Single-themed iteration cadence is sustainable post-2.0

Each release is one big idea + small content boost. This cadence works equally well for content fill (memory_hierarchy backfill), Tier 2 work (auto-translation, citation auto-import), and Tier 3 bets (benchmark CI). Cutting 2.0 doesn't slow this down — it just moves it from "v1.x experimental" to "v2.x stable additive."

---

## What 2.0 means for downstream consumers

If you're forking, scraping the API, or embedding this data:

- **URL paths are stable** for the 2.x line. Bookmark / link with confidence.
- **JSON API schemas are stable**. Additive changes only (new fields, never removed/renamed) within 2.x.
- **YAML schemas are stable**. New optional fields may appear; existing required fields won't change semantics or shape within 2.x.
- **Evidence ID format is stable** (`ev-<kebab>`).
- **License unchanged**: code Apache 2.0, data CC-BY-SA 4.0.
- **Breaking changes** are deferred to 3.0 with a deprecation cycle.

---

## v2.0.0 release artifacts

Cutting `v2.0.0` triggers `.github/workflows/release.yml` which:

1. Validates the data corpus
2. Builds the static site (451 pages)
3. Runs `pack:dist` to produce the offline tarball + sha256 + MANIFEST.json
4. Publishes a GitHub Release with both tarballs + sha256 sidecars

Plus `.github/workflows/pages.yml` deploys the same build to https://yingwen.io/evokernel-spec/.

---

## Sign-off

This release is cut on the explicit criteria above. Continued post-2.0 iteration is welcome, expected, and tracked in [docs/ROADMAP.md](./ROADMAP.md). For the 2.0 surface as defined, all gates are green.

— EvoKernel Spec maintainers · 2026-05-02
