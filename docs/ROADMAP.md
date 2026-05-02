# EvoKernel Spec — Roadmap

> **Last updated:** 2026-05-02
> **Current release:** v1.43.0 (about to cut **2.0.0 GA**)
> **Live:** https://yingwen.io/evokernel-spec/
> **Previous (archived):** [ROADMAP.archived-v1.5.1.md](./ROADMAP.archived-v1.5.1.md)

---

## Where the project is

After **27 single-themed iterations** (v1.17 → v1.43, all shipped 2026-05-01 → 2026-05-02) the
three "gaps" called out by the original brief — **hardware/cluster details ·
operator/fusion info · deployment chain** — are all closed. The project is
about to cut **v2.0.0 GA** as the stable public surface.

This document captures (a) what shipped in the v1.x arc, (b) what remains as
explicit opt-in work for the post-2.0 phase, and (c) which architectural
decisions are deliberately deferred or out of scope.

## State of the data (v1.43)

| Entity | Count | Coverage |
|---|---|---|
| Vendors | 28 | NVIDIA / AMD / Intel / Huawei / Cambricon / Moore Threads / etc. — saturated |
| Hardware | 39 | All 39 cards have full specs · 18/39 (46%) deep memory_hierarchy |
| Servers (super-pods) | 14 | 14/14 across 3 architectural axes (host_cpu / network_topology / storage_architecture) · 8/14 (57%) full cluster internals |
| Models | 20 | Frontier LLM (DeepSeek V4 Pro / Llama 4 / Qwen 3.6 / Kimi K2.6 / GLM-5 / MiniMax M2.7) + scientific (AlphaFold 3 / GraphCast) + diffusion |
| Cases | 41 | Real measured deployments — at least 1 per major (model × hardware) cell |
| Playbooks | 24 | (model archetype × hardware class) recipes |
| Patterns | 23 | Quantization / KV-cache / parallel / kernel-fusion / scheduling / communication |
| Operators | 34 | Includes MLA, expert-permute, speculative-verify, selective-scan, mamba-conv1d, lora-bgmv, online-softmax, block-quantize, index-put |
| Fused kernels | 24 | FlashAttn-3, MLA-flash, RMSNorm-residual-quant, AG+GEMM, Mooncake KV-disagg, FusedSpecDecode, FusedQuantizedAttention (FP4) |
| Quantizations | 9 | BF16 / FP16 / FP8 (E4M3, E5M2) / FP4 (NVFP4, MXFP4) / INT8 / INT4 (AWQ, GPTQ) |
| Engines | 7 | vLLM / SGLang / TRT-LLM / MindIE / lmdeploy / MoRI / HanGuangAI — **full capability matrix** (60+ features × 6 axes) |
| Pipeline stages | 7 | acquire / convert / quantize / compile / shard / serve / observe |
| Tours | 11 | Edge → super-pod spectrum |
| /learn/ pages | 14 | Decision guides + tours + symptom troubleshooting + 4 migration playbooks |
| Citations | 1 | Seed entry only; **needs community PR contributions** |
| Site E2E tests | 470 | All passing |
| Build pages | 451 | < 2 second build |

## The three gap closures — all ✅

### Gap 1 — cluster-internal info: ✅ **CLOSED**

Three architectural axes filled 14/14 across all super-pods:

- **`host_cpu`** (v1.27): name / vendor / arch / cores / sockets / PCIe / RAM / coherent-link / notes
- **`network_topology`** (v1.28): topology family / diameter / bisection / latency / SHARP / RDMA / notes
- **`storage_architecture`** (v1.29): local NVMe / parallel FS / GDS / RDMA / checkpoint strategy / notes

Each axis has its own matrix view (`/servers/host-cpu-matrix/`,
`/servers/network-topology-matrix/`, `/servers/storage-matrix/`) plus inline
display on every per-server detail page. The unified `/servers/cluster-internals/`
view (v1.33) reads all 3 axes side-by-side. Visual encoding (accent border)
flags 三轴全 ✓ "elite" super-pods.

### Gap 2 — operator / fusion info: ✅ **CLOSED**

34 operators × 24 fused kernels × 23 patterns. Coverage:

- Standard: matmul / attention / softmax / RMSNorm / RoPE / GeLU / SwiGLU / etc.
- Communication: AllReduce / AllGather / All2All / ReduceScatter / memcpy-async
- MoE: moe-gate / expert-permute / grouped-matmul
- Modern attention: scaled-dot-product-attention / MLA (DeepSeek V3) / sliding-window
- Speculative: speculative-verify
- SSM/Mamba: selective-scan / **mamba-conv1d**
- LoRA: **lora-bgmv** (Punica/S-LoRA primitive)
- Quantization: **block-quantize** (NVFP4/MXFP4/GPTQ/AWQ block scaling)
- KV cache write: **index-put** (paged-attention primitive)
- Attention internals: **online-softmax** (FlashAttention algorithmic core)

