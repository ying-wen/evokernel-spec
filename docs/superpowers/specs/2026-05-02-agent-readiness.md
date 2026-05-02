# EvoKernel Spec → Agent-Consumable Knowledge Base

> **Status**: design / gap analysis · 2026-05-02
> **Goal**: define what's missing for an end-to-end **任意模型 × 任意硬件** deployment agent
> to consume this site as its primary knowledge base, plus a prioritized plan for filling gaps.

---

## TL;DR

The current site (v2.3.0) is **excellent for human readers** but only **~40% ready for autonomous agent consumption**. The gap is mainly in three areas:

1. **Executability** — we describe configs / commands / kernel sources in prose; an agent needs them as *runnable artifacts* (parametrized templates, file:line URLs, exact ABI signatures).
2. **Composability** — our roofline formulas / cost levers / precision rules live as text; an agent needs them as *evaluable expressions* it can plug constraints into.
3. **Cross-vendor primitives** — operator/kernel coverage is documented per-vendor; what's missing is the *mapping* between vendor primitives so an agent can port "this CUDA kernel" to "this CANN kernel" or detect when no mapping exists.

A 3-iteration roadmap (v2.4 / v2.5 / v2.6) closes Priority 1 items and brings agent-readiness from ~40% → ~80%.

---

## The agent's pipeline (target capability)

```
USER PROMPT: "Deploy DeepSeek-V3 on Atlas 900 SuperPoD A2,
             target 10K req/min RAG workload, $0.50/M tokens"

  → 1. MODEL UNDERSTANDING       (architecture / ops / FLOPs/byte / precision tolerance)
  → 2. HARDWARE UNDERSTANDING    (compute / memory / op coverage / cooling / power)
  → 3. CONSTRAINT SOLVE          (does (model × hw × workload) satisfy SLA?)
  → 4. PLAN                      (engine + TP/PP/EP + quant + serving features)
  → 5. CODEGEN                   (engine config + kernel C++/CUDA/HIP/CCE if missing)
  → 6. VALIDATE                  (eval suite + perf regression)
  → 7. DEPLOY                    (canary → prod) + OBSERVE
```

For each stage below: what we have, what's missing, and how to add.

---

## Stage 1 — Model understanding

**What we have**: 20 model YAML files with `architecture`, `family`, basic op decomposition (`participates_in_fused_kernels`).

**What's missing for agents**:

| Gap | Why agent needs it | How to add |
|---|---|---|
| **Computational graph** of each model in canonical form (ONNX-like or HF transformers config + arch tag) | Agent must know *exactly* which ops fire, not just "DeepSeek-V3 uses MLA" | Add `data/models/<id>/graph.json` referencing exact HuggingFace `config.json` + custom modeling_*.py |
| **Per-token FLOPs / bytes** as evaluable expression, not just operator-level | For composability: `total_flops(model, batch, seq_len)` callable | Extend ModelSchema with `flops_expr` field (RPN or simple algebra) |
| **Activation memory** per stage (forward + KV) | Memory budgeting requires knowing this per token | Already partially in `architecture.kv_cache_per_token_bytes`; needs to be canonical |
| **Numerical sensitivity profile** | Agent must know "this model tolerates FP4" vs "MoE gates need FP16+" | Add `precision_tolerance: { weights: [bf16,fp8,...], activations: [...], gates: [...] }` |
| **Reference implementation pointer** | Agent forks from canonical impl to validate | Add `reference_impl: { repo: "deepseek-ai/DeepSeek-V3", commit: "abc123", tag: "v0.1" }` |

**Concrete v2.4 deliverable**: `ModelSchema` extended with `reference_impl` + `flops_expr` + `precision_tolerance`. Populate on the 5 most-used models.

---

## Stage 2 — Hardware understanding

**What we have**: 39 hardware specs with compute / memory / power-thermal (v2.1) / 18 with deep memory_hierarchy. 14 super-pods × 3 architectural axes.

**What's missing for agents**:

