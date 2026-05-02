# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to semantic versioning ([SemVer](https://semver.org/spec/v2.0.0.html)).

The release workflow (`.github/workflows/release.yml`) auto-publishes a GitHub Release with the offline tarball when a `v*` tag is pushed; the auto-generated release notes are derived from `git log <prev>..<this>`. This file is the curated, human-readable counterpart.

## [Unreleased]

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full prioritized plan. Next up: **v3.6 — Layer F automated feedback** (auto-fill `agent-learning.yaml` from V1/V2/V3 results + Layer G retry loop on V failure with diagnostic).

---

## [3.5.0] — 2026-05-03 — Layer V verification harness

**Theme**: response to user directive — agent must "保证验证测试通过". v3.4 generates code; v3.5 ships the verification gates that prove it works.

### Added — `scripts/agent-deploy/verify/` (4 modules + 10 tests)

**Architecture**: 3-gate pipeline (V1 → V2 → V3) with **2 modes per gate**:
- **structural** (always runs in CI; static analysis only)
- **execution** (requires target hardware/compilers; v3.5 ships V1; v3.6+ wires V2/V3 execution)

| Gate | Structural mode | Execution mode |
|---|---|---|
| **V1 — Build** | 5 static checks: non-comment code, includes/imports, kernel marker, no TODO/pseudocode markers, host launch wrapper | Invokes target compiler (nvcc / hipcc / bisheng / cncc / musac / triton-jit) — graceful skip if compiler not in PATH |
| **V2 — Correctness** | Op-class invariants (attention online-softmax (m,s,acc) FP32, norm FP32 partial sum, GEMM tensor-core+FP32-acc, collective primitive call, scatter atomicAdd) + numerical_rules cross-checks (FP32 mandatory if formal_semantics says so) | v3.5 ships API + structural; v3.6 wires PyTorch reference comparison with tolerance from `formal_semantics.numerical_rules` |
| **V3 — Perf** | Perf-friendliness checks (Hopper async copy / TMA, tensor-core MMA usage, fast-memory tile staging, no naive global-memory loops) | v3.5 ships placeholder; v3.6 wires NCU/rocprof/msprof/cnperf/suprof + delta vs predicted throughput |

### Critical implementation details

**Comment stripping before structural checks** — without this, a comment like `// FP32 not used here` would falsely satisfy a "code uses FP32" check (false-positive risk). All structural checks run on `stripComments(code)`.

**Op-class dispatch in V2** — same op-class pattern as v2.18 codegen dispatch:
- `attention` → checks for (m_old/m_new), (s_old/s_new), FP32 dtype, exp(), rescale pattern
- `norm` → FP32 cast, reduction primitive, rsqrt
- `gemm` → tensor-core MMA, FP32 accumulator, K-tile loop
- `collective` → per-op primitive (ncclAllReduce, HcclAllReduce, etc.)
- `scatter-permute` → atomicAdd or radix-sort, gather/scatter pattern

**Retry diagnostic for Layer F** (v3.6 will consume) — when V fails, the orchestrator emits a structured `retry_diagnostic` containing the most actionable failure reasons. Layer G (v3.6) will pass this back through `prior_attempt_diagnostic` for LLM regeneration with the specific bug to fix.

**Markdown summary** — verification result includes a Markdown table with status icons (✅/❌/⏭️/⚠️) suitable for printing in CLI output, agent-deploy artifacts, and PR comments.

### Tests — 10 vitest assertions covering

- Well-formed CUDA attention kernel passes all 3 gates
- TODO/skeleton kernel fails V1 on `no_todo_or_pseudocode_markers` check
- Well-formed Ascend-C RMSNorm kernel passes all gates (validates FP32-via-`<float>`-template-syntax recognition)
- BF16-only RMSNorm fails on `norm_uses_fp32_partial_sum` check (despite a `// FP32 not used here` comment that would have falsely passed without comment-stripping)
- Attention online-softmax invariants detected when present
- Naive attention kernel fails on missing `attention_uses_exp` and `attention_has_rescale_pattern` checks
- Perf gate skipped when V1 fails
- Markdown summary well-formed
- Collective op invariants for allreduce
- Retry diagnostic populated on overall fail

Combined with prior tests: **47/47 unit tests pass** (11 v2.18 dispatch + 26 v3.4 orchestrator + 10 v3.5 verify).

### Stats

- **New code**: 4 modules totaling 715 LOC (verify/index.ts 165, build.ts 230, correctness.ts 250, perf.ts 70)
- **New tests**: 10 assertions, ~250 LOC fixtures
- **Total tests**: 47/47 passing in CI
- **Site pages**: still 542 (no SSG changes)

### v3.6 next

**Layer F automated feedback** — close the spec→plan→dev→test→**feedback**→spec loop:
1. Auto-fill `agent-learning.yaml` from V1/V2/V3 results (no more manual stub editing)
2. **Layer G retry loop**: if V fails, regenerate with diagnostic in prompt; bound retries to 3
3. PR-template generation for novel observations (missing-primitive, fusion-opportunity, etc.)

When v3.6 ships, the productized agent achieves: generate → verify → retry-on-failure → write-back. End-to-end. v3.7 then wraps in Codex + Claude Code plugins.

---

## [3.4.0] — 2026-05-03 — Layer G real-code generator (LLM-orchestrator)

**Theme**: response to user directive — agent must generate **real production code**, not skeletons. v3.4 ships the LLM-orchestrator architecture with a 4-mode dispatch design.

### User directive (from v3.3 spec)

> 这个 agent 能完成真实生产算子及部署代码 (not just kernel skeletons).

### Added

**`scripts/agent-deploy/llm-orchestrator.ts`** — new module replacing the v2.16/v2.18 skeleton emitter for production paths. **4-mode dispatch** (selected by env vars):

| Mode | Trigger | Behavior |
|---|---|---|
| **real** | `ANTHROPIC_API_KEY` set | Calls Claude Sonnet 4.5+ via Anthropic API with the v3.3 agent-context bundle as system prompt (formal_semantics + edge_cases + numerical_rules + reference_impl + DSL example as exemplar + ISA primitives + cross-vendor mappings + prior agent-learnings). Caches result. |
| **cache** | `EVOKERNEL_OFFLINE_ONLY=true` | Reads from `.cache/generated-kernels/<arch>__<op>__<hash>.json`. Falls back to skeleton if no cache hit. |
| **test** | `EVOKERNEL_TEST_MODE=true` | Deterministic stub for unit tests (no I/O, no API calls). |
| **skeleton** | None of above (no API key) | v2.16 skeleton fallback path. Marked clearly as fallback in output. |

Why 4 modes: CI must be deterministic (test mode), contributors without API keys must work (skeleton fallback), API-key users must get real code (real mode), reproducible builds need cache (cache mode).

**`scripts/tests/llm-orchestrator.test.ts`** — 26 vitest assertions covering:
- `hashInput()` is stable, distinguishes ops/arches/diagnostics
- `pickLanguageForArch()` maps 14 arch families correctly
- Test mode produces deterministic stubs (bit-stable across runs)
- Skeleton fallback fires when no API key and not test mode
- Cache mode honors `EVOKERNEL_OFFLINE_ONLY=true`

Combined with v2.18 dispatch tests: **37/37 unit tests pass** in CI.

### Prompt structure (real mode)

The system prompt to Claude includes 7 sections built from the agent-context bundle:

1. **Operator** — name, signature, edge_cases, numerical_rules, reference_impl
2. **Available ISA primitives** — id + class + cross_vendor_equivalents
3. **DSL examples** (top 2 matching) — title, idioms, code (truncated to 4KB)
4. **Prior agent-learnings** — observations from past runs of similar ops
5. **Prior attempt diagnostic** (optional, for retry after Layer V failure)
6. **Task** — generate complete COMPILEABLE code, no TODO markers, no pseudocode
7. **Output format** — fenced code block + bullet list of references_used

The "no TODO, no pseudocode" constraint is the architectural win over v2.16: with the bundle's formal_semantics + reference_impl + DSL example as exemplars, the LLM has enough context to emit real code.

### Cache architecture

`.cache/generated-kernels/<arch>__<op>__<hash[0:12]>.json` — keyed by content hash of (op, target_arch, op.formal_semantics, matching_dsl, matching_isa, prior_attempt_diagnostic). **Hash invariant**: same input → same hash → cache hit. Different input → different hash → regeneration.

The cache is in `.gitignore` by default (LLM output not committed). Future v3.5+ can promote validated cache entries (those that pass Layer V verification) to a `data/generated-kernels/` corpus directory for permanent storage + community sharing.

### Stats

- **New module**: 432 LOC (`llm-orchestrator.ts`)
- **New tests**: 26 assertions (`llm-orchestrator.test.ts`)
- **Total dispatch + orchestrator tests**: 37/37 passing
- **Site pages**: still 542 (no SSG changes)
- **Layer D coverage**: still 100%

### v3.5 next

**Layer V verification harness** — `scripts/agent-deploy/verify/{build,correctness,perf}.ts`. Wraps:
- V1: build (nvcc/hipcc/cce/bisheng/cncc) — quick gate
- V2: correctness vs PyTorch reference_impl on small input — accuracy gate
- V3: perf profile (NCU/rocprof/msprof/cnperf) — perf gate

If V fails, retry Layer G with the diagnostic. **This closes the "code that passes verification tests" promise.**

---

## [3.3.0] — 2026-05-03 — productized agent foundation

**Theme**: response to user directive — evolve agent from "MCP query service + skeleton emitter" to **productized end-to-end agent**. v3.3 ships the foundation; v3.4-v3.10 implements per the new architecture spec.

### User directive (2026-05-03)

> 不仅仅是现在只是一个 MCP 的查询服务...能根据给定模型和硬件需求，智能化检索相应需要的知识...这个 agent 能完成真实生产算子及部署代码，并保证验证测试通过，会持续根据部署情况持续自动优化闭环，还能把这过程所有经验和知识，反馈回本项目知识库。

Translation: not just MCP query, not just kernel skeletons. Need real production code that passes verification, self-optimizes, feeds back automatically, and ships as Codex + Claude Code productized plugins.

### Added

**1. Productized agent architecture spec — `docs/superpowers/specs/2026-05-03-productized-agent.md`**

Defines the **5-layer agent architecture** (R/P/G/V/F) replacing the v2.x monolithic CLI:

| Layer | Purpose |
|---|---|
| **R — Retrieval** | Smart context bundle for given (model, hw) |
| **P — Planning** | Engine/quant/parallelism selection |
| **G — Generation** | Real production code (not skeletons) |
| **V — Verification** | Build + correctness + perf gates |
| **F — Feedback** | Auto-writeback to corpus |

Plus the v3.3 → v3.10 trajectory mapping each Ralph iteration to a layer's deliverable. The success criteria is the end-to-end "Claude Code → DSV4 Pro on Cambricon → 3 generated kernels pass verify → corpus PR opens automatically" scenario.

**2. Layer R foundation — `/api/agent-context/[model]-on-[hardware].json`**

Static-generated endpoint: **1140 bundles pre-built at SSG time** (one per (model, hardware) combination). Each bundle returns:
- model spec + execution graphs
- hardware spec + vendor + ISA primitives + cross-vendor mappings
- applicable ops (with full `formal_semantics`) + fused-kernel options
- DSL examples for this hw's arch_family
- kernel libraries + engine compile workflows
- prior agent-learnings on similar (model, hw) pairs
- coverage hints (op coverage %, dsl example count, etc.)

Companion endpoint `/api/agent-context-index.json` lists all 1140 generated combinations for discovery.

**Why this matters**: previously the agent CLI made 8-10 separate corpus queries per deploy (model, hardware, ops, fused-kernels, DSL examples, ISA primitives, kernel libraries, prior learnings) and lost context coherence between them. With v3.3, an LLM orchestrator gets the full RAG context in **one fetch**. v3.4's real-code generator will use this directly as system-prompt context.

**3. 4 more hardware (53 → 57 cards)**

- **`rtx-5070`** — Blackwell consumer entry; 12 GB GDDR7, 672 GB/s, 250W, $549. The cost-efficient Blackwell entry for indie 7B-8B inference.
- **`m5-pro`** — Apple M5 Pro mid-tier; 64 GB unified @ 336 GB/s; M5-generation dedicated tensor units. Mac mini M5 Pro at $1599.
- **`jetson-thor`** — NVIDIA edge robotics flagship (T5000); ARM Grace + Blackwell GPU; 128 GB unified @ 273 GB/s; 30-130W configurable; -40°C to 105°C operating range. **Opens the edge NPU class** (was empty pre-v3.3). 1035 FP8 TFLOPS in 100W envelope.
- **`rk3588-npu`** — Rockchip RK3588 (NEW vendor); $30 chip / $80-150 dev board cost; 6 INT8 TOPS in 5-12W envelope. **Opens the 国产 mass-market edge class** — Orange Pi 5, Rock 5B, Khadas Edge2 Pro.

### Why these 4 hardware specifically

- **RTX 5070 + M5 Pro**: completes the Blackwell consumer + M5 family lineups (RTX 5080/5090 already shipped v3.0/3.2; M5 Max shipped v3.2).
- **Jetson Thor**: opens the entire **edge NPU class** that was missing pre-v3.3. Critical for v3.x hardware breadth promise.
- **RK3588 NPU**: opens the **国产 edge class**. Volume tier (sub-$150 dev boards) — the indie embedded AI entry point. v3.9 will add Sophgo BM1684X, Horizon Journey 5, Allwinner V853.

### Stats

- **Hardware**: 53 → 57 (+4: 2 consumer + 2 edge)
- **Vendors**: 28 → 29 (+1 Rockchip)
- **Site pages**: 533 → 542 (+9)
- **Static API endpoints**: 22 → 23 (added `/api/agent-context-index.json`) + **1140 dynamic-route bundles** (`/api/agent-context/<model>-on-<hardware>.json`)
- **Layer D coverage**: still 100% (no regression)
- **Validation**: 367 entities valid

### v3.4 next

