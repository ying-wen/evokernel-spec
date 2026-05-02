# Productized Agent — Architecture Spec (v3.3+)

> **Status**: Design spec. v3.3 ships the foundation; v3.4-v3.7 implement.
> **Author**: 2026-05-03
> **Drives**: v3.3 → v3.10 trajectory

## What's wrong with v2.x

v2.x's agent (`scripts/agent-deploy/`) is **a planning + skeleton emitter** with manual feedback. The user identified the gaps:

> 不仅仅是现在只是一个 MCP 的查询服务...能根据给定模型和硬件需求，智能化检索相应需要的知识...这个 agent 能完成真实生产算子及部署代码，并保证验证测试通过，会持续根据部署情况持续自动优化闭环，还能把这过程所有经验和知识，反馈回本项目知识库。

Translation:
1. **Not just MCP query** — needs intelligent context retrieval
2. **Not just kernel skeletons** — needs real production code
3. **Verify tests pass** — not just emit and hope
4. **Continuous self-optimization** — closed loop based on deploy results
5. **Auto-feedback to corpus** — not manual YAML editing
6. **Codex + Claude Code productized plugin/skill** — embeddable in agent IDEs

## Architecture: 5 layers, evolved

The v2.x agent was monolithic (`scripts/agent-deploy/index.ts` = planner + codegen + artifact emitter all in one). v3.x splits it into 5 testable layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer R — Retrieval                                                    │
│   Input:  (model_id, hardware_id, workload, constraints)               │
│   Output: knowledge bundle — model arch + hw arch + applicable ops +   │
│           fused-kernel options + DSL examples + reference impls +      │
│           prior agent-learnings + cross-vendor primitive mappings      │
│   API:    /api/agent-context.json (NEW v3.3) ← shipped here            │
├────────────────────────────────────────────────────────────────────────┤
│ Layer P — Planning (existing v2.9)                                     │
│   Input:  knowledge bundle from Layer R                                │
│   Output: deployment plan (engine, quant, parallelism, kernel-gaps)    │
│   Code:   scripts/agent-deploy/index.ts Stage 1-4 (refactor target)    │
├────────────────────────────────────────────────────────────────────────┤
│ Layer G — Generation (evolves v2.16-v2.18)                             │
│   Input:  plan + Layer R bundle (DSL examples, reference impls, etc.)  │
│   Output: REAL working code — not skeletons; passes compilation        │
│   Code:   scripts/agent-deploy/kernel-codegen.ts (v3.4 rewrite target) │
│   Approach: LLM-as-orchestrator with corpus as RAG context.            │
│             Calls into Anthropic / OpenAI API with the bundle, prompt  │
│             includes formal_semantics + edge_cases + reference_impl    │
│             + DSL example as exemplars. Output is reviewed by Layer V. │
├────────────────────────────────────────────────────────────────────────┤
│ Layer V — Verification (NEW v3.5)                                      │
│   Input:  generated code from Layer G                                  │
│   Output: pass/fail + diagnostic + perf delta                          │
│   Stages:                                                              │
│     V1 — Syntax + build (nvcc/hipcc/cce/bisheng) — quick gate          │
│     V2 — Correctness — run vs PyTorch reference_impl on small tensor   │
│           (FP32 reference; allow tolerance per formal_semantics rule)  │
│     V3 — Perf — profile (NCU/rocprof/msprof/cnperf) + compare to       │
│           predicted throughput; flag regressions                       │
│   Code:   scripts/agent-deploy/verify/{build,correctness,perf}.ts      │
├────────────────────────────────────────────────────────────────────────┤
│ Layer F — Feedback (evolves v2.20-v2.24)                               │
│   Input:  V1/V2/V3 results + Layer P plan + Layer G code               │
│   Output: AUTOMATIC writeback to data/agent-learnings/ + corpus PRs    │
│           on observable gaps                                           │
│   Code:   scripts/agent-deploy/feedback.ts (v3.6 — beyond manual stub) │
│   Loop:   if V fails → Layer G retry with V's diagnostic in prompt;    │
│           if perf cliff → emit perf-cliff observation; if successful → │
│           emit success-pattern observation; PR-template for novel     │
│           DSL example or fused-kernel discovery                       │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────────────┐
              │ Plugin surfaces (v3.7)                          │
              ├─────────────────────────────────────────────────┤
              │ plugins/claude-code-productized/                │
              │   - SKILL.md describing the 5-layer flow        │
              │   - tools/ — wraps each layer as a tool the     │
              │     Claude Code agent can invoke                │
              │   - hooks/ — auto-trigger on relevant prompts   │
              │                                                 │
              │ plugins/codex-productized/                      │
              │   - prompt presets per layer                    │
              │   - integration with Codex's agent loop         │
              │                                                 │
              │ plugins/mcp-server/ (extend existing)           │
              │   - new tool: agent_full_pipeline               │
              │   - wraps R → P → G → V → F sequence            │
              └─────────────────────────────────────────────────┘