| Gap | Why agent needs it | How to add |
|---|---|---|
| **ISA capability descriptors** | Agent must know "WGMMA m64n128k16 with FP8 → 1024 TFLOPS" exact instruction | Add `architecture.tensor_isa: [{name: WGMMA, dims: [64,128,16], dtypes: [fp8-e4m3], tflops: 1024}]` |
| **Memory ordering / coherence model** | Required for correctness of generated kernels | Add `architecture.memory_model: 'release-acquire' \| 'sc' \| 'weak'` etc. |
| **Sync primitive set** | Generated kernels need barrier / fence / atomic semantics | Add `architecture.sync_primitives: [{name: __syncthreads, scope: cta}, ...]` |
| **Software stack version matrix** | What CUDA / ROCm / CANN / MUSA versions does this card support? | Add `software_support.driver_versions: { cuda: ['12.0'..'12.6'], canm: [..] }` |
| **Compiler / kernel-build chain** | Agent must know how to compile a kernel for this card | Add `kernel_build: { compiler: 'nvcc', flags: ['-arch=sm_90a'], ... }` |

**Concrete v2.5 deliverable**: `architecture.tensor_isa` + `kernel_build` populated on the 8 most-deployed cards.

---

## Stage 3 — Cross-hardware op equivalence (BIGGEST GAP)

> **Note 2026-05-02**: This stage was deepened in the supplement
> [`2026-05-02-hw-sw-gap.md`](./2026-05-02-hw-sw-gap.md) — decomposed into
> 5 distinct layers (ISA primitives / programming model / operator library /
> functional semantics / coverage matrix). The schema additions and v2.5–v2.7
> roadmap below are the simplified version; the supplement has the complete
> decomposition.


**What we have**: per-operator `engine_implementations[].hardware_arch` listing which architectures have a fast kernel. `/operators/hardware-fitness/` (v2.2) surfaces gaps.

**What's missing — the keystone for "operator generation"**:

| Gap | Why agent needs it | How to add |
|---|---|---|
| **Primitive-to-primitive mapping** across ISAs (CUDA WMMA ↔ HIP MFMA ↔ CANN cube ↔ MUSA tensor) | Agent porting a kernel must translate primitives, not just operators | Create `data/isa-mappings/<op-class>.yaml` — e.g. `gemm-tile-tensor-core.yaml` with rows per ISA |
| **Equivalent kernel pointers** | "This vLLM CUDA kernel for `paged-attention` — what's the closest equivalent on ROCm / CANN?" | Extend `engine_implementations` with `equivalent_in: [{engine_id: lmdeploy, file: ..., line: ...}, ...]` |
| **Datatype equivalence + casting rules** | FP8 E4M3 ↔ FP8 E5M2 ↔ INT8 quant scaling differences | Add `data/datatype-bridges/` with cast cost / quality drift per pair |
| **Kernel-shape specialization rules** | When does vLLM auto-select FA-3 vs FA-2 vs Triton fallback? | Document per-kernel `selection_rules: [{condition: "head_dim>128", impl: "triton"}]` |

**Why this matters most**: without a primitive mapping table, an agent cannot autonomously port a kernel from one vendor to another. It can only pick from what's already documented per-vendor — which means it inherits coverage gaps with no remediation path.

**Concrete v2.6 deliverable**: `data/isa-mappings/gemm-mma.yaml` covering matmul-tile primitives across NVIDIA WGMMA / AMD MFMA / Ascend Cube / MUSA tensor — first cross-vendor primitive table.

---

## Stage 4 — Constraint solving (composability)

**What we have**: roofline formulas in operator YAMLs (`flops_formula`, `bytes_formula`). `/calculator/capacity-planner/` (v1.32) UI form.

**What's missing for agents**:

| Gap | How to add |
|---|---|
| **Evaluable expression form** of all formulas (not free-text) | Use a small expression DSL (RPN or `expr-eval`-style) instead of human strings |
| **Composition rules**: how to combine per-op formulas into per-model formula | Add `data/models/<id>/cost_model.yaml` with op-mix weights |
| **Constraint solver inputs schema**: standardized representation of "given (memory budget, latency SLO, $-budget), what configs satisfy?" | Add a `/api/solve.json` endpoint or MCP tool that takes a query and returns viable configs |
| **Engine overhead constants** | Engine adds ~5-15% overhead beyond pure compute; needs to be modeled | Add `EngineSchema.overhead: { tp_factor: 0.95, pp_bubble: 0.05, ... }` |

