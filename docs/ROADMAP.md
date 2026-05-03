# EvoKernel Spec — Roadmap

> **Last updated:** 2026-05-04
> **Current release:** **v3.31.2** (CI stabilization for the v3.31 docs/web/API quality sync)
> **Live:** https://yingwen.io/evokernel-spec/
> **Historical (archived):** [`docs/archive/`](archive/README.md) — v1.x and v2.x roadmaps + release notes

---

## Where the project is (May 2026)

The project has gone through three major arcs:

| Arc | Versions | What it built |
|---|---|---|
| **v1.x — Corpus** | v1.0 → v1.43 | The 5 base entity types (vendors / hardware / models / cases / playbooks) reach saturation. Public site goes live. JSON APIs ship. |
| **v2.x — Computable knowledge + agent toolkit foundations** | v2.0 → v2.25 | Tier 1 calculator. 5-layer hw-sw gap framework. ISA primitives, DSL examples, kernel libraries, profiling tools. First agent-deploy CLI (skeleton mode). MCP server. Per-deploy artifacts (Dockerfile, K8s, runbook, SBOM). |
| **v3.x — Productized agent harness** | v3.0 → v3.31 | The CLI stops emitting skeletons and starts emitting real generated kernels with V1/V2/V3 verification. Host-LLM mode, unknown-model synthesis, technique entities, remote-target SSH execution, `/techniques/` SSG/API, plugin install, self-diagnosis, continuous-mode, auto-PR, 4-vendor profiler ingestion, zh i18n, and v3.31 docs/web/API alignment. |

The current state is **a working productized agent CLI with a real corpus behind it** — see [`README.md`](../README.md) "What honestly works today" + "Known limits" sections.

## State of the data (v3.31, 2026-05-04)

| Entity | Count | v3.x growth |
|---|---|---|
| Vendors | 38 | +10 across v3.x (Black Sesame, HPC-AI Tech, Genmo, MIT-Jameson, Orbital Materials, ...) |
| Hardware | 64 | +25 (Cambricon MLU220/MLU290, Iluvatar BI-V150, Black Sesame A1000, Horizon J5, MTT S5000, B300/GB300, MI355X, Apple M5 Pro/Max, Ascend 910D/950, ...) — **24 国产** |
| Servers (super-pods) | 14 | unchanged from v2.x |
| Models | 34 | +14 across v3.8/v3.10/v3.14 (AlphaFold 3, Boltz-1, ESMFold, GraphCast, MACE-MP-0, Whisper, Parakeet, F5-TTS, FLUX, SD 3.5, Mochi, OpenSora 2, HunyuanVideo, Kimi K2.6, ...) |
| Operators | 38 | +4 in v3.11/v3.13 (triangle-mult, CG tensor product, mel-spec, flow-matching) |
| Fused kernels | 27 | +3 in v3.12/v3.13 (pairformer, MACE message-pass, flow-matching with cache) |
| ISA primitives | 16 | +1 (Apple Neural Engine) |
| DSL examples | 15 | +6 cross-platform: triangle-mult on Triton/CUDA/Ascend-C/MLX/HIP (5-platform parity); Ascend-C tiled GEMM; HIP MFMA |
| Kernel libraries | 8 | unchanged |
| Profiling tools | 6 | unchanged (corpus); 4 actually wired to agent harness (NCU/rocprof/msprof/cnperf as of v3.23) |
| Engines | 7 | unchanged |
| Pipeline stages | 7 | unchanged |
| Cases | 41 | unchanged |
| Tours | 11 | unchanged |
| Patterns | 23 | unchanged |
| Quantizations | 9 | unchanged |
| Engine-compile workflows | 4 | unchanged |
| Reference impls | 3 | unchanged |
| Agent-learnings | 3 seed | community PRs welcome |
| Techniques | 4 | SageAttention + FlashAttention + PagedAttention + RingAttention |
| **Total entities** | **424** | from 297 at v2.17 |

## State of the harness and site (v3.31)

| Layer | Surface | Status |
|---|---|---|
| **Layer R** (Smart context retrieval) | `fetch-bundle.ts` + `resolveBundleId()` + `listBundles()` + 2176+ pre-built bundles + `synthesizeTemporaryBundle()` for unknown HF models | ✅ stable |
| **Layer P** (Planning) | `index.ts` Stage 1-4 (HF config fetch, classify, feasibility, synthesize plan) | ✅ stable |
| **Layer G** (Generation) | `llm-orchestrator.ts` host-LLM / real / cache / test / skeleton modes; productized path now accepts synthesized bundles | ✅ stable surface; generated quality remains workload-dependent |
| **Layer V** (Verification) | V1 build structural · V2 correctness reference compare · tensor-diff utility · V3 perf gate (auto-detect 6 vendors, 4/6 parsers wired) | ⚠️ cross-arch execution depth still pending |
| **Layer F** (Feedback) | per-deploy `agent-learning.yaml` + `auto-pr-cli.ts` cluster aggregation + `watch.ts` continuous re-deploy | ✅ stable |
| **CLI** | 11 commands · `pnpm agent:{deploy,deploy:productized,list-bundles,auto-pr,install,doctor,status,watch,...}` | ✅ stable |
| **Plugins** | Codex Node binary (`evokernel-deploy`) · CC slash commands (`/agent-deploy` + `/zh:agent-deploy`) · MCP server (12 tools) | ✅ stable |
| **Tests** | 41 schemas + 286 scripts + 49 web = 376 passing, 1 skipped network gate | ✅ |
| **Site/API docs** | 613 SSG pages, `/techniques/` catalog, route-aware EN fallback, API descriptor/OpenAPI/health aligned to current public routes | ✅ baseline; link checker still planned |

