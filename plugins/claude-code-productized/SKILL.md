---
name: evokernel-productized-agent
description: Use when the user wants to autonomously deploy any model to any hardware end-to-end with REAL working code (not skeletons), automatic verification, retry-on-failure, and knowledge feedback to the corpus. The full v3.6 productized agent loop — Layer R (smart context retrieval) → Layer P (planning) → Layer G (LLM-orchestrated real-code generation) → Layer V (build + correctness + perf gates) → Layer F (auto-feedback to data/agent-learnings/). Particularly useful when v3 vs v2 trade-offs matter, when the deploy involves a hardware × op pair without prior agent runs, or when the user wants the full closed-loop spec→plan→dev→test→feedback cycle.
---

# EvoKernel Productized Agent — 5-Layer Pipeline (v3.7)

You have access to the **fully productized agent loop** built across v3.3-v3.6. This is the user-facing surface of the architecture defined in `docs/superpowers/specs/2026-05-03-productized-agent.md`.

This skill wraps `scripts/agent-deploy/feedback.ts` `generateAndVerify()` — a single async function that runs the entire R→P→G→V→F cycle.

## When to use vs `evokernel-deploy` (older skill)

- **`evokernel-deploy`** (v2.x skill, kept for compatibility) — emits a deployment **plan + skeleton kernels**. Good for "what config / how many cards / which engine?" answers.
- **`evokernel-productized-agent`** (this, v3.7) — emits a deployment plan + **real working production kernels** that pass V1/V2/V3 verification. Good for "actually generate the kernels for this novel (model, hardware) pair" workflows.

Use this skill when the user wants production code, not just planning advice.

## The 5-layer pipeline

```
Layer R  /api/agent-context/<model>-on-<hardware>.json     (v3.3, 1140 bundles)
   ↓ smart-retrieved knowledge bundle (model arch + hw arch + ops with formal_semantics
     + DSL examples + ISA primitives + prior agent-learnings)
Layer P  scripts/agent-deploy/index.ts Stage 1-4           (v2.9, existing)
   ↓ deployment plan (engine, quant, parallelism, kernel-gaps)
Layer G  scripts/agent-deploy/llm-orchestrator.ts          (v3.4, 4-mode dispatch)
   ↓ real production code via Anthropic Claude API
Layer V  scripts/agent-deploy/verify/                      (v3.5, V1/V2/V3 gates)
   ↓ build + correctness + perf verification + retry-on-fail diagnostic
Layer F  scripts/agent-deploy/feedback.ts                  (v3.6, this skill's caller)
   ↓ auto-fill agent-learning.yaml + retry loop (≤3 attempts)
Result: shipped / partial / kernel-gap-blocked + agent-learning YAML stub
```

## How to use — single command

The simplest invocation (from the evokernel-spec repo root):

```bash
export ANTHROPIC_API_KEY=sk-ant-...    # required for Layer G real-code mode
                                       # without it: skeleton fallback (v2.16 path)
pnpm tsx -e "
  import { generateAndVerify } from './scripts/agent-deploy/feedback';
  import { fetchBundle } from './scripts/agent-deploy/fetch-bundle';
  const bundle = await fetchBundle({ model: 'deepseek-v4-pro', hardware: 'h100-sxm5' });
  const result = await generateAndVerify({
    generation: { bundle, op: 'fused-rope-qkv', target_arch: 'hopper' },
    verification: {
      reference_impl_python: bundle.applicable_fused_kernels
        .find(k => k.id === 'fused-rope-qkv')
        ?.formal_semantics?.reference_impl?.snippet,
    },
  });
  console.log(result.outcome);
  console.log(result.verification.summary_md);
  console.log('--- agent-learning.yaml ---');
  console.log(result.agent_learning_yaml);
"
```

## How to use — step-by-step (when you need to inspect each layer)

```typescript
import { generateAndVerify } from './scripts/agent-deploy/feedback';

const result = await generateAndVerify({
  generation: {
    bundle: <agent-context bundle from /api/agent-context/[model]-on-[hardware].json>,
    op: 'fused-rope-qkv',
    target_arch: 'hopper',
  },
  verification: {
    reference_impl_python: '<from formal_semantics.reference_impl.snippet>',
    numerical_rules: [<from formal_semantics.numerical_rules>],
    execution_mode: false,  // structural-only; set true if you have the target hw
  },
  max_retries: 3,
});

// result.outcome:        'shipped' | 'partial' | 'kernel-gap-blocked'
// result.kernel.code:    the generated kernel code (real production code if API key set)
// result.kernel.source:  'llm-generated' | 'cache-hit' | 'skeleton-fallback' | 'test-stub'
// result.verification.summary_md:  Markdown summary of V1/V2/V3 results
// result.attempts:       full retry history
// result.agent_learning_yaml:  pre-filled YAML for data/agent-learnings/
```

