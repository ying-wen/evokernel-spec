# EvoKernel Spec — Roadmap

> **Last updated:** 2026-05-02
> **Current release:** **v2.17.0** (post-GA quality fill — formal_semantics depth + agent toolkit)
> **Live:** https://yingwen.io/evokernel-spec/
> **Previous (archived):** [ROADMAP.archived-v1.5.1.md](./ROADMAP.archived-v1.5.1.md)

---

## Where the project is

The original three gaps (hardware/cluster details · operator/fusion info ·
deployment chain) closed in **v1.17 → v1.43**, then **v2.0 GA** locked the
public surface. From there, the **v2.1 → v2.17** arc opened a *fourth* surface:
the project no longer just describes hardware/models — it lets an AI agent
**execute** an end-to-end "any model → any hardware" deployment, generate
actual kernel skeletons, and validate cross-vendor primitive ports.

This document captures (a) the v1.x and v2.x arcs, (b) the **3 quality gaps**
remaining in the post-2.17 phase (different from the v1.x quantity gaps), and
(c) what is deliberately deferred.

## State of the data (v2.17)

| Entity | Count | Coverage |
|---|---|---|
| Vendors | 28 | NVIDIA / AMD / Intel / Huawei / Cambricon / Moore Threads / Hygon / Biren — saturated |
| Hardware | 39 | All 39 cards have full specs · 18/39 (46%) deep memory_hierarchy · power+thermal envelope on all (v2.1) |
| Servers (super-pods) | 14 | 14/14 three-axis cluster internals · 8/14 deep |
| Models | 20 | Frontier LLM + reasoning models (v2.14) + scientific + diffusion |
| Model graphs | 10 | **Architecture → ops bridge** (v2.8 / v2.14) — DeepSeek V4 Pro decode, GLM-5 reasoning decode, etc. |
| Cases | 41 | Real measured deployments |
| Playbooks | 24 | (model archetype × hardware class) recipes |
| Patterns | 23 | Quant / KV-cache / parallel / kernel-fusion / scheduling / comm |
| **Operators** | **34** | **20/34 (59%) `formal_semantics`** — signature + edge_cases + numerical_rules + reference_impl |
| **Fused kernels** | **24** | **5/24 (21%) `formal_semantics`** — biggest remaining gap (see Tier 1 below) |
| **ISA primitives** (v2.6) | **15** | NVIDIA 3 · AMD 3 · Apple 2 · Huawei 2 · Cambricon · Hygon · Moore Threads · Biren — all with `cross_vendor_equivalents` mapping ratios |
| **DSL examples** (v2.7) | **5** | CUDA-Hopper · Ascend-C · HIP-CDNA3 · Triton · BANG-C — all GEMM-shape (next: attention/norm) |
| **Kernel libraries** (v2.5) | **8** | cuBLAS / cuDNN / CUTLASS / cuDSS / CANN / aclnn / rocBLAS / MIOpen |
| **Engine compile workflows** (v2.12) | **4** | TRT-LLM build · vLLM compile · MindIE convert · SGLang loader |
| **Reference impls** (v2.7) | **3** | Triton-FA / FlashInfer / OpenAI-Triton-MoE |
| **Profiling tools** (v2.7) | **6** | NCU / msprof / cnperf / rocprof / suprof / Triton-profiler |
| Quantizations | 9 | BF16 / FP16 / FP8 (E4M3, E5M2) / FP4 (NVFP4, MXFP4) / INT8 / INT4 (AWQ, GPTQ) |
| Engines | 7 | vLLM / SGLang / TRT-LLM / MindIE / lmdeploy / MoRI / HanGuangAI — full capability matrix |
| Pipeline stages | 7 | acquire / convert / quantize / compile / shard / serve / observe |
| Tours | 11 | Edge → super-pod spectrum |
| **JSON API endpoints** | **20** | `/api/{hardware,models,operators,fused-kernels,isa-primitives,dsl-examples,kernel-libraries,engines,engine-compile-workflows,model-graphs,profiling-tools,reference-impls,playbooks,coverage-matrix,cases,solve,index,openapi,health,healthz}.json` |
| **Plugins** (v2.11) | **4** | `plugins/mcp-server/` (6 MCP tools) · `plugins/claude-code-skill/` · `plugins/codex/` · `plugins/cursor-rules/` |
| **Agent pipeline** (v2.9 → v2.16) | **2,177 LOC** | `scripts/agent-deploy/` — 7-stage end-to-end (analyze → plan → kernel-codegen → production-artifacts → validate → ship), 49-run validation matrix |
| Citations | 1 | Seed entry only — needs community PRs |
| Site E2E tests | 470+ | All passing |
| Build pages | 494 | < 2 second build |

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