**Concrete v2.5 deliverable**: Migrate the 5 most-used operator formulas to evaluable form + add composition example.

---

## Stage 5 — Codegen (planning + generation)

**What we have**: `/playbooks/<model>/<hw>/` recipes describing what to set. /learn/migrations/ procedural runbooks.

**What's missing for agents**:

| Gap | How to add |
|---|---|
| **Parametrized engine launch commands** | Add `data/cases/<id>/launch.yaml` with full reproducible command + env |
| **Configuration templates** (engine YAML, docker-compose, k8s manifest) | Add `templates/engines/<id>/<scenario>.yaml.j2` (Jinja2-style) |
| **Kernel skeletons** for empty cells in `/operators/hardware-fitness/` | Add `templates/kernels/<isa>/<op-class>.{cu,cpp,cce}` reference forms |
| **Validation harness templates** | Add `templates/eval/<workload-archetype>.yaml` with eval set selection |

**Concrete v2.4 deliverable**: 5 case studies promoted to fully-parametrized launch commands stored as YAML.

---

## Stage 6 — Validation

**What we have**: 41 cases with measured results. /learn/troubleshooting (symptoms). /learn/migrations (5-stage canary).

**What's missing for agents**:

| Gap | How to add |
|---|---|
| **Per-workload eval-set mapping** | Add `data/eval-sets/<archetype>.yaml` mapping workload → eval bench (chat → MT-Bench, code → HumanEval, math → GSM8K, retrieval → MTEB) |
| **Quality gates as numerical thresholds** | Per-archetype: `accept_rate_drift_max: 0.5` etc. |
| **Per-(model, quant, hw) golden expected metrics** | Add as part of case YAML: `expected_eval: {gsm8k: 0.81, mmlu: 0.78}` |
| **Failure mode → workaround mapping** | Extend `/learn/troubleshooting/` symptoms with structured `data/failure-modes/<id>.yaml` |

**Concrete v2.5 deliverable**: `data/eval-sets/` covering 6 workload archetypes + 5 cases with `expected_eval`.

---

## Stage 7 — Deploy + observe

**What we have**: /learn/observability with metric tiers + tools. /learn/production-lifecycle with rollout playbook. case YAMLs link to evidence.

**What's missing for agents**:

| Gap | How to add |
|---|---|
| **Tool-config templates** (Prometheus scrape config / Grafana dashboard JSON / Loki labels) | Add `templates/observability/<engine>/{prometheus,grafana}.yaml` |
| **Alert rules as machine-readable** | Each metric tier gets per-engine PromQL rules in `templates/alerts/` |
| **Replay-able case provenance** | Each case YAML adds: exact `engine_version`, `model_checkpoint_sha`, `cuda_version`, `kernel_versions: {flash_attn: "v3.2.1", ...}` |

**Concrete v2.6 deliverable**: 3 cases promoted to fully-replayable form with versioned provenance.

---

## Cross-cutting: Agent consumption protocol

The agent needs a **stable protocol** to consume this corpus. Options ranked by leverage:

### Option A — MCP Server (highest leverage)

Build an `evokernel-spec` MCP server exposing tools:
- `query_hardware(filter)` → list of cards matching constraints
- `query_operator_fitness(op_id, hw_arch)` → engine support + kernel pointers
- `solve_config({model, hw, workload, sla})` → ranked viable configurations
- `get_case(id)` → full reproducible recipe
- `get_kernel_template(op_class, isa)` → starting-point template

Distributed as a published npm package or pip package; runs locally next to the agent. Versioned independently of the website.

### Option B — Vector embedding API (medium leverage)

`/api/embeddings/` endpoint serving pre-computed embeddings of every entity. Lets agents do semantic search ("find cards similar to H100 but cheaper") without prompting an LLM.