Plus the **`/operators/fusion-graph/`** SVG bipartite graph view (v1.38) that
surfaces single-direction edges as data-completeness PR opportunities.

### Gap 3 — deployment optimization chain: ✅ **CLOSED**

The chain now has dedicated guides at every step:

| Step | Guide | Purpose |
|---|---|---|
| 0 | `/learn/capacity-planning/` (v1.31) + `/calculator/capacity-planner/` (v1.32) | "How big should I size this?" |
| 1 | `/learn/picking-engine/` + `/engines/compare/` (v1.42) | "Which engine fits my hardware × workload?" |
| 2 | `/learn/quantization-decision-tree/` + `/learn/picking-quantization-format/` | "What precision?" |
| 3 | `/learn/parallelism-cheatsheet/` | "How do I shard?" |
| 4 | `/learn/deployment-failures/` | "What's likely to go wrong?" — 27 cases × 7 stages |
| 5 | `/learn/observability/` (v1.30) | "How do I monitor it?" — 4 metric tiers, 5 stack tools |
| 6 | `/learn/production-lifecycle/` (v1.30) | "How do I change it without breaking it?" |
| 7 | `/learn/troubleshooting/` (v1.40) | "On-call at 3 AM, what's wrong?" — symptom-driven |
| 8 | **`/learn/migrations/` (v1.43)** | "I'm on X, want to move to Y?" — 4 paths × 7-step framework |

Plus tools at every stage: `/calculator/`, `/compare/`, `/servers/compare/`,
`/playbooks/`, `/patterns/`, `/fused-kernels/`, `/operators/`,
`/operators/fusion-graph/`, `/engines/compare/`, `/pricing/by-engine/`.

---

## Post-2.0 work — prioritized

### Tier 1 — high-leverage, community work (no engine code change)

#### Citation PR onboarding

Active outreach to authors of papers that use the project's data — genuine
citations build credibility on `/impact/`. The infrastructure is in place
(citation schema + page) since v1.18; only 1 seed entry exists. Tracked as
the #1 community priority.

#### Backfill memory_hierarchy on remaining 21 cards

18/39 cards have deep RF→SMEM→L2→L3→HBM hierarchy. Open candidates: B300,
Trainium 2, Hygon DCU K100, Moore Threads MTT S5000, Iluvatar Tianhang,
Biren BR104, etc. Each card takes ~30 min from vendor whitepaper to YAML.

#### Backfill cluster_internals on remaining 6 super-pods

Currently 8/14 super-pods have full cluster internals (switch_chips,
oversubscription, power, cabinet_layout, SVG fabric). Remaining: HGX H800,
Atlas 800, MLU590-pod, Kuae-cluster, MI300X-platform, B300-NVL16. Same
schema-extend recipe: vendor whitepaper → YAML.

### Tier 2 — medium-leverage, requires code work (1-2 iterations each)

#### Auto-translated vendor doc summaries

Build-time job calls Anthropic API to summarize Ascend CANN release notes,
Cambricon Neuware updates, MindIE changelogs into English. Surfaces in
`/vendors/<id>/news/`. Cost: ~$5-10/month at current cadence. Removes the
single biggest English-speaker friction.

#### Citation auto-import

Daily cron job scanning Twitter/X mentions, GitHub repos linking to the
project, arxiv papers citing data values. Auto-files PRs to `data/citations/`.

#### Lighthouse on PR gate

Currently weekly cron. Move to PR-time gate using path filters (only run
when `apps/web/src/**` changes). Trade-off: ~2 minutes added to relevant PRs.

#### EN translation parity enforcement

Add type-level assertion that `keyof typeof dict.zh ≡ keyof typeof dict.en`.
Prevents new keys landing in only one locale. Currently the i18n fallback
prevents runtime errors but lets ZH-only content ship silently.

### Tier 3 — large bets (4+ iterations each)

#### Interactive deployment journey visualization

Pick (model + hardware) → see the full deployment chain auto-traced through
all 7 pipeline stages. Each stage shows: relevant patterns, fused kernels,
operators, decision points. State-machine-driven.

#### Real benchmark CI runner

Currently every case is a YAML claim with evidence. Adding a CI runner that
periodically reproduces benchmarks on rented GPU nodes would let cases be
auto-refreshed instead of going stale. Major infrastructure work — needs
budget + secrets management + worker pool.

#### Multi-language expansion

zh + en already done. Adding ja / ko / es / fr would broaden reach. Schema
is locale-ready; the work is translation labor.

#### Private deployment edition

On-premise mirror with proprietary case data restricted to authenticated users.
Customer-specific deployment recipes vs public catalog.

#### `/api/health.json` true 503 status code

