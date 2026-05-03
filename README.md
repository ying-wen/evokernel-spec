# EvoKernel Spec

> **Open knowledge base + productized agent harness for "any model → any hardware" deployment + optimization.**
>
> Two parts: (1) a structured corpus of AI inference hardware × models × ops × DSL examples × deployment cases; (2) a productized agent CLI that takes (model, hardware) → real generated kernels + verification + corpus feedback.

**🌐 Live: [yingwen.io/evokernel-spec](https://yingwen.io/evokernel-spec/)** · [📖 Contribute](https://yingwen.io/evokernel-spec/contribute/) · [📊 TCO Pricing](https://yingwen.io/evokernel-spec/pricing/) · [🤖 Agent toolkit](https://yingwen.io/evokernel-spec/agents/) · [🔌 JSON API](https://yingwen.io/evokernel-spec/api/)

[![Live](https://img.shields.io/badge/live-yingwen.io%2Fevokernel--spec-success)](https://yingwen.io/evokernel-spec/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Data: CC-BY-SA 4.0](https://img.shields.io/badge/Data-CC--BY--SA_4.0-green.svg)](DATA_LICENSE)
[![Tests](https://img.shields.io/badge/tests-41_schemas_%2B_287_scripts_%2B_51_web-success)](#)
[![Pages](https://img.shields.io/badge/pages-613-blue)](#)
[![Plugins](https://img.shields.io/badge/plugins-MCP_%2B_Codex_%2B_ClaudeCode_%2B_Cursor-orange)](#)
[![Pages Deploy](https://github.com/ying-wen/evokernel-spec/actions/workflows/pages.yml/badge.svg)](https://github.com/ying-wen/evokernel-spec/actions/workflows/pages.yml)
[![Release](https://img.shields.io/badge/release-v3.32.0-blue)](https://github.com/ying-wen/evokernel-spec/releases/latest)

## TL;DR

```bash
git clone https://github.com/ying-wen/evokernel-spec.git
cd evokernel-spec && pnpm install && pnpm --filter @evokernel/web build

pnpm agent:install -- --target both     # one-time; symlinks Codex bin + CC slash command
pnpm agent:doctor                        # 12-check setup health
pnpm agent:list-bundles -- --hardware h100-sxm5

# Deploy (skeleton mode — no API key required)
pnpm agent:deploy --model llama-3.3-70b --hardware h100-sxm5

# Productized real-code mode inside Codex/Claude Code uses the host LLM.
pnpm agent:deploy:productized \
  --model meta-llama/Llama-3.3-70B-Instruct \
  --hardware h100-sxm5 \
  --use-host-llm --profile

# North-star technique port: unknown HF model can synthesize an in-memory bundle.
pnpm agent:deploy:productized \
  --technique sageattention \
  --model zai-org/CogVideoX1.5-5B \
  --hardware ascend-910b \
  --use-host-llm --allow-synthesize

pnpm agent:status                        # what did I deploy lately?
pnpm agent:auto-pr -- --output ./pr.md   # F-loop closure (cluster learnings → PR drafts)
pnpm agent:watch -- --pairs <pairs>      # continuous re-deploy on corpus change
```

Full guide: [`docs/HARNESS.md`](docs/HARNESS.md). Cleanup queue: [`docs/CLEANUP-TODO.md`](docs/CLEANUP-TODO.md).

## Project state (v3.32, 2026-05-04)

| Layer | Capability | Status |
|---|---|---|
| **Data corpus** | 424 entities across 24 entity types · 64 hardware (24 国产) · 34 models · 38 ops · 27 fused-kernels · 15 DSL examples · 16 ISA primitives · 4 techniques (SageAttention + Flash/Paged/Ring Attention) · 7 engines | ✅ stable |
| **Site** | 613 SSG pages · 25 JSON API route templates · WCAG 2 AA target · zh canonical + route-aware partial en mirror | ⚠️ link-check gate still needed |
| **Agent CLI** | 11 commands (`deploy`, `:productized`, `list-bundles`, `auto-pr`, `install`, `doctor`, `status`, `watch`, ...) · 2 plugin executables (Codex bin + CC slash command) | ✅ stable |
| **MCP server** | 12 tools (9 query + 3 productized: `agent_resolve_bundle` / `agent_list_bundles` / `agent_auto_pr`) | ✅ stable |
| **V3 perf gate** | 4/6 vendor profiler parsers (NCU + rocprof + msprof + cnperf via env hook); auto-detect for all 6 vendors | ⚠️ suprof/instruments pending |
| **Closed-loop F→corpus** | per-deploy `agent-learning.yaml` + cluster aggregation via `agent:auto-pr` + continuous re-deploy via `agent:watch` | ✅ stable |
| **Real production code** | LLM-orchestrator generates code citing corpus refs; host-LLM mode works in Codex/Claude Code; unknown HF models can synthesize temporary bundles | ⚠️ real-hardware quality still iteration-dependent |
| **Tests** | 41 schemas + 287 scripts + 51 web = 379 passing, 1 skipped network gate | ✅ |

## What honestly works today (v3.32)

- ✅ **One-command deploy** for any (model, hardware) pair already in corpus → produces real kernels (productized mode) + planning artifacts (Dockerfile / K8s manifests / runbook / SBOM / agent-learning YAML)
- ✅ **Discoverability**: `agent:list-bundles` enumerates all 2176+ pre-built (model × hardware) bundles
- ✅ **Self-diagnosis**: `agent:doctor` reports 12 setup checks with actionable fixes
- ✅ **Host-LLM mode**: inside Codex / Claude Code, productized generation can use the already-running host model instead of requiring a standalone `ANTHROPIC_API_KEY`
- ✅ **Unknown HF model path**: `--allow-synthesize` / `--technique` routes missing corpus models through `synthesizeTemporaryBundle`
- ✅ **Technique catalog**: `data/techniques/sageattention.yaml`, `/techniques/`, `/api/techniques.json`, and `--technique sageattention`
- ✅ **Remote-target execution surface**: `--remote` dry-run plans and `--execute` SSH build/run/profile path exist, with real credentials kept in local target config
- ✅ **Continuous re-deploy** on corpus changes (`agent:watch` with bounded concurrency)
- ✅ **Closed-loop knowledge feedback** via `agent:auto-pr` clustering
- ✅ **4-vendor profiler ingestion** (NVIDIA NCU / AMD rocprof / Huawei msprof / Cambricon cnperf) into a unified `ProfilerParseResult` shape
- ✅ **Codex CLI integration**: real `evokernel-deploy` Node binary symlinked into `~/.local/bin/`
- ✅ **Claude Code slash commands**: `/agent-deploy` (English) + `/zh:agent-deploy` (中文)
- ✅ **MCP server** with 12 tools for any LLM IDE that speaks MCP

## Known limits (the honest v3.33+ queue)

The v3.24-v3.30 arc closed the original productization gaps: host-LLM mode, technique entities, unknown-model synthesis, remote-target execution, and a real multi-entry technique catalog now exist. v3.31 aligned the docs/web/API surface with that reality, and v3.32 adds an API parity gate plus strict data-audit warning gate. The remaining work is quality depth:

- ❌ **Synthesized bundles are in-memory only** — a successful unknown-model run should persist a reviewed `data/models/<slug>.yaml` / model graph stub instead of re-synthesizing every time.
- ❌ **Cross-arch numerical verify execution is still scaffold-first** — tensor-diff exists, but the full "run reference on native arch + run new impl on target + compare with technique tolerance" loop is the v3.33 priority.
- ❌ **Serving/client-test orchestration is not first-class** — `--serve` should template FastAPI/Triton wrappers and a client sanity test for north-star deployments.
- ❌ **suprof + instruments parsers** — Moore Threads + Apple remain the 2 missing vendor profiler parsers.
- ❌ **Knowledge/web quality debt** — strict data audit is now 0 warnings, but 60 informational coverage gaps remain; many hardware/model pages lack measured cases/model graphs; partial English route mirrors still need a generated link-check gate. See [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) and [`docs/superpowers/specs/2026-05-04-knowledge-web-quality-plan.md`](docs/superpowers/specs/2026-05-04-knowledge-web-quality-plan.md).

## The 5-layer hw-sw gap framework

Every op/kernel in the corpus maps to 5 layers (see [`docs/superpowers/specs/2026-05-02-hw-sw-gap.md`](docs/superpowers/specs/2026-05-02-hw-sw-gap.md)):

| Layer | What | Example |
|---|---|---|
| A — ISA primitive | Silicon instruction | `nvidia-hopper-wgmma`, `huawei-ascend-cube`, `cambricon-mlu-mma`, `amd-cdna3-mfma` |
| B — DSL | How you write a kernel | CUDA C++, Triton, Ascend-C, HIP, BANG-C, MLX |
| C — Kernel library | Vendor-blessed packaged path | cuBLAS, CUTLASS, aclnn, rocBLAS, cuDNN, MIOpen |
| D — Formal semantics | Correctness rules across vendors | Per-op `formal_semantics.numerical_rules` |
| E — Coverage matrix | Which (op × arch) cells are filled | `data/coverage-matrix.ts` |

Every harness recommendation chains through all 5 layers — that's why the corpus has ~420 entities (not because more is better, because each layer needs separate facts to make the chain work).

## Highlights

**📦 Data corpus (v3.32)**:

- **64 加速卡** — including v3.x additions: `mi355x` (CDNA4) · `b300-sxm` · `gb300-nvl72` · `mtt-s5000` · `apple-m5-pro/max` · `ascend-910d` · `ascend-950` · `iluvatar-bi-150` · `cambricon-mlu220/mlu290/mlu590` · `black-sesame/a1000` · `horizon-robotics/journey-5` (24 国产 across edge / consumer / datacenter / auto)
- **34 models** including v3.8/v3.10/v3.14 breadth: AlphaFold 3 · Boltz-1 · ESMFold · GraphCast · MACE-MP-0 · Whisper · Parakeet · F5-TTS · FLUX · SD 3.5 · Mochi 1 · OpenSora 2 · HunyuanVideo · Kimi K2.6 · DeepSeek V4 Pro · Qwen 3.5/3.6 · GLM-5 reasoning
- **15 DSL examples** with **5-platform parity for triangle-mult**: Triton · CUDA C++ · Ascend-C · MLX · HIP rocWMMA — first non-LLM op with full cross-ISA coverage
- **16 ISA primitives** (8 vendors, all with `cross_vendor_equivalents` mapping ratios)
- **27 fused kernels** including `fused-pairformer-block` (Boltz/AlphaFold) · `fused-mace-message-pass` (equivariant GNN MD) · `fused-flow-matching-with-cache` (Mochi/FLUX) · `fused-mel-spec-with-cufft`

**🤖 Productized agent harness (v3.17 → v3.32)**:

- **5-layer architecture**: Layer R (smart context retrieval) → Layer P (planning) → Layer G (LLM-orchestrated real-code generation) → Layer V (V1 build + V2 correctness + V3 perf gates) → Layer F (auto-emit `agent-learning.yaml` + retry on V failure + cluster into PR drafts)
- **11 CLI commands** wrapping the 5 layers (see TL;DR above)
- **2 plugin executables**: Codex `evokernel-deploy` Node binary + Claude Code `/agent-deploy` slash command (zh + en)
- **12 MCP tools**: 9 query + 3 productized (`agent_resolve_bundle` + `agent_list_bundles` + `agent_auto_pr`)
- **Per-deploy manifest** (`evokernel-deploy.json` v0.1) — single canonical record CI consumers read instead of scraping 14 output files

**🌍 国产 + 可信度**:

- **24 国产 cards** spanning edge (MLU220, J5, A1000) · consumer (RK3588) · datacenter (910B/910C/910D, MLU290/370/590, BI-100/V150, DCU-Z100/K100, BR100/104, MTT S4000/S5000) · automotive (Journey 5, A1000)
- **Ascend-C non-LLM DSL** (v3.15): first public Ascend-C reference for OpenFold/Boltz triangle-multiplicative-update — documents 3-5× perf gap vs CUDA H100 honestly (Vector vs Tensor Core gap)
- **数据可信度三档**: 📄 official-claim · ✅ measured · ⚠️ community-estimated

## Repo shape

```
data/                  # YAML corpus (424 entities, 24 entity types)
schemas/               # zod schemas (TypeScript) — single source of truth
apps/web/              # Astro SSG site (613 pages, 25 JSON API route templates)
scripts/agent-deploy/  # 11 CLI commands + 4 vendor profiler parsers + verify gates
plugins/
├── mcp-server/                    # 12 MCP tools
├── claude-code-productized/       # /agent-deploy + /zh:agent-deploy slash commands
├── codex-productized/             # evokernel-deploy Node binary
├── claude-code-skill/             # legacy v2.x skill (kept for compat)
├── codex/                         # legacy Codex prompt presets
└── cursor-rules/                  # Cursor MDC rules
docs/
├── HARNESS.md                     # productized agent end-to-end guide
├── ROADMAP.md                     # v1→v2→v3 arc + v3.33+ plan
├── CLEANUP-TODO.md                # tracking incremental fixes
├── DEVELOPMENT.md                 # contributor workflow
├── DATA-TIERING.md                # how the data is organized
├── KNOWN_ISSUES.md                # current bugs + workarounds
├── superpowers/specs/             # current architecture specs (v3.x)
├── archive/                       # historical docs (v1.x, v2.x)
└── plans/                         # implementation plans
```

## Build commands

```bash
pnpm install                                    # Install
pnpm exec tsx scripts/validate-data.ts          # Schema check (~3s)
pnpm --filter @evokernel/scripts test           # 286 harness tests
pnpm --filter @evokernel/schemas test           # 41 schema tests
pnpm --filter @evokernel/web test               # 51 web tests
pnpm --filter @evokernel/web build              # SSG build (~7s, 613 pages)
pnpm --filter @evokernel/web dev                # Dev server (localhost:4321)

# Agent harness (v3.17+)
pnpm agent:doctor                               # 12-check setup health
pnpm agent:list-bundles -- --hardware h100-sxm5
pnpm agent:deploy --model <id> --hardware <id>
pnpm agent:status
pnpm agent:auto-pr -- --output ./pr.md
pnpm agent:watch -- --pairs <pairs>
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The fastest contribution paths:

1. **Add a hardware/model/op YAML** under `data/` → automatic site page + JSON API + bundle generation
2. **Add a DSL example** under `data/dsl-examples/` → goes into agent's Layer R bundle
3. **Land an `agent-learning.yaml`** in `data/agent-learnings/` → feeds the F-loop, eventually auto-clustered into PR drafts

## License

Code: Apache-2.0 ([LICENSE](LICENSE)). Data: CC-BY-SA 4.0 ([DATA_LICENSE](DATA_LICENSE)).

## Acknowledgements

Built across ~30 release iterations using Anthropic Claude (Sonnet 4.5+) in autonomous Ralph-loop mode. The full release history is in [`CHANGELOG.md`](CHANGELOG.md); the historical design docs are in [`docs/archive/`](docs/archive/README.md).
