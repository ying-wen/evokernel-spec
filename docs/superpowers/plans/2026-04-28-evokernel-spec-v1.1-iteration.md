# EvoKernel Spec — v1.1 Iteration Plan

**Goal:** Close the remaining gaps from the round-2 code review and lift the site from "feature-complete" → "credible reference for AI inference hardware spec data."

**Status of v1.0 (sprints 1–5):** complete. 215 pages built. 72/72 E2E + 23/23 unit pass. Local preview running on http://127.0.0.1:4321.

---

## Round-2 review residue (3 items, ~½ day)

### Task 1.1 — Drop the `void hwTdpW` smell in Calculator

**Files:** [apps/web/src/components/calculator/Calculator.tsx](../../apps/web/src/components/calculator/Calculator.tsx) ResultPanel + Calculator props.

- Remove `hwTdpW` prop from `ResultPanel`. `TCOPanel` already accepts `defaultTdpW` directly.
- Hoist `<TCOPanel>` invocation to the parent (Calculator) so prop wiring is one-hop instead of round-tripped.
- Verify type-check + run calculator E2E group.

### Task 1.2 — Detect "no Tier 0 data for this hardware × CN vendor" condition

**Files:** [apps/web/src/components/calculator/Calculator.tsx](../../apps/web/src/components/calculator/Calculator.tsx) ResultPanel.

- After `r.tier0Cases.length === 0` block, add a sub-notice when the selected `hwId` belongs to a CN-country vendor:
  > "No measured cases yet for this Chinese accelerator. Tier 1 uses the default 0.5 efficiency; expect 30-50% real-world throughput. [Contribute a case →]"
- Need vendor lookup in Calculator props (already passed). Filter via `hardware.find(h => h.id === hwId)?.vendor === 'huawei'|'cambricon'|...`.
- Add 1 unit test against the predicate.

### Task 1.3 — Compare radar/bar legibility at 6-8 selected cards

**Files:** [apps/web/src/components/hardware/CompareTool.tsx](../../apps/web/src/components/hardware/CompareTool.tsx).

- When `selected.length > 6`, automatically force `chartType` to `'table'` with a one-line notice ("Switched to table view: radar/bar are illegible above 6 cards"). Restore on `selected.length ≤ 6`.
- The 8-color PALETTE is enough at table view but radar/bar overlap. This is a per-view-mode soft cap.
- Add E2E for the auto-switch.

---

## Schema & Data quality (3 items, ~1 day)

### Task 2.1 — Extend Hardware schema with `architecture` block

**Files:** [schemas/hardware.ts](../../schemas/hardware.ts) + 28 yaml files.

```ts
const ArchitectureSchema = z.object({
  compute_unit_count: ValueWithEvidenceSchema(z.number().int().positive()).optional(),
  compute_unit_label: z.enum(['SM', 'CU', 'AI Core', 'IPU', 'XPU']).optional(),
  l1_cache_kb_per_cu: ValueWithEvidenceSchema(z.number().positive()).optional(),
  l2_cache_mb: ValueWithEvidenceSchema(z.number().positive()).optional(),
  hbm_stacks: ValueWithEvidenceSchema(z.number().int().positive()).optional(),
  process_node_nm: ValueWithEvidenceSchema(z.number().positive()).optional(),
  die_area_mm2: ValueWithEvidenceSchema(z.number().positive()).optional(),
  transistor_count_b: ValueWithEvidenceSchema(z.number().positive()).optional()
}).optional();
```

Populate fields for the top-8 most-cited cards (H100, H200, B200, B300, MI300X, MI355X, Ascend 910C, Hygon DCU Z100). Other cards stay `undefined` and Topology renders the inferred fallback.

**Why optional:** schema needs to ship before all data is collected. Strict-required would break the build.

### Task 2.2 — Topology renders factual data when present, inferred when absent

**Files:** [apps/web/src/components/hardware/Topology.astro](../../apps/web/src/components/hardware/Topology.astro).

- If `hw.architecture?.compute_unit_count` present, use `value` instead of bucketed `cuCount`. Ditto HBM stacks.
- Replace the "illustrative" disclaimer with a "🟢 vendor floorplan" badge when factual; keep the "⚠ inferred" badge when bucketed.
- Add `<TierChip>` next to each value to show evidence tier.

### Task 2.3 — `getEfficiency` chip-level Tier 0 confidence

