# Roadmap

> What we're building next, why, and roughly when. Items move between
> versions as priorities shift; PRs welcome on anything in v1.2 or
> later.

## Versioning Philosophy

- **v1.x** — incremental data + UX improvements with backward-compatible
  schemas. Releases monthly-ish.
- **v2.x** — schema-breaking changes (e.g. evidence-tier overhaul,
  multi-tenant data sources). Major announcement first.

---

## v1.2 — "Real production deployment story" (target: 2026 Q3)

Theme: Make the offline-tarball + GitHub Release path bulletproof and
the CI/perf story complete.

### High priority

- [ ] **Lighthouse-on-PR for frontend changes** (path-filtered)
  - Currently weekly + manual; should block PRs that regress LCP/CLS
  - Trade-off accepted: +2min on relevant PRs, no CI overhead on
    pure-data PRs
- [ ] **`/api/health.json` SSR option** for proper 503 status code
  - Behind a build flag (`PUBLIC_HEALTH_SSR=1`) to keep pure-static
    deploy targets working
  - Documented adapter recipes for Cloudflare Pages Functions, Vercel,
    Deno Deploy
- [ ] **Calculator unit tests** for MoE memory model
  - Today: 7 calculator tests + 7 calibration tests = 14 unit tests
  - Target: 25+ covering edge cases (asymmetric TP/EP, FP4 quant,
    KV cache estimation under disaggregation)
- [ ] **Faceted small-multiples** for Compare with >8 cards
  - One mini chart per metric, instead of overlapping radar
  - Toggle between unified and faceted views

### Medium priority

- [ ] **Compare URL-state for filters**
  - Today: only `ids` and `view` URL-shareable; `filter` is local
    state
  - Adding `q=...` would let users share filtered+selected URLs
- [ ] **`/api/v1/...` versioned API** under explicit version prefix
  - Today: `/api/index.json` is unversioned. Adding `/api/v1/`
    formalizes contract for downstream consumers
  - `/api/index.json` stays as a v1 alias for backward compat
- [ ] **Per-hardware "best Tier 0 case" badge** on hardware detail
  - Currently scattered across cases page. Pin the cheapest /
    fastest case directly on the hardware page
- [ ] **Calculator preset library**
  - "8× H100 + DeepSeek-V4" as a 1-click preset alongside the
    existing model-detail "Try in calculator" buttons
  - Save user's last 8 configs (already in localStorage); add an
    "Export preset" button to share configs

### Low priority

- [ ] **CHANGELOG.md auto-generated** by release workflow
  - Today: hand-curated. Trade-off: human distillation > raw git log
  - Maybe: generate a draft, then humans edit
- [ ] **Architecture data backfill** for the 23 cards still tier=estimated
  - Whitepaper-grade sources for: B300, MI355X, Trainium 2,
    Inferentia 2, TPU v5p, Trillium, Gaudi 3 (most are partially
    public), and 7 China-side cards
- [ ] **Operator pages** improved fitness analysis
  - Today: shows model × operator FLOP/byte. Add hardware fitness
    matrix (which card is cheap on this op)

---

## v1.3 — "Community contributions are easy" (target: 2026 Q4)

Theme: Lower the bar for adding cases / cards / models.

- [ ] **Hosted "Submit a deployment case" form** at `/contribute/case/`
  - Form → generates a YAML diff → opens a PR
  - Skip the "fork + clone + edit YAML" toll for one-off contributors
  - Implementation: GitHub OAuth + content-addressed PR creation
- [ ] **Vendor-claimed-vs-measured drift dashboard**
  - When a measured case lands, compute the gap to vendor claim
  - Surface on `/quality/` as a "credibility score" per vendor
- [ ] **Bilingual issue/PR templates** with bilingual labels
  - Auto-detect from issue body language; route to the right
    triage path
- [ ] **Dependabot + auto-merge for patch updates**
  - Astro/React/Tailwind/zod patch versions auto-merged after CI green

---

## v2.0 — "Multi-source, multi-locale, queryable" (target: 2027)

Theme: From "static knowledge base" to "queryable knowledge graph".

- [ ] **GraphQL endpoint** (`/api/graphql`) for relational queries
  - Today: REST gives entity-typed JSON. Hard to ask "all hardware
    where (vendor=CN AND fp8_tflops > 2000) ranked by best measured
    decode case"
  - Without abandoning static deployment: pre-compute a SQLite db
    from YAML at build time, ship it as `/data.sqlite` (~1 MB),
    query client-side via sql.js
- [ ] **Localization beyond zh/en**
  - Japanese (large H100/Grace user community)
  - Korean (Samsung Foundry / SK Hynix HBM ecosystem)
  - Add `ja`, `ko` to i18n dict + page-level mirrors
- [ ] **Time-series of vendor specs**
  - Track: when did NVIDIA first claim FP4 on Blackwell? When did
    AMD MI355X go from announcement to GA?
  - Source from git history of YAML files; render a "spec timeline"
    per vendor
- [ ] **Trust-tier reputation system**
  - `tier: measured` cases gain weight if reproduced ≥2× across
    independent submitters
  - Calibration map weights by reproduction count

---

## Stretch / "Maybe never"

These are good ideas in tension with the project's "stay simple" thesis:

- **User accounts** — implies auth, session storage, GDPR concerns;
  hard "no" unless we hit a compelling use case
- **Inference benchmark runner SaaS** — too far from our "knowledge
  base" lane; better to point at MLPerf or BentoML
- **PDF / report generation** — the print-stylesheet on case-detail
  is enough; full PDF is out of scope unless there's strong demand
- **Real-time price scraping** — would require an actively-maintained
  scraper for AWS/GCP spot prices; out of project scope, but third
  parties could build on top of `/api/`

---

## Dependency upgrades on the roadmap

| Current | Target | When |
|---|---|---|
| Astro 5 | Astro 6 | When 6 is GA + content layer is stable |
| React 19 | React 20 | After Astro 6 is on it |
| Tailwind v4 | (stay) | v4 is current; no v5 announced |
| Recharts | maintain | Largest JS dep; consider switching to
  lightweight `@tremor/react` if perf budget tightens |

---

## How to influence the roadmap

- 👍 react on a roadmap issue to vote
- Open a discussion at
  https://github.com/evokernel/evokernel-spec/discussions
- Submit a PR for any item not in v2.0 — most v1.x work is
  contributor-friendly with clear acceptance criteria

The roadmap is a living document. We update it after each release
based on what landed, what slipped, and what new pressures emerged.