## The v2.0 → v2.17 arc — agent layer + 5-layer hw-sw gap framework

Where v1.x answered **"what's the hardware/model/playbook?"**, the v2.x arc
answered **"can an AI agent take any model and ship it on any hardware?"**.
This required modeling the **5-layer hw-sw gap** (see
`docs/superpowers/specs/2026-05-02-hw-sw-gap.md`):

| Layer | What | Where it lives |
|---|---|---|
| **A — ISA primitives** | WGMMA / TMA / MFMA / Cube / MMA — the silicon-level instructions, with cross-vendor equivalence ratios | `data/isa-primitives/` (v2.6) · `/isa-primitives/` |
| **B — Programming model / DSL** | CUDA / HIP / Ascend-C / BANG-C / Triton — how you actually write a kernel | `data/dsl-examples/` (v2.7) · `/dev-toolkit/dsl-examples/` |
| **C — Kernel libraries** | cuBLAS / CUTLASS / aclnn / rocBLAS — vendor BLAS/DNN packages | `data/kernel-libraries/` (v2.5) · `/kernel-libraries/` |
| **D — Formal semantics** | Operator signatures, edge cases, numerical rules — what's *correct* across vendors | `formal_semantics` field on ops + fused-kernels (v2.5+, ongoing) |
| **E — Coverage matrix** | Which (op × arch) cells are filled? Where are gaps? | `data/coverage-matrix.ts` (v2.6) · `/operators/coverage-matrix/` |

### Three new deliverables emerged

| # | Deliverable | What it does |
|---|---|---|
| **1** | **`scripts/agent-deploy/`** (v2.9 → v2.16) | CLI agent that takes a model spec + target hardware and runs a 7-stage pipeline: detect kernel gaps → plan ports → **generate actual CUDA/Ascend-C/HIP skeleton code** (v2.16) → emit production artifacts (Dockerfile, K8s, runbook, SBOM, license-audit) → run a 49-cell validation matrix |
| **2** | **`plugins/`** (v2.11) | MCP server + Claude-Code skill + Cursor rules + Codex prompts — the same pipeline accessible from any LLM-capable IDE |
| **3** | **`/api/solve.json`** + 19 other endpoints | Machine-readable surface for any external agent (CC-BY-SA 4.0) |

### The v2.x release table

| Version | Theme |
|---|---|
| v2.0.0 | **GA — stable public surface** |
| v2.1 | Hardware power & thermal envelope (39/39) |
| v2.2 | `/operators/hardware-fitness/` — op × arch fitness matrix |
| v2.3 | `/learn/cost-optimization/` — 14 cost levers × 6 archetypes |
| v2.4 | Agent-readiness — JSON API extensions + `/api/solve.json` + `/agents/` |
| v2.5 | hw-sw gap **Layer C + D** — kernel libraries + first formal_semantics |
| v2.6 | hw-sw gap **Layer A + E** — ISA primitives + coverage matrix |
| v2.7 | `/dev-toolkit/` — DSL examples + reference impls + profiling tools |
| v2.8 | Model execution graphs — bridge from architecture to ops |
| v2.9 | End-to-end agent sample — any HF model → any hardware (production-grade) |
| v2.10 | Empirical validation matrix — 5 models × 3 hardware (15/15 pass) |
| v2.11 | **国产** hardware expansion + MCP / Claude Code / Cursor / Codex plugin system |
| v2.12 | MCP server tested + 5 more formal_semantics + EngineCompileWorkflow |
| v2.13 | MCP `plan_deployment` verified + 4 国产 ISA primitives + 3 more formal_semantics |
| v2.14 | Reasoning model coverage + 4 more formal_semantics + 49-run validation |
| v2.15 | `FusedKernelSchema.formal_semantics` introduced — 2 entries (FA3, fused-mlp-silu) |
| v2.16 | **Actual kernel codegen** — `kernel-codegen.ts` emits compileable CUDA/Ascend-C/HIP skeletons + non-HF inputs + DSV4 Pro demo verified |
| v2.17 | Layer D depth fill — 5 more op formal_semantics + 3 fused-kernel formal_semantics + BANG-C DSL example |

