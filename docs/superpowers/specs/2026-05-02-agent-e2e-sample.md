# Agent End-to-End Sample — Any HuggingFace Model → Any Hardware

> **Status**: design + implementation · 2026-05-02 (v2.9)
> **Goal**: working CLI sample showing the corpus is sufficient for an agent
> to deploy an arbitrary HuggingFace model to arbitrary hardware end-to-end.
>
> **User directive (verbatim)**:
> *"实现一个从任意huggingface上模型到任意硬件的agent端到端能work的样例"*

---

## Systems thinking — the agent's full pipeline

For "any model × any hardware" deployment, an agent must traverse this pipeline:

```
                         INPUT
              ┌────────────────────────┐
              │ huggingface_model_id   │   e.g., "meta-llama/Llama-4-Scout-17B-16E"
              │ target_hardware_id     │   e.g., "h100-sxm5"
              │ workload (chat/RAG/..) │
              │ SLA (TTFT/TPS/$/SLO)   │
              └────────────────────────┘
                         ↓
           ┌──────── 1. MODEL UNDERSTANDING ────────┐
           │ • Fetch HF config.json                 │  ← from HF API or cached
           │ • Map to internal architecture        │  ← deduce family/MoE/MLA/etc.
           │ • Decompose into op call graph        │  ← reuse v2.8 model-graph or derive
           │ • Estimate per-token FLOPs/bytes      │  ← compose op formulas + dims
           └────────────────────────────────────────┘
                         ↓
           ┌──────── 2. HARDWARE UNDERSTANDING ─────┐
           │ • Compute / memory / bandwidth specs  │  ← /api/hardware.json
           │ • Power / thermal / cooling           │  ← v2.1 power-thermal axis
           │ • ISA primitives available            │  ← v2.6 tensor_isa field
           │ • Software stack (engines / libs)     │  ← /api/engines.json + kernel-libs
           └────────────────────────────────────────┘
                         ↓
           ┌──────── 3. FEASIBILITY CHECK ──────────┐
           │ • Will weights fit in HBM?            │  ← by quantization plan
           │ • Will KV cache fit at target ctx?    │  ← from execution graph
           │ • Are required ops covered?           │  ← /api/coverage-matrix.json
           │ • Are quant formats supported?        │  ← engine + lib intersection
           └────────────────────────────────────────┘
                         ↓
           ┌──────── 4. PLAN ─────────────────────┐
           │ • Engine choice (vLLM/SGLang/TRT/..) │  ← /engines/compare/ matrix
           │ • Quant choice (FP16/8/4/INT4)       │  ← /learn/quantization-decision-tree
           │ • Parallelism (TP/PP/EP)             │  ← /learn/parallelism-cheatsheet
           │ • Card count                         │  ← from feasibility check
           │ • Expected throughput / cost         │  ← Roofline + corpus cases
           └────────────────────────────────────────┘
                         ↓
           ┌──────── 5. CODEGEN ──────────────────┐
           │ • Engine launch command + flags     │  ← derived from plan
           │ • Container manifest                │  ← templated per engine
           │ • Kernel codegen (if op missing)    │  ← v2.6 cross_vendor_equivalents
           └────────────────────────────────────────┘
                         ↓
           ┌──────── 6. VALIDATION ───────────────┐
           │ • Eval suite per workload           │  ← /learn/migrations/ canary
           │ • Performance regression target     │  ← from baseline cases
           │ • Quality regression target         │  ← formal_semantics edge cases
           └────────────────────────────────────────┘
                         ↓
                       OUTPUT
              ┌────────────────────────┐
              │ deployment_plan.json   │
              │ launch_command.sh      │
              │ docker-compose.yaml    │
              │ kernel_gaps.md (if any)│
              │ verification_plan.md   │
              └────────────────────────┘
```

---

## Cross-model / cross-hardware experience reuse — the pattern layer

The user's question: "相关经验能跨模型及硬件复用" (how can experience be reused across models + hardware?). Three abstractions enable this:

### Abstraction 1 — Model archetype taxonomy

Existing schema (`PlaybookSchema.model_archetype`) classifies any specific model into:
- `dense-llm-{small,medium,large}` (no MoE, single FFN per layer)
- `moe-llm-{medium,large}` (sparse MoE routing)
- `reasoning-llm` (long CoT, large context)
- `multi-modal` (vision + text)
- `long-context` (128K+ context)
- `diffusion` (flow-matching / iterative denoising)
- `ssm-mamba` (selective-scan based)
- `speculative-target` (used as draft for spec decoding)

**Reuse mechanic**: an agent first classifies the unknown model into an archetype (using config.json fields: `architectures`, `hidden_size`, `num_attention_heads`, `num_kv_heads`, `num_local_experts`, `model_type`). Once classified, all playbooks for that archetype apply.

**Example reuse**:
- Llama 4 Scout 17B-16E → `moe-llm-medium` archetype
- DeepSeek V4 Pro 671B → `moe-llm-large` archetype
- Both inherit MoE-specific patterns: `expert-permute`, `grouped-matmul`, `disaggregated-prefill-decode` → same engine config + same kernels needed

### Abstraction 2 — Hardware class taxonomy

Existing schema (`PlaybookSchema.hardware_class`) classifies any specific card into:
- `hopper-single-node` / `hopper-cluster`
- `blackwell-cluster` / `blackwell-superpod`
- `cdna3-single-node` / `cdna3-cluster`
- `ascend-cluster` / `cambricon-cluster` / `gaudi-cluster`
- `tpu-pod` / `trainium-instance`
- `edge-single-card` / `wafer-scale`

