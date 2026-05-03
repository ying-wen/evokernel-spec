# Known Issues & Limitations

> Honest inventory of where the project is rough or constrained. Updated
> per release. Open issues for fixes via PR.
>
> **Last reviewed:** 2026-05-04 against v3.32.0

## Severity legend

- 🔴 **Blocking** — affects core user flow; must address before next
  release.
- 🟡 **Workaround exists** — known issue; documented mitigation; on
  roadmap to fix.
- 🟢 **Minor / cosmetic** — known small papercut; low priority.

---

## Current v3.32 inventory

### 🔴 Partial English mirrors can produce hidden 404s

**What:** The Chinese canonical site has many more routes than the `/en/`
mirror. Nav and `hreflang` generation can still point to English paths that do
not exist.

**Impact:** Users and crawlers can land on broken routes even when unit tests
and SSG build pass.

**Fix path:** Either add real English mirrors for the linked pages, or make
locale link generation route-aware so missing mirrors fall back to canonical
Chinese pages. Add a build-time internal link checker.

### 🟡 Data is schema-valid but not uniformly agent-ready

**What:** `validate-data.ts` passes, and `pnpm audit:data` now reports 0
warnings. It still reports 60 informational coverage gaps. The biggest
practical gaps are hardware without cases, models without model graphs, sparse
reference implementations, and missing engine compile workflows.

**Impact:** The harness can synthesize and plan, but the "any model × any
hardware" claim remains uneven outside well-covered LLM/Hopper/Ascend paths.

**Fix path:** Prioritize data that directly improves the
SageAttention/CogVideoX/Ascend north-star path and non-LLM model coverage.

### 🟡 Generated run artifacts must stay local-only

**What:** Deploy runs can emit generated kernels, profiler captures, target
plans, run logs, and remote-host references under output directories.

**Impact:** Accidentally committing those files can leak private target details
or noisy generated artifacts.

**Fix path:** Keep `out/`, `agent-deploy-output/`, `.claude/worktrees/`, and
real `targets.yaml` ignored. Commit only sanitized corpus updates such as
reviewed `data/agent-learnings/*.yaml`.

### 🟡 Markdown rendering assumes reviewed repo content

**What:** Several pages render Markdown through `marked.parse(...); set:html`.

**Impact:** This is acceptable for reviewed repo data, but becomes stored-XSS
risk if public submissions or agent-generated Markdown are rendered without
review.

**Fix path:** Add sanitizer coverage or a constrained Markdown renderer before
accepting unreviewed Markdown into public pages.

---

## Recently fixed

### ✅ API descriptor parity regression gate (v3.32)

`/api/index.json` and `/api/openapi.json` are now tested against the actual
`apps/web/src/pages/api/` route inventory. v3.32 also restored the missing
`/api/quantizations.json` route that the descriptors already advertised.

### ✅ Reverse recommendations (hardware → models) wired (v1.5+ / v1.6)

Both `/models/<slug>/` and `/hardware/<slug>/` now show 3-axis recommendation rankings (throughput / cost / verified) with calculator deep-link presets.

### ✅ Capacity-planning interactive calculator (v1.32)

`/calculator/capacity-planner/` is now an interactive React island — pick (model × hardware × QPS × SLA) and see card-count recommendation in real time.

### ✅ `/servers/cluster-internals/` unified 3-axis view (v1.33)

All super-pods listed side-by-side across host_cpu × network_topology × storage_architecture in a single matrix. Red border for "三轴全 ✓" elite super-pods.

### ✅ Public submission portal (v1.39)

`/contribute/case-form/` lets non-engineers submit deployment cases via web form — generates PR-ready YAML automatically.

### ✅ `/operators/fusion-graph/` SVG bipartite view (v1.38)

Pure server-rendered SVG showing operators ↔ fused-kernels participation. Single-direction edges flagged as data-completeness PR opportunities.

### ✅ Engine capability matrix `/engines/compare/` (v1.42)

7 engines × 60+ features across 6 capability axes (quant / parallelism / serving / spec-decode / frontend / deployment). Replaces the "read 7 vendor READMEs" pre-decision step.

### ✅ Migration playbooks `/learn/migrations/` (v1.43)

4 paths (engine-swap / hardware-swap / quant-downcast / scaling) × 7-step framework (trigger → prerequisites → plan → cutover → validation → rollback → followups).