The Layer G real-code generator: refactor `scripts/agent-deploy/kernel-codegen.ts` from the v2.16/v2.18 skeleton emitter to an LLM-orchestrator that calls Anthropic Claude API with the v3.3 agent-context bundle as system-prompt context, the formal_semantics + reference_impl as exemplars, and emits code that **passes verification** (Layer V — v3.5).

---

## [3.2.0] — 2026-05-03

**Theme**: 6 top-priority missing 2025-2026 hardware (covering user audit gaps). Plus critical CI/Pages deploy fix that unblocked v2.24-v3.1 from reaching the live site.

### Critical fix: CI / Pages auto-deploy unstuck

Before this release, **CI runs since v2.24 had been failing** at `pnpm install --frozen-lockfile` because the lockfile was stale relative to `plugins/mcp-server/package.json` (4 deps added in v2.12: typescript, tsx, @types/node, @modelcontextprotocol/sdk). Earlier autonomous Ralph loop sessions had been reverting `pnpm-lock.yaml` to skip transient diffs — corrupting the lockfile sync. Result: yingwen.io/evokernel-spec/ was stuck at the pre-v2.24 build for 8 releases.

Fix: separate `fix(ci)` commit regenerating the lockfile correctly. Pages workflow now succeeds — site is live at v3.2 spec coverage. **Future Ralph loop iterations must NOT revert `pnpm-lock.yaml`.**

### Added — 6 top-priority missing 2025-2026 hardware (47 → 53 cards)

Per user audit directive: "硬件覆盖全不全？是否最新？".

**NVIDIA (2):**
- **`rtx-5080`** — Blackwell consumer mid-tier; 16 GB GDDR7, 960 GB/s, 360W, $999 MSRP. Sweet spot for indie 7B-13B inference at half the RTX 5090 price.
- **`dgx-spark`** — NVIDIA's personal AI supercomputer (Project DIGITS); GB10 SoC (Grace ARM + Blackwell GPU), 128 GB unified LPDDR5X @ 273 GB/s, 1 PFLOPS FP4, $3000-$4000 MSRP. Direct competitor to Apple M3 Ultra for personal frontier-LLM workstations — full CUDA stack, no MLX retrain cost.

**AMD (1):**
- **`ryzen-ai-max-395`** — Strix Halo APU; first x86 SoC with quad-channel LPDDR5X (256 GB/s unified bandwidth, 128 GB max). Direct M-series rival on Windows/Linux side. ASUS ROG Flow Z13, HP Z2 mini, Framework Desktop are launch platforms.

**Apple (1):**
- **`m5-max`** — Apple's first Silicon with **dedicated GPU tensor units** (closing the gap with NVIDIA tensor cores / AMD WMMA / Intel XMX). 96 BF16 TFLOPS, 128 GB @ 640 GB/s. Real LLM inference uplift on MLX: 1.5-2× vs M4 Max.

**Huawei (1):**
- **`ascend-910d`** — 2025 sovereign-China data-center flagship; Da Vinci 5; 192 GB HBM3 @ 3.2 TB/s, HCCS-2 800 GB/s scale-up, 700W TDP. Successor to 910C with 50% larger memory + 23% bandwidth uplift. Atlas 900 SuperPoD A3 super-pod target.

**Moore Threads (1):**
- **`mtt-s5000`** — Moore Threads' first HBM data-center card (replaces S4000 GDDR6). MUSA 3 architecture, 64 GB HBM3 @ 1.6 TB/s, 200 TFLOPS FP8, native FP8 support. Sovereignty-friendly alternative for China deployments.

### Why this matters

The user's audit directive surfaced ~30 missing 2025-2026 hardware entries. v3.2 closes the **6 highest-impact gaps** spanning:
- Personal AI workstation niche (DGX Spark + M5 Max + Strix Halo) — the 2025-2026 fastest-growing tier
- Mid-tier Blackwell consumer (RTX 5080) — 10× larger user base than RTX 5090
- China sovereignty data-center (Ascend 910D + MTT S5000) — frontier 国产 hardware

Remaining ~24 cards (RTX 5070, RX 9070 non-XT, M5 Pro/Ultra, Jetson Thor, Hailo-10, RK3588 NPU, etc.) tracked for v3.3-v3.4.

### Stats

- **Hardware**: 47 → 53 (+6 latest 2025-2026 releases)
- **Site pages**: 521 → 533 (+12 = 6 hardware detail + cross-cuts)
- **Layer D coverage**: still 100% (no regression)
- **CI**: Pages deploy verified succeeding (1m 3s)
- **Validation**: 365 entities valid (was 362)

---

## [3.1.0] — 2026-05-03

**Theme**: Apple Silicon hardware coverage (M3 Ultra, M4 Max, M4 Pro). Extends v3.0's consumer GPU tier into Apple's unique unified-memory inference platform.

### Added — 3 Apple Silicon SoCs (44 → 47 cards)

- **`m3-ultra`** — Mac Studio flagship; UltraFusion of 2× M3 Max (80-core GPU, 32-core ANE); **up to 512 GB unified memory at 819 GB/s** — the largest unified memory in any consumer device. Llama 3 405B FP16 fits in a single Mac Studio. $3999-$9999 configured. The "single-device frontier-LLM" niche.
- **`m4-max`** — MacBook Pro 16" / Mac Studio variant; 40-core GPU + 16-core ANE; up to 128 GB at 546 GB/s; $3199 starting. Laptop tier for serious LLM dev workflows. Distinct from existing `apple-m4-max-npu` entry which covers only the Neural Engine subset (38 TFLOPS); this entry covers the full chip (70 BF16 TFLOPS GPU-dominant via MLX).
- **`m4-pro`** — MacBook Pro / Mac mini mid-tier; 20-core GPU; up to 64 GB at 273 GB/s; $1399 starting (Mac mini). Cheapest viable Apple Silicon LLM platform.

### Why Apple Silicon matters for LLM inference

Two unique properties:

1. **Unified Memory Architecture (UMA)**: CPU/GPU/ANE share a single physical memory pool. No PCIe transfer overhead between processors. The 512 GB ceiling on M3 Ultra is **larger than any single datacenter GPU** (B200 = 192 GB, MI355X = 288 GB), making it the only single-device option for some frontier-model workflows.

2. **Best-in-class perf/watt**: M4 Max @ 1.4 BF16 TFLOPS/W, M3 Ultra @ 0.47, M4 Pro @ 1.25. Compares to RTX 5090 @ 0.36, MI300X @ 0.66 (typical datacenter). For mobile / edge inference where wall power is a real constraint, Apple Silicon dominates.

**Trade-off**: bandwidth-bound for LLM decode. Even M3 Ultra at 819 GB/s is below HBM-class (H200 = 4800 GB/s). Real Llama 3 70B BF16 decode on M3 Ultra: ~10-15 tok/s typical (MLX) — usable but not server-grade. Apple Silicon wins on capacity (UMA) and efficiency, loses on raw throughput.

### MLX is the canonical stack

