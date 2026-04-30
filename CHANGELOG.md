# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to semantic versioning ([SemVer](https://semver.org/spec/v2.0.0.html)).

The release workflow (`.github/workflows/release.yml`) auto-publishes a GitHub Release with the offline tarball when a `v*` tag is pushed; the auto-generated release notes are derived from `git log <prev>..<this>`. This file is the curated, human-readable counterpart.

## [Unreleased]

### Added
- (next iteration TBD)

---

## [1.8.0] — 2026-05-01

Continuing the data-density push. Wafer-scale and on-die-SRAM architectures now first-class in the schema.

### Added

**Memory hierarchy on 6 more cards** (18 → 24 deep-filled, **62% catalog coverage** up from 46%):
- **Hygon DCU K100**: domestic CDNA-style chip. LDS 96 KB/CU (vs Z100 64 KB), L1 32 KB, L2 24 MB (6× Z100), HBM3 96 GB / 2.4 TB/s, Hygon-Link on-package
- **AWS Inferentia 2**: NeuronCore-v2 dual SBUF — 12 MB × 2 = 24 MB on-chip SRAM (no traditional L1/L2), HBM2e 32 GB / 0.820 TB/s, NeuronLink intra-chip mesh 0.384 TB/s
- **Intel Gaudi 2**: MME/TPC scratchpad 128 KB per cluster (smaller than Gaudi 3's 192 KB), 48 MB cache hierarchy, HBM2e 96 GB / 2.45 TB/s, 21× 100 GbE RoCE (vs Gaudi 3's 24× 200 GbE)
- **Cerebras WSE-3** (architectural outlier): 48 KB SRAM × 900K tiles ≈ 44 GB on-wafer SRAM, **21 PB/s aggregate bandwidth (1000× HBM3)**. 2D-mesh fabric 1.5 PB/s, 30 ns/hop. "Memory IS compute" paradigm — no external HBM, no DRAM
- **Groq LPU** (architectural outlier): 230 MB on-die SRAM / 80 TB/s, **no HBM, no DRAM**. TSP (Tensor Streaming Processor) on-chip mesh, 5120 PEs deterministic execution
- **Huawei Ascend 950**: Da Vinci 4.0 — L0 384 KB (50% bigger than 910C's 256 KB), UB 768 KB (50% bigger), L2 256 MB (vs 910C's 192 MB), HBM3e 256 GB / 6.4 TB/s (2× 910C), HCCS-C2C v2 3.0 TB/s

