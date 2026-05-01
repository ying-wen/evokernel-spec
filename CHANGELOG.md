# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to semantic versioning ([SemVer](https://semver.org/spec/v2.0.0.html)).

The release workflow (`.github/workflows/release.yml`) auto-publishes a GitHub Release with the offline tarball when a `v*` tag is pushed; the auto-generated release notes are derived from `git log <prev>..<this>`. This file is the curated, human-readable counterpart.

## [Unreleased]

### v1.35+ horizon

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full prioritized plan. Summary:

**Tier 1 remaining (high-leverage, low-effort)**:
- Citation PR onboarding (real external citations to populate /impact/)
- More tours (SD3/Flux diffusion, Kimi K2.6 on B200, GPT-OSS on Atlas)

**Tier 2 (medium-leverage)**:
- Per-engine cost calibration matrix (vLLM vs SGLang vs MindIE)
- Auto-translated vendor doc summaries (CANN/Neuware/MindIE → English)
- Operator → fused-kernel DAG visualization
- Public submission portal (web-form-to-PR)
- Citation auto-import (Twitter/X mentions, GitHub backlinks, arxiv)

**Tier 3 (large bets)**:
- Interactive deployment-journey visualization
- Real benchmark CI runner (auto-refresh case data on rented GPUs)
- Multi-language expansion (ja/ko/es/fr)
- Private deployment edition

---

## [1.34.0] — 2026-05-02

**`/changelog/` public page + `/feed.xml` RSS feed.** Returning visitors and would-be contributors can now subscribe to releases. Complement to v1.18's `/impact/` dashboard — that one shows *that* the project is alive; this one shows *what's happening*.

### Added

**`/changelog/`** (NEW public page):
- Renders all releases from `CHANGELOG.md` in a single scrollable page
- 4 stat cards: total released versions / first version / latest version / RSS subscribe CTA
- Month-grouped TOC for fast navigation across many releases
- Each release: anchor-linkable header (`#v1.34.0`), GitHub Release tag link, full markdown body rendered as HTML
- Sticky month headers for orientation while scrolling
- Pre-existing `marked` library reused for markdown rendering

**`/feed.xml`** (NEW RSS feed):
- Auto-generated from `CHANGELOG.md` parsed at build time
- Uses Astro's official `@astrojs/rss` (already a dependency from `/cases.xml`)
- Skips "Unreleased" placeholder; only versioned releases included
- Each item: `vX.Y.Z — DATE` title, summary from first body paragraph (220 char cap), pubDate, link to `/changelog/#vX.Y.Z`
- 33 releases currently in feed (back to v1.0.0)

**`apps/web/src/lib/changelog.ts`** (NEW shared parser):
- Single `getReleases()` function, build-time cached
- Walks up from build cwd to find `CHANGELOG.md` at repo root
- Splits on `## [version] — date` headers; tolerant of em-dash / hyphen / en-dash separators
- Both `/changelog/` page and `/feed.xml` consume the same parsed output — single source of truth

**RSS auto-discovery**: `BaseLayout.astro` now emits two `<link rel="alternate" type="application/rss+xml">` tags in `<head>` — one for cases (existing), one for releases (new). Browser RSS readers auto-detect both.

**Nav wiring**: About dropdown gains a 5th item — Changelog (alongside Quality / Impact / Contribute / About).

### Fixed
- Pre-existing E2E test `'home has OpenGraph and Twitter meta'` was strict-mode-asserting only one RSS link existed — updated to assert at least 2 (with both `/cases.xml` + `/feed.xml` in the set).

### Stats
- 392/392 site E2E pass (+6 new) · 36/36 unit pass
- Build: 425 pages
- 33 releases in feed (v1.0.0 → v1.33.0)
- About dropdown count: 5 items (was 4)

---

## [1.33.0] — 2026-05-02

**Capstone: unified `/servers/cluster-internals/` view.** v1.27/28/29 built per-axis matrices for compute / fabric / storage. Those are good for *per-axis* analytical queries ("rank all super-pods by bisection bandwidth"). But they don't answer the *per-pod* orientation question ("show me everything cluster-internal about NVL72 in one row"). v1.33 adds that view as the gap-1 capstone.

### Added

**`/servers/cluster-internals/`** (NEW unified view):
- 5 stat cards highlighting architectural dividers: total / GPU-coherent host / SHARP-class fabric / GDS-capable storage / **all-three (顶级架构)**
- 14 per-pod rows, each with 3 card sections (compute / fabric / storage)
- Each section surfaces 3-4 highest-signal fields, with accent-border + chip badge when the pod has the flagship feature on that axis (coherent / SHARP / GDS)
- Special "三轴全 ✓" red border highlight for super-pods with all three flagship features (currently 2: NVL72 / GB300 NVL72)
- Cross-links to all 3 per-axis matrices for deeper analytical drill-down
- Sorted: coherent-host pods first, then by card_count desc

**Nav wiring**: Tools dropdown gains an 8th item — Cluster internals overview (alongside compare / 3 matrices / capacity-planner / pricing / showcase).

### Why both views (per-axis matrices + per-pod unified)
- **Per-axis matrices** (`/servers/host-cpu-matrix/` etc.): optimize for analytical queries. "Show me all super-pods sorted by latency."
- **Per-pod unified** (`/servers/cluster-internals/`): optimize for orientation. "Show me NVL72's full architecture in one row."

Same data, two access patterns. The user's mental model picks one.

### Stats
- 386/386 site E2E pass (+5 new) · 36/36 unit pass
- Build: 424 pages
- Tools dropdown count: 8 items (was 7)

---

## [1.32.0] — 2026-05-02

**Interactive capacity-planning calculator.** v1.31 wrote the sizing math; v1.32 turns it into a form-based tool. Same logic, computable surface — picks (model × hardware × precision × workload), produces recommended card count with full 7-step derivation visible inline.

### Added

**`/calculator/capacity-planner/`** (NEW interactive tool):
- React island form with 9 inputs: model / hardware / weight precision / KV precision / QPS / avg output tokens / max context / concurrent sessions / headroom %
- 27 supported hardware cards + 19 models (auto-derived from catalog)
- Per-hardware median decode tok/s/card extracted from cases (median across all matching deployments)
- Recommendation card: `N× <hardware>` with TP + headroom shown prominently
- 7-step derivation panel — every formula visible (A weight, B KV/session, C activation, D total/card, E recommended TP, F throughput→cards, G max + headroom)
- Smart warnings: KV cache overflow / FP4 on non-Blackwell / single-card-doesn't-fit / 64+ cards needs super-pod
- Disclaimer: ±20% accuracy, day-1 starting point not final answer

**Cross-links**:
- `/learn/capacity-planning/` (static guide) now has a prominent CTA box pointing to the interactive tool
- Calculator footer links back to picking-engine, observability, and the static guide for full chain

**Nav wiring**: Tools dropdown gains a 7th item (capacity calculator alongside compare / matrix views / pricing / showcase).

### Implementation notes
- `client:only="react"` directive — pure-client island avoids hydration mismatch since the calculator's state has no useful server render
- `useMemo` for derived `model`, `hw`, `result` — only recomputes on input change
- Trimmed model + hardware payloads to only the fields the calculator needs (keeps island JS small)
- Median over case-derived decode rates as decode_tok_s_per_card fallback

### Stats
- 381/381 site E2E pass (+7 new) · 36/36 unit pass
- Build: 423 pages
- Same content counts as v1.31 (no new patterns / cases / operators added; the win is the interactive surface)

---

## [1.31.0] — 2026-05-02

**Capacity planning (deployment chain step 0) + LoRA multiplexing pattern + comprehensive roadmap.**

This is the iteration that closes the deployment chain at the *front* end. v1.30 added the post-deployment guides (observability + lifecycle); v1.31 adds the *pre*-deployment guide (capacity planning). The full chain now reads top-to-bottom in 7 sequential steps.

### Added

**`/learn/capacity-planning/`** (NEW educational guide):
- 4 input categories you must have before sizing (model specs / workload profile / SLO budget / hardware options) — each with concrete questions + how-to-get-it
- 7-step sizing formula chain (A → G): weight HBM → KV cache → activation → throughput → long-context correction → parallelism → SLO validation
- Complete worked example (Llama 4 Scout 109B FP8 on H200, 100 QPS, 32K context → 3-node × 8-H200 + TP=2 + KV-INT8)
- 6 common sizing mistakes with fixes
- Closing 7-step deployment chain summary linking to all sibling /learn/ guides

**1 more pattern** (23 → 24): `lora-adapter-multiplexing`
- Punica / S-LoRA / vLLM multi-LoRA — serve 100s of fine-tuned models from one base
- 7-10x cost saving for multi-tenant SaaS
- Trade-offs: BGMV overhead ~5-10%, cold LoRA swap 50-200 ms, rank standardization required

**`docs/ROADMAP.md`** (refreshed):
- Replaces stale v1.5.1-era roadmap (archived to ROADMAP.archived-v1.5.1.md)
- Captures the complete v1.17 → v1.31 arc + state of all entities
- Three-tier prioritized future work: high-leverage low-effort / medium / large bets
- Process notes for next contributor (release cadence, schema-extension recipe, test budget)

### Final 7-step deployment optimization chain
0. **Capacity planning** → /learn/capacity-planning/ ← v1.31 NEW
1. **Pick engine** → /learn/picking-engine/
2. **Pick quantization** → /learn/quantization-decision-tree/
3. **Pick parallelism** → /learn/parallelism-cheatsheet/
4. **Anticipate failures** → /learn/deployment-failures/
5. **Monitor** → /learn/observability/ ← v1.30
6. **Iterate** → /learn/production-lifecycle/ ← v1.30

