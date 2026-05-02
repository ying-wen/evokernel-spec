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

- `CLAUDE.md` (repo root) — project-specific guide for Claude Code agents
- `CONTRIBUTING.md` — DCO + bilingual contribution guide (5 contribution paths)
- `DEPLOYMENT.md` — production deployment (Cloudflare Pages, nginx, systemd)
- `SECURITY.md` — vulnerability disclosure policy
- `KNOWN_ISSUES.md` — limitations and workarounds
- `ROADMAP.md` — what's next (v2.25+ trajectory + v3.0 planning)

---

## v2.x — Agent layer, plugins, knowledge feedback (added v2.0 → v2.24)

The v1.x guide above covers **data + site** development. The v2.x major
added three new layers: **agent CLI**, **plugins**, **feedback loop**.
This section covers each.

### Repository layout — v2.x additions

```
scripts/
├── agent-deploy/                  # 7-stage agent CLI (2,177 LOC)
│   ├── index.ts                   # CLI entry, stages 1-8
│   ├── kernel-codegen.ts          # Op-class-aware kernel skeleton emission
│   ├── production-artifacts.ts    # Dockerfile / K8s / runbook / SBOM / etc.
│   └── run-validations.sh         # Multi-config validation matrix
├── tests/
│   ├── kernel-codegen-dispatch.test.ts  # 11 vitest assertions on op-class dispatch (v2.18)
│   └── fixtures/                  # Offline configs for CI agent-regression
│       ├── llama-3-3-70b/config.json
│       ├── deepseek-v4-pro/config.json
│       └── qwen3-6-plus/config.json
└── validate-data.ts               # Schema check (now includes agent-learnings)

plugins/
├── mcp-server/                    # MCP server, 6 tools (v2.11+)
├── claude-code-skill/             # Claude Code skill
├── cursor-rules/                  # Cursor MDC rules
└── codex/                         # OpenAI Codex prompt presets

data/                              # v2.x added 6 new entity types:
├── isa-primitives/                # Layer A: silicon instructions (v2.6)
├── dsl-examples/                  # Layer B: kernel DSL examples (v2.7)
├── kernel-libraries/              # Layer C: vendor BLAS/DNN packages (v2.5)
├── reference-impls/               # Hand-rolled reference impls (v2.7)
├── profiling-tools/               # NCU / msprof / cnperf / etc. (v2.7)
├── model-graphs/                  # Architecture → ops bridge (v2.8)
├── engine-compile-workflows/      # Engine build steps (v2.12)
└── agent-learnings/               # Knowledge feedback — per-run observations (v2.20)
```

### The 5-layer hw-sw gap framework

When you write code or data that crosses hardware archs, identify which
layer your change affects:

| Layer | What | Where in repo |
|---|---|---|
| A — ISA primitive | Actual silicon instruction with cross-vendor mapping ratios | `data/isa-primitives/` · `schemas/isa-primitive.ts` · `/isa-primitives/` page |
| B — DSL | How a kernel is written (CUDA, HIP, Ascend-C, BANG-C, Triton) | `data/dsl-examples/` · `schemas/dsl-example.ts` · `/dev-toolkit/dsl-examples/` page |
| C — Kernel library | Vendor-blessed packaged paths (cuBLAS, CUTLASS, aclnn) | `data/kernel-libraries/` · `schemas/kernel-library.ts` · `/kernel-libraries/` page |
| D — Formal semantics | Per-op `formal_semantics` block with edge_cases + numerical_rules + reference_impl | Embedded in `data/operators/*.yaml` and `data/fused-kernels/*.yaml` |
| E — Coverage matrix | Which (op × arch) cells have library coverage | `data/coverage-matrix.ts` · `/operators/coverage-matrix/` page |

This framework drives the agent's recommendations. When you change one
layer, think about whether the others need updates too:

- **Add an ISA primitive (Layer A)** → likely also need `cross_vendor_equivalents` mappings + at least one `used_by_kernels` reference
- **Add a DSL example (Layer B)** → likely cross-references 1-2 ISA primitives + 1 kernel library
- **Add a kernel library entry (Layer C)** → list the ops it implements + arch families it supports
- **Add `formal_semantics` to an op (Layer D)** → no other layer changes needed; this is self-contained
- **Coverage matrix (Layer E)** is auto-derived; only add manual override entries

### Agent CLI dev recipe

