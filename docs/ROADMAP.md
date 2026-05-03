# EvoKernel Spec — Roadmap

> **Last updated:** 2026-05-04
> **Current release:** **v3.23.0** (vendor profiler parity + zh i18n + DRY refactor)
> **Live:** https://yingwen.io/evokernel-spec/
> **Historical (archived):** [`docs/archive/`](archive/README.md) — v1.x and v2.x roadmaps + release notes

---

## Where the project is (May 2026)

The project has gone through three major arcs:

| Arc | Versions | What it built |
|---|---|---|
| **v1.x — Corpus** | v1.0 → v1.43 | The 5 base entity types (vendors / hardware / models / cases / playbooks) reach saturation. Public site goes live. JSON APIs ship. |
| **v2.x — Computable knowledge + agent toolkit foundations** | v2.0 → v2.25 | Tier 1 calculator. 5-layer hw-sw gap framework. ISA primitives, DSL examples, kernel libraries, profiling tools. First agent-deploy CLI (skeleton mode). MCP server. Per-deploy artifacts (Dockerfile, K8s, runbook, SBOM). |
| **v3.x — Productized agent harness** | v3.0 → v3.23 | The CLI stops emitting skeletons and starts emitting real generated kernels with V1/V2/V3 verification. Plugin install (`agent:install`), self-diagnosis (`agent:doctor`), continuous-mode (`agent:watch`), auto-PR (`agent:auto-pr`), 4-vendor profiler ingestion (NCU/rocprof/msprof/cnperf), zh i18n. |

The current state is **a working productized agent CLI with a real corpus behind it** — see [`README.md`](../README.md) "What honestly works today" + "Known limits" sections.

## State of the data (v3.23, 2026-05-04)

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
| **Total entities** | **419** | from 297 at v2.17 |

## State of the harness (v3.23)

| Layer | Surface | Status |
|---|---|---|
| **Layer R** (Smart context retrieval) | `fetch-bundle.ts` + `resolveBundleId()` (fuzzy: HF id / partial slug / canonical) + `listBundles()` + 2176+ pre-built (model × hardware) JSON bundles | ✅ stable |
| **Layer P** (Planning) | `index.ts` Stage 1-4 (HF config fetch, classify, feasibility, synthesize plan) | ✅ stable |
| **Layer G** (Generation) | `llm-orchestrator.ts` 4-mode (real / cache / test / skeleton) | ⚠️ requires `ANTHROPIC_API_KEY` for real mode |
| **Layer V** (Verification) | V1 build structural · V2 correctness reference compare · V3 perf gate (auto-detect 6 vendors, 4/6 parsers wired) | ⚠️ no kernel-runner yet |
| **Layer F** (Feedback) | per-deploy `agent-learning.yaml` + `auto-pr-cli.ts` cluster aggregation + `watch.ts` continuous re-deploy | ✅ stable |
| **CLI** | 11 commands · `pnpm agent:{deploy,deploy:productized,list-bundles,auto-pr,install,doctor,status,watch,...}` | ✅ stable |
| **Plugins** | Codex Node binary (`evokernel-deploy`) · CC slash commands (`/agent-deploy` + `/zh:agent-deploy`) · MCP server (12 tools) | ✅ stable |
| **Tests** | 172 scripts + 49 web = 221 total · all green | ✅ |

---

## v3.24+ priorities (the "real productized agent" work)

These are the gaps user feedback (May 2026) explicitly called out as
"too simple to be a real product". Full design at
[`docs/superpowers/specs/2026-05-04-real-productized-agent.md`](superpowers/specs/2026-05-04-real-productized-agent.md).

### Priority 1: Host-LLM execution (no Anthropic API key)

**The gap**: today productized real-mode requires `ANTHROPIC_API_KEY`. When the harness runs **inside Claude Code or Codex**, those tools have their own LLM — requiring an external key is friction that breaks one-click integration.

**The plan** (v3.24 → v3.25):
- Add a `--host-llm` mode to `llm-orchestrator.ts` that **emits a structured prompt + tool-spec instead of calling an API**. The host (CC or Codex) consumes the prompt with its own model and posts back the generated kernel.
- Claude Code: extend `/agent-deploy` slash command to detect host-LLM mode and route generation through the in-session Claude.
- Codex: extend `evokernel-deploy` binary to detect Codex execution context and emit a tool plan that Codex's GPT-5 can execute.
- Standalone (CLI invoked outside CC/Codex): keep current API-key path as fallback.