### ✅ React island links missing /evokernel-spec base path on GH Pages (v1.5.1)

Previously: clicking a hardware card on `https://yingwen.io/evokernel-spec/hardware/` 404'd because the React island built `href="/hardware/<id>/"` directly (without going through `pathname()` helper). 4 islands + Nav locale switcher + Pagefind bootstrap all affected. Local `pnpm dev` and `pnpm preview` both ran with default base="/" so the bug was invisible until production. **Fixed in v1.5.1.** A regression probe (`pnpm test:e2e:basepath`) now simulates GH Pages locally to catch the same class going forward.

---

## Architecture / deployment

### 🟡 `/api/health.json` returns body=503 but HTTP=200 in static export

**What:** When the corpus loader fails or core entities are empty,
`/api/health.json` correctly emits `{"status": "degraded"}` in the
body, but the HTTP status code returned by `pnpm preview` (and
Cloudflare Pages, GitHub Pages, plain nginx) is **200, not 503**.

**Why:** Astro's static-SSG export serializes only the response body
to disk. The static file server has no way to honor a `Response.status`
that was set in the build-time route function.

**Workaround:**
1. For uptime monitors that support body-based health checks (most do
   — UptimeRobot, StatusCake, Pingdom), assert
   `body.status === "ok"` instead of HTTP 200.
2. For stricter HTTP-200-as-health probes, configure your static host
   to respond with 503 when `body.status !== "ok"`. nginx example:
   ```nginx
   location = /api/health.json {
       try_files /api/health.json @check_health;
   }
   location @check_health {
       # Custom Lua/JS to grep response body
   }
   ```

**Fix path:** Switch the route to SSR (`export const prerender = false`)
and switch `output: 'static'` → `output: 'hybrid'` in `astro.config.mjs`.
Trade-off: requires a Node/edge runtime (Cloudflare Functions, Vercel,
Deno) — breaks pure-static deploy targets like GitHub Pages.

**Tracked in:** ROADMAP.md → v1.2 if there's demand.

### 🟡 `launch.sh` requires bash 3.2+ but uses some bash-specific syntax

**What:** While we explicitly avoid bash-4 features (`mapfile`),
`launch.sh` does use `[[ ... ]]` and `${VAR:-default}` which are bash
extensions, not strictly POSIX sh.

**Workaround:** All targets (macOS, Ubuntu, Alpine, WSL2) ship bash 3+.
If you're on a bash-less system (e.g. Termux without bash, BSD with
only sh), invoke explicitly:

```sh
bash launch.sh
```

instead of `./launch.sh`.

**Fix path:** Out of scope — bash 3.2+ is a reasonable floor.

### 🟢 `pack:dist` tarball includes `.runtime/` if it exists at pack time

**What:** When packing right after a launch, the tarball can include
the runtime PID file and preview log if they're inside the dist (they
shouldn't be, but if someone runs `cp .runtime apps/web/dist/` for
debugging…).

**Workaround:** Don't put runtime artifacts in dist. The pack script
walks the dist directory directly.

---

## Data / schema

### 🟡 Vendor-claimed performance figures are unverified

**What:** Many `tier: official` figures (especially for new chips like
B300, MI355X, Ascend 910C) are sourced from vendor press releases or
keynotes rather than independent third-party measurement. The site
does NOT independently verify these.

**Workaround:** Tier metadata is honest about source — `tier: official`
means "vendor-claimed", not "verified". Use `tier: measured` (Tier 0
case) for any decision-critical comparison. The /quality dashboard
shows tier distribution.

**Fix path:** Crowd-sourced reproduction via deployment cases. Each
new measured case shifts the calibration map and tightens Tier 1
estimates. Currently 18/31 cards have at least one measured case.

### 🟡 China hardware specs partially derived from CloudMatrix announcement

**What:** Ascend 910C / 910B specs in `data/hardware/huawei/` are
partly inferred from CloudMatrix 384 system-level announcements
divided by card count, since Huawei doesn't publish per-card datasheets.

**Workaround:** Disclaimers added in YAML files. Treat with `tier:
estimated` precision in calculator.

**Fix path:** Wait for vendor to publish official datasheets, OR get a
third-party measurement (Tier 0 case).

