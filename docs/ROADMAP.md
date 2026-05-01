# EvoKernel Spec — Roadmap

> **Last updated:** 2026-05-02
> **Current release:** v1.31.0
> **Live:** https://yingwen.io/evokernel-spec/
> **Previous (archived):** [ROADMAP.archived-v1.5.1.md](./ROADMAP.archived-v1.5.1.md)

## Where the project is

After 15 iterations (v1.17 → v1.31, all shipped 2026-05-01 → 2026-05-02) the
three "gaps" called out by the original brief — **hardware/cluster details ·
operator/fusion info · deployment chain** — have been substantially closed.
This document captures (a) what's done, (b) what remains, and (c) prioritized
future work for the next contributor or session.

## State of the data (v1.31)

| Entity | Count | Coverage notes |
|---|---|---|
| Vendors | 28 | NVIDIA / AMD / Intel / Huawei / Cambricon / Moore Threads / etc. — saturated |
| Hardware | 39 | All 39 cards have full specs; 100% memory_hierarchy populated |
| Servers (super-pods) | 14 | **All 14 covered on three architectural axes**: host_cpu (v1.27), network_topology (v1.28), storage_architecture (v1.29) |
| Models | 19 | Frontier open-source: Llama 4 family, DeepSeek V3/V4/R1, Qwen 3.6, GLM-5, Kimi K2.6, Mistral, Gemma 3, MiniMax M2.7, etc. |
| Cases | 38 | Real measured deployments — at least 1 per major (model × hardware) cell |
| Playbooks | 24 | (model archetype × hardware class) recipes |
| Patterns | 23 | Quantization / KV-cache / parallel / kernel-fusion / scheduling / communication |
| Operators | 29 | Including DeepSeek-V3 MLA, expert-permute, speculative-verify, memcpy-async |
| Fused kernels | 24 | FlashAttn-3, MLA-flash, RMSNorm-residual-quant, AG+GEMM, etc. |
| Quantizations | 9 | BF16 / FP16 / FP8 (E4M3) / FP4 / INT8 / INT4 / MXFP4 / AWQ / GPTQ |
| Engines | 7 | vLLM / SGLang / TRT-LLM / MindIE / lmdeploy / Triton / others |
| Pipeline stages | 7 | acquire / convert / quantize / compile / shard / serve / observe |
| Tours | 8 | Edge → super-pod spectrum: Jetson / H200 / MI325X / Gaudi 3 / H100-disagg / CloudMatrix / MLU590 / NVL72 |
| /learn/ guides | 10 | overview + tours + 8 decision-tree / cheatsheet / playbook guides |
| Citations | 1 | Seed entry only; **needs community PR contributions** |
| Site E2E tests | 379 | All passing |
| Build pages | 422 | < 1 second build |

## The three gap closures

### Gap 1 — cluster-internal info: ✅ **CLOSED**

Three architectural axes populated 14/14 across all super-pods:

- **`host_cpu`** (v1.27): name / vendor / arch / cores / sockets / PCIe / RAM / coherent-link / notes
- **`network_topology`** (v1.28): topology family / diameter / bisection / latency / SHARP / RDMA / notes
- **`storage_architecture`** (v1.29): local NVMe / parallel FS / GDS / RDMA / checkpoint strategy / notes

Each axis has its own matrix view (`/servers/host-cpu-matrix/`,
`/servers/network-topology-matrix/`, `/servers/storage-matrix/`) and is also
displayed inline on every per-server detail page. Per-axis "best value"
highlighting + family distribution stats baked in.

**Remaining**: No fourth axis is needed; the trilogy covers the architectural
divides. Optional capstone in v1.32+ would be a unified
`/servers/cluster-internals/` view that reads all 3 axes side-by-side, but
this is deduplicative — readers who want comprehensive comparison already have
`/servers/compare/`.

### Gap 2 — operator / fusion info: ✅ **mostly closed**

29 operators × 24 fused kernels × 23 patterns. Major frontier ops covered:

- Standard: matmul / attention / softmax / RMSNorm / RoPE / GeLU / SwiGLU / etc.
- Communication: AllReduce / AllGather / All2All / ReduceScatter / **memcpy-async**
- MoE: moe-gate / **expert-permute** / grouped-matmul
- Modern attention: scaled-dot-product-attention / **MLA** (DeepSeek V3) / sliding-window
- Speculative: **speculative-verify**
- SSM/Mamba: selective-scan

**Remaining gaps** (low-priority / specialized):

- `lora-adapter-bgmv` operator (BGMV kernel is the dual of LoRA pattern)
- `expert-load-balance` operator (variant of expert-permute with bucketing)
- `flash-attention-v3-fp8` as separate variant (currently inside flash-attention-v3)
- `paged-attention-decode-tree-spec` for tree speculative

These are all minor refinements; the operator layer is mature.

### Gap 3 — deployment optimization chain: ✅ **CLOSED**

The chain now has **7 sequential steps** with dedicated guides:

| Step | Guide | Purpose |
|---|---|---|
| 0 | `/learn/capacity-planning/` (v1.31) | "How big should I size this?" — 7-step sizing math |
| 1 | `/learn/picking-engine/` | "Which engine fits my hardware × workload?" |
| 2 | `/learn/quantization-decision-tree/` | "What precision?" — 3-branch decision tree |
| 3 | `/learn/parallelism-cheatsheet/` | "How do I shard?" — TP/PP/EP/SP combinator |
| 4 | `/learn/deployment-failures/` | "What's likely to go wrong?" — 27 cases × 7 stages |
| 5 | `/learn/observability/` (v1.30) | "How do I monitor it?" — 4 metric tiers, 5 stack tools |
| 6 | `/learn/production-lifecycle/` (v1.30) | "How do I change it without breaking it?" — rollout / A/B / migration / rollback |