```

## Why split into 5 testable layers

Each layer is **independently testable**. v3.3+ adds a unit-test job per layer:

| Layer | Test (v3.3+) | What it catches |
|---|---|---|
| R | `agent-context.json` returns correct bundle for known (model, hw) | Schema drift, missing cross-references |
| P | Plan synthesis produces same engine/quant for fixed input | Heuristic regressions |
| G | Generated code compiles for canonical (op, hw) pairs | Codegen regressions, syntax bugs |
| V | Reference correctness check matches PyTorch (small input) | Numerical correctness |
| F | Feedback writes valid YAML matching schema | Schema drift in writeback |

This is the v2.24 dispatch test pattern (`kernel-codegen-dispatch.test.ts`) generalized — **CI catches regressions in any layer before they break a real deploy.**

## v3.3 → v3.10 trajectory

| Sprint | Theme | Concrete deliverables |
|---|---|---|
| **v3.3** (this) | Layer R foundation + 4 more hardware | spec doc (this file) + `/api/agent-context.json` endpoint + 4 hardware (RTX 5070, M5 Pro, Jetson Thor, RK3588 NPU) |
| v3.4 | Layer G real-code emitter | refactor `kernel-codegen.ts` from skeleton emitter to LLM-orchestrator with corpus as RAG context. Use Anthropic Claude API + Layer R bundle as system prompt + reference_impl as exemplar. |
| v3.5 | Layer V verification harness | `scripts/agent-deploy/verify/{build,correctness,perf}.ts` — V1 (build) + V2 (correctness vs PyTorch) + V3 (perf profile). Verify as gate before artifact emission. |
| v3.6 | Layer F automated feedback | refactor `agent-learning.yaml` emission from manual stub to auto-filled-from-V-results entry. Auto-PR template for novel observations. |
| v3.7 | Productized Claude Code + Codex plugins | `plugins/claude-code-productized/` with SKILL.md + tool wrappers; `plugins/codex-productized/` with prompt presets; both wrap the 5-layer pipeline. |
| v3.8 | Continuous optimization loop | Layer F observations drive Layer P heuristic updates; closed loop. v3.7 manual; v3.8 automatic. |
| v3.9 | Hardware breadth completion | Remaining audit gaps (RTX 5070 Ti, RX 9060 XT, more edge NPU, 国产 edge: BM1684X, Horizon Journey 5) |
| v3.10 | Model breadth — video/image/speech/bio/molecule | First entries per category; corpus expansion beyond LLM/VLM |

When v3.10 ships, the spec/plan/dev/test/feedback loop closes for **any model class on any hardware tier**, not just LLM-on-datacenter.

## What v3.3 actually ships

Three deliverables (this commit):

### 1. This spec doc

Captures the v3.3-v3.10 architecture so future Ralph loop iterations have a north star. Without this, the agent productization risks scope creep.

### 2. `/api/agent-context.json` — Layer R foundation

Given `(model_id, hardware_id)` query params, returns:

```jsonc
{
  "model": { /* full ModelSchema entry */ },
  "model_graphs": [ /* matching ModelExecutionGraph entries (decode + prefill) */ ],
  "hardware": { /* full HardwareSchema entry */ },
  "vendor": { /* full VendorSchema for this hw */ },
  "applicable_ops": [
    /* OperatorSchema entries — every op the model uses, with formal_semantics
       included so the LLM-orchestrator can reason about edge cases */
  ],
  "applicable_fused_kernels": [
    /* FusedKernelSchema entries that apply to this (model, hw) combo,
       with formal_semantics included */
  ],
  "dsl_examples": [
    /* DslExampleSchema entries matching this hw's arch_family — the
       structural reference patterns for the LLM to emit code in */
  ],
  "isa_primitives": [
    /* IsaPrimitiveSchema entries for this arch + cross_vendor_equivalents
       — so LLM knows what instructions to emit + how to port from CUDA */
  ],
  "kernel_libraries": [
    /* KernelLibrarySchema for this arch — vendor BLAS/DNN packages
       agent should prefer over hand-rolled kernels */
  ],
  "engine_compile_workflows": [
    /* applicable engine build steps */
  ],
  "prior_learnings": [
    /* AgentLearning entries from prior runs on similar (model, hw) pairs
       — so the LLM-orchestrator starts smarter */
  ],
  "coverage_matrix": {
    /* which (op, arch) cells are covered for this hw — drives kernel-gap
       detection without requiring agent-deploy CLI */
  }
}
```

This is **the knowledge bundle the LLM-orchestrator needs**. With it, Layer G can call Anthropic / OpenAI API with the full RAG context and get real code back. Without it, the LLM has to query 8-10 endpoints separately and lose context coherence.

### 3. 4 more hardware (continuing v3.0-v3.2 audit gap closure)

- **NVIDIA RTX 5070** — Blackwell consumer entry tier ($549)
- **Apple M5 Pro** — completing M5 family
- **NVIDIA Jetson Thor** — opens the edge NPU class (long-overdue)
- **Rockchip RK3588 NPU** — 国产 edge mass-market (Orange Pi, Rock 5, etc.)

## Risks + mitigations

**Risk 1**: Layer G real-code generation requires LLM API access at deploy time. Hard requirement; not free.
- **Mitigation**: design the API call as cacheable per `(model, hw)` tuple. Once a (model, hw) is validated, cache the generated code in `data/generated-kernels/` with provenance. Subsequent runs of the same pair use cache.

**Risk 2**: Layer V verification harness needs target hardware to run V2 (correctness) + V3 (perf). Most contributors won't have an Ascend or MTT card.
- **Mitigation**: V1 (build) runs in CI universally (cross-compile via nvcc/hipcc; cce-toolchain in container). V2 (correctness) runs vs PyTorch CPU reference (always available). V3 (perf) gated on hardware availability — degrades to "skipped" in CI without target hw, runs on contributor's actual hw before merge.

**Risk 3**: Layer F automatic feedback could spam the corpus with low-value learnings.
- **Mitigation**: triage_status defaults to `open`; `merged` requires human review. Auto-PRs go through normal review. Filter at observation level: only emit observations with `evidence` field populated.

**Risk 4**: Plugin surface for Codex + Claude Code requires those tools' plugin APIs to be stable.
- **Mitigation**: Claude Code skill API is documented; v3.7 tracks SDK version. Codex plugin format may iterate; ship a markdown-prompt-preset version first, upgrade to typed plugin when API matures.

## Success criteria for v3.10

When v3.10 ships, this scenario must work end-to-end with no human intervention:

> User runs `claude-code --skill evokernel-deploy "deploy DeepSeek V4 Pro on Cambricon MLU590"`. Claude Code:
> 1. Calls `agent_context(model=DeepSeek-V4-Pro, hardware=mlu590)` — gets full knowledge bundle.
> 2. Calls `agent_plan(...)` — gets deployment plan (MindIE engine, FP8, TP=4).
> 3. Calls `agent_generate(...)` — LLM-orchestrator generates 3 missing kernels (fused-rope-qkv-on-Cambricon, fused-moe-dispatch-on-Cambricon, paged-attention-decode-on-Cambricon) using the bundle's DSL examples + formal_semantics as exemplars. Real BANG-C code, not skeletons.
> 4. Calls `agent_verify(...)` — V1 builds (cncc passes); V2 runs vs PyTorch on small tensor (within 1e-3 tolerance); V3 profiles (cnperf shows expected throughput).
> 5. Calls `agent_deploy(...)` — emits Dockerfile + K8s + runbook + the 3 generated kernels. Bundle is reproducible.
> 6. Calls `agent_feedback(...)` — auto-writes 3 agent-learning entries (one success-pattern per generated kernel) + opens 1 PR (novel BANG-C DSL example for fused-rope-qkv-on-Cambricon).
> 7. User reviews + merges PR. Next deploy of DSV4 Pro on Cambricon starts with these kernels in cache + corpus.

This is the v3.x major's promise concretized. v3.3 (this release) ships the **foundation**.