```bash
# 1. Make changes in scripts/agent-deploy/ or kernel-codegen.ts

# 2. Run unit tests (catches op-class dispatch regressions immediately)
pnpm --filter @evokernel/scripts test

# 3. Type-check (existing pre-existing errors in audit-data.ts are OK)
pnpm exec tsc --noEmit -p scripts/tsconfig.json | grep "agent-deploy/index.ts" | grep -v "TS18048\|TS2532\|TS2322"
# (empty output = your edits are clean)

# 4. Smoke test with offline fixture (no HF / API calls)
# Note: Stage 2 requires a running dev server for the API. For CI, we skip
# Stage 2+ and only run dispatch unit tests. Local smoke needs:
pnpm --filter @evokernel/web dev &  # bg dev server
sleep 5
pnpm exec tsx scripts/agent-deploy/index.ts \
  --source-type local \
  --model scripts/tests/fixtures/llama-3-3-70b \
  --hardware h100-sxm5 \
  --workload chat
kill %1  # stop dev server

# 5. Verify the emitted agent-learning.yaml stub validates
cp agent-deploy-output/agent-learning.yaml data/agent-learnings/test-$(date +%s).yaml
pnpm exec tsx scripts/validate-data.ts
rm data/agent-learnings/test-*.yaml  # cleanup
```

The `agent-deploy-output/` directory is gitignored. Production agent runs
that produce useful learnings should `mv agent-learning.yaml` into
`data/agent-learnings/` after editing actuals + commit.

### Adding `formal_semantics` to an op or fused-kernel

**Quality bar** (enforced by review, not schema):
- `signature:` 1-3 line type signature, PyTorch-ish prose
- `fusion_lifecycle:` (fused-kernels only) one of: `compile-time-template`, `jit-trace`, `runtime-graph`, `manual-kernel`
- `unfused_penalty:` (fused-kernels only) prose on HBM round-trip cost
- `edge_cases:` 2-4 cases where libraries diverge; `behaviors:` map per library
- `numerical_rules:` 1-2 dtype/precision rules; `per_library:` map
- `reference_impl:` PyTorch snippet (readable, not necessarily compilable)

**Anti-patterns** to avoid:
- Inventing `fusion_lifecycle` enum values (`runtime-fused` is NOT valid; use `manual-kernel`)
- Multi-line `source_url:` (must be a single URL; use `notes:` for multi-source)
- Apostrophes in single-quoted YAML scalars (`'foo's bar'` breaks parse; use double quotes)
- More than ~100 LOC per `formal_semantics` block (compress; the agent uses structured fields, not prose)

**Reference patterns**:
- Op: [`data/operators/silu.yaml`](../data/operators/silu.yaml)
- Fused kernel: [`data/fused-kernels/flash-attention-v3.yaml`](../data/fused-kernels/flash-attention-v3.yaml)
- DSL example: [`data/dsl-examples/cuda-flash-attention-hopper.yaml`](../data/dsl-examples/cuda-flash-attention-hopper.yaml)
- Agent learning (open): [`data/agent-learnings/dsv4-pro-on-mlu590-2026-05-02.yaml`](../data/agent-learnings/dsv4-pro-on-mlu590-2026-05-02.yaml)
- Agent learning (closed): [`data/agent-learnings/qwen3-6-on-ascend-910c-2026-05-02.yaml`](../data/agent-learnings/qwen3-6-on-ascend-910c-2026-05-02.yaml)

### Plugin system dev recipe

The 4 plugins under `plugins/` share a common shape: each is a small TS
package that wraps the `data/` corpus and surfaces it via the plugin's
host protocol (MCP, Claude Code skill, Cursor MDC, Codex prompt presets).

```bash
# Build & test the MCP server
pnpm --filter @evokernel/mcp-server build
pnpm --filter @evokernel/mcp-server test

# Local end-to-end smoke (stdio JSON-RPC)
node plugins/mcp-server/dist/index.js
# Then in another terminal, send JSON-RPC requests:
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | \
  node plugins/mcp-server/dist/index.js
```

**MCP plugin tool list** (verified end-to-end in v2.12-v2.13):
- `query_hardware` — fetch hardware spec by ID
- `query_operator` — fetch op spec + formal_semantics
- `query_isa` — fetch ISA primitive + cross-vendor mappings
- `solve` — constraint solver: (model, target hw) → recommended (engine, quant, parallelism)
- `coverage_matrix` — query (op, arch) coverage
- `plan_deployment` — full agent-deploy pipeline as MCP tool