## Environment variables

| Var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Required for Layer G **real mode** (production code). Without it: skeleton fallback. |
| `EVOKERNEL_LLM_MODEL` | Override default Claude model. Default: `claude-sonnet-4-5`. |
| `EVOKERNEL_OFFLINE_ONLY=true` | Force cache mode (no API calls); skeleton fallback if no cache hit. Useful for reproducible builds. |
| `EVOKERNEL_TEST_MODE=true` | Deterministic stubs only. CI default. |

## Cost expectations (real mode)

Layer G calls Anthropic API per kernel generation. Typical cost:
- Claude Sonnet 4.5+: ~$0.01-0.05 per kernel (~5K input tokens for bundle, ~3K output for code)
- Retry on V failure: 1-2 additional generations (each ~same cost)
- Per (model, hardware) deploy: 0-15 kernels generated (most ops have library coverage; only kernel-gaps trigger generation)

Typical full deploy: $0.05-$1.00 in API costs. Cache hits on subsequent same-(model, hw) runs: $0.

## Standard CLI workflow

If the user just says "deploy X on Y", invoke:

```bash
pnpm tsx scripts/agent-deploy/index.ts \
  --model <HF_MODEL_ID> \
  --hardware <HARDWARE_ID> \
  --workload chat \
  --output ./agent-deploy-output
```

This runs the full v2.9 pipeline. **For v3.7 productized real-code generation**, the CLI will be enhanced in v3.8 with `--use-llm-orchestrator` flag. For now, call `feedback.ts:generateAndVerify()` programmatically.

## Output handling

After `generateAndVerify()` returns:

1. **Print verification summary** — `result.verification.summary_md` is Markdown-formatted with status icons. Show this to the user.
2. **Save agent-learning stub** — write `result.agent_learning_yaml` to `agent-deploy-output/agent-learning.yaml` for the user to review.
3. **Surface kernel files** — for each generated kernel in result, save to `agent-deploy-output/kernels-generated/<filename>`.
4. **If outcome is `kernel-gap-blocked`** — explain to the user that all retries exhausted. Show the final retry diagnostic and suggest manual intervention (e.g., adding a DSL example for that arch).

## Hardware ID reference

See `data/hardware/<vendor>/<id>.yaml` for full inventory. Common IDs:

- NVIDIA: `h100-sxm5`, `h200-sxm`, `b200-sxm`, `b300-sxm`, `gb300-nvl72`, `rtx-5090`, `rtx-5080`, `rtx-5070`, `rtx-4090`, `dgx-spark`, `jetson-thor`, `l40s`, `a100-sxm4`
- AMD: `mi355x`, `mi325x`, `mi300x`, `mi300a`, `rx-9070-xt`, `rx-7900-xtx`, `ryzen-ai-max-395`
- Apple: `m3-ultra`, `m4-max`, `m4-pro`, `m5-max`, `m5-pro`
- Huawei: `ascend-910b`, `ascend-910c`, `ascend-910d`, `ascend-950`
- Cambricon: `mlu370-x8`, `mlu590`
- Hygon: `dcu-z100`, `dcu-k100`
- Moore Threads: `mtt-s4000`, `mtt-s5000`
- Biren: `br100`, `br104`
- Intel: `gaudi-2`, `gaudi-3`, `arc-b580`
- Rockchip: `rk3588-npu`
- Apple NPU: `apple-m4-max-npu`
- Other: `tpu-v5p`, `trillium`, `trainium-2`, `inferentia-2`, `wse-3`, `lpu`, `sohu`, `mtt-s4000`, etc.

## See also

- `docs/superpowers/specs/2026-05-03-productized-agent.md` — full architecture spec
- `CLAUDE.md` § "Decision rules for AI agents" — when to use which layer
- `data/agent-learnings/` — examples of what feedback writeback looks like
- `/agents/learnings/` — site page surfacing all known agent runs
- `CHANGELOG.md` § v3.3 → v3.6 — implementation history per layer