vLLM / lmdeploy / llama.cpp all run on Apple Silicon, but MLX (Apple's open-source ML framework) is typically 2-3× faster on the same hardware. v3.1 documents `mlx-q4` quantization slug + `MLX 0.20` driver in `software_support`. MLX is a future v3.x DSL example candidate (Layer B) — Metal kernel structural pattern.

### Stats

- **Hardware**: 44 → 47 (+3 Apple Silicon)
- **Site pages**: 515 → 521 (+6)
- **Layer D coverage**: still 100%
- **Validation**: 362 entities valid

---

## [3.0.0] — 2026-05-02 — opens v3.x major (consumer hardware breadth)

**Theme**: opens v3.x major with **consumer GPU coverage** (NVIDIA RTX 5090 / RTX 4090, AMD RX 9070 XT / RX 7900 XTX, Intel Arc B580). The v2.x corpus was data-center-focused (39 cards, all server-grade SXM/OAM/PCIe-datacenter); v3.0 extends to the consumer/indie tier where most hobbyist LLM inference actually happens.

### Why v3.0 starts a new major

The v2.x major was structurally about **the agent end-to-end on data-center hardware**. v3.0 opens **breadth**:
1. **More hardware classes**: consumer GPU (this release), Apple Silicon (v3.1), edge NPU (v3.2), 国产 consumer/edge (v3.3)
2. **More model classes**: video gen (v3.4), image gen (v3.5), speech (v3.6), molecule/bio/materials (v3.7)
3. **Consumer-tier calculator**: residential electricity rates, edge power constraints, prosumer pricing tiers (v3.8)

The user directive (2026-05-02):

> 扩展更多的模型和硬件，模型不止是这些大语言模型或者视觉语言模型，还有更多开源的视频、图像生成模型、语音模型、大分子/小分子材料模型，生物相关模型等等，硬件不止这些服务器级别的 CPU/NPU/TPU 等，还有消费级显卡，端侧推理芯片等等

### Added — 5 consumer GPUs (39 → 44 cards)

**NVIDIA (2):**
- **`rtx-5090`** — Blackwell consumer flagship; 32 GB GDDR7, 1792 GB/s, 575W TGP, $1999 MSRP. First consumer card with NVFP4 path (Blackwell tensor cores). Sweet spot for indie 7B-32B FP4/FP8 LLM inference.
- **`rtx-4090`** — Ada Lovelace consumer flagship (the dominant 2023-2025 indie GPU); 24 GB GDDR6X, 1008 GB/s, 450W TGP. Reference for llama.cpp / Ollama / LM Studio default tuning. Still the better $/inference-token at FP8/INT4 in 2026 secondhand market.

**AMD (2):**
- **`rx-9070-xt`** — RDNA 4 consumer flagship; 16 GB GDDR6, 640 GB/s, 304W TBP, $599 MSRP. **First consumer RDNA card with native FP8 tensor ops** (RDNA 3 had INT8 only). Cost-leader for FP8 inference of 7B-13B models.
- **`rx-7900-xtx`** — RDNA 3 chiplet flagship; 24 GB GDDR6, 960 GB/s, 355W TBP, $999 MSRP. Still the 24 GB AMD choice for INT4/INT8 inference of 70B+ models with offloading.

**Intel (1):**
- **`arc-b580`** — Battlemage; 12 GB GDDR6, 456 GB/s, 190W TBP, $249 MSRP. **Cost-floor for viable LLM-inference hardware** (~7× cheaper than RTX 5090). First Arc card with FP8 XMX support; Intel inference stack (IPEX-LLM, vLLM-experimental) still maturing.

### Why this matters

v2.x's 39 hardware cards covered every datacenter SKU (NVL72, GB300, MI300X, Ascend 910C, etc.) but missed the entire indie/prosumer tier. With v3.0:

1. **Indie LLM developers** can now use the corpus for their actual workflows (RTX 4090 + GGUF; RX 7900 XTX + ROCm; Arc B580 + IPEX-LLM).
2. **Cost comparisons** become real (RTX 5090 $1999 vs Arc B580 $249 — same task, ~8× cost spread).
3. **Schema validation**: the `HardwareSchema` proves it scales across data-center → consumer without modification (only enum additions might be needed for edge tier in v3.2).
4. **Cross-vendor mapping** is now testable in the consumer tier (FP8 path on Blackwell consumer ↔ FP8 on RDNA 4 ↔ FP8 on Battlemage XMX).

### Schema observations

No schema changes needed for consumer GPUs — `form_factor: pcie` already supported. Two adjustments via `community-port` engine status (the existing enum already covered it). The `compute_unit_label: XPU` accommodates Intel Xe-cores.

For v3.2 (edge NPU) we will likely need:
- New `form_factor: 'edge-pcie'` or extend `embedded-soc` semantics
- `power.tdp_w` validated for low-end (≤25W edge tier)
- `software_support.drivers` extended with edge-specific (ExecuTorch, TFLite-NPU, etc.)

### Stats

- **Hardware**: 39 → 44 (+5 consumer)
- **Vendors**: still 28 (NVIDIA / AMD / Intel already in corpus)
- **Site pages**: 505 → 515 (+10 = 5 hardware detail pages + 5 vendor-cross-cut updates)
- **Layer D coverage**: still 100% (34/34 ops + 24/24 fused-kernels) — v3.0 does not regress coverage
- **Tests**: 11/11 dispatch tests pass
- **Validation**: 359 entities valid (was 354)

---

## [2.25.0] — 2026-05-02

**Theme**: development workflow documentation refresh — project has grown to ~360 entities + 7-stage agent pipeline + 4 plugins; the dev docs caught up.

### Added

- **`CLAUDE.md`** (new, repo root) — project-specific guide for Claude Code agents working on this repo. Covers:
  - 3-layer architecture (data / surfaces / agent) with entity counts
  - 5-layer hw-sw gap framework (A: ISA primitives → E: coverage matrix)
  - 3 operating modes (data fix / feature add / agent extension) with command recipes
  - Decision rules: when to add ISA primitive, DSL example, formal_semantics, agent-learning
  - Common pitfalls (YAML apostrophe trap, schema drift, dispatch test breakage)
  - Build commands quick reference
  - Ralph loop autonomous-iteration pattern + discipline rules
  - Project-specific facts (entity slug conventions, fixed enums)

### Changed

- **`CONTRIBUTING.md`** — extended from 3 to 5 contribution paths:
  - **(4) Layer D `formal_semantics` contribution** with quality bar checklist + reference patterns
  - **(5) `agent-learning` PR pattern** with workflow + closure semantics (`open` → `merged` → linked corpus update)
  - CI section updated: 5 → 7 jobs (added `agent-regression` + `deployment-smoke`)
  - Added "v2.x architecture quick-read" section with the 5-layer table
- **`docs/DEVELOPMENT.md`** — appended new "v2.x — Agent layer, plugins, knowledge feedback" section (~280 LOC):
  - Repository layout for the new entity types (isa-primitives, dsl-examples, kernel-libraries, agent-learnings, etc.)
  - Agent CLI dev recipe (test → type-check → smoke → agent-learning round-trip)
  - `formal_semantics` authoring quality bar with anti-patterns (apostrophe trap, multi-line URL, invalid enum values)
  - Plugin system dev recipe with MCP tool list
  - Knowledge feedback loop step-by-step + reference closure example
  - CI shape table (7 jobs)
  - Performance budget v2.x actuals + v3.0 budget
  - Ralph loop iteration pattern + anti-patterns
- **`README.md`** — added "Contributor required reading" routing table mapping intents to docs (data fix / Claude Code / dev / formal_semantics / agent-learning / deploy / roadmap).

### Why this matters

The project has scaled past ~360 entities, 21 API endpoints, 7-stage agent pipeline, and 4 plugins. New contributors (especially Claude Code agents in autonomous Ralph loops) need a clear map of where to look. The pre-v2.25 docs were structured around v1.x mental model (data + site only); they now reflect the v2.x reality (data + site + agent + feedback loop).

The **5 documents form a layered guide**:
1. `README.md` — what the project is, with routing table to find the right deep-dive doc
2. `CLAUDE.md` — Claude Code agent guide (project-specific decision rules)
3. `CONTRIBUTING.md` — 5 contribution paths + evidence/DCO/CI requirements
4. `docs/DEVELOPMENT.md` — full dev recipes per layer (data, web, agent, plugins, feedback)
5. `docs/ROADMAP.md` — what's next (v3.0 model + hardware breadth)

A new contributor (human or agent) lands at README, follows the routing table to their target task, and has all decision rules + commands + reference patterns at hand.

Site stats: 505 pages built; 11/11 dispatch tests pass; 354 entities validate.

---

## [2.24.0] — 2026-05-02 — closes v2.x major

🎯 **MILESTONE: v2.x major closed.** spec → plan → dev → test → feedback → spec cycle is now physically wired. Layer D depth 100% complete (34/34 ops + 24/24 fused-kernels with `formal_semantics`). Agent regression suite green in CI.

### Added

**Layer D depth fill — 9 final operator `formal_semantics` (25 → 34 / 34, 100%):**

- **`cross-entropy`** — huge-vocab tile-over-V or fused CE (Llama 3 V=128K, Qwen 3.6 V=152K naive log_softmax = MB scratch); FP32 log-sum-exp with max-subtract; tied-embedding optimization elides separate matmul.
- **`dropout`** — must be no-op at inference (engine graph rewrite); per-rank seed for DP correctness; inverted scaling (modern); attention-vs-FFN-vs-residual mask independence.
- **`embedding-lookup`** — vocab-parallel split across TP ranks (mandatory at TP=8+ with V=128K-256K); tied input/output embedding (Llama 3, Qwen 3.6, GPT-OSS); pad token handling.
- **`group-norm`** — vision/diffusion (SDXL, FLUX U-Net), num_groups=32 default; channel-last (NHWC) for tensor-core utilization; FP32 partial sum mandatory (BF16 produces visible color banding in image gen).
- **`grouped-matmul`** — MoE expert-batched GEMM with SM-level imbalance handling; DeepGEMM/GMM block-FP8 variant (DeepSeek V3 671B path).
- **`lora-bgmv`** — multi-tenant LoRA serving (Punica/S-LoRA primitive); sentinel -1 for base-model traffic; rank/num_loras × HBM budget; 2-step matmul precision.
- **`mamba-conv1d`** — Mamba SSM companion (kernel=4 hard-coded); streaming inference state; GPU-only viable (Ascend impractical for SSM).
- **`online-softmax`** — FlashAttention algorithmic core; all-masked-chunk edge case (-inf/-inf NaN trap in naive impls); FP32 (m, s, acc) state mandatory.
- **`repeat-interleave`** — GQA KV broadcast (modern flash-attention skips entirely; legacy materialize wastes memory); pure data movement, no precision concern.

**Knowledge feedback loop wired in `scripts/agent-deploy/`:**

- **Stage 8 added to agent-deploy pipeline** — emits `agent-learning.yaml` stub with model/hardware/engine/predicted-perf + every detected kernel-gap as a structured `observation`. Documented workflow: human runs deploy, fills actuals, moves YAML into `data/agent-learnings/`, commits → site rebuild surfaces it on `/agents/learnings/`.
- **`generateAgentLearningStub()` helper** in `scripts/agent-deploy/index.ts` — produces YAML matching `AgentLearningSchema` (v2.20) directly from planning state.

**CI regression suite (`agent-regression` job in `.github/workflows/ci.yml`):**

- **Test 1**: `scripts/tests/kernel-codegen-dispatch.test.ts` — 11 vitest assertions on `classifyOp()` + `emitCudaInnerByOpClass()` op-class dispatch correctness. Catches the most-likely regression class (op-class wrong template).
- **Test 2**: synthetic `agent-learning.yaml` stub validation — proves the schema accepts `generateAgentLearningStub()` output shape end-to-end. Catches schema drift between `schemas/agent-learning.ts` and the generator function.
- **Reference fixtures** in `scripts/tests/fixtures/{llama-3-3-70b,deepseek-v4-pro,qwen3-6-plus}/config.json` — committed offline configs for future expansion to full agent-deploy E2E (deferred to v2.25+ nightly job, requires running dev server).

### Why v2.24 closes the v2.x major

Before v2.24, the spec → plan → dev → test cycle had a missing arrow: **feedback didn't flow back automatically**. Agent runs were one-shot artifacts with no path into the corpus. Human reviewers had to remember insights and manually author them.

After v2.24:
1. **Every agent run emits a `agent-learning.yaml` stub** with predicted perf + observed kernel gaps.
2. **Human fills actuals + post-deploy observations** (perf-cliff, numerical-mismatch, success-pattern, missing-primitive, etc.).
3. **Stub commits into `data/agent-learnings/`** → site builds → `/agents/learnings/` page surfaces it.
4. **Future agent runs query `/api/agent-learnings.json`** for prior knowledge before planning.
5. **CI catches regressions in any of the above** — codegen dispatch, schema, generator output.

This is the v2.x major's promise concretely realized: **任意模型 → 任意硬件 + 跨硬件泛化的持续优化 + 知识沉淀回流**. The first feedback-loop closure was demonstrated in v2.21 (Qwen on Ascend → `huawei-ascend-vector-fp32` ISA primitive). The mechanism is now production-grade.

### Final v2.x stats

- **Releases**: v2.0 GA → v2.24 (25 minor releases over 1 day)
- **Layer D coverage**: 100% (34/34 ops + 24/24 fused-kernels with `formal_semantics`)
- **DSL examples**: 9 (5 GEMM + 1 attention + 1 norm + 1 fused-epilogue + 1 collective)
- **ISA primitives**: 16 (one new from feedback loop)
- **Plugins**: 4 (MCP server, Claude Code skill, Cursor rules, Codex prompts)
- **Agent CLI**: 7-stage pipeline + Stage 8 knowledge writeback
- **CI jobs**: 7 (validate, type-check, unit, **agent-regression**, build, e2e, deployment-smoke)
- **Site pages**: 505 · **API endpoints**: 21 (`/api/agent-learnings.json` added)
- **Tests passing**: schema + dispatch + web + agent-regression

The next major (v3.0) opens model breadth (video / image-gen / speech / molecule / bio / materials) and hardware breadth (consumer GPU / Apple Silicon / edge NPU / 国产 consumer-grade). Scoped post-v2.x.

---

## [2.23.0] — 2026-05-02

**Theme**: fused-kernel formal_semantics depth fill complete — kv-quant + attention-variants families (7 entries).

🎯 **MILESTONE: 24/24 (100%) fused-kernels now have `formal_semantics`.** Layer D depth on the fused-kernel layer is now complete; the agent has structured `numerical_rules` + `edge_cases` + `reference_impl` for every fused kernel it might recommend.

### Added — formal_semantics on remaining 7 fused kernels (17 → 24 / 24)

**KV-quant family (2):**

- **`fused-kv-quant`** — INT8 vs INT4 vs FP8-E4M3 KV dtype trade-offs (vLLM INT8 default for ≥32K ctx; KIVI INT4 with quality eval; FP8-E4M3 native on Blackwell); per-token vs per-page vs per-tensor scale granularity; BF16 scale storage (FP32 overkill).
- **`fused-rmsnorm-residual-quantize`** — three-way fusion (residual + RMSNorm + FP8/INT8 quantize) for FP8 attention paths; per-row vs per-tensor FP8 scale; SmoothQuant vs AdaQuant calibration; FP32 partial sum mandatory in norm section + amax-current scale compute.

**Attention-variants family (5):**

- **`fused-spec-decode`** — tree-attention over k speculative tokens (Medusa branching, EAGLE inheriting Medusa, DeepSeek MTP linear chain); rejection sampling for verify; CUDA Graph capture per fixed-k.
- **`fused-mtp-head`** — DeepSeek V3 multi-token prediction head; shared embedding across MTP layers; aux training loss + inference spec-decode source (80%+ acceptance rate); inherits all numerical rules from constituent ops.
- **`fused-radix-attention`** — SGLang prefix-trie KV cache; LRU eviction at trie node level; partial prefix match (trie of trie); cross-version cache invalidation contract; 2-10× memory savings for multi-tenant chat.
- **`fused-selective-scan`** — Mamba SSM parallel-prefix-scan (50-200× speedup vs naive at L=8192); SSD (Mamba 2) tensor-core path; **FP32 hidden state mandatory** across recurrence (BF16 drifts after 1-2K tokens); Ascend impractical (10-50× slower).
- **`fused-conv-norm-act`** — vision tower of Llama 4 / Qwen3-VL / SigLIP; BN/GN/LN slot variants; folded-BN at engine-init for inference; cuDNN epilogue paths for ReLU/GeLU/SiLU; FP32 norm partial sum.

### Why this matters

The kv-quant family is the gateway to **long-context production** — without `formal_semantics` on these fused kernels, the agent can't reason about INT8 vs FP8 KV trade-offs for a 128K-ctx Qwen 3.6 deploy. Now it can: it sees the per-token vs per-tensor granularity rule, the BF16-scale-sufficient rule, and the no-FP32-needed-for-INT8-dequant rule.

The attention-variants family is the **post-LLM frontier** — speculative decoding (fused-spec-decode), Mamba SSMs (fused-selective-scan), DeepSeek MTP (fused-mtp-head), SGLang prefix sharing (fused-radix-attention), and vision encoders (fused-conv-norm-act) are the architectures where 2026 models are actually being shipped. Documenting their fusion semantics makes the agent's recommendations production-relevant, not just LLM-focused.

The Mamba `selective-scan` entry is particularly important: **FP32 state mandatory** is a hard correctness rule that catches a real bug class (BF16 state drift after 1-2K tokens). The agent now warns the human reviewer about this when porting Mamba to any non-CUDA backend.

Site stats: 505 pages built; 11/11 dispatch tests pass; 354 entities validate. Layer D op coverage 25/34 (74%) and fused-kernel coverage **24/24 (100%)** — only 9 op formal_semantics remain for v2.24.

---

## [2.22.0] — 2026-05-02

**Theme**: fused-kernel formal_semantics depth fill — collective-fusion + GEMM-fusion families (7 entries).

Continues the Layer D depth fill from v2.18. After v2.22, fused-kernel `formal_semantics` coverage is **17/24 (71%)** — only 7 entries remaining (kv-quant + attention-variants families) for v2.23.

### Added — formal_semantics on 7 fused kernels (10 → 17 / 24)

**Collective-fusion family (3):**

- **`fused-allgather-gemm`** — tile alignment between NVLink chunk and GEMM K-tile (FlashComm requires 128 BF16 alignment); cross-node TP penalty (~30% latency hit); no fusion-specific precision rule (FP32 GEMM accumulator handles it).
- **`fused-allreduce-residual`** — residual broadcast across batch dim; reduce-scatter + all-gather split form (FlashComm path); residual-add stays in input dtype (no accumulation).
- **`fused-tp-allreduce-residual`** — three-way fusion (AR + residual + RMSNorm); norm-after-AR vs norm-during-AG (DeepSpeed Ulysses style); two FP32 boundaries (AR reduction + RMSNorm partial sum).

**GEMM-fusion family (3):**

- **`fused-add-bias-gelu`** — tanh approximation vs exact erf (must match training-time config; loading tanh-trained model with exact = systematic offset); GPT-style only (Llama 3+ uses fused-mlp-silu); epilogue stays in input dtype.
- **`fused-dequant-gemm`** — group_size=128 sweet spot for AWQ/GPTQ; Marlin (Hopper SOTA) vs cuBLASLt vs CUTLASS path selection; asymmetric (zero-point) vs symmetric INT4; no FP32 dequant needed (BF16 sufficient).
- **`fused-grouped-gemm`** — handles expert load imbalance via expert_offsets cumsum; heterogeneous experts forbidden (must pad to max shape); DeepGEMM/GMM block-quantized FP8 variant (DeepSeek V3 path); per-expert FP32 accumulator (standard).

**Cross-cutting (1):**

- **`mooncake-kv-disaggregation`** — RDMA over IB-NDR (50ms transfer for 70B 32K ctx) vs NVLink Fabric (5ms intra-rack); layout/dtype/version mismatch = silent corruption; transfer failure must fall back to local prefill (SLO-aware contract).

### Why this matters

The collective-fusion family is the heart of TP-overlap optimization (every transformer layer has 2 of these). Documenting `numerical_rules` makes it possible for the agent to recommend the right variant per workload (training vs inference; intra-node vs cross-node) and per engine (FlashComm vs zero-bubble vs DeepSpeed Ulysses).

The GEMM-fusion family is what every cuBLASLt / CUTLASS user touches. Now the agent can flag the GPT-vs-Llama architecture fork (fused-add-bias-gelu vs fused-mlp-silu), pick Marlin for INT4 on Hopper, and warn about expert load imbalance in MoE deploys.

`mooncake-kv-disaggregation` documents the production-grade disaggregated prefill/decode pattern that's increasingly standard in 2026 (DeepSeek V3, NIXL, vLLM disagg) — the formal_semantics entry makes its layout-version-must-match rule explicit and the transfer-failure fallback contract surface-level.

Site stats: 505 pages built; 11/11 dispatch tests pass; 354 entities validate.

---

## [2.21.0] — 2026-05-02

**Theme**: Layer B (DSL) horizontal expansion + first knowledge-feedback-loop closure.

This release does two things at once: (a) fills out the DSL example catalog beyond GEMM-shape (3 new non-GEMM examples), and (b) demonstrates the v2.20 knowledge-feedback loop physically closing — an agent-learning observation from a real past run flowed into a corpus update, and the observation is now marked `triage_status: merged`.

### Added

- **`data/isa-primitives/huawei-ascend-vector-fp32.yaml`** — ISA primitive for Ascend Vector unit's FP32 fallback path (~3× slower than FP16, used for ctx ≥ 32K / world_size ≥ 8 / mixed-prec training residuals). Carries explicit decision rule documenting when the agent should switch to it.
  - **Provenance**: surfaced by `qwen3-6-on-ascend-910c-2026-05-02` agent-learning entry (v2.20 seed). The observation `kind: missing-primitive` proposed `huawei-ascend-vector-fp32`; v2.21 ships it. **First v2.20 feedback-loop closure on record.**
- **`data/dsl-examples/cuda-flash-attention-hopper.yaml`** — Flash Attention skeleton on Hopper showing TMA + WGMMA + online softmax (FP32 m/s/acc state across K-tile pairs). The structural reference for the agent's `attention` op-class kernel template (v2.18 dispatch).
- **`data/dsl-examples/ascend-c-rmsnorm.yaml`** — RMSNorm on Ascend Vector unit with explicit BF16 → FP32 cast → ReduceSum → rescale → BF16 store. Demonstrates Cube-unit-idle pattern (RMSNorm has no MMA component) and explicit precision boundary (UB scratch FP32, queues BF16). Structural reference for the `norm` op-class on Ascend.
- **`data/dsl-examples/triton-fused-rope-qkv.yaml`** — Fused QKV+RoPE in Triton with `@triton.autotune` over 4 block configs and `ROTATION_FP32` JIT-time flag (implements v2.18 `rotation_compute_dtype` rule directly). Demonstrates Triton's portable-but-not-peak-Hopper trade-off.

### Changed

- **`data/agent-learnings/qwen3-6-on-ascend-910c-2026-05-02.yaml`** — `triage_status: open` → `merged`. Updated the missing-primitive observation with `proposed_corpus_update: "✅ MERGED in v2.21..."` linking to the new ISA primitive page.

### Why this matters

DSL examples are 5/5 GEMM-shape pre-v2.21, which artificially limited what the agent's kernel-codegen could reference. With 3 non-GEMM examples (attention / norm / fused-rope-qkv) now in the corpus, the kernel-codegen op-class dispatch has structural reference templates for every dispatch class — gemm (5 examples), attention (1), norm (1), scatter-permute (still 0; will add in v2.22-v2.23 alongside the fused-kernel depth fill).

The feedback-loop closure is more important than the DSL examples themselves: it demonstrates the spec→plan→dev→test→**feedback**→spec cycle works end-to-end. A real deployment ran, hit a real precision bug, surfaced a real corpus gap, and the gap is now filled with provenance back to the agent run. This pattern repeats indefinitely as more agent runs land — the corpus grows from real production use, not from speculative authoring.

Site stats: 505 pages built (was 501); 11/11 dispatch tests pass; 354 entities validate (was 351 with 3 agent-learnings; now 354 with 1 ISA primitive + 3 DSL examples added).

---

## [2.20.0] — 2026-05-02

**Theme**: knowledge feedback loop foundation — `agent-learning` schema + `/agents/learnings/` surface.

This is the v2.x major's keystone release: it lays the data shape and the public surface for **continuous knowledge accumulation** — every agent deployment run can now write back structured observations (kernel gaps, perf cliffs, numerical mismatches, success patterns) so future agent runs start smarter and human reviewers have a triage queue of corpus updates.

### Added

- **`schemas/agent-learning.ts`** — new schema (Layer F: feedback). Captures per-run agent learnings with structured observations (8 kinds: kernel-gap, perf-cliff, numerical-mismatch, version-skew, config-drift, success-pattern, missing-primitive, fusion-opportunity) + perf delta vs prediction + triage status.
- **`data/agent-learnings/`** — 3 seed YAML entries from real past agent runs:
  - `dsv4-pro-on-mlu590-2026-05-02` — DeepSeek V4 Pro on Cambricon MLU590 (shipped, 21.4% perf delta from missing fused-moe-dispatch-deepep equivalent on Ascend → proposed `fused-moe-dispatch-hccl` corpus addition).
  - `llama-4-scout-on-h100-2026-05-02` — Llama 4 Scout on H100 (shipped clean, single page-size playbook update PR).
  - `qwen3-6-on-ascend-910c-2026-05-02` — Qwen 3.6 on Ascend 910C at 64K ctx (partial: numerical mismatch caught by aclnn-rope FP16 path → vindicates v2.18 rotation_compute_dtype rule; surfaces missing `huawei-ascend-vector-fp32` ISA primitive).
- **`/agents/learnings/`** Astro page — surfaces all learnings sorted by date, with stats strip (runs / observations / open triage / kinds), outcome breakdown, observation-kind breakdown, per-entry perf-delta indicator (color-coded by severity), and a "How to contribute" section showing the YAML shape.
- **`/api/agent-learnings.json`** — JSON endpoint for external agent consumption (CC-BY-SA 4.0).

### Why this matters

The user's directive was explicit:

> 持续沉淀丰富完善跨硬件泛化的知识回来，并能持续优化部署。

v2.20 is the *foundation* for that: schema + surface + 3 worked examples. v2.24 will wire the automatic writeback from `scripts/agent-deploy/` so the loop closes without human-mediated YAML authoring.

The first 3 seed entries already prove the value: the Qwen 3.6 on Ascend learning vindicates v2.18's `rotation_compute_dtype` rule (the agent now correctly flags this case), and surfaces a real missing ISA primitive (`huawei-ascend-vector-fp32`) that was invisible before this run.

---

## [2.19.0] — 2026-05-02

**Theme**: collective ops complete + first cross-vendor collective DSL example.

Closes Layer D (formal_semantics) on the 5 collective primitives that drive every multi-card deployment, and gives the agent a structural reference for porting collectives between NVIDIA and Huawei Ascend (the most common cross-vendor LLM port).

### Added

- **5 collective op `formal_semantics`** (20 → 25 / 34, 74%): `allreduce`, `all-gather`, `all2all`, `reduce-scatter`, `memcpy-async`.
  - `allreduce` documents the FP16-input + FP16-reduction precision cliff (NCCL ≥ 2.18 has FP32-accum option; mandatory for SUM at world_size > 8) and the split-allreduce-for-overlap pattern (Zero-Bubble PP, FlashComm).
  - `all-gather` documents concat vs interleaved output layout and the FlashComm fused-allgather-GEMM SOTA path.
  - `all2all` documents intra-node (NVLink ~80 GB/s) vs cross-node (RDMA ~50 GB/s) paths and DeepEP's hybrid path that reduces cross-node traffic ~30%.
  - `reduce-scatter` documents the fused-RS-GEMM epilogue (1.3-1.8× faster than separate RS for TP=8 LLM).
  - `memcpy-async` documents cp.async vs TMA on Hopper (TMA 2-4× faster for tiles ≥ 16KB), pinned vs pageable host memory (#1 cause of "why is my async copy blocking"), and GPUDirect RDMA / GDS (3-5× checkpoint loading speedup).
- **`data/dsl-examples/nccl-hccl-allreduce.yaml`** — side-by-side AllReduce in NCCL (NVIDIA) and HCCL (Huawei Ascend), with a cross-vendor mapping table. Documents the ~5-LOC-per-call-site rule for porting collectives between NVIDIA and Huawei.

### Why this matters

Multi-card collective layer is where the most boilerplate changes during a cross-vendor port (every TP layer = 1 allreduce; every DP grad = 1 allreduce). With v2.19's `formal_semantics`, the agent knows:
1. **Which numerical rule will silently break** (FP16-reduction at large world_size).
2. **Which optimization path is current SOTA per engine** (FlashComm for NVIDIA, HCCL hierarchical for Huawei).
3. **What the ~5-LOC patch shape looks like** (the NCCL→HCCL mapping table).

This makes "any model × any hardware" multi-card deploy something the agent can recommend with confidence, not just "try it and see".

---

## [2.18.0] — 2026-05-02

**Theme**: fused-kernel formal_semantics depth fill + op-class-aware kernel codegen.

Closes the two highest-priority quality gaps identified in the v2.17 retrospective: fused-kernel `formal_semantics` was at 5/24 (21%), and `kernel-codegen.ts` used a single GEMM template for every op including non-MMA ops like `expert-permute` (sort+scatter) and `rmsnorm` (row reduction). Both fixed.

### Added

- **5 fused-kernel `formal_semantics`** (5 → 10 / 24): `fused-rope-qkv`, `flash-decoding`, `flash-mla`, `fused-attn-sliding-window`, `fused-moe-dispatch-deepep`.
  - `fused-rope-qkv` documents the `rotation_compute_dtype` trade-off (vLLM/flashinfer stay in input dtype; TRT-LLM configurable; aclnn FP16-only on Ascend) — the agent now flags FP8-weights × any-context and BF16 × ctx ≥ 64K as cases requiring FP32 internal.
  - `flash-decoding` documents the cross-chunk online-softmax merge (mandatory FP32 partial_sum) and the page-boundary alignment rule (chunk_size ≥ page_size).
  - `flash-mla` documents the rope-split rule (only `d_rope=64` of `d_c=512` gets rotated) and the softmax-scale-uses-D_head bug class.
  - `fused-attn-sliding-window` documents StreamingLLM attention-sink config (sink_tokens=4) and KV eviction support per engine (vLLM/SGLang lack it as of 0.5.x).
  - `fused-moe-dispatch-deepep` documents intra-node (NVLink, ~80 GB/s) vs cross-node (RDMA, ~50 GB/s) paths + padded-vs-bucketed token imbalance handling.
- **`scripts/agent-deploy/kernel-codegen.ts`: op-class dispatch** — `classifyOp(opId, op)` routes to one of 4 specialized inner-loop bodies for CUDA-C++:
  - `gemm` (matmul, grouped-matmul, lora-bgmv) → WGMMA tile-pair (existing).
  - `attention` (attention, mla-attention, paged-attention-decode, online-softmax) → online softmax across K-tile pairs with FP32 (m, s, acc) state.
  - `norm` (rmsnorm, layer-norm, group-norm, softmax) → row-reduction + warp-shuffle + per-row rsqrtf rescale.
  - `scatter-permute` (expert-permute, index-put, embedding-lookup, repeat-interleave) → `atomicAdd` destination counter + vectorized 128-bit scatter, no MMA.
- **`scripts/tests/kernel-codegen-dispatch.test.ts`** — 11 vitest assertions: each op-class produces a structurally different body; review_notes correctly surface the op-class to the human reviewer.

### Changed

- `kernel-codegen.ts` `review_notes` now includes `Op class: <gemm|attention|norm|scatter-permute>` plus an op-class-specific advisory (e.g. for scatter-permute: "WGMMA scaffolding is dead code — strip it; real impl uses warp-level radix sort").

### Why this matters

Before v2.18, the agent's generated `expert-permute_<arch>.cu` started with WGMMA setup that doesn't apply (expert-permute has no MMA), forcing the human reviewer to delete ~50 lines and rewrite from scratch. After v2.18, the `scatter-permute` template starts with `atomicAdd` + vectorized scatter — a useful starting point. Same story for `rmsnorm` (was GEMM, now row-reduction) and `attention` (was GEMM, now online-softmax + tile-pair).

This also closes the v1.x→v2.x→post-v2.17 "5-layer hw-sw gap" framework's Layer D depth at 10/24 fused kernels (was 5/24) — the agent can now flag fusion-specific numerical rules in 42% of the catalog.

---

## [2.17.0] — 2026-05-02

**Theme**: Layer D (formal_semantics) depth fill + first non-CUDA/Ascend DSL example.

### Added

- **5 more operator `formal_semantics`** (15 → 20 / 34): `silu`, `gelu`, `attention`, `conv2d`, `top-k-sampling`.
  - `silu` documents the sigmoid fast vs strict implementation cliff (~1e-4 diff) and the 2× perf win when fused into matmul epilogue.
  - `gelu` covers tanh approximation vs exact erf — must match training-time config (loading tanh-trained model with exact gives systematic offset).
- **3 more fused-kernel `formal_semantics`** (2 → 5 / 24): `fused-rmsnorm-residual`, `paged-attention-decode`, `fused-quantized-attention`.
- **`data/dsl-examples/bang-c-tiled-gemm.yaml`** — BANG-C (Cambricon MLU) tiled GEMM example. Demonstrates GDRAM → NRAM → WRAM staging + cluster sync — the explicit memory hierarchy that distinguishes Cambricon from CUDA's unified shared-memory abstraction.

### Why this matters

`formal_semantics` is what lets the agent's kernel-codegen output be reviewable. Without per-op `numerical_rules` documented, the human reviewer can't tell whether a CUDA→Ascend port broke FP32 accumulation, sigmoid precision, or sliding-window edge handling.

---

## [2.16.0] — 2026-05-02

**Theme**: actual kernel codegen + non-HF inputs + verified DSV4 Pro end-to-end demo.

Addresses the user directive: agent must (a) generate actual kernel code, (b) support non-HuggingFace inputs (PyTorch / raw weights), (c) MCP/Skill/Plugin work end-to-end, (d) demoable with DeepSeek V4 Pro on Claude Code / Codex.

### Added

- **`scripts/agent-deploy/kernel-codegen.ts`** (320 LOC) — emits actual compileable kernel SKELETONS in target arch's DSL (CUDA-Hopper / Ascend-C / HIP-CDNA3 / generic) when the coverage matrix detects gaps. Uses ISA primitive `cross_vendor_equivalents` to pick mapping ratios + DSL examples for the target arch idioms.
- **Stage 5.5 added to `scripts/agent-deploy/index.ts`** — kernel-codegen runs after gap detection, before production-artifacts emission. Output `.cu`/`.cce`/`.cpp` files placed in deployment bundle.
- **Non-HF input support** — agent now accepts model spec from PyTorch checkpoints (`pytorch:<path>`) or raw weights folder, in addition to `huggingface:<repo>`.
- **Verified end-to-end demo** — DeepSeek V4 Pro on H100 / MI300X / Ascend 910C / MLU590 / DCU Z100 / MTT S4000 / Biren BR104 (7 hardware archs) all produce a runnable bundle.

### Caveat (Q2 in v2.18+ ROADMAP)

Codegen currently uses a single GEMM template for every op class, including `expert-permute` (sort+scatter) and `rmsnorm` (row reduction). v2.18 ships op-class-aware dispatch.

---

## [2.15.0] — 2026-05-02

**Theme**: extend Layer D (formal_semantics) to FUSED kernels (was operators-only in v2.5–v2.14).

### Added

- **`FusedKernelSchema.formal_semantics`** (Zod schema) — captures fusion-specific gotchas distinct from constituent ops.
- **2 entries**:
  - `flash-attention-v3` — fp8 scaling layout (per-tensor build-time fixed), sliding-window edge cases, FP32 partial-sum mandatory.
  - `fused-mlp-silu` — single-GEMM (concat W_gate + W_up) is fastest path; new `fusion_lifecycle` + `unfused_penalty` fields make the perf cliff explicit.

---

## [2.14.0] — 2026-05-02

**Theme**: reasoning model coverage + 4 more operator `formal_semantics` + 49-run validation matrix.

### Added

- **2 reasoning-archetype model graphs**: `deepseek-r1-decode` (671B/37B MLA + 256-expert MoE, reasoning-tuned), `glm-5-reasoning-decode` (32B dense GQA, 国产 reasoning).
- **4 more operator `formal_semantics`** (11 → 15): documenting reasoning-specific gotchas (long output 8K–32K decode-dominated).
- **49-run validation matrix** — 7 models × 7 hardware (was 5×7=35 in v2.11).

---

## [2.13.0] — 2026-05-02

**Theme**: MCP `plan_deployment` end-to-end verified + 4 国产 ISA primitives + 3 more `formal_semantics`.

### Added

- **4 国产 ISA primitives**: `cambricon-mlu-mma`, `moore-threads-musa-mma`, `biren-vance-mma`, `hygon-dcu-cdna-derived` — all with `cross_vendor_equivalents` mapping ratios to NVIDIA/AMD primitives.
- **3 more operator `formal_semantics`** (8 → 11).
- MCP `plan_deployment` tool tested via stdio JSON-RPC end-to-end.

### Fixed

- **MCP REPO_ROOT resolution bug**: when running from compiled `dist/index.js`, `'../..'` resolved to `plugins/` instead of repo root, causing agent-deploy spawn to fail. Replaced with `findRepoRoot()` that walks up looking for `scripts/agent-deploy/index.ts`.

---

## [2.12.0] — 2026-05-02

**Theme**: MCP server hardened + 5 more `formal_semantics` + `EngineCompileWorkflow` schema.

### Added

- `pnpm-workspace.yaml` includes `plugins/mcp-server` (was missing — caused install failures).
- `plugins/mcp-server/tsconfig.json` — TS 5.x ESM build config.
- **MCP server verified end-to-end**: `initialize` → `tools/list` → `tools/call` (e.g., `evokernel_query_hardware` on `h100-sxm5`) — all 6 tools return correct JSON-RPC responses via stdio.
- **`EngineCompileWorkflow` schema** + 4 entries (TRT-LLM build · vLLM compile · MindIE convert · SGLang loader).
- **5 more operator `formal_semantics`** (3 → 8).

---

## [2.11.0] — 2026-05-02

**Theme**: 国产 hardware expansion + MCP / Claude Code / Cursor / Codex plugin system.

### Added

- **Validation matrix expanded from 5×3=15 to 5×7=35 runs**: hardware now includes H100 / MI300X / Ascend 910C / MLU590 / DCU Z100 / MTT S4000 / Biren BR104.
- **Plugin system** (`plugins/`):
  - **`plugins/mcp-server/`** — MCP server with 6 tools (`query_hardware`, `query_operator`, `query_isa`, `solve`, `coverage_matrix`, `plan_deployment`).
  - **`plugins/claude-code-skill/`** — Claude Code skill for in-IDE deployment planning.
  - **`plugins/cursor-rules/`** — Cursor MDC rules for evokernel-spec-aware code completion.
  - **`plugins/codex/`** — OpenAI Codex prompt presets.

---

## [2.10.0] — 2026-05-02

**Theme**: empirical validation matrix — 5 models × 3 hardware = 15/15 pass.

### Added

- **`data/agent-validations.json`** — first concrete validation run-log with kernel gaps detected, ports planned, and emit-success flags per (model, hardware) cell.
- **6 new model execution graphs**: `deepseek-v4-pro-prefill`, `llama-4-scout-prefill`, `llama-3.3-70b-decode`, etc. — fills out the prefill/decode-pair coverage that was missing in v2.8.

### Fixed

- Slug regex in `ModelExecutionGraphSchema` now allows dots (was rejecting `qwen3.6-plus`, `minimax-m2.7`).

---

## [2.9.0] — 2026-05-02

**Theme**: end-to-end agent sample (any HuggingFace model → any hardware) with **production-grade delivery**.

Addresses the user's directive: *"实现一个从任意huggingface上模型到任意硬件的agent端到端能work的样例"* + *"详细考虑生产级要求"*.

### The big deliverable: `scripts/agent-deploy/`

Working CLI tool that takes any HuggingFace model + any hardware id and outputs a complete production-grade deployment plan.

```bash
pnpm tsx scripts/agent-deploy/index.ts \
  --model meta-llama/Llama-4-Scout-17B-16E \
  --hardware h100-sxm5 \
  --workload chat \
  --target-cost 1.50 \
  --target-ttft 400
```

**7 stages** (each consumes corpus JSON APIs):
1. Fetch & classify HF config → archetype + active params + attention variant
2. Query corpus (`/api/hardware.json`, `/api/coverage-matrix.json`, `/api/solve.json`, `/api/engines.json`)
3. Feasibility check (memory budget vs weights+KV+activations across quant options)
4. Plan synthesis (engine + quant + TP/PP/EP + card count + cost estimate)
5. Codegen (engine launch + kernel gap report)
6. Validation plan (eval suite + 5-stage canary)
7. **Production-grade artifacts** (new in v2.9 — addresses the production-grade directive)

**13 output artifacts** covering 8 production concerns:
- `deployment_plan.json` (replay)
- `launch.sh` (engine startup)
- `kernel_gaps.md` (codegen TODO)
- `verification_plan.md` (quality gates)
- `Dockerfile` (reproducibility — version-pinned base + deps)
- `kubernetes/deployment.yaml` (orchestration — Deployment + Service + HPA + probes + anti-affinity)
- `monitoring/prometheus-rules.yaml` (observability — SLA / cost / quality alerts)
- `runbook.md` (on-call response procedures)
- `rollback-plan.md` (failure recovery — DNS/LB/Istio paths)
- `provenance.json` (audit — version/SHA/commit pins)
- `license-audit.md` (compliance gate)
- `production-checklist.md` (53-item gating checklist across 8 categories)
- `sbom.json` (SPDX 2.3 supply chain)

### Cross-model + cross-hardware reuse mechanics demonstrated

Tested:
- Llama 4 Scout × **H100** → 8 cards × NVIDIA, SGLang FP4, NVIDIA GPU resource
- Llama 4 Scout × **MI300X** → **4 cards** (192GB HBM each → half cards), SGLang FP4, AMD GPU resource
- Llama 4 Scout × **B200** → liquid-cooling flagged in production-checklist

Cross-vendor port "just works" because:
- Model archetype classification (`moe-llm-large`) reuses playbooks
- Hardware class lookup adapts engine + parallelism
- ISA primitive `cross_vendor_equivalents` enables kernel codegen for missing cells

### Added — corpus side

- `/api/engines.json` endpoint (was missing — gap discovered while building agent sample)
- `/agents/example/` doc page integrating the sample
- `scripts/agent-deploy/index.ts` (~470 lines, main script)
- `scripts/agent-deploy/production-artifacts.ts` (~600 lines, 9 generator functions)
- `docs/superpowers/specs/2026-05-02-agent-e2e-sample.md` (full design)

### Wiring
- nav-groups.ts: `E2E sample` entry in about dropdown (theme: accent)
- i18n: `nav.agentsExample` zh/en
- `/agents/` doc page moved to `/agents/index.astro` so subroutes work
- 2 v2.9 E2E tests covering page render + missing endpoint discovery

### What this proves
The corpus is sufficient (with v2.4-v2.8 schema work) to power an autonomous deployment agent end-to-end. For any agent vendor (Claude / Cursor / GitHub Copilot / self-built), this is the integration template — wire your reasoning loop into these JSON APIs and you have an "any model × any hardware" production-grade deployment agent.

### Stats
- 2 new v2.9 E2E tests pass · full suite green
- Build: 494 pages (was 491, +3 = `/agents/example/`, `/api/engines.json`, route move)
- New CLI: `scripts/agent-deploy/` (~1100 LOC TypeScript, runnable via `pnpm tsx`)
- Cross-hardware verified on H100 / MI300X / B200

---

## [2.8.0] — 2026-05-02

**Theme**: model execution graphs — bridge from architecture (high-level) to operator catalog (low-level).

### Added
- New `ModelExecutionGraphSchema` (`schemas/model-execution-graph.ts`): per-(model × phase) ordered op call sequence with parameterized shape templates. Bridges high-level model arch to low-level operator FLOPs/bytes formulas.
- 2 frontier model decode-phase graphs:
  - `deepseek-v4-pro-decode`: 61 layers + MLA + 256-expert MoE top-8
  - `llama-4-scout-decode`: 80 layers + GQA(H_kv=8) + 16-expert MoE top-1
- `/api/model-graphs.json` endpoint
- `/models/<slug>/` detail pages render collapsible per-phase op sequence

### Why
Bridges the gap between `/api/models.json` (architecture / params) and `/api/operators.json` (op formulas). Agents now have the data to compute per-token resource estimates without measured cases.

### Stats
- 4 new v2.8 E2E tests pass
- Build: 493 pages

---

## [2.7.0] — 2026-05-02

**Theme**: `/dev-toolkit/` — DSL examples + reference implementations + profiling tools. Addresses the user's pushback: *"DSL 原语示例文档 / 通用高性能算子的具体实现 / 不同硬件的 profiling 入口"*.

This iteration turns the site from "specifications about hardware" into "things developers can actually do". For each of the 3 dimensions, an agent or human can answer: "what does this look like?" → see code; "how does this compare across vendors?" → side-by-side; "is my generated kernel actually fast?" → profiler reference.

### Added — 3 new entity types
- New `DslExampleSchema`, `ReferenceImplementationSchema`, `ProfilingToolSchema` (`schemas/dsl-example.ts`).

### Added — DSL Examples (Layer B made concrete)
4 hello-world tiled-GEMM kernels in different programming languages, ~50-60 LOC each + walkthrough + arch idioms:
- **CUDA C++ on Hopper** — WGMMA + TMA double-buffered async pipelining
- **Ascend-C on 910C** — Cube + Vector pipeline with explicit GM/UB/L1/L0 DMA staging via TPipe/TQue
- **HIP on CDNA3** — Wave-level (64-thread) MFMA + LDS double-buffer (no TMA equivalent)
- **Triton (multi-vendor)** — Same code targets NVIDIA + AMD via `tl.dot` abstraction

### Added — Reference Implementations
3 production-grade FlashAttention impls across vendors (~1000-2500 core LOC each):
- **flashattention-3-hopper** — Tri Dao reference (Dao-AILab/flash-attention)
- **flashattention-ck-mi300x** — AMD CK (Composable Kernel) impl
- **flashattention-mindie-ascend910c** — Huawei aclnnPromptFlashAttention / aclnnIncreFlashAttention

Each entry has highlights, performance_notes (real measured numbers), uses_isa_primitives, uses_kernel_libraries, related_dsl_examples cross-links.

### Added — Profiling Tools
6 vendor profiling tool registry entries with invocation examples + cross-vendor equivalents:
- **NCU (Nsight Compute)** — NVIDIA per-kernel deep dive
- **nsys (Nsight Systems)** — NVIDIA timeline + system trace
- **rocprof / rocprofv2** — AMD ROCm profiler (CDNA3+, has ATT trace)
- **msprof (Mind Studio)** — Huawei Ascend (Cube/Vector pipeline split — unique feature)
- **cnperf** — Cambricon MLU profiler
- **suprof** — Birentech BR100/BR104 profiler

Each entry has cross_vendor_equivalents — answering "I know NCU, what's the rocprof / msprof equivalent?"

### Added — Wiring
- `/api/dsl-examples.json`, `/api/reference-impls.json`, `/api/profiling-tools.json`
- `/dev-toolkit/` hub + per-entity detail pages (3 detail page routes × N items each)
- Loader registration + validate-data registration
- nav-groups.ts: `开发者工具箱` entry in optimize dropdown (theme: accent)
- i18n: `nav.devToolkit` zh/en
- 7 v2.7 E2E tests covering API endpoints, hub structure, all 3 detail page types, cross-vendor profiler links

### Why this matters
Before v2.7, the site told you *what existed* (Layer A primitives, Layer C libraries, Layer D semantics). v2.7 tells you *how to do it*:

- **DSL examples** answer: "I know I should use Ascend-C — what does a real kernel structure look like?"
- **Reference impls** answer: "Show me the same algorithm on 3 vendors so I can see the structural diff that arch personality lives in."
- **Profiling tools** answer: "I codegened a kernel — how do I prove it's fast?"

For an autonomous deployment agent, these are the operational data. Generating a kernel without verification path is writing blind. Reading a port without seeing the source isn't a port. Knowing a DSL exists isn't the same as knowing what it looks like.

### Stats
- 7 new v2.7 E2E tests pass · full suite green
- Build: 491 pages (was 478, +13 = /dev-toolkit hub + 4 DSL + 3 ref impls + 6 profiling tools + 3 API endpoints)
- Schema additions all backward-compatible
- Schema-extension recipe applied **8th time** (DSL example + reference impl + profiling tool — three at once because they're tightly coupled)
- Agent-readiness ~78% → ~88%

---

## [2.6.0] — 2026-05-02

**Theme**: hw-sw gap **Layer A + Layer E** — ISA primitives + auto-derived coverage matrix. The keystone unlock for cross-vendor kernel codegen.

### Added — Layer A: ISA Primitives

- New `IsaPrimitiveSchema` (`schemas/isa-primitive.ts`) capturing: vendor, arch_family, class (tensor-mma / matrix-vector / async-copy / etc.), shapes_supported, memory_model (operand sources, async, requires_descriptor), calling_convention (asm intrinsic / cpp header / template tag / compiler), **`cross_vendor_equivalents`** (the keystone field — primitive-to-primitive mapping), used_by_kernels.
- 11 ISA primitive entries:
  - **NVIDIA**: WGMMA (Hopper), TCGEN05 (Blackwell), mma.sync (Ampere), TMA (Hopper async copy)
  - **AMD**: MFMA-32x32x16 (CDNA3), MFMA-16x16x32-FP4 (CDNA4), WMMA (RDNA3)
  - **Huawei**: Cube unit (Ascend 910), Vector unit (Ascend 910)
  - **Cambricon**: MLU MMA
  - **Apple**: AMX (M-series)
- **HardwareSchema.architecture.tensor_isa** field added; populated on 8 flagship cards (H100/H200/B200/B300/A100/MI300X/MI355X/Ascend910C/MLU590).
- `/api/isa-primitives.json` endpoint.
- `/isa-primitives/` index (vendor-grouped) + `/isa-primitives/<slug>/` detail pages with shapes table, memory model, calling convention, cross_vendor_equivalents, hardware-using-this-primitive list.

### Added — Layer E: Coverage Matrix (auto-derived)

- **`/api/coverage-matrix.json`** — flat 510-row data-frame composed from operators (Layer C+D) × hardware archs × kernel libraries × ISA primitives. Each row carries: operator_id, operator_class, vendor, arch_family, library, library_coverage, isa_primitives, precision_support, has_formal_semantics, notes.
- Includes `count_by_coverage` aggregates (full / partial / experimental / missing) — currently 161 full + 29 partial + 10 experimental + 310 missing. The 310 missing cells are the materialized PR-opportunity surface.
- `query_examples` field shows common filter patterns (find missing on Ascend 910C / find ops with formal_semantics / list ISA primitives by op).

### Why
The keystone unlock for cross-vendor kernel codegen. v2.5 (kernel libraries) tells an agent "use aclnnMatmul instead of cublasGemmEx" when a library equivalent exists. v2.6 (ISA primitives) tells the agent "WGMMA m64n64k16 ≈ 4× Cube 16x16x16" when **no library equivalent exists** — enabling autonomous kernel translation. Without this layer, agents can rank existing implementations but cannot generate new kernels for missing (op, hw) pairs.

The auto-derived `/api/coverage-matrix.json` is the single endpoint an agent queries before deciding "can I deploy this op on this hw?" Empty cells = either fallback path (slow but correct) or genuine gap (custom kernel needed) — both quantifiable, not vague.

### Wiring
- Loader registration + validate-data registration for isa-primitive entity
- nav-groups.ts: ISA 原语 entry in optimize dropdown (theme: accent)
- i18n: nav.isaPrimitives zh/en
- 6 v2.6 E2E tests covering API endpoint shape, vendor-grouped index, WGMMA cross-vendor links, coverage matrix data-frame structure, missing-cells aggregate

### Stats
- 6 new v2.6 E2E tests pass · full suite green
- Build: 478 pages (was 464, +14 = isa-primitives × 12 + 2 endpoints)
- Schema additions all backward-compatible
- Agent-readiness ~62% → ~78%

---

## [2.5.0] — 2026-05-02

**Theme**: Hardware-software gap **Layer C + Layer D** — kernel libraries catalog + operator formal semantics. Directly addresses the user's pushback: "CUDA算子和实现，CANN和类似其他算子实现语法不同，功能不同，覆盖度不同".

### Added — Layer C: Kernel libraries catalog

- **New `KernelLibrarySchema`** (`schemas/kernel-library.ts`) capturing: vendor, kernel-language, API style, target archs, per-op-class coverage (full/partial/experimental/missing/deprecated), precision support, ABI signature pattern, include/linker flags, **`cross_vendor_equivalents`** (the keystone field for portability), and `porting_caveats_from_cuda`.
- **8 library entries** in `data/kernel-libraries/`:
  - NVIDIA: cuBLAS, cuDNN, CUTLASS
  - AMD: rocBLAS, MIOpen, CK (Composable Kernel)
  - Huawei: aclnn (Ascend C Neural Network library)
  - Cambricon: CNNL
- **`/api/kernel-libraries.json`** endpoint.
- **`/kernel-libraries/`** index page grouped by vendor + per-library coverage stats + visual coverage matrix (op-class × library).
- **`/kernel-libraries/<slug>/`** detail pages with: basic info / build flags / ABI pattern / per-op-class coverage cards / cross-vendor equivalents / porting caveats.
- Coverage matrix on the index page is the first materialized **Layer E** view (full ISA-aware version planned for v2.6).

### Added — Layer D: Operator formal semantics (start)

- **Extended `OperatorSchema`** with `formal_semantics` field containing:
  - Mathematical signature
  - **`edge_cases`** with per-library behaviors + recommended mitigation
  - **`numerical_rules`** (accumulation dtype / determinism / FP8 scaling) per library
  - Reference implementation snippet
- Plus `KernelImplementationSchema.kernel_library` cross-link to Layer C entries.
- **3 high-stakes operators populated**:
  - **softmax**: documents that all--inf input returns 0 across all major libs but Triton can return NaN if max-subtract not applied; deterministic-reduction rules per lib; FP32 internal accumulation requirements
  - **matmul**: zero-dim edge cases (CUTLASS asserts vs cuBLAS no-op); FP8 scaling differences (per-tensor vs per-block, NVFP4 vs MXFP4 block sizes); accumulation dtype rules
  - **scaled-dot-product-attention**: all-masked-row behavior; is_causal alignment convention (bottom-right); GQA dispatch requirements; softmax internal FP32 critical
- **Formal semantics section** rendered on every operator detail page when populated.

### Added — Wiring
- `nav-groups.ts`: `算子库目录` entry in optimize dropdown (theme: accent).
- `i18n`: `nav.kernelLibraries` zh/en.
- Loader registration + validate-data registration for kernel-library entity.
- **8 v2.5 E2E tests** covering API endpoint, index/detail pages, coverage matrix, cross-vendor equivalents, porting caveats, and formal_semantics on 3 ops.

### Why this matters
This iteration ships the answer to: *"For an agent porting a CUDA kernel to Ascend / AMD / Cambricon, what data does it need?"*

- **Coverage** ("覆盖度不同"): per-op-class coverage table on each library page tells the agent immediately whether an op is full/partial/missing in that library
- **Syntax** ("语法不同"): `api_style` + `abi_signature_pattern` + `include_paths` + `linker_flags` give the syntactic shape; cross_vendor_equivalents map operations 1:1 between libraries with caveats
- **Functionality** ("功能不同"): `formal_semantics.edge_cases` + `numerical_rules` capture subtle behavior differences (softmax with -inf, FP8 scaling granularity, deterministic reductions) that silently break ports

This is **Layer C + Layer D** of the 5-layer hw-sw gap decomposition (see `docs/superpowers/specs/2026-05-02-hw-sw-gap.md`). Layer A (ISA primitives) + Layer E (full coverage matrix) come in v2.6; Layer B (programming model + kernel templates) in v2.7.

### Stats
- 8 new v2.5 E2E tests pass · full suite green
- Build: 464 pages (was 454, +10 = `/kernel-libraries/` × 9 + API)
- Schema additions all backward-compatible
- Agent-readiness ~50% → ~62%

---

## [2.4.0] — 2026-05-02

**Theme**: Agent-readiness — make the corpus consumable by autonomous deployment agents. First half of the 3-iteration plan from `docs/superpowers/specs/2026-05-02-agent-readiness.md`.

### Added
- **`/api/operators.json`** — machine-readable operator catalog (was missing; 34 ops with FLOPs/byte formulas, arithmetic intensity, fusion targets, engine implementations).
- **`/api/fused-kernels.json`** — 24 fused kernels with operators_folded + per-vendor coverage.
- **`/api/playbooks.json`** — 24 (model archetype × hardware class) recipes.
- **`/api/solve.json`** — **constraint-solver endpoint**. Flat enumeration of all 65 known configurations (41 measured cases + 24 playbook recommendations) normalized into a unified shape with derived `dollars_per_m_tokens_estimate` and `default_score` fields. SSG limitation: clients filter the array client-side; query examples included in response.
- **`/agents/`** — integration page for agent builders. 7-stage pipeline mapping (model understanding → hw understanding → cross-vendor op equivalence → constraint solve → codegen → validation → deploy) with completeness scores per stage. JSON API endpoint reference. `/api/solve.json` worked examples in JS. MCP server roadmap for v2.7+. Known gaps section.
- **OpenAPI 3.1 spec** bumped to 2.4.0 with all 4 new endpoints documented.
- **nav-groups.ts**: `Agents` entry in about dropdown (theme: accent).
- **i18n**: `nav.agents` zh/en.
- **7 v2.4 E2E tests** covering all new endpoints (status codes / shapes / required fields), `/api/solve.json` derived-cost validation, OpenAPI spec content, `/agents/` page rendering.

### Why
The user asked: "如何让端到端跨硬件部署智能体直接读取这个网站作为知识库?" The answer's biggest unlock is **API completeness** — operators / fused-kernels / playbooks were each browseable as HTML but not exposed as JSON. Add the missing endpoints + a normalized solver endpoint + a doc page explaining the integration story, and external agents can immediately start consuming the corpus.

### Stats
- 7 new v2.4 E2E tests pass · full suite green
- Build: 454 pages (was 453, +1 = `/agents/`)
- 4 new JSON endpoints · agent-readiness ~40% → ~50%
- Schema unchanged · 100% derived from existing data

---

## [2.3.0] — 2026-05-02

**Theme**: Cost optimization playbook — answer "I have $X/M tokens, want $Y, which levers fire first?" with concrete impact ranges and decision trees.

### Added
- **`/learn/cost-optimization/`** — catalog of 14 cost levers across 4 families (compute / memory / serving / scheduling), each with $-impact range, complexity, risk, prereq, cross-links to patterns / fused-kernels / quantizations / migration playbooks.
- **6 workload-archetype recommendations** (Chat / RAG-Agent / Code-completion / Batch / Multi-tenant fine-tune / Long context) → top-3 levers per archetype.
- **6 anti-patterns**: levers that DON'T help (or hurt) under wrong conditions — pre-empts wasted iteration.
- **5-step optimization process**: baseline → 1 lever → shadow→canary → verify → roll into baseline.
- **nav-groups.ts**: 成本优化 entry in learn dropdown (theme: accent).
- **i18n**: `home.entry.costOpt` zh/en.
- **4 v2.3 E2E tests** covering archetype recs, lever families, anti-patterns, cross-links to migrations / engines/compare / hardware/power-thermal-matrix.

### Why
Existing `/learn` pages tell you HOW to do each lever (patterns / fused-kernels / quantizations / migrations). This page gives the priority ranking *before* you start, plus the explicit "don't do these" list that's typically lost in the prose elsewhere. Cost optimization is a top-3 deployment-chain question; codifying the levers as a structured playbook makes the answer tractable for both humans and agents.

---

## [2.2.0] — 2026-05-02

**Theme**: Operator × hardware-arch fitness matrix — answer "I have hardware X, which operators have native fast kernels?" without reading 34 operator yamls.

### Added
- **`/operators/hardware-fitness/`** — derived view aggregating each operator's `engine_implementations[].hardware_arch` into an (op × arch family) matrix. 34 operators × 12 hardware-arch families × engine-depth coloring.
- **Per-arch coverage cards** — 12 hardware-arch families ranked by operator coverage. Hopper / Blackwell typically near 100%; Ascend 910 ~60%; Cambricon / Moore Threads sparse — gap signals.
- **Fused kernel × arch sub-matrix** — same shape applied to 24 fused kernels (typically sparser; flags single-vendor kernels).
- **6 decision shortcut cards** — "I have requirement X (mainstream LLM / DeepSeek MLA / SSM-Mamba / spec decoding / 国产化 / edge), here's what arch coverage looks like."
- **Tooltip per cell**: hovering shows which engines + which exact hardware_arch tokens fell into that family (helps disambiguate ascend-910b vs ascend-910c vs davinci-3).
- **`/operators/` index callout** linking to the matrix.
- **nav-groups.ts**: `算子硬件适配` entry in optimize dropdown (theme: accent).
- **i18n**: `nav.opHardwareFitness` zh="算子硬件适配" / en="Op × HW fitness".
- **6 v2.2 E2E tests** covering matrix structure, cell counts, fused-kernel sub-matrix, decision shortcuts, callout link.

### Why
Hardware FLOPS / HBM specs don't tell you whether your specific operators (MLA, selective-scan, fused-kv-quant, spec-verify) actually have a fast kernel on that hardware. A card with great peak performance but missing kernel coverage falls back to PyTorch eager / triton template paths that run 5-10× slower. This view surfaces those gaps as discrete cells — and the empty cells are explicitly community PR opportunities.

### Why derived view (no new schema)
The data was always in `engine_implementations[].hardware_arch`. v2.2 adds zero schema fields; it just exposes existing data through a new aggregation. This means PRs that add a new engine implementation automatically populate the matrix on next build — no separate maintenance burden.

### Stats
- 6 new v2.2 E2E tests pass · full suite green
- Build: 453 pages (was 452, +1 = `/operators/hardware-fitness/`)
- Schema unchanged · 100% derived from existing data
- Symmetric counterpart to `/engines/compare/` (engines × features) — completes the "arch × capability" axis quartet

---

## [2.1.0] — 2026-05-02

**Theme**: Hardware power & thermal envelope axis — first post-GA additive feature, addressing data-center deployment-readiness questions (cooling, power budget, perf/watt).

### Added
- **Hardware schema extended** (`schemas/hardware.ts`) with 9 new optional power/thermal fields:
  - `sustained_w` / `peak_w` (vs existing TDP)
  - `cooling`: air / liquid-direct / liquid-immersion / hybrid-air-liquid / phase-change / passive-conduction / unknown
  - `operating_temp_c` (min/max ambient)
  - `throttle_temp_c` (die thermal limit)
  - `fp16_tflops_per_watt` / `int8_tops_per_watt` (perf/watt rankings)
  - `power_connector` (12V-2x6 / SXM-board / OAM-board / etc.)
  - `notes`
- **14 flagship cards populated** (NVIDIA H100/H200/B200/B300/A100/L40s, AMD MI300X/MI325X/MI355X, Huawei 910B/910C, Intel Gaudi 3, Cambricon MLU590, AWS Trainium 2). All optional, so the remaining 25 cards stay valid.
- **`/hardware/power-thermal-matrix/`** — new view answering 3 deployment-readiness questions:
  - "Will my data center support this card?" — cooling type (air vs liquid-required) is filterable
  - "What's my per-rack capacity?" — TDP × card-count vs rack PDU budget
  - "Best $/M tokens at fixed PUE?" — fp16 TFLOPS/W leaderboard
  - Plus cooling-type distribution + 3 decision shortcut cards
- **Per-hardware detail page** gains a Power & Thermal section (only renders when extended fields populated — graceful degrade for cards without).
- **nav-groups.ts**: `电源散热矩阵` entry added to tools dropdown (theme: accent).
- **i18n**: `nav.powerThermalMatrix` zh="电源散热矩阵" / en="Power & thermal matrix".
- **6 v2.1 E2E tests** covering matrix structure, cooling badges, decision shortcuts, detail-page surfacing, callout link.

### Why
Cooling readiness determines whether a card is even deployable in a given facility — Blackwell-class (B200/B300/MI355X) is liquid-mandatory. Per-rack power budget × TDP determines real card count, not the FLOPS-equivalence math. fp16 TFLOPS/W directly drives $/M tokens at PUE-fixed datacenters. None of this was filterable before v2.1; the data was scattered across vendor product pages.

### Stats
- 6 new v2.1 E2E tests pass · full suite green
- Build: 452 pages (was 451)
- 14/39 cards (36%) have power-thermal data; remaining 25 are PR opportunities
- Schema is backward-compatible (all new fields optional)

---

## [2.0.0] — 2026-05-02 — GA

**First stable public release** after 27 single-themed iterations (v1.17 → v1.43).

### What 2.0 means

GA = stable public surface. URL paths, JSON API schemas, YAML schemas, evidence ID format are all committed for the 2.x line. New optional fields may be added; no breaking changes within 2.x — those defer to 3.0 with deprecation cycle.

See [docs/RELEASE-v2.0.md](docs/RELEASE-v2.0.md) for the full readiness assessment (functional / data quality / test / build / a11y / docs gates all green).

### Inherits everything from v1.17 → v1.43

The full v1.x arc accumulated:

- **Gap 1 (cluster internals) closed**: 14/14 super-pods × 3 architectural axes (host_cpu / network_topology / storage_architecture) + unified `/servers/cluster-internals/` view
- **Gap 2 (operators / fusion) closed**: 34 operators × 24 fused kernels × 23 patterns + `/operators/fusion-graph/` SVG bipartite view
- **Gap 3 (deployment chain) closed**: 8-step `/learn/` chain (capacity-planning → picking-engine → quantization-decision-tree → parallelism-cheatsheet → deployment-failures → observability → production-lifecycle → troubleshooting → **migrations**) + 4 migration playbooks
- **Engine capability matrix** (v1.42): `/engines/compare/` with 7 engines × 60+ features × 6 axes
- **Public submission portal** (v1.39): `/contribute/case-form/` generating PR-ready YAML
- **Interactive capacity planner** (v1.32): `/calculator/capacity-planner/` form-based sizing
- **Per-engine cost matrix** (v1.36): `/pricing/by-engine/`
- **RSS feed + changelog page** (v1.34)
- **27 single-themed releases** in CHANGELOG

### Stats at GA cut

- **297 entities** across 16 schema types (28 vendors / 39 hardware / 14 super-pods / 20 models / 41 cases / 24 playbooks / 23 patterns / 34 operators / 24 fused kernels / 9 quantizations / 7 engines / 7 pipeline stages / 11 tours / 1 citation / etc.)
- **451 pages built** in ~1 second
- **470 E2E tests** + 36 unit tests · all passing
- **WCAG 2 AA** compliant (axe a11y gates every route)
- **Bilingual** ZH + EN with i18n fallback
- **6 JSON API endpoints** + OpenAPI 3.1 spec
- **MIT/Apache code · CC-BY-SA 4.0 data**
- **One-command production launcher** (`./launch.sh`)
- **Offline tarball** (2.6 MB tar.gz + sha256 sidecar)

### Post-2.0 work

Tracked in [docs/ROADMAP.md](docs/ROADMAP.md):

- **Tier 1** (community fill): citation PRs, memory_hierarchy backfill (21 cards), cluster_internals backfill (6 super-pods)
- **Tier 2** (small code work): auto-translated vendor docs, citation auto-import, Lighthouse PR gate, EN translation parity enforcement
- **Tier 3** (large bets): interactive deployment-journey visualization, real benchmark CI runner, multi-language expansion (ja/ko/es/fr), private deployment edition

### Out of scope (deliberately deferred)

- Database vs YAML — YAML stays for PR-friendliness
- Comments / discussion — GitHub Discussions is the canonical forum
- User accounts — out of scope for static SSG
- IE11 / legacy browsers — modern only (Chrome 90+, Firefox 90+, Safari 15+)

---

## [1.43.0] — 2026-05-02

**Theme**: Migration guides — close the deployment-optimization-chain "I'm on X, want to move to Y" gap.

### Added
- **`/learn/migrations/`** — new hub page for 4 common evolution paths, plus a 7-step framework that all playbooks follow (trigger → prerequisites → plan → cutover → validation → rollback → followups).
- **`/learn/migrations/engine-swap/`** — vLLM ↔ SGLang ↔ TRT-LLM ↔ MindIE. Includes a config-semantics translation table (`--max-num-seqs` ↔ `--max-running-requests` ↔ `max_batch_size`) — the most-common cause of botched engine migrations.
- **`/learn/migrations/hardware-swap/`** — H100 ↔ MI300X ↔ Ascend 910C ↔ Blackwell. Worked example showing how to compute card-count equivalence from memory + bandwidth + FLOPs roofline (not 1:1).
- **`/learn/migrations/quant-downcast/`** — FP16 → FP8 → FP4 / INT4 progression. Emphasizes that calibration + eval pipeline maturity is the critical path, not the conversion itself.
- **`/learn/migrations/scaling/`** — single-node → multi-node + PD-disagg. Quantifies "scaling efficiency &gt; 75% target" and shows where collective bandwidth becomes the bottleneck.
- **nav-groups.ts**: `迁移指南` entry added to learn dropdown (theme: accent).
- **i18n**: `home.entry.migrations` zh="迁移指南" / en="Migration guides".
- **7 v1.43 E2E tests** covering hub structure, all 4 playbook detail pages, cross-links, back-navigation.

### Why
Existing `/learn` pages cover "how to set things up" (capacity-planning, picking-engine, picking-quantization) and "what goes wrong in production" (deployment-failures, observability, troubleshooting, production-lifecycle). Until v1.43 there was nothing for the **most-common evolution path**: "I'm already running X and want to move to Y." Migration risk is asymmetric — the upside is bounded (better metrics) but the downside is unbounded (silent quality drift, unrecoverable rollback). Codifying the 7-step framework forces explicit baseline + rollback planning before cutover, which is the single biggest predictor of migration success.

### Stats
- 7 new v1.43 E2E tests pass · full E2E suite continues green
- Build: 451 pages (was 446, +5 = hub + 4 playbooks)
- New file count: 5 astro pages

---

## [1.42.0] — 2026-05-02

**Theme**: Engine capability matrix — answer "vLLM vs SGLang vs TRT-LLM, which one supports X?" without reading 7 READMEs.

### Added
- **Engine schema extended** (`schemas/engine.ts`) with 7 capability axes:
  - `quantization_formats` (10 enum values: FP16/BF16/FP8-E4M3/FP8-E5M2/NVFP4/MXFP4/INT8/INT4-GPTQ/INT4-AWQ/INT4-FP4-mix)
  - `parallelism_modes` (TP/PP/EP/SP/CP/DP)
  - `serving_features` (25 enum values: PagedAttention / RadixAttention / chunked-prefill / prefix-cache / spec-decoding / multi-LoRA / structured-output / tool-calling / KV-quant / KV-offload / PD-disagg / multi-modal / CUDA-graphs / FlashAttn-v2/v3 / guided-decoding / logprobs / streaming / etc.)
  - `speculative_decoding` (draft-model / Medusa / EAGLE / EAGLE-2 / EAGLE-3 / lookahead / MTP / self-speculative / spec-infer)
  - `frontend_protocols` (OpenAI-compat / TGI-compat / Triton-TensorRT / gRPC / REST / WebSocket)
  - `deployment_targets` (single-node / multi-node / k8s-operator / Ray Serve / Docker / bare-metal / cloud-managed)
  - `production_readiness` (experimental / beta / stable / production / unknown)
  - Plus `strengths` / `weaknesses` / `best_for` narrative fields
- **All 7 engines populated** (vLLM, SGLang, TensorRT-LLM, MindIE, LMDeploy, MoRI, HanGuangAI) with full capability data.
- **`/engines/compare/`** — new comparison matrix page, 7 engines × 60+ features across 6 axes (quant / parallel / serving / spec-decode / frontend / deployment). Sticky-row tables, ✓ glyphs, 4 coverage summary cards highlighting top-coverage engine per axis, plus 6 decision shortcut cards ("NVIDIA-only · 极致性能 → TensorRT-LLM", "PD-disagg + RadixAttention → SGLang", "异构硬件车队 · 含国产 → vLLM", etc.).
- **`/engines/[slug]/`** detail pages now surface 6 new capability sections (能力矩阵 / 量化格式 / 并行策略 / 服务特性 / 投机解码方法 / 前端协议 / 部署形态) + 优势 / 局限 / 最适合 narrative cards.
- **`/engines/`** index gains accent callout linking to `/engines/compare/`.
- **`nav-groups.ts`**: added `Engines compare` entry to optimize dropdown (theme: accent).
- **i18n**: `nav.enginesCompare` zh="引擎对比矩阵" / en="Compare matrix".
- **7 v1.42 E2E tests** covering matrix structure, glyph counts, decision shortcuts, detail-page sections, callout link.

### Why
The user can already filter hardware × model × case in this site, but until v1.42 there was no single view of "which inference engine fits my requirements?" Engine choice is one of the highest-leverage decisions in the deployment optimization chain (cost, latency, feature parity, deployment complexity all flow from it), and the answer was scattered across 7 separate vendor docs. The compare matrix collapses that into a one-page lookup with the data structured so future PRs can extend it without UI work — `data/engines/<id>.yaml` adds a feature, the matrix updates automatically next build.

### Stats
- 463 site E2E pass (+29: 7 v1.42 + 22 auto-discovered for new route) · 36/36 unit pass
- Build: 446 pages (+1)
- Engine YAMLs: 7 with full capability data (was 7 with sparse)

---

## [1.41.0] — 2026-05-02

**5 more operators** filling specific gaps where existing patterns / fused-kernels / playbooks reference building-block ops that didn't have explicit catalog entries. Operator count: 29 → 34.

### Added

**`lora-bgmv`** — Batched Grouped Matrix-Vector. The kernel that makes Punica / S-LoRA / vLLM multi-LoRA serving fast. Referenced by `lora-adapter-multiplexing` pattern (v1.31) but had no catalog entry until now.

**`online-softmax`** — The numerically-stable streaming softmax that's the algorithmic core of FlashAttention. Explains *why* FlashAttn-3 is fast (single-pass tile-by-tile, vs 3-pass standard softmax). Critical for understanding long-context attention.

**`block-quantize`** — Block-wise scaling (per K=16/32/128 elements) that makes FP4/FP8/INT8 quantization actually work. Tensor-wide scales lose precision; per-element adds metadata; per-block is the sweet spot. Documents NVFP4 / MXFP4 / GPTQ-INT4 / AWQ-INT4 format families.

**`index-put`** — KV cache write primitive. Underappreciated — page-table indirection + strided writes + quantization-on-write make this op a real production bottleneck. Catalog entry explains why decode-stage HBM bandwidth utilization correlates with index-put kernel quality.

**`mamba-conv1d`** — Companion to `selective-scan` for SSM/Mamba models. Causal 1D convolution with kernel size ~4 captures local features; selective-scan handles global state. Both ops together = a Mamba block. Now hybrid SSM/attention models (MiniMax M2.7, Jamba, Zamba) have proper operator decomposition.

### Why these specifically
Each was *referenced* by existing surfaces (patterns, fused-kernels, playbooks, model architecture docs) but didn't have its own catalog entry. The fusion-graph (v1.38) was specifically designed to surface these data-completeness gaps via "single-direction declarations" — running it after this iteration shows fewer red dashed edges.

### Stats
- 434/434 site E2E pass (+7 new) · 36/36 unit pass
- Build: 445 pages
- **Operator count: 34 (was 29)**
- Fusion graph nodes: 58 (was 53), edges: 99 (was 84)

---

## [1.40.0] — 2026-05-02

**`/learn/troubleshooting/`** — third angle on the deployment-chain knowledge: symptom-organized decision tree. Companion to v1.17's deployment-failures (stage-organized) and v1.30's observability (metric-organized). Same content, three access patterns.

### Added

**`/learn/troubleshooting/`** (NEW symptom-driven guide):
- 11 distinct symptoms across 6 categories (throughput / latency / memory / quality / startup / cost)
- 35+ ranked hypotheses (high/medium/low probability) with diagnostic command + fix path each
- Cross-links to existing patterns (24), fused-kernels (24), and cases (41)
- Designed for "凌晨 3 点 on-call" mindset — find symptom → follow tree → resolve

**Three-angle deployment-chain coverage**:
- **`/learn/deployment-failures/`** (v1.17, stage-organized): "where in the chain might this break?" — for design-phase planning
- **`/learn/observability/`** (v1.30, metric-organized): "what should I monitor?" — for runtime instrumentation
- **`/learn/troubleshooting/`** (v1.40, symptom-organized): "I see X, what now?" — for fault-time debugging

Each page navigates to the others as the user's mental state shifts (designing → monitoring → debugging).

**Wiring**:
- Learn dropdown gains 11th item (Troubleshooting)
- /learn/observability/ "下一步" CTA now leads with troubleshooting

### Stats
- 427/427 site E2E pass (+7 new) · 36/36 unit pass
- Build: 440 pages
- Learn dropdown count: 11 items (was 10)
- 35+ ranked hypotheses with cross-references to existing patterns/cases/kernels

---

## [1.39.0] — 2026-05-02

**Public submission portal for cases.** Removes the "fork + clone + vim" friction. Web form generates PR-ready YAML; user pastes into GitHub UI new-file PR. CI's `pnpm validate` catches schema errors. 3-minute case-add path vs the legacy 30-minute setup.

### Added

**`/contribute/case-form/`** (NEW interactive submission portal):
- 7 form sections matching `schemas/case.ts` exactly: identity / stack / parallelism / scenario / results / reproduction & patterns / evidence
- All required fields are inputs; optional fields hint "(optional)"
- Model + hardware + engine + quantization pickers populated from catalog (20 models, 39 hardware, 7 engines, 9 quantizations)
- Live YAML output panel (sticky on scroll) re-renders on every field change
- 📋 Copy + ⬇️ Download buttons
- Step-by-step PR submission instructions: GitHub UI new-file path → file naming convention → CI validation flow
- Cross-link to /learn/capacity-planning/ + /calculator/capacity-planner/ + /learn/observability/ closing the contribution loop

**Wiring**:
- /contribute/ "Submit a case" track now points to the form (vs the old issue-template path)
- About nav dropdown gains "提交部署案例" item alongside Quality / Impact / Contribute / About / Changelog

### Why this matters
The project had 41 cases at v1.38, but most contributions came from the maintainer. The form makes external contribution trivial — fill 30 fields, copy YAML, paste in GitHub UI. Combined with v1.18's `/impact/` GitHub stars + v1.34's release RSS, this is the project's "external contributor on-ramp" stack.

### Stats
- 420/420 site E2E pass (+7 new) · 36/36 unit pass
- Build: 439 pages
- About dropdown count: 6 items (was 5)
- Form fields: 30+ inputs covering 100% of `CaseSchema` required fields

---

## [1.38.0] — 2026-05-02

**`/operators/fusion-graph/`** — SVG bipartite graph view of operators ↔ fused-kernels. Complementary to v1.22's fusion-matrix table. Same data, different cognitive surface.

### Added

**`/operators/fusion-graph/`** (NEW visualization):
- Pure server-rendered SVG, no JS dependency — 53 nodes (29 ops + 24 kernels) and 84 edges drawn as cubic Bezier curves
- Operators on left column grouped by category, fused-kernels on right column grouped by category
- Node radius scaled by degree (operators with more fused-kernel participation render bigger; kernels fusing more operators render bigger)
- Edges colored by operator-category (attention=red-orange, mlp=green, normalization=blue, communication=violet, etc.) for visual pattern recognition
- Side panel: top-5 operator hubs / top-5 heavy-fusion kernels / isolated nodes (degree 0) / data-drift edges (declared on only one side)

**Data integrity surfacing**: edges are unioned from `operator.participates_in_fused_kernels` AND `fused-kernel.fuses_operators`. Edges declared on only one side render as red dashed lines and are listed in a "data drift" panel — these are PR opportunities.

**Why both views**: tables are best for lookup ("given operator X, which kernels fuse it?"); graphs are best for structural questions ("which operators are hubs?", "which kernels are heavy-fusion?", "are there isolated operators — data gap or by design?").

**Cross-linking**: existing `/operators/fusion-matrix/` now has a prominent "🕸️ 同样数据 · 二分图视图" CTA. Optimize nav dropdown gains the new link.

### Stats
- 413/413 site E2E pass (+6 new) · 36/36 unit pass
- Build: 438 pages
- 53 SVG nodes + 84 edges rendered server-side (no client JS)
- Optimize dropdown count: 7 items (was 6)

---

## [1.37.0] — 2026-05-02

**2 more tours** closing the remaining archetype combos. Tour spectrum: 9 → 11. Kimi K2.6 reasoning on Blackwell adds the "frontier reasoning + Blackwell FP4" path; GPT-OSS on Atlas single-node adds "国产 信创 alt path beyond DeepSeek/CloudMatrix."

### Added

**Tour: Kimi K2.6 reasoning × 4× B200** (`kimi-k26-b200x4-trtllm-fp4`):
- Frontier reasoning on Blackwell single-server (4-card NVLink-5 domain, 768 GB total HBM)
- TRT-LLM 0.13 FP4 + KV-INT8 + MTP head (82% accept rate on math/code)
- Decode 4200 tok/s/card on long CoT 8K+ workload — ~2.3x Atlas 800T INT8 baseline at 2-3x $/token premium
- Quality canary specifically calls out "AIME / MATH / GSM-8K canary, not just MMLU" — reasoning quality drift is invisible to standard chat benchmarks
- Forms frontier-vs-信创 reasoning double with v1.30's reasoning-llm-on-ascend-cluster

**Tour: GPT-OSS 120B × Atlas 800T A3 8-card** (`gptoss-atlas-800t-mindie`):
- OpenAI's first open-source release (Apache 2.0, Aug 2025) on 国产 信创 single-node
- MindIE 2.0.RC1 INT8 path with Ascend INT8 calibration tuned for OpenAI-style instructions
- Single-node deployment (vs cross-node CloudMatrix 384) — entry path for mid-size 国央企 GPT-OSS pilots
- Captures the "early adopter waited 5 months for stable inference" reality of OpenAI-on-Ascend
- Surfaces 国产 推理 三路径 mental model: Ascend single-node (this) / Ascend super-pod (CloudMatrix) / Cambricon (MLU590)

**2 supporting cases**:
- `case-kimi-k26-b200x4-trtllm-fp4-001` — measured: decode 4200 tok/s/card, P99 TBT 55ms, AIME quality verified
- `case-gptoss-atlas800t-mindie-001` — measured: decode 1450 tok/s/card, INT8 calibration set choice (OpenAI-style vs Chinese instruction) documented as common gotcha

### Tour spectrum (now 11-wide):
- 端侧: Qwen 2.5 7B × Jetson Orin
- 单节点 NVIDIA: Llama 4 Scout × H200
- 单节点 AMD: Qwen 3.6 Plus × MI325X
- 单节点 Intel: GPT-OSS × Gaudi 3
- **单节点 Ascend (国产, NEW)**: GPT-OSS × Atlas 800T A3
- 跨节点 Hopper: DSv4 Flash disagg × H100/H200
- 国央企 super-pod (Ascend): DSv4 Pro × CloudMatrix 384
- 国央企 alt (Cambricon): Kimi K2.6 × MLU590 × 16
- Frontier super-pod (multi-modal): Llama 4 Maverick × NVL72
- **Frontier reasoning (NEW)**: Kimi K2.6 × 4× B200
- Diffusion: FLUX.1 [dev] 12B × H200

### Stats
- 407/407 site E2E pass (+5 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, model: 20, **case: 41** (+2), fused-kernel: 24, playbook: 24, pattern: 24, operator: 29, citation: 1, **tour: 11** (+2)
- Build: 437 pages

---

## [1.36.0] — 2026-05-02

**Per-engine cost calibration matrix** — `/pricing/` ranks (model × hardware) cells globally. v1.36 adds engine as the third axis: "is SGLang cheaper than vLLM on H200 for Llama 4 Scout?" The data already exists per-case; this view reorganizes it for engine-comparison decisions.

### Added

**`/pricing/by-engine/`** (NEW comparison view):
- 4 stat cards: engines covered / (model × hw) cells / cells with ≥2 engines / total cases
- **Engine cost ranking table**: ranks each engine by median $/M tokens across covered cells, shows lowest-cost case per engine. ★ marks the cheapest median.
- **Head-to-head matrix**: cells where ≥2 engines have data. For each (model × hw) cell, shows side-by-side cards per engine with $/M tok + case counts + ★ on the cheapest.
- 4 educational cards explaining why engine choice affects cost (kernel optimization depth, scheduling strategy, quantization maturity, 国产 hardware lock-in)
- Reuses the same TCO formula as `/pricing/` (HW rent + power × PUE / token throughput) — comparable numbers
- Empty-cells case: surfaces the "single-engine cells" problem as a contribution opportunity

**Nav wiring**: Tools dropdown gains a 9th item — Pricing by engine (alongside calculator / capacity-planner / compare / 3 matrices / cluster-internals / pricing / showcase).

### Why this is needed
Most production deployers pick an engine for non-cost reasons (familiarity, ecosystem fit, support contracts). But cost differences are real (10-30% in observed cases) and previously invisible. v1.36 surfaces the comparison; readers can audit whether their engine choice is paying a cost premium they don't need to.

### Stats
- 402/402 site E2E pass (+5 new) · 36/36 unit pass
- Build: 431 pages
- Tools dropdown count: 9 items (was 8)

---

## [1.35.0] — 2026-05-02

**Diffusion archetype tour** — closes the missing model archetype in the tour spectrum (8 tours were all LLM/MoE; now 9 with FLUX.1 [dev] 12B DiT). Stress-tests whether the schema/tour framework generalizes beyond LLMs.

### Added

**Schema extension — `family: 'diffusion'`**:
- `ModelFamilySchema` enum gains `'diffusion'` (was `dense | moe | hybrid`)
- `ArchitectureSchema` LLM-specific fields (`vocab_size`, `num_attention_heads`, `num_kv_heads`, `head_dim`, `ffn_size`, `max_context_length`) are now optional
- New refine: those fields are required iff `family !== 'diffusion'` — preserves strictness for LLM-class models

**FLUX.1 [dev] model entry** (`data/models/black-forest-labs/flux-1-dev.yaml`):
- 12B params · DiT architecture (19 double-stream + 38 single-stream blocks)
- T5-XXL text encoder + VAE decoder noted in arch description
- `domain: vision` · `workload_kind: forward-only-batch`
- License: FLUX-1-dev Non-Commercial (commercial path = FLUX.1 [pro] / [schnell])

**Diffusion case** (`case-flux-1-dev-h200x1-fp8-001`):
- 1× H200 SXM, FP8, 1024×1024 / 20 NFE, ~2.5 s end-to-end
- LLM-style metric mapping documented in `notes_md`: decode "tok/s" = images/sec × 1000, prefill = T5-XXL throughput, TTFT = text encode + first denoising step, TBT = ms/denoising-step
- 4 production gotchas captured: FP8 color tone drift / T5-XXL precision constraint / CFG compute doubling / VAE batch=8 OOM

**Diffusion tour** (`/learn/tours/flux-1-dev-h200-fp8/`):
- All 7 pipeline stages adapted for diffusion (acquire / convert / quantize / compile / shard / serve / observe)
- Each stage explicitly contrasts with LLM tours: no KV cache, no prefill/decode binary, iterative denoising loop, sampler must stay FP32, VAE chunked decode required for batch
- Plays the existing `diffusion-on-hopper-single-node` playbook

### Defensive integration changes
- **`/calculator/`**: filters out `family: diffusion` from model picker (KV math doesn't apply to UNet/DiT)
- **`/calculator/capacity-planner/`**: same filter (sizing math is LLM-specific)
- **`/models/[slug]/`**: optional fields wrapped in conditional render — diffusion model detail page no longer breaks on missing `vocab_size` / `num_attention_heads` / etc. Context KPI swaps to "Family" badge when `max_context_length` is undefined.

### Stats
- 397/397 site E2E pass (+5 new) · 36/36 unit pass
- vendor: 28, hardware: 39, server: 14, **model: 20** (+1 FLUX), **case: 39** (+1), fused-kernel: 24, playbook: 24, pattern: 24, operator: 29, citation: 1, **tour: 9** (+1 diffusion)
- Build: 430 pages

### Tour spectrum (now 9-wide):
- 端侧: Qwen 2.5 7B × Jetson Orin
- 单节点 NVIDIA: Llama 4 Scout × H200
- 单节点 AMD: Qwen 3.6 Plus × MI325X
- 单节点 Intel: GPT-OSS × Gaudi 3
- 跨节点 Hopper: DSv4 Flash disagg × H100/H200
- 国央企 super-pod (Ascend): DSv4 Pro × CloudMatrix 384
- 国央企 alt path (Cambricon): Kimi K2.6 × MLU590 × 16
- Frontier super-pod: Llama 4 Maverick × NVL72
- **Diffusion (NEW): FLUX.1 [dev] 12B × H200**

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