### Option C — Stable JSON API extensions (lowest leverage but easiest)

Extend existing `/api/*.json` with:
- `/api/operators.json` (currently missing!)
- `/api/fused-kernels.json`
- `/api/playbooks.json`
- `/api/templates.json` (NEW: codegen templates index)
- `/api/solve.json?model=...&hw=...` (NEW: query-able solver)

**Recommendation**: ship C first (1 iteration, additive, no new infra), then B (1 iteration, embedding pipeline), then A (3 iterations, real product).

---

## Prioritized roadmap

### v2.4 — "Reproducibility skeleton" (Priority 1)

Theme: turn descriptions into runnable artifacts.

- `data/templates/launch-commands/` — 5 fully-parametrized engine launch commands per case
- `ModelSchema.reference_impl` field + populate on 5 frontier models
- `/api/operators.json` + `/api/fused-kernels.json` + `/api/playbooks.json` (currently missing!)
- `/api/solve.json` endpoint — input: `{model, hw_id, workload, sla}` → ranked viable configs
- Doc page `/agents/` explaining the agent integration story (1-page)

### v2.5 — "Composability layer" (Priority 1-2)

Theme: turn formulas into evaluable expressions; turn cases into full eval bundles.

- `OperatorSchema.flops_expr` evaluable form on top 10 ops
- `data/eval-sets/<archetype>.yaml` for 6 workload archetypes
- 5 cases promoted with `expected_eval` (golden metrics) + `provenance` block (versions / SHAs)
- `EngineSchema.overhead_constants` populated on all 7 engines

### v2.6 — "Cross-vendor primitives" (Priority 2)

Theme: enable cross-hardware kernel porting.

- `data/isa-mappings/gemm-mma.yaml` first cross-vendor primitive table (NVIDIA WGMMA ↔ AMD MFMA ↔ Ascend Cube ↔ MUSA Tensor)
- `architecture.tensor_isa` field on hardware schema + populate on 8 cards
- `architecture.kernel_build` (compiler / flags) on 8 cards
- `templates/kernels/` skeleton library — 4 op classes × 4 ISAs = 16 starting templates

### v2.7+ — MCP server release

Once the corpus has the structured fields above, building an MCP server is mostly mechanical: each tool is a query against the JSON API or a templated codegen call.

Tracked as Tier 3 work but the schema groundwork in v2.4-v2.6 is the actual heavy lifting.

---

## What to defer

- **Real benchmark CI runner** (Tier 3) — still high cost; the schema work above gives us 80% of what an agent needs without it
- **Multi-language expansion** (Tier 3) — orthogonal; doesn't affect agent capability  
- **Auto-translated CN vendor docs** (Tier 2) — useful but not blocking for an English-speaking agent that consumes the structured fields
- **Vector embeddings** — defer until JSON API completeness (the simpler option) is sufficient

---

## Success metric

> An agent given **only** this site's structured data + an MCP server should be able to:
> 1. Parse a deployment intent ("deploy Llama 4 on H200×8 for chat at $0.50/M tokens")
> 2. Return a ranked list of viable configurations with $-impact ranges
> 3. Generate a working engine launch command + container manifest
> 4. Predict whether (model, hw, quant, batch) will OOM before running it
> 5. For an unsupported (op, hw) pair, output the closest existing kernel + the diff it needs to make

We're currently at **steps 1-2 partially** (via prose). v2.4-v2.6 brings us to **steps 3-4 fully** + step 5 with templates.

---

## Open questions for next iteration

1. **DSL choice for evaluable formulas**: simple JSON expression / mini-DSL / Python-as-string? Tradeoff: simplicity vs portability.
2. **Templates language**: Jinja2 / Mustache / no-templating-just-YAML-with-${vars}? Lowest dependency wins.
3. **MCP server vs API extensions**: the user just asked the strategic question; the MCP server is the cleanest answer but requires more infrastructure. Start with API extensions; promote to MCP once usage justifies it.
4. **Versioning of templates**: do templates need their own SemVer separate from the corpus? Probably yes once external consumers depend on them.