---

## v3.32+ priorities

The v3.24-v3.31 arc closed the original "too simple to be a real product" gaps and aligned the public docs/web/API surface. The next releases should now focus on execution depth and corpus accretion. Historical design remains at [`docs/superpowers/specs/2026-05-04-real-productized-agent.md`](superpowers/specs/2026-05-04-real-productized-agent.md).

### Priority 1: Cross-arch numerical verify execution

**The gap**: tensor-diff exists, but the full run-reference-on-native-arch + run-new-impl-on-target + compare tensors with technique tolerance loop is not yet a first-class end-to-end command.

**Target**: v3.32. Drive it from the SageAttention/CogVideoX/Ascend-910B scenario and record pass/fail in the deploy manifest + agent-learning stub.

### Priority 2: Persist synthesized bundles into the corpus

**The gap**: v3.29 synthesis is in-memory. A second run of the same unknown model re-synthesizes instead of using a reviewed `data/models/` entry.

**Target**: v3.32. Emit PR-ready model/model-graph YAML stubs after successful synthesis, with caveats and source provenance.

### Priority 3: Serving/client-test orchestration

**The gap**: generated kernels and deploy artifacts exist, but `--serve` should template the model-serving wrapper and client sanity test so the north-star scenario ends at a user-visible endpoint.

**Target**: v3.32. Generate FastAPI/Triton wrapper templates plus a local/remote client script and record their status in the run summary.

### Priority 4: Knowledge base and web/API quality gate

Current audit state: schema validation passes, but `pnpm audit:data` still reports 3 warnings and 60 info. Web/API descriptor parity was tightened in v3.31; remaining debt is build-time link checking, sparse model graphs/reference impls, and measured-case coverage. See [`2026-05-04-knowledge-web-quality-plan.md`](superpowers/specs/2026-05-04-knowledge-web-quality-plan.md).

### Priority 5: Remaining 2/6 vendor profiler parsers

`suprof` (Moore Threads MUSA) + `instruments` (Apple). Same pattern as v3.22 NCU + v3.23 rocprof/msprof/cnperf.

---

## How to think about which version to use

| Use case | Version |
|---|---|
| Citation in a paper or industry report | Latest stable (v3.31.2) |
| Production deploy planning (no codegen) | Any v3.x — corpus is stable since v3.0 |
| Real-code generation (productized) | v3.17+ (when the harness was wired) |
| 4-vendor profiler ingestion | v3.23+ |
| Continuous re-deploy (`agent:watch`) | v3.22+ |
| Codex CLI binary (`evokernel-deploy`) | v3.18+ (install via `agent:install`) |
| Claude Code zh slash command | v3.23+ |
| Host-LLM generation without a standalone API key | v3.25+ |
| Technique-driven SageAttention-style port attempts | v3.26+ |
| Remote-target `--execute` SSH build/run/profile | v3.27+ |
| Unknown HF model synthesis in productized loop | v3.29+ |
| Technique catalog with Flash/Paged/Ring/Sage attention | v3.30+ |
| Public docs/web/API alignment for v3.30 state | v3.31+ |

---

## What is deliberately deferred (out of scope)

These are not gaps — they're explicit non-goals to keep scope manageable:

- **Closed-source model proxying** (e.g. running GPT-4 inference) — corpus is open-source models only
- **Cloud provider CLI integration** (AWS/GCP/Azure CLIs) — out of scope; harness produces plain Dockerfile + K8s manifests for any orchestrator
- **GUI frontend for the harness** — CLI + slash command + MCP is enough surface
- **Real-time monitoring dashboards** — Prometheus rules are emitted; visualization is downstream

If you'd like one of these added, open an issue with the specific use case + concrete user scenario (similar to how the SageAttention/CogVideoX/910B scenario drove the v3.24-v3.31 arc).

---

## Cadence

The project ships in tight micro-releases (~1-2 hours each, themed). v3.x has shipped at roughly 1 release/day during active phases. Pages auto-deploy on tag push. Each release adds ~10-20 tests and a new product surface (CLI command, MCP tool, parser, UI section) — see CHANGELOG.md for the full history.