### 🟡 Memory hierarchy populated for 18 of 39 cards (was 7 in v1.5)

**What:** `architecture.memory_hierarchy` is the richest data structure on Hardware (RF → SMEM → L2 → L3 → HBM with bandwidths and notes). Currently filled for: A100, H100, H200, B200, B300, L40s, MI300X, MI325X, MI355X, Gaudi 3, Trainium 2, TPU v5p, TPU Trillium, MLU590, DCU Z100, MTT S4000, Ascend 910B, Ascend 910C. The other 21 cards have flat headline numbers but no layered hierarchy.

**Workaround:** Cards without hierarchy still render the legacy spec block; the `MemoryHierarchy.astro` component is conditional. Recommendation engine still works (uses bandwidth + capacity from headline fields).

**Fix path:** Backfill data — open candidates: Hygon DCU K100, Moore Threads MTT S5000, Iluvatar Tianhang, Biren BR104, etc. Each card takes ~30 min from vendor whitepaper to YAML. PRs welcome.

### 🟡 Cluster internals filled on 8 of 14 super-pods (was 2 in v1.5)

**What:** Cluster-internals (switch_chips, oversubscription, power, cabinet_layout, SwitchFabric SVG) currently filled for NVL72, GB300 NVL72, HGX H100, HGX H200, CloudMatrix 384, Atlas 900 SuperPoD A2, Atlas 800T A3, Trn2 UltraServer. Remaining 6: HGX H800, Atlas 800, MLU590-pod, Kuae-cluster, MI300X-platform, B300-NVL16.

**Workaround:** All 14/14 super-pods have full coverage on the three architectural axes (host_cpu / network_topology / storage_architecture) — the gap is only in the deeper switch-chip / cabinet detail.

**Fix path:** Same as above — vendor docs / whitepaper → YAML.

### ✅ Reverse recommendations (hardware → models) wired (v1.5+, v1.6)

**What:** Both directions now render: `/models/<slug>/` shows recommended hardware, `/hardware/<slug>/` shows recommended models. Three-axis ranking (throughput / cost / verified) on each side. Calculator deep-link presets included.

### 🟢 Some vendors have no products yet

**What:** A few vendors (e.g. some early-stage Chinese fabless
startups) appear in `data/vendors/` but have no hardware files. They're
included for ecosystem context (the China hub matrix references them).

**Workaround:** None needed — these are placeholders awaiting
release. The audit script flags them.

---

## UI / UX

### 🟡 Compare radar/bar legibility degrades above 8 cards

**What:** Selecting more than 8 cards in `/compare/` shows a soft
warning recommending switch to table view. Radar overlay becomes
unreadable; bar chart x-axis labels overlap.

**Workaround:** The warning IS the workaround — it tells users
explicitly. PALETTE wraps via modulo so all cards still get a color,
just not a unique one.

**Fix path:** Faceted small-multiples view for >8 cards (one mini
chart per metric). Tracked in ROADMAP v1.2.

### 🟢 Calculator MOE memory model doesn't account for expert sharding

**What:** When EP (expert parallel) > 1, the calculator computes
weight memory as `total_params / TP / PP / EP`. In practice, expert
sharding has alignment overhead (rounded up to power-of-2 per device)
that the calculator ignores. Off by ~5–15% for asymmetric splits.

**Workaround:** Fine for back-of-envelope sizing. For tighter numbers,
consult deployment cases or vendor sharding guides.

### 🟢 Dark mode is opt-in via `data-theme="dark"`

**What:** We don't auto-respect `prefers-color-scheme: dark` because
some axe a11y rules failed in dark mode that pass in light. Dark is
available behind a button, not via system preference.

**Workaround:** Click the theme toggle in nav.

**Fix path:** Audit each component's dark-mode contrast against WCAG
AA. Once green, re-enable system preference.

### 🟢 Pricing page TCO is a "compute-only" lower bound

**What:** `/pricing` computes $/M tokens from `(rent + power) /
throughput` only. Excludes datacenter amortization, networking,
licensing, ops headcount.

**Workaround:** The page itself says "Real production $/M tokens are
typically 1.5–3× of this. Use for relative ranking, not absolute
quotes." Honest disclaimer is the workaround.