### Stats
- 374/374 site E2E pass (+6 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 38, fused-kernel: 24, playbook: 24, **pattern: 24**, operator: 29, citation: 1, tour: 8
- Build: 422 pages
- /learn/ guides: 10 (was 9) — capacity-planning added

---

## [1.30.0] — 2026-05-02

Closes the deployment optimization chain (gap-3) at the post-deployment lifecycle layer. Until now the site covered *how to deploy* (playbooks, cases, patterns) but not *how to operate*. v1.30 adds the missing post-deployment knowledge: observability (what to monitor / which tool / alert thresholds) + lifecycle (rollout / A/B / migration / rollback). Plus 2 more operators completing key MoE + speculative paths.

### Added

**`/learn/observability/`** (NEW educational guide):
- 4 metric tiers: Golden signals (Tier 1) → GPU/NPU utilization (Tier 2) → Service-level SLO (Tier 3) → Quality drift (Tier 4)
- Per-stack tooling for 5 ecosystems: NVIDIA (DCGM/Triton/vLLM), AMD (rocm-smi/profiler), Intel Gaudi (hl-smi), Huawei Ascend (npu-smi/MindIE), Cambricon (cnmon)
- 6 diagnostic playbooks mapping symptom → metric signature → likely causes → fix path. Each cross-links to relevant patterns
- Alert threshold guidance (page vs ticket vs ignore) baked into every metric

**`/learn/production-lifecycle/`** (NEW educational guide):
- 4 rollout strategies: Canary / Blue-Green / Shadow / Progressive — with concrete pros/cons/best-for/worst-for
- A/B test matrix: 4 common LLM scenarios (quant precision / engine / hardware / model version) with sample size + duration + gotchas
- 5 migration paths with blocking-changes + validation-path: NVIDIA→AMD, NVIDIA→Ascend, BF16→FP8, BF16→FP4 (Blackwell), vLLM→SGLang
- Rollback principles: 4-piece rollback kit + when-to-trigger / when-not-to-trigger / hidden-costs
- Closing summary section linking to the full 5-step deployment chain (engine → quant → parallelism → failures → observability)

**2 more operators** (27 → 29):
- `expert-permute`: MoE token routing op — the actual data shuffle behind moe-gate. Critical for understanding DeepEP and EP scaling. Bound to `fused-moe-dispatch-deepep` fused kernel
- `speculative-verify`: Speculative decoding's verify step — the op that takes draft model's K candidate tokens and validates against target model in parallel. Acceptance rate determines speedup (50% → 1.5x, 85% → 3.5x). Connected to flash-mla, fused-mtp-head, fused-spec-decode

**Nav + homepage Learn section now exposes 9 guides** (was 7):
- /learn/ overview, tours, quantization-decision-tree, parallelism-cheatsheet, picking-engine, attention-variants, deployment-failures, **observability** (NEW), **production-lifecycle** (NEW)

### Three architectural axes — 14/14 super-pods covered (no change from v1.29)
- v1.27: `host_cpu` — compute axis
- v1.28: `network_topology` — fabric axis
- v1.29: `storage_architecture` — persistence axis

### Deployment optimization chain — 5-step coverage (gap-3 closed)
1. **Pick engine** → /learn/picking-engine/
2. **Pick quantization** → /learn/quantization-decision-tree/
3. **Pick parallelism** → /learn/parallelism-cheatsheet/
4. **Anticipate failures** → /learn/deployment-failures/
5. **Monitor + iterate** → /learn/observability/ + /learn/production-lifecycle/ ← v1.30

### Stats
- 368/368 site E2E pass (+11 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 38, fused-kernel: 24, playbook: 24, pattern: 23, **operator: 29**, citation: 1, tour: 8
- Build: 420 pages
- /learn/ guides: 9 (was 7) — observability + production-lifecycle added

---

## [1.29.0] — 2026-05-02

Continuing the gap-1 cluster-internal trilogy. After v1.27 host_cpu (compute axis) and v1.28 network_topology (fabric axis), v1.29 adds **storage_architecture** as the third axis — covering parallel FS, GPU Direct Storage, local NVMe, checkpoint strategy. All 14 super-pods now have all three architectural axes populated. Plus 1 new pattern bridging storage → compute, and 2 new operators.

### Added

**`storage_architecture` server schema field**:
- 12 FS family enum: lustre, gpfs-spectrum-scale, weka, daos, beegfs, cephfs, pure-flashblade, vast, object-store-s3-compat, cloud-managed, none, other
- 5 checkpoint strategy enum: local-nvme, parallel-fs, object-store, hybrid, unknown
- Fields: `local_nvme_per_node_tb`, `parallel_fs_pb`, `parallel_fs_family`, `gpu_direct_storage`, `rdma_storage`, `checkpoint_strategy`, `aggregate_read_bandwidth_gbps`, `notes`

**`storage_architecture` populated on all 14 super-pods (100%)**:
- NVL72 / GB300 — Weka + GDS + hybrid checkpoint (hot NVMe + cold Weka)
- HGX H100 / H200 / DGX A100 — Lustre + GDS + parallel-fs checkpoint
- MI325X Platform — Weka + RDMA but no GDS (DirectGMA experimental)
- El Capitan EX255a — ClusterStor E1000 (Lustre) + 11 TB/s aggregate
- AWS Trn2 — S3-compat cloud-native (no GDS, object store)
- CloudMatrix 384 / Atlas 900 / Atlas 800T — OceanStor + NPU Direct Storage (国产 GDS)
- Cambricon MLU590-pod / Moore Threads KUAE — host-bounce path (no GDS equivalent yet)

**`/servers/storage-matrix/`** (NEW comparison view):
- 9-dimension side-by-side table: local NVMe / parallel FS capacity / FS family / checkpoint strategy / aggregate read / GDS / RDMA / GPU count / notes
- Best-value highlighting (max NVMe, max FS capacity, max read bandwidth)
- FS family distribution chips (5+ families across 14 super-pods)
- "Why storage architecture matters" section with 4 trade-off cards: GDS divider / NVMe reload / 信创 OceanStor / cloud-vs-on-premise
- Cross-links to hot-cold-kv-tiering pattern + host-cpu + network-topology matrices (the trilogy)

**Per-server detail page surfaces storage_architecture**:
- New "存储架构" card alongside host_cpu, network_topology, switch_chips, power
- Accent border when `gpu_direct_storage === true` (visual encoding for GDS-class systems)
- All 8 storage fields rendered + cross-link to /servers/storage-matrix/

**1 more pattern** (22 → 23):
- `weight-streaming-prefetch`: bridges storage → compute. When model weights exceed HBM, GDS-capable systems prefetch next layer's weight from NVMe/FS while current layer computes. Layer-aware scheduler + double-buffering. Implemented in NVIDIA Magnum IO + Dynamo, TRT-LLM 0.13+. Distinguished from `hot-cold-kv-tiering` (KV data, not weights)

**2 more operators** (25 → 27):
- `mla-attention`: DeepSeek V2/V3/V4 Multi-head Latent Attention. Caches latent vector instead of K/V — KV cache 4-8× smaller than GQA, ~30× smaller than MHA. The reason DeepSeek V3 671B + 32K context is deployable. Bound to `flash-mla` fused kernel
- `memcpy-async`: cross-device DMA primitive (host↔device, GPU↔GPU peer, GPU↔NVMe via GDS). Referenced everywhere but was never an explicit operator. Now properly bound to hot-cold-kv-tiering, kv-cache-cpu-offload, weight-streaming-prefetch patterns.

### Three architectural axes — 14/14 super-pods covered on all of them
- v1.27: `host_cpu` — compute axis (Grace, EPYC, Sapphire, Kunpeng, Graviton)
- v1.28: `network_topology` — fabric axis (full-mesh, fat-tree, dragonfly+, torus, optical)
- v1.29: `storage_architecture` — persistence axis (Lustre, Weka, OceanStor, S3, GDS)

### Stats
- 357/357 site E2E pass (+11 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14 (**14 with all three axes**), model: 19, case: 38, fused-kernel: 24, playbook: 24, **pattern: 22**, **operator: 27**, citation: 1, tour: 8
- Build: 416 pages

---

## [1.28.0] — 2026-05-02

Continuing the gap-1 cluster-internal depth push from v1.27. Added the **other** architectural divider — network topology — mirroring the host_cpu pattern (schema field + per-server card + matrix view). Plus the deferred Cambricon MLU590 tour and 2 more fused kernels filling operator-fusion gaps.

### Added

**`network_topology` server schema field**:
- 11 enum values: fat-tree, fat-tree-rail-optimized, dragonfly-plus, full-mesh, 2d-torus, 3d-torus, 4d-torus, slim-fly, optical-fabric, hierarchical-mesh, star-burst, single-switch
- Fields: `topology`, `in_network_reduction`, `diameter_hops`, `bisection_bandwidth_gbps_per_node`, `latency_us_p99_intra_node`, `latency_us_p99_inter_node`, `switch_count`, `rdma_capable`, `notes`

**`network_topology` populated on all 14 super-pods (100%)**:
- NVL72 / GB300 NVL72 — full-mesh + SHARP-3 in-network reduction (1 hop, 14.4 TB/s/node bisection)
- HGX H100 / H200 — fat-tree-rail-optimized + SHARP-2 (3 hops typical)
- DGX A100 — fat-tree-rail-optimized + SHARP-1 (Ampere era, 200G HDR IB)
- MI325X Platform — switchless full-mesh (Infinity Fabric P2P, no central switch)
- El Capitan EX255a — dragonfly+ (Slingshot-11, 11000+ blades, 5 hops)
- AWS Trn2 UltraServer — 2D-torus (NeuronLink-v3, switchless)
- CloudMatrix 384 — optical-fabric (lingqu, 384 cards ≤2 hops, in-network reduction)
- Atlas 900 SuperPoD — hierarchical-mesh (8 cabinets × 32 cards, RoCE-400G inter-cabinet)
- Atlas 800T A3 / Cambricon X8 — single-switch single-node
- Cambricon MLU590-pod / Moore Threads KUAE — hierarchical-mesh (RoCE-200G inter-node)

**`/servers/network-topology-matrix/`** (NEW comparison view):
- 10-dimension side-by-side table: topology / diameter / bisection / intra-latency / inter-latency / switch count / in-network reduction / RDMA / GPU count / notes
- Best-value highlighting (lowest hop diameter, lowest latency, highest bisection)
- Topology family distribution chips (5 families covered)
- "Why network topology matters" educational section with 4 trade-off cards
- Cross-links to tp-allreduce-overlap pattern + 国央企 reasoning tour

**Per-server detail page surfaces network_topology**:
- New "网络拓扑" card alongside host_cpu, switch_chips, power
- Accent border when `in_network_reduction === true` (visual encoding for SHARP-class fabrics)
- All 9 network_topology fields rendered
- Cross-link to `/servers/network-topology-matrix/`

**2 more fused kernels** (22 → 24):
- `fused-rmsnorm-residual-quantize`: extends fused-rmsnorm-residual by also fusing FP8/INT8 quant. Critical for FP8 inference hot path — without this, intermediate BF16 tensor wastes ~40% norm-stage HBM bandwidth. Implemented in vLLM 0.7+, TRT-LLM 0.13+, MindIE 2.0
- `fused-allgather-gemm`: column-wise TP dual to fused-tp-allreduce-residual (which is RS+AR for row-wise TP). Megatron-LM async-tp + vLLM async-tp + TRT-LLM AG+GEMM plugin all implement this

**1 more tour** (7 → 8) — completing the China stack diversification:
- `kimi-k26-mlu590-x16-vllm-bf16`: Cambricon 思元 590 × 2 节点 16 卡, Kimi K2.6 1T MoE, vLLM-MLU community port. Surfaces 国产 LLM 部署的非华为路径 — vLLM-MLU 比 CANN+MindIE 接近 NVIDIA 体验, 但量化路径成熟度滞后 6-9 月

### Stats
- 346/346 site E2E pass (+11 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14 (**14 with host_cpu + 14 with network_topology**), model: 19, case: 38, **fused-kernel: 24**, playbook: 24, pattern: 21, operator: 25, citation: 1, **tour: 8**
- Build: 412 pages

### Tour spectrum (8 tours = full deployment span):
- 端侧/edge: Qwen 2.5 7B × Jetson Orin
- 单节点 NVIDIA: Llama 4 Scout × H200
- 单节点 AMD: Qwen 3.6 Plus × MI325X
- 单节点 Intel: GPT-OSS × Gaudi 3
- 跨节点 Hopper: DSv4 Flash disagg × H100/H200
- 国央企 super-pod (Ascend): DSv4 Pro × CloudMatrix 384
- 国央企 alt path (Cambricon, NEW): Kimi K2.6 × MLU590 × 16
- Frontier super-pod: Llama 4 Maverick × NVL72

---

## [1.27.0] — 2026-05-01

**Information architecture overhaul.** User feedback: 超节点/集群、部署链路、优化模式、算子目录、融合 kernel、关于、学习中心、精选发现、数据质量 — all hard to find. v1.27 fixes the IA at the source.

### Added

**`apps/web/src/lib/nav-groups.ts` — single source of truth for site IA**:
- `NAV_GROUPS` defines 5 groups (browse / optimize / learn / tools / about), each with 4-7 items
- Both Nav header dropdowns and homepage sections consume the same data — they cannot drift
- Each item has `path`, `labelKey` (i18n), `desc_zh`, `desc_en`, optional `theme`
- Adding a new page = 1 edit to add it to both surfaces

**Nav redesign — top bar + 4 grouped dropdowns**:
- Top: 硬件 · 超节点 (NEW prominent) · 模型 · 案例 · Playbook · 学习 ↓ · 部署优化 ↓ · 工具 ↓ · 国产 · 关于 ↓
- Each dropdown shows label + 1-line description per item (50 zh char / 80 en char budget)
- Hover-to-open + click-to-lock + Esc-to-close + click-outside-to-close
- Mobile collapses to native `<details>` accordion (free keyboard accessibility)
- Single inline script for click-lock; CSS handles hover

**Homepage redesign — 5 grouped sections mirroring nav IA**:
- Browse (6 cards): hardware / **servers** / models / cases / playbooks / vendors
- Optimize (6 cards): **pipeline** / **patterns** / **operators** / **fused-kernels** / quantizations / engines
- Learn (7 cards): /learn/ overview + tours + 5 decision-tree guides
- Tools (6 cards): calculator / compare / **servers/compare** / **host-cpu-matrix** / pricing / showcase
- About (4 cards): quality / impact / contribute / about
- Each section header includes a dynamic count (e.g. "21 模式 · 25 算子 · 22 融合")
- Hero gains a third CTA: 学习中心 alongside 计算器 + 国产专题
- Stats grid expands 4 → 6 numbers (adds servers + playbooks)

**`host_cpu` populated on remaining 8 super-pods (now 14/14, 100%)**:
- nvidia-gb300-nvl72 — Grace 72-core (sibling to GB200 NVL72; only other GPU-coherent design)
- amd-mi300a-supercomputer — APU (24 Zen-4 cores per APU, in-package, GPU-coherent unified-memory)
- aws-trn2-ultraserver — Graviton4 96-core (cloud-only, NeuronLink isn't GPU-coherent)
- huawei-atlas-900-superpod — Kunpeng 920 dual-socket (信创合规)
- cambricon-mlu590-pod — Hygon C86 / Kunpeng 920 (multi-vendor host)
- cambricon-x8-server — Hygon C86 / Intel Xeon (mid-range single-node)
- moore-threads-kuae — Hygon C86 / Intel Xeon (PCIe Gen5)

**Per-server detail page surfaces host_cpu**:
- New "Host CPU" card alongside switch_chips, power, scale-out
- Accent border when `has_coherent_gpu_link === true` (visual encoding for the architectural divider)
- All 10 host_cpu fields rendered: vendor / arch / cores / sockets / PCIe / lanes / RAM / coherent link / notes
- Cross-link to /servers/host-cpu-matrix/ at the card footer

### Fixed
- Mobile menu now uses `<details>` for each dropdown group (was previously a flat list of all top-level links — would have grown unwieldy with new entries)
- Top-level nav `lg:hidden` → keeps the menu collapse threshold appropriate for 9 top items + 4 dropdowns

### Stats
- 335/335 site E2E pass (+12 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14 (**14 with host_cpu**), model: 19, case: 38, fused-kernel: 22, playbook: 24, pattern: 21, operator: 25, citation: 1, tour: 7
- Build: 408 pages

---

## [1.26.0] — 2026-05-01

Hits gap (1) cluster details directly: server schema gains `host_cpu` field exposing the often-overlooked CPU choice (Grace / EPYC / Sapphire Rapids / Kunpeng). New `/servers/host-cpu-matrix/` makes architecture diversity comparable. Plus 1 more tour, 2 cases, 1 fused-kernel.

### Added

**Server `host_cpu` schema field** (`schemas/server.ts`):
- `name`, `vendor`, `architecture`, `cores_per_node`, `sockets_per_node`
- `pcie_gen`, `pcie_lanes_per_node`, `host_ram_gb`
- `has_coherent_gpu_link` (Grace+Hopper / Grace+Blackwell only set this)
- `notes` for free-form context (信创合规 / OEM choice / etc.)

**6 super-pods populated with host_cpu**:
- NVIDIA GB200 NVL72 — Grace 72-core Neoverse V2 (the only coherent design)
- NVIDIA HGX H100/H200 — Sapphire / Emerald Rapids dual-socket (PCIe Gen5)
- NVIDIA DGX A100 — AMD EPYC 7742 Rome (NVIDIA's first AMD-host platform)
- AMD MI325X Platform — EPYC 9654 Genoa dual-socket (192 cores/node)
- Huawei CloudMatrix 384 — 鲲鹏 920 (the 信创合规 ARM path)
- Huawei Atlas 800T A3 — 鲲鹏 920 48-core variant

**`/servers/host-cpu-matrix/`** (NEW comparison view):
- Side-by-side table of all 10 dimensions (model, arch, cores, PCIe, lanes, RAM, coherent link, paired GPU, notes)
- Architecture distribution chips (counts per arch family)
- Per-row best-value highlighting
- "Why host CPU matters" educational section with 4 trade-off cards
- Cross-links to `hot-cold-kv-tiering` pattern (NVLink-C2C dependency) + 国央企 tour (Kunpeng-host context)

**1 more tour** (6 → 7) — completing the single-node spectrum:
- `qwen36-plus-mi325x-sglang-fp8`: AMD CDNA-3 single-node tour. Qwen 3.6 Plus on MI325X with SGLang ROCm + HIP Graph + FP8. Pairs with the new H200 case for direct NVIDIA-vs-AMD comparison

**2 more cases** (36 → 38):
- `case-qwen36-plus-h200x8-vllm-fp8-001`: Qwen 3.6 Plus on 8×H200 with vLLM FP8. Direct NVIDIA baseline vs the new AMD MI325X tour — same model, same quant, comparable numbers (NVIDIA ~17% faster decode, ~25% higher $/token)
- `case-minimax-m27-b200x8-trtllm-fp4-001`: MiniMax M2.7 hybrid SSM/attention on 8×B200 with TRT-LLM FP4 + Mamba2 kernels. First Blackwell + hybrid SSM case, surfaces 64K long-context decode 4-5× speedup over H100 BF16

**1 more fused-kernel** (21 → 22):
- `fused-dequant-gemm`: W4A16 / AWQ-INT4 hot path. Fuses INT4 → BF16 dequant into GEMM epilogue — without this, INT4 quantization's bandwidth advantage is wasted on intermediate BF16 tensor write-back. Marlin / ExLlamaV2 / cuBLASLt INT4_AWQ all implement this

### Stats
- 323/323 site E2E pass (+8 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14 (6 with host_cpu), model: 19, **case: 38**, **fused-kernel: 22**, playbook: 24, pattern: 21, operator: 25, citation: 1, **tour: 7**
- Build: 408 pages

### Tour spectrum (7 tours = full deployment span):
- 端侧/edge: Qwen 2.5 7B × Jetson Orin
- 单节点 NVIDIA: Llama 4 Scout × H200
- 单节点 AMD: Qwen 3.6 Plus × MI325X (NEW)
- 单节点 Intel: GPT-OSS × Gaudi 3
- 跨节点 Hopper: DSv4 Flash disagg × H100/H200
- 国央企 super-pod: DSv4 Pro × CloudMatrix 384
- Frontier super-pod: Llama 4 Maverick × NVL72

---

## [1.25.0] — 2026-05-01

Validating the v1.24 tour refactor. Adds 2 more YAML tours (Intel + Hopper disagg), tour authoring guide for contributors, 2 cases, and 1 pattern. Each new tour was ~80 lines of YAML with no astro/TypeScript changes — confirms data-driven approach pays off at scale.

### Added

**2 more YAML tours** (4 → 6) covering the deployment spectrum:
- `gptoss-gaudi3-vllm-fp8`: Intel stack — single-node Gaudi 3 OAM via SynapseAI graph compiler + vLLM HPU + FP8 native. Documents the Habana ecosystem (hl-smi, RoCE-v2 fabric) for users evaluating Intel as third-path beyond NVIDIA/AMD
- `dsv4flash-disagg-h100-h200-mooncake`: Mixed-Hopper disaggregated cluster — H100 prefill pool + H200 decode pool + Mooncake KV transfer over IB-NDR. Documents the disagg + RDMA + GPUDirect requirement chain

**`/contribute/authoring-tours/`** (NEW guide):
- Format reference for `data/tours/*.yaml` schema with full YAML template
- "When to write a tour" checklist (✓ vs ✗ scenarios)
- Valid ID quick-reference (7 stage_ids + live cases/operators/kernels/patterns counts pulled from data)
- 5-step from 0 to PR workflow (cp template → edit → validate → preview → submit)
- Links to existing 6 tours as worked examples
- Closes the v1.25 horizon item

**1 more pattern** (20 → 21):
- `compile-time-graph-optimization`: cross-vendor view of the compile stage. CUDA Graph (NVIDIA) vs TRT engine (NVIDIA offline) vs HIP Graph (AMD) vs SynapseAI (Intel) vs XLA HLO (TPU) vs CANN (Ascend) vs MPSGraph (Apple). Trade-offs (warmup time, GPU-arch lock, dynamic-shape friendliness) made explicit.

**2 more cases** (34 → 36):
- `case-gemma-4-tpu-v5p-pod-001`: Gemma 4 27B on TPU v5p 32-chip pod with JAX/SGLang. First Gemma 4 case + first SP=4 (sequence parallel) example + Gemma's hybrid sliding-window attention (5 SWA + 1 global)
- `case-mistral-small-4-b200x4-vllm-fp4-001`: Mistral Small 4 24B on 4×B200 with vLLM FP4 + chunked prefill. Documents the over-provisioned-compute pattern (24B model on 4× B200 = 62% utilization → 2× B200 or 4× H200 might be cheaper)

### Stats
- 315/315 site E2E pass (+8 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 36**, fused-kernel: 21, playbook: 24, **pattern: 21**, operator: 25, citation: 1, **tour: 6**
- Build: 401 pages
- Tour spectrum: edge (Jetson) · single-node (H200, Gaudi 3, B200) · cluster mixed (H100/H200 disagg) · super-pod (CloudMatrix 384, NVL72) · TPU pod

### Validated
- v1.24 data-driven tour infrastructure scales: each new tour was pure YAML, no astro/TypeScript changes needed
- Tours index auto-discovered the 2 new entries with no code changes

---

## [1.24.0] — 2026-05-01

Tour infrastructure refactor + 1 new tour completing the deployment spectrum (edge → super-pod) + 2 more cases. The hand-coded tour pages from v1.22-v1.23 are now data-driven — adding a new tour goes from ~250 lines of astro to ~80 lines of YAML.

### Added

**Tour data schema** (`schemas/tour.ts`):
- Tour entity with id, title, context_zh, case_id, optional playbook_id, why_it_matters, display_order, and 7-stage narratives array
- Per-stage narrative: stage_id, decision, rationale, involves_operators / involves_kernels / involves_patterns, optional pitfall
- Validates via existing `pnpm validate` pipeline

**4 YAML tours** (`data/tours/`):
- `llama4-scout-h200-vllm-fp8` — extracted from v1.22 hand-coded `/learn/end-to-end-tour/`
- `dsv4pro-cloudmatrix-384-mindie` — extracted from v1.23 hand-coded `/learn/tour-dsv4pro-cloudmatrix-384/`
- `llama4-maverick-nvl72-fp4` — extracted from v1.23 hand-coded `/learn/tour-llama4-maverick-nvl72/`
- **`qwen25-7b-jetson-orin-edge` (NEW)** — edge deployment, completes spectrum. Walks Qwen 2.5 7B on Jetson Orin with llama.cpp Q4_K_M INT4: pre-quantized GGUF download, no convert step, single-chip TP=1, thermal throttling pitfalls

**Dynamic route** (`/learn/tours/[slug]/`):
- One astro file renders any tour given its slug
- `getStaticPaths` enumerates all tours from data
- Sibling tours surface in footer for cross-navigation
- Index page (`/learn/tours/`) reads from data; tour matrix table + cards both auto-update on YAML add

**Legacy URL redirects**:
- `/learn/end-to-end-tour/` → `/learn/tours/llama4-scout-h200-vllm-fp8/`
- `/learn/tour-dsv4pro-cloudmatrix-384/` → `/learn/tours/dsv4pro-cloudmatrix-384-mindie/`
- `/learn/tour-llama4-maverick-nvl72/` → `/learn/tours/llama4-maverick-nvl72-fp4/`
- meta-refresh + canonical link preserves SEO + external links from blog posts / social media

**2 more cases** (32 → 34):
- `case-kimi-k26-h100x8-sglang-fp8-001`: Moonshot Kimi K2.6 agent MoE on H100x8 with SGLang FP8 + RadixAttention. Documents 73% prefix-cache hit rate on agent multi-turn workload — closes-the-loop with `/learn/picking-engine/` agent recommendation
- `case-minimax-m27-trillium-pod-001`: MiniMax M2.7 hybrid SSM/attention on Google Trillium 64-chip TPU pod with JAX/SGLang. First TPU + JAX case in the catalog, surfaces TPU-specific gotchas (no nvidia-smi, XLA cold-compile time)

### Stats
- 307/307 site E2E pass (+8 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 34**, fused-kernel: 21, playbook: 24, pattern: 20, operator: 25, citation: 1, **tour: 4**
- Build: 393 pages
- New tours add cost: ~80 lines of YAML each (vs ~250 lines astro)

---

## [1.23.0] — 2026-05-01

End-to-end tour expansion. v1.22 introduced one tour; v1.23 extends to **3 tours covering the deployment spectrum** (single-node Hopper / 国央企 super-pod / frontier Blackwell super-pod) + tour index + density adds.

### Added

**2 more end-to-end tours**:
- `/learn/tour-dsv4pro-cloudmatrix-384/`: DeepSeek V4 Pro 671B-A37B MoE on Huawei CloudMatrix 384 (Ascend × MindIE × 信创合规). Marquee Chinese-stack reasoning deployment — 384 卡 super-pod, TP=16 × PP=4 × EP=6, 国央企 context
- `/learn/tour-llama4-maverick-nvl72/`: Llama 4 Maverick 400B-A17B multi-modal MoE on GB200 NVL72 (vLLM × FP4 × disagg). Frontier Blackwell super-pod — 72 卡 NVLink-5 全互联, EP=72 single-domain, 24 prefill + 48 decode disagg split

**`/learn/tours/`** (NEW index page):
- 3 tour cards with model × hardware × engine × quant scope summary
- Tour comparison matrix (规模 × 量化 × 引擎 × 部署语境)
- "PR a new tour" instructions
- Closes the gap-3 ask: tours give concrete narratives where decision-trees give abstract matrices

**1 more pattern** (19 → 20):
- `chunked-prefill`: mixed prefill/decode batching to eliminate P99 TBT spike. vLLM/SGLang default since 0.7+, MindIE 2.0+ experimental. Distinct from disagg-prefill-decode (chunked = same step, disagg = different node)

**1 more fused-kernel** (20 → 21):
- `fused-grouped-gemm`: MoE expert batched compute. Replaces expert-loop with single grouped-GEMM kernel — 2-4× speedup at 16-256 experts. CUTLASS / vLLM Triton / DeepSeek FlashMoE / MindIE all implement this

**1 more case** (31 → 32):
- `case-llama4-scout-mi355x-vllm-rocm-001`: Llama 4 Scout 109B-A17B on 8×MI355X with vLLM ROCm + chunked prefill. Surfaces the chunked-prefill P99 TBT win on AMD (64ms → 22ms) and demonstrates MI355X 288 GB HBM3e capacity advantage

### Stats
- 299/299 site E2E pass (+7 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 32**, **fused-kernel: 21**, playbook: 24, **pattern: 20**, operator: 25, citation: 1
- Build: 385 pages
- `/learn/` surfaces: **3 tours + 6 guides + 1 fusion-matrix + 1 deployment-failures** = 11 educational pages

---

## [1.22.0] — 2026-05-01

Cross-cutting integration: surfaces the bipartite operator↔fused-kernel graph as an explicit matrix, distinguishes quantization strategy from format, and walks one concrete deployment through every pipeline stage. Closes the "data is correct but spread across separate sections" complaint behind gap (3).

### Added

**`/operators/fusion-matrix/`** (NEW cross-reference page):
- 25 operators × 20 fused-kernels truth-table — every cell is ✓ (both sides agree), ⚠️ (one-sided declaration — data gap), or · (no relation)
- Per-row + per-column coverage stats; consistency % surfaced
- Orphan-operator section lists ops not in any fused kernel (legitimate or contribution opportunity)
- Closes gap-2 ask: "operator/fusion info incomplete" was partly catalog density, partly relational visibility — this page makes the relations explicit

**`/learn/picking-quantization-format/`** (NEW educational guide):
- Distinguishes **strategy** (FP8 vs INT4 vs QAT — see `/learn/quantization-decision-tree/`) from **format** (NVFP8 / AWQ-INT4 / GPTQ-INT4 / GGUF Q4_K_M)
- 7 weight-precision format profiles + 3 container format profiles (GGUF / safetensors / TRT engine)
- Per-format: best-for / not-for / framework loader / per-group scale / case usage count
- Closes a frequent confusion in the deployment chain: "AWQ" and "INT4" are not the same axis

**`/learn/end-to-end-tour/`** (NEW narrative guide):
- Walks ONE concrete case (Llama 4 Scout on H200x8 with vLLM FP8) through all 7 pipeline stages
- Each stage shows: actual decision, rationale, involved operators / kernels / patterns, and a known pitfall
- Pulls from existing data — case + playbook + pipeline + operator + kernel + pattern catalogs
- Bottom CTA links all 6 `/learn/` guides
- Closes gap-3 "deployment optimization chain unclear" by showing what a complete chain looks like in one specific story

**2 more cases** (29 → 31):
- `case-mistral-large-3-mi355x-sglang-001`: Mistral Large 3 on 8×MI355X with SGLang ROCm INT8 + GQA. AMD MI355X (288 GB HBM3e) deployment with full-context capacity
- `case-qwen-coder-l40s-trtllm-awq-001`: Qwen 2.5-Coder 32B on 4×L40s PCIe with TRT-LLM AWQ-INT4. Surfaces PCIe-TP gotcha (no NVLink → 36× slower all-reduce vs H100) and code-specific calibration

### Stats
- 292/292 site E2E pass (+8 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 31**, fused-kernel: 20, playbook: 24, pattern: 19, operator: 25, citation: 1
- Build: 378 pages
- `/learn/` tour: 6 guides (attention-variants, quantization-decision-tree, picking-quantization-format, parallelism-cheatsheet, picking-engine, deployment-failures) + end-to-end-tour

---

## [1.21.0] — 2026-05-01

Triple-gap iteration: attention-variants completes the `/learn/` tetrad (gap 2/3), `/servers/compare/` closes the cluster-internals analytical UI (gap 1), and 3 more operators + 2 more fused-kernels deepen the operator catalog.

### Added

**`/learn/attention-variants/`** (NEW educational guide):
- 5-variant cross-comparison table (MHA / MQA / GQA / MLA / SWA) with 5 axes: KV compression, quality loss, long-context viability, example models, related fused-kernels
- Per-variant trade-offs section linking to primary patterns
- Cross-links to model detail pages, fused-kernel pages, and the rest of the `/learn/` tetrad
- Closes the attention architecture choice gap — the most consequential decision before deployment

**`/servers/compare/`** (NEW cluster analytical UI):
- Side-by-side super-pod comparison table (15 dimensions: card_count, scale-up domain, fabrics, bisection BW, total memory/compute, rack power, cooling, switch chips, oversubscription, scale-out NICs, release year)
- Per-row best-value highlighting (★ for max compute/memory, min for power)
- Default top-6 by BF16 PFLOPS, picker grid linking to all 14 super-pod detail pages
- Mirrors `/compare/` for hardware but simpler (categorical data, no radar chart needed)
- Closes the gap-1 cluster-internals analytical UI complaint

**3 more operators** (22 → 25):
- `dropout` (misc): training-only stochastic regularizer; documents the eval-mode trap (`model.eval()` not called → non-deterministic decode output)
- `group-norm` (norm): vision/diffusion primitive; SD3/Flux UNet + multi-modal vision encoder. Distinct from LayerNorm/RMSNorm
- `repeat-interleave` (memory): GQA KV broadcast + beam expansion. Documents why modern attention kernels avoid materializing the broadcast (FlashAttn v2/v3 internal GQA path)

**2 more fused-kernels** (18 → 20):
- `fused-conv-norm-act`: Conv2D + GroupNorm/LayerNorm + GELU/SiLU vision encoder block. ViT patch-embed + SD3/Flux UNet + multi-modal vision tower
- `fused-add-bias-gelu`: legacy GPT-style MLP block. Pre-SwiGLU pattern, still in vision FFN + GPT-OSS legacy

### Fixed
- `/servers/compare/` originally tried to read `?ids=...` from `Astro.url.searchParams` but static SSG renders without querystrings. Refactored to render a deterministic top-by-compute sample server-side; picker grid links to individual server detail pages instead of querystring re-renders. (Future: client-side React island for real subset filtering.)

### Stats
- 284/284 site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 29, **fused-kernel: 20**, playbook: 24, pattern: 19, **operator: 25**, citation: 1
- Build: 371 pages

---

## [1.20.0] — 2026-05-01

Operator catalog deepening + completing the `/learn/` triad. Closes gap (2) operator/fusion info and gap (3) deployment optimization chain in one release.

### Added

**4 more operators** (18 → 22):
- `swiglu` (activation): Swish-Gated Linear Unit — universal in modern LLMs (Llama 3+, Mistral, Qwen 3, DeepSeek V3 expert MLP)
- `scaled-dot-product-attention` (attention): explicit SDPA primitive distinct from `attention.yaml` layer wrapper. Documents FlashAttn evolution + decode/prefill cost asymmetry
- `conv2d` (matmul): vision encoder primitive for multi-modal LLMs (Llama 4 Vision, Qwen 2.5-VL, Pixtral) and diffusion (SD3, Flux)
- `cross-entropy` (misc): token sampling cost. vocab 60K-200K makes prefill cross-entropy a surprise long-context bottleneck

**2 more fused-kernels** (16 → 18):
- `flash-mla`: DeepSeek V2/V3 Multi-Head Latent Attention specialized kernel. Latent KV cache 5-10× smaller than GQA. Hopper-only optimal
- `flash-decoding`: long-context decode parallelism. Splits KV-cache along sequence dim across SMs for 32K+ decode 2.5-8× speedup. Distinct from PagedAttention-decode (memory layout)

**`/learn/parallelism-cheatsheet/`** (NEW educational guide):
- 6 strategy cards: TP / PP / EP / SP / Ring / Disagg with pros/cons/when-to-use
- 8 deployment-scenario decision matrix: each row recommends specific TP×PP×EP recipe
- Each row cross-links to relevant patterns + playbooks
- Closes gap-3 "parallelism is unclear" complaint

**`/learn/picking-engine/`** (NEW educational guide):
- 7 scenario picker (NVIDIA general / agent / production / ascend / InternLM-Qwen / AMD / edge)
- 5 engine profiles (vLLM / SGLang / TRT-LLM / MindIE / LMDeploy) with strengths / weaknesses / best-for / not-for / ecosystem
- Engines sorted by real deployment density (cases + playbooks count, live)
- Closes gap-3 "which engine to pick" complaint — completes /learn/ triad with quantization-decision-tree + parallelism-cheatsheet

### Stats
- 274/274 site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 29, **fused-kernel: 18**, playbook: 24, pattern: 19, **operator: 22**, citation: 1
- Build: 364 pages

---

## [1.19.0] — 2026-05-01

Continuing the operator/optimization gap (gap 2 of the user's 3-gap directive). 4 new optimization patterns + 2 new playbooks + 2 new cases + first /learn/ decision-tree guide.

### Added

**4 more optimization patterns** (15 → 19):
- `gqa-mqa-shared-kv`: Grouped/Multi-Query Attention KV-cache reduction (Llama 3+, Mistral, GPT-4o, Gemma) — affects every modern LLM, 4-64× KV compression
- `hot-cold-kv-tiering`: HBM/DRAM/NVMe three-tier KV-cache (Mooncake / NVIDIA Dynamo). Distinct from `kv-cache-cpu-offload` — page-level, not session-level
- `tp-allreduce-overlap`: Strategy-layer TP communication/compute overlap (RS+AG split, async-tp, SHARP). Distinct from `fused-tp-allreduce-residual` (fused-kernel)
- `quant-aware-finetune`: QAT recovery for PTQ quality loss. ~10× more time but <0.5 pt MMLU loss for small models. Critical for <13B + INT4

**2 more playbooks** (22 → 24):
- `multi-modal-on-blackwell-superpod`: Llama 4 Maverick / Pixtral 124B on GB200 NVL72 with FP4 LLM + BF16 vision encoder + disagg + NVLink-5 EP
- `reasoning-llm-on-ascend-cluster`: DeepSeek-R1 / Qwen-QwQ / o1-style on Atlas 800T with INT8 + KV-INT8 + MTP + 国央企 替代 path

**2 more cases** (27 → 29):
- `case-llama4mvk-h200x8-vllm-fp8-001`: Llama 4 Maverick on 8×H200 single-node FP8, multi-modal MoE baseline before Blackwell super-pod
- `case-glm5-reasoning-atlas800t-mindie-001`: GLM-5 Reasoning 32B on Atlas 800T A3 with MindIE 2.0 INT8 + MTP, real 国央企 reasoning POC

**`/learn/quantization-decision-tree/`** (NEW educational guide):
- 3-step decision tree: hardware × model size × workload
- Each leaf links to a relevant pattern + example case
- Pulls live data from data/patterns + data/cases — recommendations stay in sync with catalog
- Standalone CTA card: calculator + playbooks + 19 patterns

### Stats
- 264/264 site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 29**, fused-kernel: 16, **playbook: 24**, **pattern: 19**, citation: 1
- Build: 356 pages

---

## [1.18.0] — 2026-05-01

Impact-metrics surface — make adoption visible. Until now the site was a content catalog; v1.18 adds the credibility layer that quantifies "this matters because…" so contributors and citers can link to a single dashboard.

### Added

**Live GitHub star button (Nav, every page)**:
- React island fetches `https://api.github.com/repos/ying-wen/evokernel-spec` client-side (60 req/h/IP unauth limit)
- localStorage 1h cache amortizes one fetch per visitor; falls back to "—" if API unreachable
- One-click goes to GH Star UI (true one-click-star requires OAuth)
- `client:only="react"` to avoid SSR hydration mismatch with localStorage state

**Homepage impact strip**:
- Compact heartbeat under hero: ★ stars · 👥 contributors · 📦 cases · 🚀 last commit · → /impact/ CTA
- Build-time stats baked from `git shortlog -sne` + `git log -1 --format=%cI`
- New `contributorStats()` helper in `apps/web/src/lib/build-meta.ts`

**`/impact/` public dashboard** (NEW page):
- 5 live GitHub cards (stars / forks / watchers / issues / last-pushed) via React island
- 7 content-catalog cards (hardware / servers / models / cases / playbooks / fused-kernels / patterns) — click-through to their index
- 4 development-velocity cards (total commits, contributors, project start, last commit)
- Top-5-contributors list with commit counts
- External citations section grouped by source_type (paper / talk / blog / docs / video / podcast / newsletter / press / tweet / other)
- Build-time PR-add CTA pointing to `data/citations/`

**Privacy-friendly analytics injection** (opt-in):
- New `apps/web/src/components/impact/Analytics.astro` injects beacons only when configured
- Two providers supported via build-time env vars: `PUBLIC_CF_ANALYTICS_TOKEN` (Cloudflare Web Analytics) and `PUBLIC_PLAUSIBLE_DOMAIN` (Plausible)
- No-op without env var — site stays analytics-free in dev / preview / forks
- Wired into `BaseLayout.astro` head

**Citations schema + tracker**:
- New `schemas/citation.ts` with `CitationSchema` + `CitationSourceType` enum
- New `data/citations/` directory with seed entry; PRs add new citations
- `getCitations()` in `apps/web/src/lib/data/index.ts`
- Validate-data script picks up `data/citations/*.yaml`

### Fixed
- Nav GitHub link previously pointed to `evokernel/evokernel-spec` (wrong owner) — corrected to `ying-wen/evokernel-spec`
- React #418 hydration mismatch: `client:idle` with localStorage-seeded `useState` initializer caused SSR HTML to differ from client first render. Switched live components to `client:only="react"` since they have no useful server render — fetched data is client-only

### Stats
- 254/254 site E2E pass (+8 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 27, fused-kernel: 16, playbook: 22, pattern: 15, **citation: 1** (seed)
- Build: 345 pages

---

## [1.17.0] — 2026-05-01

Failure-modes drilldown — surfaces production gotchas as a quick-lookup guide organized by 7-stage pipeline. + Coverage matrix density push.

### Added

**`/learn/deployment-failures/` failure-modes guide** (NEW educational page):
- Aggregates `issues_encountered` from all **27 cases** organized by 7-stage pipeline (acquire → convert → quantize → compile → shard → serve → observe)
- Stage-keyword classifier maps each issue to the most-likely stage by content
- Cross-links: each stage → relevant playbooks; each issue → source case + bottleneck + hardware
- Contribute CTA explains how to PR `issues_encountered` into existing case YAMLs
- Closes a long-standing UX gap: "what should I worry about going wrong?" was scattered across 27 case-detail pages; now one queryable index

**3 more playbooks** (19 → 22, coverage matrix density up):
- `multi-modal-on-cdna3-cluster`: Llama 4 Maverick on MI300X/MI325X with mixed-TP + vision-encoder fusion
- `long-context-on-blackwell-superpod`: 10M context Behemoth on GB200/GB300 NVL72 with Ring-attention + FP4 weights
- `dense-llm-medium-on-ascend-cluster`: 70B-class on Atlas 800T (910C/910D), MindIE 2.0, 国央企 国产替代 path

**2 more cases** (25 → 27):
- `llama4-maverick-on-gb200-nvl72`: compute-bound on Blackwell FP4 + disaggregated prefill/decode
- `qwen25-7b-on-jetson-orin`: edge deployment, llama.cpp Q4_K_M INT4 — pushes the deployment story to Jetson-class hardware

**1 more fused-kernel** (15 → 16):
- `fused-tp-allreduce-residual`: zero-bubble RS+AG (reduce-scatter overlapped with all-gather) with SHARP/NVSwitch in-network reduction. Closes the TP-comm-overlap gap that limited multi-GPU dense scaling.

### Stats
- 246/246 site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 27**, fused-kernel: 16, **playbook: 22**, pattern: 15
- Build: 344 pages

---

## [1.16.0] — 2026-05-01

**5 foundational operators + pipeline-stage case panel + 2 more playbooks.** Direct response to the persistent "算子层面信息也不全" complaint — fills the 5 most-cited missing ops.

### Added

**5 new operators** (13 → 18):
- **layer-norm** (BERT/T5 ancestor of RMSNorm): Welford-stable streaming variance, 2-reduce path, comparison table vs RMSNorm — covers BERT-era / multi-modal vision encoder use.
- **embedding-lookup** (input + LM head): Bimodal AI ranges (input gather AI=0.1, output projection AI=10-100). Documents tied vs untied embedding, vocab pruning, **LM head as decode bottleneck on large-vocab models** (Llama 4 Behemoth 260K vocab).
- **all-gather** (TP/SP collective trinity): Companion to reduce-scatter and all-reduce. Documents Ring vs Recursive-Doubling vs SHARP variants. Critical for zero-bubble TP and SP→TP transitions.
- **grouped-matmul** (MoE expert batched-GEMM): Distinct from regular matmul because of variable per-expert batch sizes. Documents token-packing, padding-vs-masking, sparse-routing implementation tradeoffs. Why MoE decode is less efficient than dense.
- **top-k-sampling** (decoding op): Often-overlooked actual sampling op. Documents block-radix sort top-K, fused softmax+sampling+penalty path, and how 5-15% of decode time goes here on large-vocab models.

**Pipeline stage detail page enhancement**:
- Each stage now surfaces 🔬 实测案例 (concrete cases) that exemplify decisions in that stage — matched by patterns referenced in stage AND case
- Closes the abstraction gap: stages had playbooks (recipes) and patterns (mechanisms) but no concrete proof; v1.16 adds case study links
- Each case link shows bottleneck + decode tok/s as quick context

**2 more playbooks** (17 → 19):
- **reasoning-llm × cdna3-cluster**: DeepSeek R1 / QwQ on AMD MI300X / MI325X集群. **HBM 192-256 GB advantage avoids KV CPU offload latency on long reasoning** (vs Hopper 80 GB必须 offload).
- **ssm-mamba × hopper-single-node**: Mamba-2 30B / Jamba 1.5 52B / Falcon-H1 大 size on H100 single-node. SSM linear-memory advantage on 13-50B range.

**1 more case study** (24 → 25):
- DeepSeek R1 671B reasoning on 32×MI325X with vLLM ROCm BF16 + spec decode — concrete proof for reasoning-llm × cdna3-cluster playbook. 8 TB HBM total avoids CPU offload required on H100.

### Stats
- **236/236** site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 25** (+1), **operator: 18** (was 13), fused-kernel: 15, pattern: 15, **playbook: 19** (was 17)
- Build: 335 pages
- Coverage matrix: 19/176 cells (~11%)

---

## [1.15.0] — 2026-05-01

**Operator-hardware fitness layer + engine compatibility matrix.** Cross-cutting structural views — answering questions that previously required browsing N pages.

### Added

**Structural fitness panel on operator detail pages**:
- New `~/lib/operator-hw-fitness.ts` — roofline-based classification of (operator × hardware × precision) at "natural" precision per hardware (highest-supported precision = real deploy choice)
- Each operator detail page now shows: 🟦 memory-bound count, 🟧 compute-bound count, 🟨 regime-dependent count across all 39 hardware cards
- Expandable full table with ridge points + classification per card
- Closes the "given operator X, where does it run efficiently?" question — e.g. attention is memory-bound on 35/39 cards, only compute-bound on Cerebras WSE-3 (memory-IS-compute paradigm)

**Engine × Vendor compatibility matrix on /engines/ index**:
- 7 engines × 14 hardware vendors compatibility grid with card-count chips
- Answers "I have hardware X, which engines support it?" without clicking through 14 vendor pages
- Cross-cutting view that surfaces engine ecosystem maturity (vLLM widest, MindIE narrow, etc.)

**2 more playbooks** (15 → 17):
- **diffusion × hopper-single-node**: FLUX.1 / SD 3.5 / SDXL on H100/H200. Diffusers / ComfyUI primary stack (vs LLM's vLLM/SGLang); image-sec metric (not token/s); FP8 + step-caching key. Different deployment paradigm vs LLM.
- **dense-llm-small × cdna3-single-node**: 1B-13B dense on single MI300X / MI325X. AMD HBM 192-256 GB advantage on small models too — BF16 装 13B + 长 KV 不需 quant.

**1 more case study** (23 → 24):
- Llama 4 Scout 109B (multi-modal) on 8×MI325X with vLLM ROCm 0.7+ — concrete proof for multi-modal × cdna3-single-node playbook. Mixed-TP (vision encoder TP=1, LLM TP=8) + 256 GB HBM3e advantage for high-res multi-image prompts.

### Stats
- **226/226** site E2E pass (+9 new + 2 brittle-test fixes) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 24** (+1), operator: 13, fused-kernel: 15, pattern: 15, **playbook: 17** (was 15)
- Build: 326 pages
- Coverage matrix: 17/176 cells (10%)

---

## [1.14.0] — 2026-05-01

**Bottleneck diagnosis layer** — closes the micro-level loop between concrete case measurements and the optimization knowledge graph. The user's persistent "后续部署优化链路也不清楚" gap addressed at the per-case level.

### Added

**Bottleneck → Pattern recommendation map** (NEW knowledge layer):
- New `~/lib/bottleneck-map.ts` with hand-curated mapping from each `Bottleneck` enum value (memory-bandwidth / compute / interconnect / software / mixed / unknown) to relevant patterns + pipeline stages + diagnosis explanation + actionable advice
- Each case detail page now renders **🩺 诊断 panel** showing: bottleneck classification → architectural diagnosis → applicable patterns (split: ✓ already used vs 🔄 suggested to try) → relevant pipeline stages
- Closes the loop: case (concrete proof) → bottleneck (diagnosis) → patterns (mechanism) → playbook (recipe)

**Bottleneck distribution panel** on `/cases/`:
- 22 cases grouped by bottleneck — surfaces that **13/22 (59%) of LLM deployments are memory-bandwidth-bound** (which is *why* quantization is always "first thing to try")
- 5 software, 2 compute, 0 interconnect bottlenecks visible — distribution shapes mental model for new contributors
- Each bottleneck card lists top cases linking through to detail page (with the new diagnosis)

**2 more playbooks** (13 → 15) targeting CDNA-3 single-node coverage gap:
- **dense-llm-medium × cdna3-single-node**: Llama 3.3 70B / Qwen 2.5 72B / Mixtral 8x22B on MI300X 8-OAM. **HBM 192 GB × 8 = 1.5 TB BF16 advantage** — avoids FP8 calibration vs H100x8 80 GB.
- **multi-modal × cdna3-single-node**: Llama 4 Scout / Qwen 2.5-VL / Pixtral on MI300X. Mixed-TP (LLM=8 / vision=1), high-res image sleeper advantage from large HBM.

**1 new case study** (22 → 23): Qwen 3.6+ MoE on 8×MI300X with vLLM ROCm BF16 — concrete proof for moe-medium × cdna3 path. Memory-bandwidth-bound (78% memory-BW utilization), demonstrates intra-node EP=8 sweet spot.

### Stats
- **217/217** site E2E pass (+8 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, **case: 23** (+1), operator: 13, fused-kernel: 15, pattern: 15, **playbook: 15** (was 13)
- Build: 322 pages
- Coverage matrix: 15/176 cells (~9%)

---

## [1.13.0] — 2026-05-01

**Coverage matrix + memory_hierarchy 100%.** Playbook coverage gap now visualized as a 2D grid; long-tail hardware data work concluded.

### Added

**4 more deployment playbooks** (9 → 13 total) targeting common missing combos:
- **long-context × hopper-cluster**: Llama 4 Behemoth 10M / Gemini 1.5 / GLM-4-Long-1M / MiniMax-Text-01. Ring-Attention + Sliding-Window + prefix-radix-cache for 1M-10M context. TP=8 + SP=8-16.
- **moe-llm-medium × hopper-single-node**: Mixtral 8x7B / 8x22B, Qwen 3 30B-A3B, GLM-4 MoE. **EP=8 intra-node only** (no DeepEP cross-node) — sweet spot for 50-200B MoE.
- **dense-llm-small × ascend-cluster**: Llama 3 8B / Qwen 2.5 7B / GLM-4-Flash on 国产 910C/910D 单卡. INT8 + MindIE 主栈, 国央企合规起步配置.
- **ssm-mamba × ada-single-node**: Mamba-2 / Jamba 1.5 / Falcon-H1 on RTX 4090/5090/L40s. Linear-memory advantage for long context. fused-selective-scan + INT4 quant.

**Coverage Matrix view** (NEW UX on /playbooks/):
- 2D grid of (11 model archetypes × 16 hardware classes) = 176 cells with filled/empty visualization
- Filled cells (✓) link to playbook detail, empty cells show missing combo on hover — making contribution targets visually obvious
- Coverage stats: 13/176 cells = ~7% — intentionally sparse; matrix is forcing-function for contribution growth
- Forcing-function pattern same as /quality dashboard from v1.7

**Memory hierarchy: 100% (39/39 cards)**:
- **PingTouge 平头哥 含光 800** (last unfilled): 4 cluster × 2 MB = 8 MB scratchpad, 16 MB on-chip cache, **16 GB LPDDR5** (no HBM — inference-only design tradeoff). 阿里巴巴 NPU 路线, 不通用但 INT8 推理高效率.

### Stats
- **209/209** site E2E pass (+9 new) · 36/36 unit pass
- vendor: 28, hardware: 39 (**100% memory_hierarchy filled**), server: 14 (100% switch_chips), model: 19, case: 22, operator: 13, fused-kernel: 15, pattern: 15, **playbook: 13** (was 9)
- Build: 318 pages

### Coverage saturation milestones
- ✅ super-pod cluster_internals: 100% (achieved v1.9)
- ✅ memory_hierarchy: 100% (achieved v1.13 — this release)
- 📈 playbook matrix: 7% — intentionally sparse, growth target for community

---

## [1.12.0] — 2026-05-01

**Playbook discoverability (gap 3 follow-up).** v1.11 introduced the playbook entity but they were isolated at /playbooks/. v1.12 expands to 9 playbooks and **surfaces them from the natural entry points** — every model page and hardware page now shows recommended playbooks for that pivot.

### Added

**4 more deployment playbooks** (5 → 9 total):
- **reasoning-llm × hopper-cluster**: DeepSeek R1 / o1-class / QwQ. Disagg P:D=1:5 (vs chat 1:2 — long CoT decode), MTP fused kernel, prefix-radix-cache, KV CPU offload. Decode 3500-6500 tok/s/GPU, $1.5-4/M tokens (3-5x chat cost).
- **multi-modal × hopper-single-node**: Llama 4 Scout / Qwen 2.5-VL / Pixtral / Gemma 3 MM. **Mixed-TP** key innovation — vision encoder TP=1, LLM backbone TP=8. TTFT 350-800ms (2-3x dense due to vision encoder).
- **dense-llm-large × tpu-pod**: Gemini-class / Gemma 3 / PaLM-derivative on TPU v5p / Trillium. **JAX/MaxText primary**, vLLM fallback (-30%). GSPMD mesh sharding (no separate TP/EP). $0.20-0.55/M tokens at 1024+ chip scale.
- **moe-llm-large × cdna3-cluster**: DeepSeek V3 / Mixtral / Qwen 3.5 on AMD MI300X / MI325X. ROCm + RCCL, Infinity Fabric mesh (vs NVSwitch — 30% slower fabric, 2x HBM capacity advantage). $0.30-0.85/M tokens.

**Bidirectional playbook recommendation widget** (NEW UX):
- New `~/lib/playbook-match.ts` — deterministic matcher inferring `ModelArchetype` from model.architecture (family + size + name patterns: reasoning, multi-modal, ssm-mamba) and `HardwareClass` from hardware.generation + form_factor + vendor.
- `RecommendedPlaybooks.astro` widget surfaced on `/models/<id>/` and `/hardware/<id>/` pages — match function shows direct + soft-expansion fallback (e.g. H100 detail shows both hopper-single-node AND hopper-cluster playbooks).
- Closes the discoverability gap: users no longer need to know /playbooks/ exists; deployment recipes are surfaced **at the natural decision points**.

**Memory hierarchy on 4 more cards** (31 → 35 deep-filled, **~90% catalog coverage**):
- **Etched Sohu** (transformer-only ASIC outlier): 144 specialized Tile × 256 KB SRAM ≈ 36 MB, 96 MB L2, **transformer-flow-aware NoC** 8 TB/s. Cannot run non-transformer workloads — domain restriction is the entire bet.
- **NVIDIA GB300 NVL72**: 168 SMs (vs B200 160), 100 MB L2, **288 GB HBM3e (36 GB stacks)** — +50% capacity vs GB200, same NV-HBI 10 TB/s.
- **NVIDIA R200 SXM (Vera Rubin)**: 200 SMs, 256 KB SMEM (up from 228 KB), 128 MB L2, **288 GB HBM4 / 13 TB/s** (+63% bandwidth vs HBM3e). NV-HBI v2 15 TB/s, NVLink-6.0 3.6 TB/s/GPU enabling 144-card scale-up domain.
- **Enflame 云燧 T21**: 80 cluster × 192 KB ≈ 15 MB scratchpad, 24 MB L2, HBM2e 64 GB / 1.6 TB/s. 国产 GPGPU 云端推理路线 (与 Hygon DCU / MetaX C500 同代).

### Stats
- **200/200** site E2E pass (+12 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 22, operator: 13, fused-kernel: 15, pattern: 15, **playbook: 9** (was 5)
- Build: 314 pages

---

## [1.11.0] — 2026-05-01

**Major: deployment optimization chain (gap 3) — Playbook entity introduced.**

After v1.7-v1.10 closed gaps 1 (hardware/cluster ~80%/100%) and 2 (operators/fusion: 13 ops + 15 patterns + 15 fused-kernels), gap 3 (deployment optimization chain) was the remaining frontier — pipeline pages existed but per-(model × hardware) recipe layer was missing. v1.11 introduces **Deployment Playbooks** as that bridge.

### Added

**Playbook entity (NEW)** — actionable per-(model_archetype × hardware_class × workload_profile) recipes:
- Schema: `schemas/playbook.ts` with parametric recipe (TP/EP/PP/SP, quant, engine, kernels, patterns, expected perf range, decision points across deploy scale, "not for" exclusions)
- Sits between **cases** (point-measurements) and **patterns** (cross-cutting signals) — answers "I have model X, hardware Y, what now?"
- 5 playbooks shipped:
  - **moe-llm-large × hopper-cluster**: DeepSeek V3 / Llama 4 Maverick / Qwen 3.5 on H100/H200 cluster (TP=8, EP=32-128, FP8, vLLM/SGLang, 2500-4500 tok/s/GPU)
  - **dense-llm-medium × hopper-single-node**: Llama 3.3 70B / Qwen 2.5 72B on 8x H100/H200 (TP=8, FP8 or BF16, 4500-8500 tok/s/GPU)
  - **moe-llm-large × blackwell-superpod**: NVL72 GB200 / NVL36 GB300 (TP=8, EP=72, FP4 native, disagg P:D=1:2)
  - **moe-llm-large × ascend-cluster**: 国产 Atlas 900 / CloudMatrix 384 + 910C/910D (TP=8, EP=32-128, INT8, MindIE 2.0)
  - **dense-llm-small × edge-single-card**: Llama 3 8B / Qwen 2.5 7B / Phi 4 on RTX 4090 / M3 Max / Jetson (INT4-AWQ, llama.cpp, 35-180 tok/s)

**UI for Playbooks**:
- `/playbooks/` index — 5 cards grouped by archetype + hardware-class with expected perf chips
- `/playbooks/[slug]/` detail — full recipe + decision points + cross-references to cases / patterns / fused-kernels / pipeline-stages
- **Pipeline stage pages** now cross-link to playbooks affecting that stage — makes the deployment chain navigable as a knowledge graph
- **Home page** surfaces Playbook entry as primary navigation card

**Memory hierarchy on 3 more cards** (28 → 31 → 34 deep-filled, **~87% coverage**):
- **AMD MI300A APU**: 64 KB LDS × 228 CU = 14 MB scratchpad, 192 MB L2 (6-XCD chiplet), **256 MB Infinity Cache**, 128 GB **unified HBM3** shared with Zen-4 CPU. Used in El Capitan exascale.
- **NVIDIA GB200 NVL72**: 256 KB RF + 228 KB SMEM × 160 SMs, 100 MB L2, 192 GB HBM3e / 8 TB/s, **NV-HBI dual-die bridge 10 TB/s** (Blackwell's defining feature)
- **Apple M4 Max ANE**: ~128 KB local cache × 16 NE cores, 32 MB SLC (shared SoC-wide), 128 GB **UMA LPDDR5X** — sleeper LLM platform (no GPU/HBM separation, unified address space)

### Stats
- **188/188** site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 22, operator: 13, fused-kernel: 15, pattern: 15, **playbook: 5** (new)
- Build: 310 pages

---

## [1.10.0] — 2026-05-01

Operator-level depth push (gap 2). Added 4 foundational operators + 3 fused-kernels covering MTP / SWA / RadixAttention. Hardware coverage now 80%.

### Added

**4 new operators** (9 → 13):
- **gelu** (Gaussian Error Linear Unit): BERT/GPT-2/GPT-3/T5/Falcon default activation. Variants: exact (erf-based), tanh approximation, fast (sigmoid). Fuses with FFN GEMM.
- **quantize-dequantize** (Q/DQ): Foundational op for FP8/FP4/INT8 paths. Documents 7+ quantization formats (INT8 sym/asym, FP8-E4M3/E5M2, INT4-AWQ/GPTQ, NVFP4, MXFP4) with calibration mechanics.
- **selective-scan** (Mamba/Mamba-2 SSM core): O(L · D · N) — sequence-length-independent arithmetic intensity, alternative to attention's O(L²). Implements parallel-prefix-scan + SSD path (matrix-multiply-reduction).
- **reduce-scatter** (TP/SP collective): Bandwidth-optimal half of all-reduce; key for zero-bubble TP. Documents Ring vs Tree vs SHARP variants. Critical for MoE EP and SP→TP transitions.

**3 new fused-kernels** (12 → 15):
- **fused-mtp-head** (DeepSeek V3 MTP): K-prediction-head fusion sharing target backbone. Includes comparison table vs Medusa / EAGLE-2 — MTP achieves 80-90% acceptance vs 60-75% for post-hoc draft methods.
- **fused-attn-sliding-window** (Mistral/Gemma SWA): Implicit mask + streaming KV evict + block-sparse early-exit fused into FlashAttn-3 path. Long context 4-40× speedup vs full attention.
- **fused-radix-attention** (SGLang RadixAttention kernel): Trie-on-GPU + block-aligned hit length + inline miss recompute. High-concurrency throughput +10-20% vs separate trie-then-attention.

**Memory hierarchy on 3 more cards** (28 → 31 deep-filled, **~80% catalog coverage**):
- **Biren BR104**: derated BR100 — 32 cluster × 192 KB ≈ 6 MB scratchpad, 16 MB L2 (50% of BR100), 32 GB HBM2e / 1.15 TB/s. Bi-link Mesh single-die (vs BR100 dual-die)
- **Cambricon MLU370-X8**: 256 KB SRAM × 64 IPU = 16 MB total, 24 MB L2 (chiplet bridged), 48 GB HBM2e dual-die. **First Cambricon chiplet design** — predates NV-HBI commercialization
- **Iluvatar 天垓 100**: 192 KB SMEM/SM (CUDA-compatible CoreX), 8 MB L2, 32 GB HBM2e / 1.2 TB/s. PCIe Gen4 fabric (no proprietary scale-up)

### Stats
- 178/178 site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 22, **operator: 13** (was 9), **fused-kernel: 15** (was 12), pattern: 15
- Build: 304 pages

---

## [1.9.0] — 2026-05-01

Operator-fusion / optimization-pattern push (gap 2 from the 3-gap directive). Patterns library 9 → 15, super-pod coverage now 100%.

### Added

**6 new optimization patterns** (9 → 15):
- **prefix-radix-cache** (RadixAttention 前缀缓存 trie): SGLang-style radix tree for token-level prefix sharing. Multi-turn chat TTFT 5-20×, prefill cost 60-90% reduction.
- **mtp-multi-token-prediction** (DeepSeek V3 MTP head): K-token prediction heads built into the model — 80-90% acceptance rate vs 60% for independent draft. Decode 1.6-2.5×.
- **sliding-window-attention** (Mistral / Gemma hybrid SWA): O(L·W) attention + streaming KV cache. KV memory 4-32× reduction at long context.
- **fp4-weight-only-quant** (NVFP4 / MXFP4 W4A16): Blackwell native FP4 path. Decode 1.8-2.5×, HBM 4× reduction. Hopper falls back to emulation (~1.2×).
- **ring-attention-long-context**: Sequence-parallel attention for 1M+ context. Memory linear-N reduction across N GPUs. Trade: prefill TTFT slightly worse, but unlocks contexts that don't fit single-card.
- **kv-cache-cpu-offload** (Mooncake / vLLM swap): HBM → host DRAM offload for idle multi-turn sessions. 5-20× active-session capacity. Cache-miss path adds 50-200ms TTFT.

**Memory hierarchy on 4 more cards** (24 → 28 deep-filled, **72% catalog coverage** up from 62%):
- **Biren BR100**: 192 KB L1/SPC × 64 SPCs = 12 MB scratchpad, 32 MB L2, HBM2e 64 GB / 2.3 TB/s, **on-package chiplet Bi-link Mesh** (国产首款 chiplet GPU)
- **Tenstorrent Wormhole n300**: 1.5 MB Tensix L1 SRAM × 128 cores ≈ 192 MB total on-die SRAM, GDDR6 24 GB (cost/efficiency tradeoff vs HBM), tile NoC mesh — RISC-V tile-based architecture
- **MetaX 曦云 C500**: 128 KB shared/CU × 64 CUs = 8 MB, 16 MB L2, HBM2e 64 GB / 1.8 TB/s. 单 die 路线 (vs Biren chiplet)
- **SambaNova SN40L**: 3-tier memory — 64 MB on-die SRAM (1040 RDU tiles × 64 KB PMU), 64 GB HBM3, **1.6 TB DDR5** (only accelerator that hosts 5T+ models in single node), reconfigurable RDU dataflow mesh

**Cluster internals on last 2 super-pods** (12 → 14, **100% super-pod coverage**):
- **Moore Threads KUAE 集群方案**: 8 nodes × 8 cards = 64 MTT-S4000. MTLink switch × 8 (radix 8, 50 GB/s/port) intra-node, 200 GbE RoCE 2:1 oversubscribed inter-node. 国产 GPU 集群参考方案
- **Cambricon 思元 X8 Server**: single-node 8× MLU590 reference design. MLU-Link-v2 switch (radix 8, 50 GB/s/port, similar to NVSwitch Gen-3 single-side), 4× 200 GbE RoCE optional scale-out. 训推一体, 4U air-cooled

### Stats
- 168/168 site E2E pass (+10 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 19, case: 22, fused-kernel: 12, **pattern: 15** (was 9)
- Build: 297 pages

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