When adding a new MCP tool, also:
1. Add JSON Schema for input args in `plugins/mcp-server/src/tools.ts`
2. Wire to corresponding `data/` reader in `plugins/mcp-server/src/index.ts`
3. Document in `plugins/mcp-server/README.md`
4. Cross-reference from [`docs/ROADMAP.md`](ROADMAP.md) MCP section

### Knowledge feedback loop

The v2.x major's keystone: **every agent run can write back what it learned**.

1. `scripts/agent-deploy/` runs (Stage 1-7 same as before)
2. Stage 8 (v2.24+) emits `agent-learning.yaml` stub with predicted perf + kernel-gap observations
3. Human reviewer runs the actual deployment, fills `_actual` perf numbers
4. Reviewer adds post-deploy observations (perf-cliff, numerical-mismatch, missing-primitive, etc.)
5. Reviewer commits the YAML into `data/agent-learnings/`
6. CI validates schema → site rebuilds → `/agents/learnings/` page surfaces it
7. Next agent run queries `/api/agent-learnings.json` to start smarter

**The loop closes** when an observation drives a corpus update:
- Observation `kind: missing-primitive` → new entry in `data/isa-primitives/`
- Observation `kind: kernel-gap` → new entry in `data/dsl-examples/` (if novel pattern)
- Observation `kind: fusion-opportunity` → new entry in `data/fused-kernels/`
- Observation `kind: numerical-mismatch` → update `formal_semantics.numerical_rules` on existing op

When closure happens: update the agent-learning entry's observation
`triage_status` → `merged` and add a link to the corpus PR in
`proposed_corpus_update`.

**Reference**: v2.21 closed the loop on a v2.20 observation (Qwen on Ascend
→ `huawei-ascend-vector-fp32` ISA primitive). See
[`data/agent-learnings/qwen3-6-on-ascend-910c-2026-05-02.yaml`](../data/agent-learnings/qwen3-6-on-ascend-910c-2026-05-02.yaml)
and the corresponding [`data/isa-primitives/huawei-ascend-vector-fp32.yaml`](../data/isa-primitives/huawei-ascend-vector-fp32.yaml).

### CI shape — 7 jobs (v2.24)

| Job | What it catches |
|---|---|
| `validate-data` | Schema errors, dangling cross-references, duplicate IDs |
| `type-check` | TS / Astro type errors |
| `unit-tests` | Schema unit tests + web vitest |
| `agent-regression` (v2.24) | Op-class dispatch regressions (11 assertions) + agent-learning schema drift |
| `build` | Astro SSG build (must be < 8s, < 1000 pages) |
| `e2e` | Playwright critical user flows |
| `deployment-smoke` | `./launch.sh` 17-route health check |

Plus weekly `check-links` cron (evidence URL health; non-blocking).

### Performance budget — v2.x updated

| Metric | v1.x budget | v2.x actual | v3.0 budget |
|---|---|---|---|
| Site pages | < 1000 | 505 | < 2000 |
| Build time | < 2 min | 7s | < 30s |
| Schema validate | < 30s | 3s | < 30s |
| Dispatch tests | n/a | < 1s (11 assertions) | < 5s |
| E2E | < 90s | ~60s | < 90s |
| API endpoints | 6 | 21 | < 50 |
| JSON API gzip size | < 5 MB | ~1.2 MB combined | < 10 MB |

When budgets stretch, refactor; when they break, reject the change.

### Ralph loop iteration pattern

For autonomous Claude Code sessions, this project uses **Ralph loops**:

```
1. Survey      — git log, file counts, what changed
2. Identify    — highest-leverage gap (worst-coverage field, latest learning)
3. Ship        — focused minor release (v2.x.y), one theme, < 1000 LOC diff
4. Document    — CHANGELOG, ROADMAP, README updates
5. Tag + push  — CI catches regressions
```

**Discipline**: one theme per release. The v2.18 → v2.24 arc was 7 releases
in one autonomous session — each had narrow scope (op-class codegen, then
collective ops, then DSL expansion, etc.). Trying to ship two themes per
release breaks the focus.

**Anti-pattern**: schema-extension habit. The v1.x recipe (add field →
populate entities → matrix view → nav → tests) was used 4 times in v1.x
and is now exhausted. v2.x quality gaps are about **depth**, not breadth.
v3.0 will reopen breadth (new model/hardware classes); until then, focus
on filling existing fields and closing feedback loops.