### Three quality gaps remaining (v2.18+ targets)

The v1.x gaps were about **quantity** ("the data isn't there"). The post-2.17
gaps are about **quality** ("the data is there but the agent's output isn't
useful enough yet").

#### Gap Q1 — Fused-kernel formal_semantics: 5/24 → ~24/24

This is the **biggest remaining gap**. Fused-kernels are where the agent's
recommendations actually land (it picks fused-rope-qkv, not raw rope+matmul).
Without `formal_semantics` per fused kernel, the agent can't tell the human
reviewer *which* numerical rule will break when porting from Hopper to CDNA3.

**Priority entries** (drives DeepSeek / Llama / Qwen deploys):
flash-decoding · flash-mla · fused-rope-qkv · fused-attn-sliding-window ·
fused-radix-attention · fused-moe-dispatch-deepep · fused-spec-decode ·
fused-mtp-head · fused-selective-scan · mooncake-kv-disaggregation ·
fused-allreduce-residual · fused-tp-allreduce-residual · fused-allgather-gemm ·
fused-grouped-gemm · fused-dequant-gemm · fused-kv-quant ·
fused-rmsnorm-residual-quantize · fused-conv-norm-act · fused-add-bias-gelu

#### Gap Q2 — Op-class-aware kernel codegen

`kernel-codegen.ts` (v2.16) currently uses a **single GEMM template** for every
op. This is wrong for `expert-permute` (sort+scatter, no MMA), `rmsnorm`
(row-reduction + per-row rescale, vector-unit on Ascend), `attention` (tile-pair
iteration with online softmax). The fix is a 4-way dispatch on op class
(gemm / attention / norm / scatter-permute) — same prologue/epilogue, different
inner loop. v2.18 ships this.

#### Gap Q3 — Collective-op formal_semantics + DSL examples

Operators 14/34 missing `formal_semantics` are concentrated in collectives
(allreduce, all-gather, all2all, reduce-scatter, memcpy-async) — the cells that
matter most for multi-card deploys. DSL examples are also all GEMM-shape;
no attention/norm/all2all examples yet.

---

## v2.18+ trajectory

| Sprint | Theme | Concrete deliverables |
|---|---|---|
| **v2.18** | Fused-kernel depth + op-class codegen | 5 fused-kernel `formal_semantics` (flash-decoding, flash-mla, fused-rope-qkv, fused-attn-sliding-window, fused-moe-dispatch-deepep) + 4-way op-class codegen dispatch (gemm / attention / norm / scatter-permute) |
| v2.19 | Collective ops complete | 5 op `formal_semantics` (allreduce, all-gather, all2all, reduce-scatter, memcpy-async) + NCCL+HCCL DSL example |
| v2.20 | Agent toolkit visibility | `/dev-toolkit/agent-toolkit/` index page + plugins documentation + 5-layer framework visualization |
| v2.21 | DSL examples horizontal expansion | 4 new DSL examples (attention-on-Hopper, rmsnorm-on-Ascend, fused-rope-qkv-on-Triton, all2all-on-NCCL/HCCL) |
| v2.22 | Fused-kernel depth fill cont. | Remaining 14 fused-kernel `formal_semantics` |
| v2.23 | Operator depth fill cont. | Remaining 9 op `formal_semantics` (embedding-lookup, cross-entropy, dropout, repeat-interleave, layer-norm, group-norm, swiglu, softmax, mla-attention) |
| v2.24 | E2E agent regression suite | Frozen 49-run validation as CI job — catches regressions in codegen / planning agent |

When all of v2.18-v2.24 ship, the agent layer's "any model × any hardware" promise
will be reproducibly verifiable from CI alone, and the post-deployment optimization
chain (Gap 3 of v1.x) will be backed by formal_semantics for every (op, kernel)
the agent might suggest.

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