**Fix path:** Add an opt-in "full TCO" toggle that lets the user dial
in DC overhead %. Tracked in ROADMAP.

---

## Build / CI

### 🟡 Lighthouse CI is a separate workflow, not a CI gate

**What:** `.github/workflows/lighthouse.yml` runs perf budget checks
but is on a weekly cron + manual trigger, not blocking the main `ci`
workflow. A perf regression can land on main and only get caught by
the next cron.

**Workaround:** Run `pnpm exec lhci autorun` locally before pushing
perf-sensitive changes.

**Fix path:** Move Lighthouse into `ci.yml` as a 7th job depending on
`build`. Trade-off: adds ~2 minutes to every PR. Discussed in
ROADMAP v1.2 — opt for a "Lighthouse on PR-with-frontend-changes"
pattern using path filters.

### 🟢 `pnpm validate` runs both schema AND cross-reference checks at once

**What:** A single failure cascades — fix one schema error, the
cross-ref pass might surface 5 more it was hiding.

**Workaround:** Iterate. The output prints all failures, not just the
first.

### 🟢 GitHub Release workflow assumes signed tags

**What:** `release.yml` doesn't enforce that the tag is GPG/SSH-signed.
Anyone with push access can `git tag v9.9.9` and trigger a release.

**Workaround:** Set repo branch protection: require signed tags for
`v*`. (One-time admin config.)

**Fix path:** Add `--verify-signatures` to a release pre-flight step.

---

## Testing

### 🟢 4 E2E tests are skipped by design (470 passed)

**What:** `pnpm test:e2e` reports "470 passed, 4 skipped" as of v1.43. The skipped 4 are visualization tests gated on Recharts rendering inside `pnpm preview`'s static-html-with-late-React-hydration mode.

**Workaround:** They run in `pnpm dev` mode locally. The CI job uses `pnpm preview` for production-mode realism, hence skip.

**Fix path:** Add `await page.waitForFunction(() => document.querySelector('.recharts-surface'))` before assertions.

### 🟢 Playwright traces only uploaded on failure

**What:** Successful E2E runs don't upload traces. Debugging a
flake-on-CI requires re-running with `--trace=on`.

**Workaround:** Re-trigger with workflow_dispatch and a debug branch.

---

## Browser Compatibility

### 🟡 No IE11 / legacy browser support

**What:** Modern browsers only (Chrome 90+, Firefox 90+, Safari 15+).
We use `oklch()` colors, CSS custom properties, ES2022 features.

**Workaround:** None — this is a deliberate choice. Inference
hardware engineers don't run IE11.

### 🟢 Pagefind search requires JavaScript

**What:** ⌘K search is client-side via Pagefind. Without JS, the
search button is a no-op.

**Workaround:** Browse via the catalog pages (`/hardware/`,
`/models/`, `/cases/`) which are fully static and need no JS.

---

## Internationalization

### 🟡 EN translation lags ZH for new content

**What:** When adding a new page or section, ZH dict gets the key
first. EN sometimes ships with English-as-fallback (the i18n function
falls back to ZH text if an EN key is missing).

**Workaround:** PRs are welcome for EN translation gaps. The
fallback prevents 404 / runtime error.

**Fix path:** TypeScript should fail compile when EN dict is missing
keys present in ZH. Currently `keyof typeof dict.zh` types the t()
key but doesn't enforce parity. Could add a type-level assertion.

---

## Performance / scaling

### 🟢 Build time grows linearly with corpus size

**What:** At 39 hardware × 20 models × 41 cases × 451 pages, build is ~1 s. At 200 hardware × 100 models, expect ~10–15 s. Cross-reference resolution is O(n×m).

**Workaround:** None needed at current scale.

**Fix path:** Memoize cross-ref lookups, or migrate to a lazy-loader pattern with per-page data fetching.

### 🟢 Pagefind index is ~3 MB of the 15 MB dist

**What:** Pagefind generates per-page search indices, which dominate
total dist size.

**Workaround:** Lazy-loaded — first search adds ~200 KB to first
interaction. Subsequent are instant.

**Fix path:** Consider stop-words tuning to shrink index.

---

## Reporting Issues

For bugs not listed here: open an issue at
https://github.com/evokernel/evokernel-spec/issues using the
`bug-report` template.

For security issues: see [SECURITY.md](../SECURITY.md).