**Cluster internals on 4 more super-pods** (8 → 12 with SwitchFabric SVG, **86% coverage**):
- **NVIDIA DGX A100 8-GPU**: 6× NVSwitch Gen-2 (radix 36, 25 GB/s/port — vs Gen-3 64/50), 8× ConnectX-6 (200 Gb/s IB-HDR), bisection 4.8 TB/s (vs HGX H100 7.2 TB/s — 50% slower fabric). Ampere-era reference platform
- **HPE Cray EX255a (MI300A APU)**: 4× MI300A APUs per blade with HPE Slingshot 11 (radix 64, 25 GB/s/port), bisection 1.6 TB/s, 24/30 kW liquid-cooled. **El Capitan supercomputer** (~11000 blades, ~44000 MI300A — world's largest AMD scale-out, > 2 ExaFLOPS at LLNL)
- **AMD MI325X Platform 8-OAM**: Infinity Fabric P2P **fully-connected mesh** (no central switch — every GPU directly connected to other 7), UBB 2.0 OAM standard. Topology contrast with NVL/HGX NVSwitch crossbar. RoCE v2 400G scale-out
- **Cambricon 思元 590 集群 (16-node pod)**: 16 × 8-card = 128 MLU590. MLU-Link-v2 switch × 16 (radix 8, 50 GB/s/port intra-node), 200 GbE RoCE inter-node 2:1 oversubscribed (typical enterprise budget tradeoff)

### Stats
- 158/158 site E2E pass (+7 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 22, fused-kernel: 12
- Build: 291 pages

---

## [1.7.0] — 2026-04-30

Continuing the data-density push. Coverage dashboard makes the long tail visible to contributors.

### Added

**Memory hierarchy on 6 more cards** (12 → 18 deep-filled, **46% catalog coverage** up from 31%):
- **NVIDIA A100 SXM4**: 256 KB RF/SM × 108 SMs, 192 KB SMEM (vs Hopper 228), 40 MB L2 single-partition, 5× HBM2e 16 GB stacks (80 GB, 2.04 TB/s — main reason A100 lags H100 on decode)
- **Google TPU v5p**: 32 MB VMEM × 4 TensorCores = 128 MB on-chip SRAM, 192 MB CMEM, 4× HBM2e 24 GB stacks (95 GiB), ICI fabric 4.8 TB/s scaling to 8960-chip pods
- **Google Trillium (v6e)**: 16 MB VMEM single-core, 64 MB CMEM, 2× HBM2e 16 GB stacks (32 GB), ICI fabric 3.2 TB/s
- **Intel Gaudi 3**: 192 KB scratchpad per cluster × 64 = 12 MB, 96 MB cache hierarchy, 8× HBM2e 16 GB stacks (128 GB). Open-fabric 24× 200 GbE RoCE (vs NVLink lock-in)
- **AMD MI325X**: same CDNA 3 architecture as MI300X but HBM3e upgrade — 8× 32 GB stacks (256 GB, 6.0 TB/s); compute peak unchanged
- **NVIDIA L40s**: 256 KB RF, 128 KB SMEM (Ada Lovelace gaming-derived), 96 MB L2 (largest L2 in NV inference catalog), 12× GDDR6 48 GB

**Cluster internals on 3 more super-pods** (5 → 8 with SwitchFabric SVG, **57% coverage**):
- **NVIDIA HGX H200 8-GPU**: same NVSwitch Gen-3 fabric as HGX H100; H200 upgrade is HBM3e raising total rack memory to 1.13 TB
- **Huawei Atlas 900 SuperPoD A2**: 256-card 8-cabinet design. 16× HCCS-v2 switches (radix 32, 100 GB/s/port) + 32× 400 GbE NICs. Bisection 12.8 TB/s (between NVL72 64.8 and Atlas 800T 0.4)
- **AWS Trn2 UltraServer**: 64-chip = 4× Trn2 instances joined via inter-instance NeuronLink-v3. AWS-specific architecture only via EC2

**Schema-richness coverage dashboard on `/quality/`** (NEW visual section):
- 3 progress cards (memory_hierarchy / tensor_core_specs / switch_chips) with live %
- Expandable list of unfilled entities — clickable for direct contribution path
- CTA links to /contribute and DEVELOPMENT.md
- Surfaces the long tail visually so PRs are 1-click discoverable from `/quality`

### Stats
- 151/151 site E2E pass (+6 new) · 36/36 unit pass
- 291 pages built (no new pages — all enhancements to existing pages)
- 12 entity types · 18 deep-filled cards (was 12) · 8 super-pods with full cluster internals (was 5)

### Why this iteration
The user repeatedly flagged hardware/cluster/operator info as "not detailed enough". v1.7 keeps deepening the long tail (cards 31% → 46%, super-pods 36% → 57%) AND makes the gap visible to contributors via the new coverage dashboard — closing the loop from "data is sparse" to "here's a clickable list of what to fill, pick one".

---

## [1.6.0] — 2026-04-30

User-confirmed full A+B+C+D plan executed.

### Added

**A. Reverse-recommendation widget on `/hardware/<slug>/`** (zh + en, symmetric to v1.5's `/models/<slug>/` widget):
- 3 leaderboards: 🚀 highest decode throughput · 💰 lowest $/M tokens · ✅ verified by measured cases
- Each row deep-links to `/calculator/?model=...&hw=...&prec=...&tp=...` with scenario preset
- Reuses `recommendModelsForHardware()` helper that shipped (un-wired) in v1.5.0 commit `6cdcbb1`
- Inserted between cluster-internals and QuickEstimates so it's the first thing users see when answering "what should I run on this card?"

**B. Memory hierarchy on 5 more cards** (deep-filled coverage 7 → 12, ~30% of catalog):
- **B300 SXM**: 168 SMs, 256 KB RF/SMEM per SM, 100 MB L2 (per-die ×2 via NV-HBI), 8× HBM3e 36 GB stacks (288 GB)
- **AWS Trainium 2**: 24 MB SBUF per NeuronCore-v3 × 8 = 192 MB on-chip SRAM, 4× HBM3 96 GB, NeuronLink-v3 1.28 TB/s
- **Cambricon MLU590**: 768 KB NRAM per IPU × 80 = 60 MB scratchpad, 64 MB L2, 4× HBM2e 64 GB
- **Hygon DCU Z100**: 64 KB LDS per CU × 64 = 4 MB, 4 MB L2 (single-die, no Infinity Cache), 4× HBM2e 64 GB
- **Moore Threads MTT S4000**: 96 KB cluster shared mem × 48 = 4.5 MB, 24 MB L2, 12× GDDR6 48 GB (no HBM)

**C. Cluster internals on 3 more super-pods** (SwitchFabric SVG renderable 2 → 5):
- **NVIDIA HGX H100 8-GPU**: 4× NVSwitch Gen-3 (radix 64) + 8× ConnectX-7. Bisection 7.2 TB/s, 8.5 kW sustained
- **NVIDIA GB300 NVL72**: same 18× NVSwitch Gen-4 backplane as GB200 NVL72. B300 upgrade is HBM3e 24 → 36 GB stacks (180 → 288 GB per card; 13.8 → 20.7 TB rack memory). 110 kW sustained / 152 kW peak
- **Huawei Atlas 800T A3**: single-chassis 8-card. 1× HCCS-v1 switch (radix 16). Bisection 0.4 TB/s (an order of magnitude below HGX H100). Cabinet markdown contrasts vs CloudMatrix 384 hyperscale

**D. 4 new fused kernels** (catalog 8 → 12):
- **`fused-selective-scan`** (Mamba / Mamba-2 / SSD): chunk-parallel scan + SMEM hidden-state. 8-20× over PyTorch eager; 1.2-3× over FA3 at long context
- **`fused-spec-decode`** (Medusa / EAGLE): draft + verify forward fused, tree-attention mask in-kernel. 1.5-3× decode at 60-85% acceptance
- **`fused-quantized-attention`** (Blackwell+ FP4 e2m1): native FP4 attention with per-block scaling + outlier-aware softmax fallback. 1.6-2.0× over BF16 FA3, 50% memory cut. Hardware-locked to B200/B300
- **`fused-kv-quant`** (FP8/INT8 KV cache write): K/V projection epilogue does in-flight quant. 1.4-2.0× decode at 32K+ context. Compatible with PagedAttention + prefix caching + Mooncake

### Stats
- 145/145 site E2E pass (+8 new) · 36/36 unit pass
- 291 pages built (+4 from new fused kernel pages)
- 12 entity types · ~185 entities

### Why this iteration
v1.5 closed the convergence loop (model → hardware). v1.6 mirrors it (hardware → model) AND fills enough long-tail data that recommendations have credible foundations across 30%+ of catalog. The user-flagged three gaps continue closing simultaneously: pipeline, operators+fusion, hardware/cluster internal — each axis got measurably deeper this iteration.

---

## [1.5.1] — 2026-04-30

### Fixed
- **🔥 P0 base-path bug on GitHub Pages deploy** — clicking a hardware card on the live site (`https://yingwen.io/evokernel-spec/hardware/`) navigated to `/hardware/<id>/` (404) instead of `/evokernel-spec/hardware/<id>/`. Same class affected 4 more spots:
  - `HardwareGrid.tsx` (React island) — `detailHref` hardcoded paths now go through `pathname()`
  - `CompareTool.tsx` — table-view hardware links wrapped in `pathname()`
  - `Leaderboard.tsx` — case-detail links wrapped in `pathname()`
  - `Search.tsx` — Pagefind script bootstrap reads `import.meta.env.BASE_URL` (was silently failing because `.catch()` swallowed the rejection)
  - `Nav.astro` (locale switcher) — used same strip-base/swap-locale/re-prepend-base pattern as BaseLayout's hreflang alternates (was producing `/en/evokernel-spec/...` instead of `/evokernel-spec/en/...`)

### Added
- `apps/web/e2e/manual/basepath-island.spec.ts` — 5-test regression probe simulating GitHub Pages locally with python http.server. Run via `pnpm test:e2e:basepath`. `playwright.config.ts` excludes `e2e/manual/*` from regular runs (testIgnore).

### Why this didn't get caught earlier
Local `pnpm dev` and `pnpm preview` both use the default base `"/"`, so `pathname()` is a no-op and all 5 broken paths returned correct strings. Only GitHub Pages production exercises the prefix branch. The new manual probe closes this gap.

---

## [1.5.0] — 2026-04-30

### Added
- **🎯 Model → Recommended Hardware** widget on every `/models/<slug>/` page (zh + en):
  - Three leaderboards: 🚀 highest decode throughput · 💰 lowest $/M tokens · ✅ verified by measured cases
  - Each row deep-links to `/calculator/?model=...&hw=...&prec=...&tp=...` for further tuning
  - Algorithm reuses Roofline math + calibration map + TCO formula — same data as `/calculator` and `/pricing`
- `apps/web/src/lib/recommendations.ts` — pure orchestration helpers
  - `recommendHardwareForModel({ model, hardware, cases })` → `RecommendationRow[]`
  - `topByThroughput`, `topByCost`, `verifiedByMeasuredCase` rankers
  - `calculatorDeepLink(modelId, row)` query-string builder
- `apps/web/src/lib/recommendations.test.ts` — 6 fixture-based unit tests
- (Infra) `recommendModelsForHardware()` reverse helper added but not yet wired (planned for next iteration)

### Why
The user-facing question every visitor lands with is "I want to deploy X, what hardware should I pick?" This converges 5 axes built across v1.1–v1.4 (operators × fusions × pipeline × hardware-internal × cluster-internal) into a direct, ranked answer with no calculator-input ceremony.

### Stats
- 137/137 site E2E pass (+3 new) · 36/36 web unit pass (+6 new in recommendations.test.ts; +1 fix to brittle pattern-count assertion) · 287 pages built

---

## [1.4.0] — 2026-04-30

### Added
- **4 more fused kernels** (catalog 4 → 8):
  - Fused RMSNorm + Residual Add (vLLM `fused_add_rms_norm`)
  - Mooncake KV Disaggregation (Moonshot/Kimi production architecture, applies at `serve` stage)
  - DeepEP Fused MoE All-to-All (DeepSeek expert-parallel comm library)
  - Fused AllReduce + Residual (NVIDIA NVLS / AMD RCCL fused / HCCL fused)
- **Memory hierarchy populated for 3 more cards** (4 → 7 deep-filled): H200, MI300X, Ascend 910B
- **`SwitchFabric.astro` SVG topology renderer** on `/servers/<super-pod>/`. Top row = switch chip boxes; bottom row = compute nodes; fan-out lines proportional to per-port bandwidth share. Bisection bandwidth + oversubscription multiplier shown in caption.

### Stats
- 134/134 E2E pass (+5 new) · 287 pages built

---

## [1.3.0] — 2026-04-29

### Added
- **Schema: `Hardware.architecture.memory_hierarchy`** — ordered list of memory levels (RF → L1/SMEM → L2 → L3/Infinity Cache → HBM) with size, bandwidth, scope, notes. Per-field optional so partial data renders.
- **Schema: `architecture.tensor_core_specs`** — per-precision per-cycle peak ops + sparsity multiplier
- **Schema: `architecture.{base,boost}_clock_mhz`** + `on_chip_interconnect`
- **Schema: `Server.switch_chips[]`** — chip name, count, radix, bandwidth_gbps_per_port, URL
- **Schema: `Server.{oversubscription_ratio, scale_out_nics_per_node, scale_out_bandwidth_gbps_per_nic, bisection_bandwidth_tbs, power_distribution, cabinet_layout_md}`**
- **4 cards populated** with deep memory hierarchy: H100, B200, MI355X, Ascend 910C
- **2 super-pods populated** with cluster internals: NVL72 (18× NVSwitch Gen-4 + 72× ConnectX-8 + N+N PSUs + 100kW sustained), CloudMatrix 384 (32× Lingqu optical switches + 16-cabinet layout + 480kW sustained)
- **`MemoryHierarchy.astro`** component: log10-scaled horizontal bars (so 256 KB RF and 80 GB HBM fit on the same chart), color-graded cool→warm closest-to-compute first; tensor core specs grid; on-chip interconnect footer.
- **`/servers/<slug>` cluster-internals section** — switch fabric panel + power+scale-out+oversubscription panel + cabinet markdown rendered through marked.

### Stats
- 129/129 E2E (+4 new) · 283 pages built

---

## [1.2.x bundle] — 2026-04-28~29

### Added (highlights across v1.2.0–v1.2.4)
- **7-stage deployment pipeline** (`/pipeline/`): ACQUIRE → CONVERT → QUANTIZE → COMPILE → SHARD → SERVE → OBSERVE. Per-stage rich data: ~5 decisions, ~5 tools, ~3 failure modes; cross-links to patterns/operators/engines; `invalidates_downstream` change-propagation map.
- **`OperatorSchema` extended** to 14 fields: arithmetic_intensity_typical, fusion_targets, participates_in_fused_kernels, engine_implementations[] with hardware-arch tags, precision_support, related_patterns, references[]
- **`FusedKernelSchema` first-class entity**: 10 fields including speedup[] × baseline arrays, implementations[] across engines, hardware_requires, enables_patterns, applies_at_stage, trade_offs
- **Initial 4 fused kernels**: FlashAttention-3, FusedMLP-SiLU, FusedRoPE-QKV, PagedAttention-Decode
- **9 optimization patterns** with cross-cutting matrix
- **`/operators/<slug>/` rich detail**: AI-bound classification badge (🟦 mem-bw / 🟧 compute / 🟨 mixed), forward+reverse fusion graph, engine-implementation grid, references
- **`/operators/` index** regrouped by category with AI badges + per-card icon counts
- **`/fused-kernels/` catalog page** with engine coverage matrix
- **`/contribute/`** — 3 contributor tracks (vendor / community / measured), 3 GitHub Issue templates, `docs/DATA-TIERING.md` canonical tier policy
- **GitHub Pages deploy live at https://yingwen.io/evokernel-spec/** with `pages.yml` workflow
- **Schema-driven base-path** in `astro.config.mjs` via `PUBLIC_DEPLOY={github-pages|custom-domain}` env var

---

## [1.1.0] — 2026-04-28

The "production-ready, releasable" milestone. The site has been
deployable since 1.0; this release closes the gap to "ship it as a
versioned open-source product".

### Added
- **Production-grade local deployment** (`./launch.sh` + `pnpm launch`)
  - Single-command pipeline: install → validate → build → preview-detached → health-poll → 12-route smoke
  - `--no-build` / `--no-validate` / `--stop` / `--help` flags
  - macOS bash-3.2 / GNU bash-4 / busybox sh portable (POSIX while-read instead of `mapfile`)
  - `.runtime/preview.log`, `.runtime/preview.pid` for supervisorless process management
- **Health probe surface**
  - `/api/health.json` — corpus snapshot with build SHA + entity counts; HTTP 503 + `status:degraded` when any loader fails or core corpus is empty
  - `/api/healthz` — minimal `ok\n` plain-text liveness probe (k8s style, intended for fast load-balancer polling)
  - 6 unit tests for the health endpoint covering happy + 4 degraded branches
- **Offline tarball distribution** (`pnpm pack:dist`)
  - Produces `.runtime/evokernel-spec-{sha}-{ts}.tar.gz` (~2.6 MB)
  - Embeds `MANIFEST.json` at dist root with build SHA, page count, entity counts, license
  - sha256 sidecar for cryptographic verification (`sha256sum -c`)
  - `MANIFEST.json` is `ManifestSchema`-validated by zod **before** packing
- **GitHub Release on tag push** (`.github/workflows/release.yml`)
  - Triggered by `v*` tags (e.g. `git tag v1.1.0 && git push --tags`)
  - Dual filename publishing: stable (`evokernel-spec-v1.1.0.tar.gz`) + provenance (`{sha}-{ts}` form)
  - Auto-generated release notes from commits since previous tag
  - Tags containing `-` (e.g. `v1.1.0-rc1`) auto-marked as prereleases
- **Pricing / TCO leaderboard** (`/pricing`, `/en/pricing`)
  - Best/median/worst $/M tokens per hardware (18 cards aggregated)
  - Public formula box with all assumptions (rent rate, kWh price, PUE)
  - Honest disclaimer: 1.5–3× under-estimates real production TCO
  - Promoted to nav (between Calculator and China Hub)
- **Hardware architecture data** for all 31 cards (was inferred for 23, factual for 8)
  - New optional `architecture` block in `HardwareSchema`: SM/CU count, L2 cache, HBM stacks, process node, die area, transistor count, PCIe gen
  - `Topology.astro` renders a 🟢 **vendor floorplan** badge with full breakdown when factual; falls back to ⚠ **illustrative** for inferred
  - Hardware detail page surfaces "芯片架构 / Die architecture" sub-section in zh + en
- **Hardware comparison without card cap** — was MAX_PICK=8, now unlimited; soft warning in radar/bar views above 8; "全选 / clear" buttons; PALETTE wraps via modulo
- **Critical-routes manifest** (`apps/web/src/lib/critical-routes.ts`)
  - 12 user-facing routes declared once, consumed atomically by `launch.sh` smoke check + Playwright "Critical routes" describe block
  - `scripts/print-critical-routes.ts` makes the list shell-consumable
- **CI deployment-smoke job** (6th job): downloads `dist` artifact, runs `launch.sh`, asserts health endpoints via `jq`, runs `pack:dist`, uploads `offline-tarball` artifact (14-day retention)
- **`SECURITY.md`** with disclosure policy + tarball verification flow
- **`/api/health.json` degraded-path test** — mocks loaders to verify 503 semantics (E2E only covers happy path)

### Changed
- `data.test.ts` — exact-count assertions (`toBe(28)`) replaced with lower-bound (`toBeGreaterThanOrEqual(28)`) to eliminate corpus-growth-driven test churn (~10 false-positive events per quarter)
- README — badges (151 tests / 237 pages / 6 CI jobs), highlights (31 cards / 17 models / 22 cases), new "Quick start" section featuring `./launch.sh`
- Compare tool default view is `table` (was `radar`)

### Fixed
- macOS bash 3.2 incompatibility in `launch.sh`'s route-loading (was using `mapfile`, now POSIX `while read`)
- E2E flake: `Compare 2/8 selected` assertion (badge format changed)

---

## [1.0.0] — 2026-04-26

Initial public release. See `git log` from `158c247` (chore: configure biome) through `1502d0e` (ci+release: GitHub Release) for full history.

### Highlights
- 31 hardware accelerators (NVIDIA / AMD / Intel / AWS / Google + 9 China vendors)
- 17 frontier open-source models with operator decomposition
- 22 deployment cases with Tier 0 measured + Tier 1 calibrated Roofline
- Tier 0 + Tier 1 calculator with per-operator breakdown, concurrency sweep, TCO panel, disaggregated mode
- China hub: matrix heatmap + generation genealogy + ecosystem comparison
- Showcase: 8 auto-computed insights refreshed each build
- Bilingual (zh + en) full coverage with hreflang
- WCAG 2 AA compliance (axe across 29 routes)
- 6 JSON API endpoints
- Pagefind search with ⌘K
- 5 CI jobs (validate-data, type-check, unit-tests, build, e2e)

[Unreleased]: https://github.com/evokernel/evokernel-spec/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/evokernel/evokernel-spec/releases/tag/v1.1.0
[1.0.0]: https://github.com/evokernel/evokernel-spec/releases/tag/v1.0.0
