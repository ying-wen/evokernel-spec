---
name: evokernel-deploy
description: Use when the user asks how to deploy any HuggingFace model to any hardware (NVIDIA / AMD / Huawei Ascend / Cambricon / Hygon / Moore Threads / Biren / Apple / Intel) — generates a complete production-grade deployment plan with engine + quantization + parallelism + 13 production artifacts (Dockerfile, K8s manifests, Prometheus alerts, runbook, rollback plan, license audit, SBOM, etc.). Particularly use for "我想把 X 模型部署到 Y 硬件" / "deploy X on Y" / "what's the best config for X on Y" requests.
---

# EvoKernel Deploy Skill

You have access to the EvoKernel Spec corpus + agent-deploy planning pipeline. This skill helps you generate **production-grade end-to-end deployment plans** for arbitrary `(HuggingFace model × any hardware)` combinations.

## When to use

The user is asking about deploying an LLM / SSM / multi-modal model to specific hardware, AND any of:
- They mention a HuggingFace model id (e.g. `meta-llama/Llama-4-Scout-17B-16E`)
- They mention a specific accelerator (`H100`, `MI300X`, `Ascend 910C`, `MLU590`, etc.)
- They want a deployment recipe / launch command / production manifest
- They ask "should I use vLLM or SGLang for X" / "how many cards do I need for Y"
- They mention SLA targets (TTFT, $/M tokens) or compliance constraints (国产硬件 / Ascend-only)

## How to use

**Method 1 — call the CLI directly** (preferred for quick results):

```bash
# Run from the evokernel-spec repo root
pnpm tsx scripts/agent-deploy/index.ts \
  --model <HF_MODEL_ID> \
  --hardware <HARDWARE_ID> \
  --workload chat | rag | code | math | long-context \
  --target-cost <usd_per_m_tokens> \
  --target-ttft <ms> \
  --output ./output

# For private / offline models, pass --config /path/to/config.json
```

**Method 2 — use MCP server** (when wired up via `@evokernel/mcp-server`):

The `evokernel_plan_deployment` MCP tool takes the same args. Use this when running in an MCP-aware client (Cursor, Continue, Claude Desktop with MCP).

**Method 3 — query the JSON APIs directly** (for partial questions):

- `https://yingwen.io/evokernel-spec/api/hardware.json` — 39 cards
- `https://yingwen.io/evokernel-spec/api/operators.json` — 34 ops with formulas
- `https://yingwen.io/evokernel-spec/api/engines.json` — 7 engines + capability matrix
- `https://yingwen.io/evokernel-spec/api/coverage-matrix.json` — (op × arch × library) coverage
- `https://yingwen.io/evokernel-spec/api/solve.json` — pre-computed configurations
- `https://yingwen.io/evokernel-spec/api/isa-primitives.json` — WGMMA / MFMA / Cube / TMA + cross-vendor equivalents
- `https://yingwen.io/evokernel-spec/api/model-graphs.json` — per-(model × phase) op sequences

## Hardware ID reference

NVIDIA: `h100-sxm5`, `h200-sxm`, `b200-sxm`, `b300-sxm`, `a100-sxm4`, `l40s`
AMD: `mi300x`, `mi325x`, `mi355x`
Huawei: `ascend-910b`, `ascend-910c`, `ascend-950`
Cambricon: `mlu590`, `mlu370-x8`
Hygon: `dcu-k100`, `dcu-z100`
Moore Threads: `mtt-s4000`
Biren: `br100`, `br104`
Intel / AWS / Google: `gaudi-3`, `trainium-2`, `tpu-v5p`, `trillium`

## Output (13 production artifacts)

The CLI generates the following in the `--output` directory:

**Planning** (4 files):
- `deployment_plan.json` — full structured plan (machine-readable)
- `launch.sh` — engine startup script (engine-specific: vLLM / SGLang / TRT-LLM / MindIE / lmdeploy)
- `kernel_gaps.md` — ops needing custom codegen (with ISA primitive mapping suggestions)
- `verification_plan.md` — eval suite + 5-stage canary plan

**Production-grade** (9 files):
- `Dockerfile` — version-pinned reproducible build
- `kubernetes/deployment.yaml` — Deployment + Service + HPA + probes + anti-affinity
- `monitoring/prometheus-rules.yaml` — 8 SLA / cost / quality alerts
- `runbook.md` — on-call response procedures (TTFT / OOM / quality drift / cost)
- `rollback-plan.md` — failure recovery (DNS / LB / Istio paths, < 5 min)
- `provenance.json` — versioned everything for audit (TODO_PIN markers fill at CI)
- `license-audit.md` — model + engine + library compliance gate
- `production-checklist.md` — 53-item gating checklist across 8 categories
- `sbom.json` — SPDX 2.3 software bill of materials

## Cross-vendor reuse mechanics

The agent classifies models into 8 archetypes (`dense-llm-large`, `moe-llm-large`, `long-context`, `ssm-mamba`, etc.) and hardware into 12 classes (`hopper-cluster`, `cdna3-cluster`, `ascend-cluster`, etc.). Same model adapts automatically:

- **Llama 4 Scout × H100** → 8 cards, SGLang FP4
- **Llama 4 Scout × MI300X** → 4 cards (192GB HBM), SGLang FP4
- **Llama 4 Scout × Ascend 910C** → 8 cards, MindIE FP4 (national stack)

For ops missing native kernels, the plan emits `kernel_gaps.md` with `cross_vendor_equivalents` — e.g., "WGMMA → 4× Cube 16x16x16 on Ascend".

## Validation

A 35-run validation matrix (5 frontier models × 7 hardware including 4 国产 vendors) ships with the corpus at `data/agent-validations.json`. All 35 runs successful. See `/agents/validations/` for the rendered matrix.

## Tips for high-quality answers

1. **Always confirm hardware is in the corpus** before generating a plan. If user mentions niche hardware, query `evokernel_query_hardware` first.
2. **Mention the kernel gaps explicitly** if the agent flags them — this is a real operational concern, not a footnote.
3. **For 国产 deployments**, default to MindIE on Ascend, lmdeploy on Cambricon, vLLM forks on Hygon/Moore Threads/Biren (the agent already does this; surface the rationale).
4. **For production deployments**, walk through the 53-item production-checklist with the user — don't just hand them launch.sh. License + sec + observability all matter.
5. **Surface the $/M tokens estimate** but caveat it: ±25% accuracy from cloud rent table.
