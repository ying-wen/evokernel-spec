# Development Guide

> A practical map of the codebase for new contributors. Read this before
> opening a PR.

## Table of Contents

- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Dev Loop](#dev-loop)
- [Adding a New Hardware Card](#adding-a-new-hardware-card)
- [Adding a New Model](#adding-a-new-model)
- [Adding a New Deployment Case](#adding-a-new-deployment-case)
- [Adding a New Page or Route](#adding-a-new-page-or-route)
- [Adding a Translation Key](#adding-a-translation-key)
- [Testing Strategy](#testing-strategy)
- [Performance Budget](#performance-budget)
- [Debugging Tips](#debugging-tips)

---

## Architecture

EvoKernel Spec is a **fully-static knowledge site** with a sharp split:

```
data/**/*.yaml                        ← human-authored content
  ↓ (build time)
@evokernel/schemas (zod)              ← validation layer
  ↓
apps/web/src/lib/data.ts              ← in-memory loader + cross-ref resolver
  ↓
apps/web/src/pages/**/*.astro         ← static SSG pages (237+)
apps/web/src/components/*.tsx         ← React islands (hydrated client-side)
  ↓ (build)
apps/web/dist/                        ← deployable static bundle
  ↓ (deploy)
launch.sh / Cloudflare Pages / nginx  ← serving layer
```

**No runtime database. No auth. No SSR (with one optional exception
for `/api/health.json`).** Every number on the site is rendered into
HTML at build time, with the React islands handling dynamic UX
(filters, calculator, charts).

Why fully static:
1. Permits hosting on any commodity static host (cost ≈ $0)
2. Bundles offline beautifully (`pnpm pack:dist` → 2.6 MB tarball)
3. Build-time data validation catches issues before deploy
4. No backend → no security surface beyond the build pipeline

The trade-off: dynamic features (live API queries, user accounts,
form submissions) are out of scope. Contributions go via PR; data
ships with the next release.

---

## Repository Layout

```
.
├── apps/web/                    # Astro frontend
│   ├── src/
│   │   ├── pages/               # File-system routes (.astro)
│   │   │   ├── api/             # Static JSON / TXT endpoints
│   │   │   ├── en/              # English mirror (locale prefix)
│   │   │   ├── hardware/[slug].astro
│   │   │   ├── models/[slug].astro
│   │   │   ├── cases/[slug].astro
│   │   │   ├── calculator.astro
│   │   │   ├── pricing.astro
│   │   │   ├── china.astro
│   │   │   ├── compare.astro
│   │   │   └── showcase.astro
│   │   ├── components/          # Reusable UI
│   │   │   ├── ui/              # Atoms (Badge, Container, Nav, ...)
│   │   │   ├── hardware/        # Hardware-specific (Topology, Compare)
│   │   │   ├── case/            # Case-specific (Leaderboard, CaseCompare)
│   │   │   ├── model/           # Model-specific (Timeline)
│   │   │   └── calculator/      # The big React island
│   │   ├── lib/
│   │   │   ├── data.ts          # YAML loaders + cross-ref resolution
│   │   │   ├── calculator/      # Tier 0 + Tier 1 + calibration
│   │   │   ├── i18n/            # zh + en translation dicts
│   │   │   ├── critical-routes.ts  # Single source of truth for smoke
│   │   │   ├── jsonld.ts        # Schema.org structured data
│   │   │   ├── csv.ts           # CSV export helper
│   │   │   └── build-meta.ts    # git SHA + builtAt
│   │   ├── styles/              # tokens.css, typography.css, global.css
│   │   └── layouts/BaseLayout.astro
│   ├── tests/                   # Vitest unit tests
│   ├── e2e/                     # Playwright integration tests
│   └── public/                  # Static assets (og-default.svg)
│
├── schemas/                     # @evokernel/schemas — zod schemas
│   ├── hardware.ts              # HardwareSchema (incl. architecture)
│   ├── model.ts
│   ├── case.ts
│   ├── manifest.ts              # Offline tarball manifest contract
│   └── schemas.test.ts          # 41 unit tests
│
├── data/                        # Human-authored YAML corpus
│   ├── vendors/*.yaml
│   ├── hardware/{vendor}/*.yaml
│   ├── models/*.yaml
│   ├── cases/{year}/{month}/*.yaml
│   ├── servers/*.yaml
│   ├── operators/*.yaml
│   └── ...
│
├── scripts/                     # Build-time + deploy-time helpers
│   ├── validate-data.ts         # schema + cross-ref validation
│   ├── audit-data.ts            # quality warnings + coverage
│   ├── check-evidence-links.ts  # weekly URL reachability cron
│   ├── decompose-operators.ts   # auto-fill operator FLOPs/bytes
│   ├── pack-dist.ts             # offline tarball + MANIFEST + sha256
│   └── print-critical-routes.ts # shell-friendly route list
│
├── .github/workflows/
│   ├── ci.yml                   # 6 jobs: validate / type-check / unit / build / e2e / deployment-smoke
│   ├── lighthouse.yml           # Perf-budget gate + weekly cron
│   ├── check-links.yml          # Weekly evidence URL health
│   └── release.yml              # Tag-triggered GitHub Release
│
├── launch.sh                    # Production-grade local launch script
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml          # Workspace declaration
├── biome.json                   # Lint + format config
└── tsconfig.base.json           # Shared TS config
```

---

## Dev Loop

```bash
# First time
pnpm install

# Iterate
pnpm dev            # http://localhost:4321 with HMR
# … hack …
pnpm validate       # zod + cross-ref check (run before every commit)
pnpm test           # unit tests across schemas + web + scripts
pnpm test:e2e       # Playwright (87 site tests, ~9s)

# Pre-PR
pnpm exec tsc --noEmit                # strict type-check
pnpm --filter web exec astro check    # astro-aware type-check
pnpm lint                             # biome lint

# Local production preview
./launch.sh         # full build + health-poll + 12-route smoke
./launch.sh --stop
```

Hot-reload note: editing a YAML file in `data/` triggers an Astro
HMR via the `data.ts` import chain. If you change a `schemas/*.ts`
file, you may need to restart `pnpm dev` for the type-check overlay
to pick up the new shape.

---

## Adding a New Hardware Card

1. Create `data/hardware/{vendor}/{card-id}.yaml` following the
   `HardwareSchema` (see `schemas/hardware.ts`).
2. Required fields: `id`, `name`, `vendor`, `release_year`,
   `form_factor`, `compute.bf16_tflops`, `memory.capacity_gb`,
   `memory.bandwidth_gbps`, `power.tdp_w`, `software_support.engines`,
   `software_support.quantizations`.
3. Every quantitative claim needs an `evidence_ref` pointing at an
   `evidence` block at the bottom of the file. Tier (`official` /
   `measured` / `estimated`) reflects source reliability.
4. Optional `architecture` block: SM/CU count, L2 cache, HBM stacks,
   process node, die area, transistor count. When populated, the
   Topology component renders 🟢 vendor floorplan; otherwise ⚠
   illustrative.
5. Run `pnpm validate` to catch schema + cross-ref errors.
6. Run `pnpm audit:data` to surface coverage gaps (e.g. missing
   PCIe gen, no measured cases yet).
7. Run `pnpm test` to make sure data loaders still pass (lower-bound
   assertions tolerate growth).

Reference: `data/hardware/nvidia/h100-sxm5.yaml` is the most
fully-populated example.

---

## Adding a New Model

1. Create `data/models/{model-id}.yaml` per `ModelSchema` (`schemas/model.ts`).
2. Required: architecture block (params, layers, hidden_size, FFN size,
   attention heads/KV heads, head_dim, vocab_size, attention_type,
   moe-config if applicable).
3. **Strongly recommended**: populate `operator_decomposition` with
   per-token FLOPs + bytes for each major operator. The script
   `pnpm exec tsx scripts/decompose-operators.ts` auto-generates this
   from the architecture block — review the output before committing.
4. The calculator uses `operator_decomposition` to compute per-token
   compute/memory cost. Without it, the model can't be scored on
   `/operators/<slug>`-style fitness pages.
5. `pnpm validate && pnpm audit:data && pnpm test`.

---

## Adding a New Deployment Case

1. Create `data/cases/{YYYY}/{MM}/{case-id}.yaml`.
2. Required: `stack` (hardware ref + count + model ref + engine +
   quantization + parallel config), `results` (throughput in
   prefill/decode tok/s, optional latency p50/p95, optional utilization
   compute/memory %).
3. Cross-references resolved at build: hardware/model/engine/
   quantization IDs must exist.
4. **Decode + prefill throughput are the most-consumed numbers** —
   they feed into the calibration map (`buildEfficiencyMap`) and
   directly into pricing/showcase pages.
5. Evidence: source document URL or DOI, accessed date, citation.
   `tier: measured` is the most rigorous; use `tier: official` only
   for vendor whitepapers.
6. After commit, `/showcase` and `/pricing` re-derive their insights —
   no manual UI update needed.

---

## Adding a New Page or Route

For a top-level page (e.g. `/api-explorer/`):

1. Create `apps/web/src/pages/api-explorer.astro`.
2. Use `BaseLayout` for nav/footer/hreflang/JSON-LD slots.
3. If the route is locale-aware, also create `apps/web/src/pages/en/api-explorer.astro`
   passing `locale="en"` to `BaseLayout` and using `t(locale, ...)`
   for translatable strings.
4. **If it's user-facing critical**, add it to `apps/web/src/lib/critical-routes.ts`.
   This auto-adds the route to:
   - `launch.sh` startup smoke
   - Playwright `Critical routes` describe block
   - CI deployment-smoke job
5. Add an i18n key in `apps/web/src/lib/i18n/index.ts` for the
   page title + nav label, in both `zh:` and `en:` dicts.
6. If the page should appear in nav, edit `apps/web/src/components/ui/Nav.astro`.
7. For a React island, place the component in
   `apps/web/src/components/{domain}/{Component}.tsx` and import
   with a hydration directive: `<Component client:load />` or
   `client:idle` for non-critical UX.

---

## Adding a Translation Key

```ts
// apps/web/src/lib/i18n/index.ts
const dict = {
  zh: {
    'page.foo.title': '我的页面',
    // ...
  },
  en: {
    'page.foo.title': 'My Page',
    // ...
  }
};
```

Then in `.astro`:

```astro
---
import { t, type Locale } from '~/lib/i18n';
const { locale = 'zh' } = Astro.props as { locale?: Locale };
---
<h1>{t(locale, 'page.foo.title')}</h1>
```

For React islands, use `~/lib/i18n/island` (smaller bundle):

```tsx
import { tr } from '~/lib/i18n/island';
const t = (k, v) => tr(locale, k, v);
return <button>{t('cmp.export')}</button>;
```

Both dicts MUST contain the same keys — `pnpm exec tsc --noEmit` will
catch missing keys via `keyof typeof dict.zh` typing.

---

## Testing Strategy

The pyramid:

| Layer | Count | Speed | Coverage |
|---|---|---|---|
| **Schema (zod)** | 41 | <1s | Data shape contracts (Hardware, Model, Case, Manifest, ...) |
| **Web unit (vitest)** | 30 | <1s | Calculator math, calibration, data loaders, health endpoint degraded path |
| **Site E2E (Playwright)** | 100+ | ~8s | Real-browser interactions, a11y axe sweeps, JSON API responses |
| **Deployment smoke (launch.sh + CI)** | 12 | ~30s | Built artifact actually serves over HTTP |

Layers are **complementary, not redundant**. Each catches a different
failure class:

- Schema: malformed YAML before it reaches the build
- Web unit: pure-function correctness (calculator math) and degraded
  paths E2E can't easily exercise
- E2E: integration regressions, a11y, JSON API contracts
- Deployment smoke: production-mode artifact correctness, distinct
  from preview-mode behavior

When fixing a bug, write the test at the **lowest layer where it can
fail**. A YAML schema bug should be caught by zod, not by Playwright
clicking through 5 screens.

---

## Performance Budget

| Metric | Budget | Current |
|---|---|---|
| LCP (home, 3G Slow) | < 2.5s | ~1.2s |
| INP | < 200ms | ~80ms |
| CLS | < 0.1 | ≈0 |
| JS bundle (page, gzip) | < 100kb | ~80kb |
| Total dist | — | ~15 MB (incl. Pagefind index) |
| Build time | < 30s | ~7s |

Lighthouse CI gates these in `.github/workflows/lighthouse.yml`.
Regressing past budget will fail the build.

Prefer:
- CSS for transitions (composited; cheap)
- Semantic HTML (smaller payload than div soup)
- Astro hydration directives (`client:idle`/`client:visible` over
  `client:load` when possible)
- Recharts is the only big React-side dep — it's lazy-loaded into
  Calculator/Compare/Leaderboard islands, NOT used on home

---

## Debugging Tips

### `pnpm validate` errors

The validation script (`scripts/validate-data.ts`) lints YAML in
`data/**/*.yaml` against the zod schemas in `@evokernel/schemas`. The
output is structured: `[schema] hardware/foo.yaml: <jsonpath>: <reason>`.
Most failures are typo'd field names or missing required fields.

### Cross-reference failures

Hardware files reference vendor IDs. Cases reference hardware/model/
engine IDs. Vendor/hardware/model files reference evidence IDs (within
the same file). The validator walks all these and prints unresolved
refs.

### `pnpm audit:data` warnings

Non-failing quality signals: missing PCIe gen, no measured cases yet
for a card, vendor without products, evidence URL not yet checked. Use
this to find good first-issue fodder — the dataset is large enough
that there's always a coverage gap.

### Calculator gives unexpected numbers

The calculator pipeline is:
1. Pick precision → look up FLOPS rating
2. Multiply by `efficiency` (calibrated from cases if available)
3. Divide model FLOPs/token to get tok/s upper bound
4. Compare against memory-bandwidth ceiling → bottleneck
5. Tier 0 lookup (closest matching case) overrides Tier 1 if found

Check `apps/web/src/lib/calculator/` for the full code path. The
calibration map (`buildEfficiencyMap`) is rebuilt each page load —
adding a case file changes calculator output without UI changes.

### E2E flake

If a Playwright test flakes locally:
1. Run with `--repeat-each=10` to reproduce
2. Check `apps/web/playwright-report/` for the trace
3. Common causes: localStorage leak between tests (clear in
   `beforeEach`), missing `waitForLoadState('networkidle')`, stale URL
   state hydration

### Health endpoint says degraded but data looks fine

Check `apps/web/src/pages/api/health.json.ts`. The endpoint loads ALL
10 entity types — if any one throws (e.g. malformed YAML in
`patterns/`), the whole probe flips to 503. Run `pnpm validate` first;
if that passes but health still 503s, look at the loader-specific
catch in the route and add temporary logging.

### Adding a new column / chart axis to Compare

`apps/web/src/components/hardware/CompareTool.tsx` has a
`METRICS` array driving columns. Add an entry, update `getMetric()`,
and the radar/bar/table all update automatically. Color comes from
`PALETTE` (modulo-indexed).

---

## See Also

- `CONTRIBUTING.md` — DCO + bilingual contribution guide
- `DEPLOYMENT.md` — production deployment (Cloudflare Pages, nginx, systemd)
- `SECURITY.md` — vulnerability disclosure policy
- `KNOWN_ISSUES.md` — limitations and workarounds
- `ROADMAP.md` — what's next