Plus tools at every stage: `/calculator/`, `/compare/`, `/servers/compare/`,
`/playbooks/`, `/patterns/`, `/fused-kernels/`, `/operators/`.

**Remaining**: Capacity planning could grow into a dedicated calculator that
auto-computes sizing given (model, hardware, QPS, SLO) inputs. v1.31 covers the
math; the interactive tool is a v1.32+ enhancement.

## Future work — prioritized

### Tier 1: high-leverage, low-effort (1-2 iterations each)

#### Capacity-planning interactive calculator

Make `/learn/capacity-planning/` interactive — same math but with form inputs.
Estimate: 1 React island + 4 inputs (model / hardware / QPS / SLO) + 1 output panel.
Reuses existing `/calculator/` infrastructure.

#### Citation PR onboarding

v1.18 added citation infrastructure but only 1 seed entry. Active outreach to
authors of papers that use the project's data → genuine citations build credibility
on `/impact/`. Not code work — community work.

#### "What's new this week" RSS feed

Auto-generate `/feed.xml` from git log filtered to `data/` and `apps/web/src/pages/`.
1 build-time script + RSS template.

#### `/servers/cluster-internals/` unified view

Read all 3 axes (host_cpu + network_topology + storage_architecture) into a single
matrix. Lower priority because the per-axis matrices already serve specific user
queries; this is a scannability nice-to-have.

#### More tours

- **SD3 / Flux on Hopper** (diffusion) — needs minor schema work for non-LLM models
- **Kimi K2.6 reasoning on B200** — frontier reasoning + Blackwell FP4
- **GPT-OSS 70B on Atlas 800T** — 国产 推理 alt path beyond DeepSeek

### Tier 2: medium-leverage, medium-effort (2-3 iterations each)

#### Per-engine cost calibration matrix

Currently `/pricing/` ranks (model × hardware) cells. Adding engine as a third
dimension would surface "vLLM vs SGLang vs MindIE on same chip" cost variance.
Schema work: add `engine_calibration` field to cases or build `engine-pricing`
table.

#### Auto-translated vendor doc summaries

Build-time job calls Anthropic API to summarize Ascend CANN release notes,
Cambricon Neuware updates, MindIE changelogs into English. Surfaces in
`/vendors/<id>/news/`. Cost: ~$5-10/month at current cadence.

#### Operator → fused-kernel DAG visualization

Cytoscape-style graph showing which operators get fused into which kernels.
Pre-existing `participates_in_fused_kernels` data is enough to build it.
1 React island + d3-force layout.

#### Public submission portal

Web form that generates a PR-ready case YAML from form input. Removes "have to
fork + clone + edit YAML" friction. Major contributor on-ramp.

#### `/impact/` citation auto-import

Daily cron job that scans Twitter/X mentions, GitHub repos linking to the project,
arxiv papers citing data values. Auto-files PRs to `data/citations/`.

### Tier 3: large bets (4+ iterations each)

#### Interactive deployment journey visualization

Pick (model + hardware) → see the full deployment chain auto-traced through all
7 pipeline stages. Each stage shows: relevant patterns, fused kernels, operators,
decision points. State-machine-driven.

#### Real benchmark runner

Currently every case is a YAML claim with evidence. Adding a CI runner that
periodically reproduces benchmarks on rented GPU nodes would let cases be
auto-refreshed instead of going stale. Major infrastructure work.

#### Multi-language expansion

zh + en already done. Adding ja / ko / es / fr would broaden reach. Schema is
locale-ready; the work is translation labor.

#### Private deployment edition

On-premise mirror with proprietary case data restricted to authenticated users.
Customer-specific deployment recipes vs public catalog.

## Architectural decisions to defer

- **Database vs YAML**: YAML stays — it's PR-friendly and version-controllable.
  Moving to a DB would require a backend service.
- **Comments / discussion**: Out of scope for static SSG. GitHub Discussions is
  the canonical forum.
- **User accounts**: Same — out of scope.

## Process notes for next contributor

- Each release is single-themed (one big idea + small content boost). This
  matches the project's iteration cadence and keeps changelogs readable.
- Follow the v1.27/28/29 schema-extension recipe when adding new architectural
  axes: schema field → populate all entities → per-detail-page card → matrix view → nav-groups.ts wiring.
- Test budget: 11-12 new E2E tests per release. Keeps coverage growing without
  inflating test runtime past 30 s.
- Build invariant: < 500 pages should always build in < 2 min. We're at 422
  pages currently with builds ~0.7 s.
- The single-source-of-truth file `apps/web/src/lib/nav-groups.ts` controls both
  the homepage section structure and the nav dropdown content. Don't duplicate.

## Summary of the v1.17 → v1.31 arc

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
| v1.27 | 2026-05-01 | IA redesign — Nav dropdowns + homepage sections + `host_cpu` 14/14 |
| v1.28 | 2026-05-02 | `network_topology` schema + matrix + 2 fused kernels + Cambricon tour |
| v1.29 | 2026-05-02 | `storage_architecture` — third architectural axis complete |
| v1.30 | 2026-05-02 | observability + production-lifecycle (gap-3 closed) + 2 ops |
| v1.31 | 2026-05-02 | capacity-planning step-0 + LoRA pattern + roadmap doc |

The most useful repeating pattern across this arc was: **schema field → populate
all entities → per-detail-page card → matrix view → nav-groups.ts wiring**.
Used 3 times for the cluster-internal trilogy; could be applied for any new
architectural axis (e.g. cooling-class, power-class, security-posture,
certification-coverage).