**Files:** [apps/web/src/lib/calculator/calibration.ts](../../apps/web/src/lib/calculator/calibration.ts).

- Currently `efficiency.factor` is a single mean. Compute `stddev` and `min/max` over the case sample. When `stddev > 0.15`, surface a "high variance — multiple workload regimes" hint on hardware detail and in calculator.
- Hardware detail Quality block becomes: factor 0.62 ± 0.08 (n=14).

---

## Performance & polish (4 items, ~1 day)

### Task 3.1 — Lighthouse audit + budget regression

**Files:** new e2e/lighthouse.spec.ts, .github/workflows/lighthouse.yml.

- Add Playwright + Lighthouse CI run against /, /hardware/, /calculator/, /china/. Targets: LCP<2.5s, CLS<0.1, INP<200ms, JS<150kb gzip on landing.
- Fail CI when any target slips by >10%.

### Task 3.2 — Pagefind index trimming for /en/

**Files:** astro.config.mjs, public/pagefind config.

- Pagefind currently indexes both /<page> and /en/<page>, doubling the index. Mark zh as canonical and exclude /en/ duplicates from search until detail-page content meaningfully diverges. Result: ~50% smaller pagefind output.

### Task 3.3 — Comparison highlighting in `CompareTool` table view

**Files:** [apps/web/src/components/hardware/CompareTool.tsx](../../apps/web/src/components/hardware/CompareTool.tsx).

- For each metric row, mark the best value with a ★ or color highlight. Helps the user spot winners across 8 cards instantly.
- Already shipped for `CaseCompare`; extract a shared `bestInRow` util to lib/.

### Task 3.4 — Cluster topology for super-pods: animate data flow

**Files:** [apps/web/src/components/hardware/Topology.astro](../../apps/web/src/components/hardware/Topology.astro).

- Add a `<animateMotion>` SVG element to show packet flow along spine→leaf links (respect `prefers-reduced-motion`).
- Adds visual life to the otherwise-static Clos diagram. Keep purely cosmetic — no JS required.

---

## Observability & deployment (3 items, ~½ day)

### Task 4.1 — Cloudflare Pages deployment

**Files:** [DEPLOYMENT.md](../../DEPLOYMENT.md), wrangler.toml.

- Move from "documented" to "deployed." Ship to `evokernel.dev` (or chosen domain).
- Add a CNAME, set NODE_VERSION=22, link CI artifact upload.
- Update README "本地部署" to "公网 + 本地都跑通."

### Task 4.2 — Plausible/Umami opt-in analytics

**Files:** [apps/web/src/layouts/BaseLayout.astro](../../apps/web/src/layouts/BaseLayout.astro).

- Self-hosted, no cookies, no fingerprinting. Surface page views per /hardware/<slug> so we can prioritize next-round data work by traffic.

### Task 4.3 — Structured-data validator in CI

**Files:** new scripts/validate-jsonld.ts.

- Pipe Schema.org JSON-LD output through the official structured-data type checker. Catch silent regressions.

---

## v1.2 horizon (not in scope of this iteration)

- Per-engine cost calibration (vLLM vs SGLang vs MindIE deliver different efficiencies on the same chip).
- MoE expert-distribution heatmap on model detail.
- Auto-translate vendor docs (Ascend CANN release notes → English summary) via Anthropic API as a build-time job.
- Public submission portal (case YAML web form) — currently all contributions are PR-based.

---

## Self-review

**Spec coverage:** ✅ Every CRITICAL/HIGH/MEDIUM item from the round-2 review has a task here.

**Placeholder scan:** ✅ Each task names files + concrete output. No "TBD."

**Type consistency:** ✅ The `architecture` schema uses `ValueWithEvidenceSchema` already in use elsewhere.

**Effort estimate:** Round-2 residue (½d) + Schema (1d) + Polish (1d) + Deployment (½d) ≈ **3 dev-days** for a focused engineer.

**Sequence:** Schema (2.1) blocks 2.2 and 2.3. Otherwise tasks are parallelizable. Recommended order:

1. Round-2 residue (Task 1.x) — clears reviewer backlog, shippable in a day.
2. Schema + Topology factual mode (2.1, 2.2) — biggest correctness win.
3. Lighthouse + Cloudflare (3.1, 4.1) — lifts site to "publicly credible."
4. Everything else.