Currently SSG limitation: body says "degraded" but HTTP returns 200. Fix
requires hybrid runtime (`output: 'hybrid'`) which breaks pure-static deploy
targets like GitHub Pages. Defer until demand surfaces.

---

## Architectural decisions — deliberately out of scope

- **Database vs YAML**: YAML stays — it's PR-friendly and version-controllable.
  Moving to a DB would require a backend service.
- **Comments / discussion**: Out of scope for static SSG. GitHub Discussions
  is the canonical forum.
- **User accounts**: Same — out of scope.
- **IE11 / legacy browser support**: Modern browsers only (Chrome 90+,
  Firefox 90+, Safari 15+). Inference-hardware engineers don't run IE11.

---

## Process notes for next contributor

- Each release is single-themed (one big idea + small content boost). This
  matches the project's iteration cadence and keeps changelogs readable.
- Follow the **schema-extension recipe** when adding new architectural axes:
  schema field → populate all entities → per-detail-page card → matrix view →
  nav-groups.ts wiring. Used 4 times (host_cpu / network_topology /
  storage_architecture / engine capabilities).
- Test budget: 7-12 new E2E tests per release. Keeps coverage growing
  without inflating test runtime past 90 s.
- Build invariant: < 1000 pages should always build in < 2 min. We're at 451
  pages currently with builds ~1 s.
- The single-source-of-truth file `apps/web/src/lib/nav-groups.ts` controls
  both the homepage section structure and the nav dropdown content. Don't
  duplicate.

---

## The v1.17 → v1.43 arc

| Version | Date | Theme |
|---|---|---|
| v1.17 | 2026-05-01 | Production gotcha drilldown — `/learn/deployment-failures/` |
| v1.18 | 2026-05-01 | Impact metrics surface — GitHub stars + `/impact/` dashboard |
| v1.19 | 2026-05-01 | Operator gap fill — quantization decision tree + 4 patterns |
| v1.20 | 2026-05-01 | `/learn/` triad — parallelism cheatsheet + picking-engine |
| v1.21 | 2026-05-01 | Triple-gap closure — attention variants + `/servers/compare/` |
| v1.22 | 2026-05-01 | Integration — fusion-matrix + format picker + 1st tour |
| v1.23 | 2026-05-01 | Tour expansion — 3 tours covering deployment spectrum |
| v1.24 | 2026-05-01 | Tour refactor — data-driven + edge tour |
| v1.25 | 2026-05-01 | Validate refactor — 2 more YAML tours + authoring guide |
| v1.26 | 2026-05-01 | `host_cpu` schema + matrix view + AMD tour |
| v1.27 | 2026-05-01 | IA redesign — Nav dropdowns + homepage sections + host_cpu 14/14 |
| v1.28 | 2026-05-02 | `network_topology` schema + matrix + 2 fused kernels + Cambricon tour |
| v1.29 | 2026-05-02 | `storage_architecture` — third architectural axis complete |
| v1.30 | 2026-05-02 | observability + production-lifecycle (gap-3 closed) + 2 ops |
| v1.31 | 2026-05-02 | capacity-planning step-0 + LoRA pattern + roadmap doc |
| v1.32 | 2026-05-02 | capacity-planner interactive calculator |
| v1.33 | 2026-05-02 | `/servers/cluster-internals/` unified 3-axis view |
| v1.34 | 2026-05-02 | `/changelog/` page + RSS feed + `marked`-driven release log |
| v1.35 | 2026-05-02 | Diffusion model schema generalization (FLUX / SD3) |
| v1.36 | 2026-05-02 | `/pricing/by-engine/` engine-cost calibration matrix + 2 tours |
| v1.37 | 2026-05-02 | 2 more tours (Kimi K2.6 reasoning B200 + GPT-OSS Atlas) |
| v1.38 | 2026-05-02 | `/operators/fusion-graph/` SVG bipartite view |
| v1.39 | 2026-05-02 | `/contribute/case-form/` public submission portal |
| v1.40 | 2026-05-02 | `/learn/troubleshooting/` symptom-driven decision tree |
| v1.41 | 2026-05-02 | 5 more operators (lora-bgmv / online-softmax / block-quantize / index-put / mamba-conv1d) |
| v1.42 | 2026-05-02 | `/engines/compare/` engine capability matrix (7 × 60+) |
| v1.43 | 2026-05-02 | `/learn/migrations/` 4 migration playbooks (engine / hardware / quant / scaling) |
| **v2.0.0** | **2026-05-02** | **GA — stable public surface** |

The most useful repeating pattern was the **schema-extension recipe**:
schema field → populate all entities → per-detail-page card → matrix view →
nav-groups.ts wiring. Used 4 times (host_cpu, network_topology, storage_architecture,
engine_capabilities). Recommended for any new architectural axis (cooling-class,
power-class, security-posture, certification-coverage).