**Reuse mechanic**: an agent looks up playbooks indexed by (model_archetype × hardware_class) — a 8 × 12 = 96-cell matrix. Each cell pre-encodes a working recipe.

### Abstraction 3 — ISA primitive equivalence (v2.6)

When the agent needs to generate kernel code for a missing (op × hardware) pair:
1. Find op's `engine_implementations` on a covered arch (e.g., Hopper)
2. Look up `isa_primitives` used in that arch
3. Use `cross_vendor_equivalents` to map to target arch's primitive
4. Use `dsl-examples` for the target arch's programming model
5. Use `formal_semantics` to validate output equivalence
6. Use `profiling-tools` to verify performance

**This entire flow already exists in the corpus.** The agent sample below operationalizes it.

---

## The CLI sample design

Implementation goal: **a single `pnpm` script** that takes a HuggingFace model id + hardware id, queries the corpus's JSON APIs, and outputs a complete deployment plan.

### Inputs
```
node scripts/agent-deploy.ts \
  --model meta-llama/Llama-4-Scout-17B-16E \
  --hardware h100-sxm5 \
  --workload chat \
  --target-cost 0.50 \
  --target-ttft 300
```

### Stages

**Stage 1 — fetch & classify** (HF API → archetype)
- Pulls `config.json` from HF (or accepts a local path for offline)
- Maps `architectures`, `num_local_experts`, etc. → `model_archetype`
- Computes total params / active params / KV cache size

**Stage 2 — corpus query**
- Reads (live or cached) JSON APIs:
  - `/api/hardware.json` for hardware specs
  - `/api/playbooks.json` filtered by (archetype × hardware_class)
  - `/api/coverage-matrix.json` filtered by ops needed × hardware
  - `/api/engines.json` for engine capability matrix
  - `/api/solve.json` for similar measured configurations

**Stage 3 — feasibility check**
- Memory budget = HBM_capacity × 0.9
- Required = weights(quant) + KV_cache(ctx, batch, kv_heads, head_dim) + activations + overhead
- If required > budget → recommend higher TP or quant downcast → re-check

**Stage 4 — plan synthesis**
- Pick engine from playbook recommendation, validated against `/engines/compare/` capability
- Pick quant by HBM headroom + ops × precision_support
- Pick parallelism by `card_count = ceil(weights / (HBM × util))`
- Cost estimate from `/api/solve.json` similar configs

**Stage 5 — codegen**
- Engine launch command — templated from `data/cases/<id>/reproduction.startup_command` patterns
- Detects kernel gaps from coverage-matrix; for each missing cell, emits a "TODO: codegen kernel from <isa_primitive_equivalent>" note

**Stage 6 — verification plan**
- Pulls per-workload eval set from `/learn/migrations/quant-downcast/`
- Pulls failure-mode signals from `/learn/troubleshooting/`
- Generates 5-stage canary plan (shadow → 1% → 10% → 50% → 100%)

### Outputs

```
output/
├── deployment_plan.json      # Full structured plan
├── launch.sh                 # Engine startup script
├── docker-compose.yaml       # Container orchestration
├── kernel_gaps.md            # If any ops missing native kernels
└── verification_plan.md      # Eval suite + canary stages
```

---

## What this proves

Running this sample successfully on (say) Llama 4 Scout → MI300X demonstrates:

1. **The corpus is sufficient** — agent gets all needed inputs from JSON APIs alone
2. **Cross-model reuse works** — archetype classification enables one playbook → many models
3. **Cross-hardware reuse works** — hardware_class taxonomy + ISA equivalents enable porting
4. **The 5-layer hw-sw model is operational** — agent traverses Layer A (primitives) ↔ B (DSL) ↔ C (libs) ↔ D (semantics) ↔ E (coverage matrix) per gap

For an agent vendor (Claude / Cursor / GitHub Copilot / self-built), this is the **integration template** — wire your reasoning loop into these JSON APIs and you have an "any model × any hardware" deployment agent.

---

## Where it stops short

This sample is intentionally pragmatic, not industrial:

1. **No actual kernel codegen yet** — emits `kernel_gaps.md` with "agent should generate a kernel using primitive X mapping" but doesn't produce the C++/CCE-C code itself. v3.0 might extend.

2. **No actual deployment execution** — outputs a plan + launch script; doesn't ssh into a cluster and run it. This is intentional separation of concerns: plan generation is the corpus's job, execution is the user's CI/CD pipeline.

3. **No HF private repos / auth** — public models only. Easy extension.

4. **Heuristic feasibility check** — uses linear-algebra-friendly approximations (MoE active path = total_params / num_experts × top_k). Doesn't account for activation memory perfectly.

5. **Engine-overhead constants are estimates** — TP factor 0.95, PP bubble 0.05 are reasonable defaults but not measured.

These are all upgrade paths, not blockers. The sample is intentionally a thin agent that can be replaced piece by piece with smarter logic.

---

## Roadmap implications

The sample being viable proves: **the v2.x line achieved its agent-readiness goal**.

Post-v2.9 work shifts focus:
- More content fill (community PRs, more model graphs, more reference impls)
- MCP server formalization (wrap the sample as MCP tools)
- Cross-vendor primitive table expansion (more ISA equivalence rows)
- Integration with real LLM agents (Claude / Cursor) via MCP

The schema-extension recipe (applied 8+ times) has saturated the structural axes. Future iterations are about **depth of fill** and **integration**, not new schema axes.