### Priority 2: Unknown model auto-import (HuggingFace + technique entities)

**The gap**: today if your model isn't in `data/models/`, the CLI errors with "BundleNotFoundError". Auto-import from HF config exists but is partial. Plus there's no concept of a *technique* entity (e.g. "SageAttention" is an attention-optimization library, not a model — it's a *technique to apply* to a model running on a hardware target).

**The plan** (v3.25):
- Extend `fetch-bundle.ts` to **synthesize a temporary in-memory bundle** for unknown models by fetching HF config + decomposing operator graph.
- Add a new entity type `data/techniques/` with schema covering: name + reference impl URL + applicable to (model archetypes, ops, hardware) + porting notes.
- `agent:deploy --technique sageattention --model cogvideox-1.5-5b --hardware ascend-910b` becomes a first-class invocation.

### Priority 3: Remote-target SSH executor

**The gap**: the V3 perf gate consumes pre-collected profiler CSVs via env vars. There's no integration that **SSHs to a target machine, compiles the generated kernel, runs it, profiles it, and pulls back metrics**.

**The plan** (v3.26):
- New `scripts/agent-deploy/remote-target.ts`: SSH config (`~/.config/evokernel/targets.yaml`) + toolchain detection (`ascend-toolkit`, `cuda`, `rocm`, etc) + remote build + remote run + remote profile + scp back artifacts.
- `agent:deploy --remote ascend-910b-<host-id> ...` SSHs in, compiles via the right toolchain, runs the verifier, runs the profiler, and returns measured tok/s.
- The user's concrete scenario: `agent:deploy --technique sageattention --model cogvideox-1.5-5b --hardware ascend-910b --remote root@<ASCEND_910B_HOST> --use-host-llm` should work end-to-end.

### Priority 4: Per-op-class perf threshold (carried from v3.23)

The uniform `perf_score >= 0.5` gate is wrong for memory-bound ops (triangle-mult won't legitimately hit 70% SM throughput). Per-op-class threshold: `matmul: 0.6`, `attention: 0.4`, `reduction: 0.5`.

### Priority 5: Remaining 2/6 vendor profiler parsers

`suprof` (Moore Threads MUSA) + `instruments` (Apple). Same pattern as v3.22 NCU + v3.23 rocprof/msprof/cnperf.

### Priority 6: UI cleanup

See [`docs/CLEANUP-TODO.md`](CLEANUP-TODO.md) for the visual/UX queue:
- Vendor sub-page generational timelines (Cambricon's 4-gen line in one component, etc.)
- ROADMAP.md prune (this doc)
- Pre-v3.x model family audit

---

## How to think about which version to use

| Use case | Version |
|---|---|
| Citation in a paper or industry report | Latest stable (v3.23.0) |
| Production deploy planning (no codegen) | Any v3.x — corpus is stable since v3.0 |
| Real-code generation (productized) | v3.17+ (when the harness was wired) |
| 4-vendor profiler ingestion | v3.23+ |
| Continuous re-deploy (`agent:watch`) | v3.22+ |
| Codex CLI binary (`evokernel-deploy`) | v3.18+ (install via `agent:install`) |
| Claude Code zh slash command | v3.23+ |

---

## What is deliberately deferred (out of scope)

These are not gaps — they're explicit non-goals to keep scope manageable:

- **Closed-source model proxying** (e.g. running GPT-4 inference) — corpus is open-source models only
- **Cloud provider CLI integration** (AWS/GCP/Azure CLIs) — out of scope; harness produces plain Dockerfile + K8s manifests for any orchestrator
- **GUI frontend for the harness** — CLI + slash command + MCP is enough surface
- **Real-time monitoring dashboards** — Prometheus rules are emitted; visualization is downstream

If you'd like one of these added, open an issue with the specific use case + concrete user scenario (similar to how the SageAttention/CogVideoX/910B scenario drove v3.24+ priorities).

---

## Cadence

The project ships in tight micro-releases (~1-2 hours each, themed). v3.x has shipped at roughly 1 release/day during active phases. Pages auto-deploy on tag push. Each release adds ~10-20 tests and a new product surface (CLI command, MCP tool, parser, UI section) — see CHANGELOG.md for the full history.
