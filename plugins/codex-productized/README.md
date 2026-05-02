# Codex CLI — EvoKernel Productized Agent (v3.7)

End-to-end productized agent for OpenAI Codex CLI. Wraps the v3.6 5-layer pipeline (Retrieval → Planning → Generation → Verification → Feedback) as Codex-callable surfaces.

## What this is

The v3.7 productized agent (built across v3.3-v3.6) lets Codex:
1. Smart-retrieve corpus context for any (model, hardware) pair
2. Plan a deployment (engine / quant / parallelism)
3. **Generate real production kernels** via LLM-orchestrator (not skeletons)
4. Verify kernels with V1 build + V2 correctness + V3 perf gates
5. Auto-retry on verification failure with diagnostic
6. Auto-emit `agent-learning.yaml` feedback for the corpus

Compared to the older `evokernel-spec` MCP integration (v2.x — query-only): this is a full action surface. Codex doesn't just retrieve facts; it deploys.

## Setup

### Step 1: Install MCP server

```bash
git clone https://github.com/ying-wen/evokernel-spec.git
cd evokernel-spec
pnpm install
pnpm --filter @evokernel/mcp-server build
```

### Step 2: Configure Codex CLI to use the MCP server

Add to `~/.config/codex/mcp.json`:

```json
{
  "mcpServers": {
    "evokernel-productized": {
      "command": "node",
      "args": ["/path/to/evokernel-spec/plugins/mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "EVOKERNEL_LLM_MODEL": "claude-sonnet-4-5"
      }
    }
  }
}
```

The `ANTHROPIC_API_KEY` is what unlocks Layer G real-code generation. Without it, the agent falls back to skeleton mode (v2.16 path).

### Step 3: Verify connectivity

In Codex CLI:

```
> List the available evokernel-productized tools
```

Codex should report:
- `evokernel_query_hardware` — fetch hardware spec by ID (v2.x)
- `evokernel_query_operator` — fetch op + formal_semantics (v2.x)
- `evokernel_query_isa` — fetch ISA primitive (v2.x)
- `evokernel_solve` — constraint solver (v2.x)
- `evokernel_coverage_matrix` — (op × arch) coverage (v2.x)
- `evokernel_plan_deployment` — full agent-deploy planning (v2.13)
- **`evokernel_agent_full_pipeline`** — NEW v3.7: end-to-end R→P→G→V→F (this is the productized agent)
- **`evokernel_agent_context`** — NEW v3.7: smart-retrieval bundle for given (model, hw)
- **`evokernel_verify_kernel`** — NEW v3.7: V1/V2/V3 verification gates on arbitrary code

## Usage patterns

### Pattern 1: Full end-to-end deploy

```
> Use evokernel-productized to deploy DeepSeek V4 Pro on Cambricon MLU590 for chat workload.
```

Codex calls `evokernel_agent_full_pipeline(model=deepseek-v4-pro, hardware=mlu590, workload=chat)`:
1. Fetches `/api/agent-context/deepseek-v4-pro-on-mlu590.json` (Layer R)
2. Plans deployment (engine=mindie, quant=fp16, parallelism=TP=2) (Layer P)
3. Generates ~5 missing kernels (fused-rope-qkv-on-cambricon, etc.) via Anthropic API (Layer G)
4. Verifies each kernel via V1 (cncc compile) + V2 (correctness vs PyTorch ref) + V3 (cnperf) (Layer V)
5. On failure: retries up to 3x with diagnostic in prompt (Layer G + V)
6. Emits `agent-learning.yaml` for human review (Layer F)
7. Returns: deployment plan + generated kernels + verification summary + agent-learning stub

### Pattern 2: Just generate one kernel

```
> Generate the fused-rope-qkv kernel for Cambricon MLU590 only — don't run full deploy.
```

Codex calls `evokernel_agent_full_pipeline` with `op_only=fused-rope-qkv` constraint:
- Layer R (just for that op's context)
- Skip Layer P (no full plan needed)
- Layer G (generate)
- Layer V (verify)
- Layer F (emit learning if novel)

### Pattern 3: Verify hand-written kernel

```
> I wrote this CUDA kernel for attention on Hopper. Verify it.
[paste code]
```

Codex calls `evokernel_verify_kernel(code=..., language=cuda-cpp, op=attention, target_arch=hopper)`:
- V1: structural checks + nvcc invocation if available
- V2: structural checks for online-softmax invariants (m, s, acc FP32; rescale pattern)
- V3: structural perf-friendliness checks
- Returns: pass/fail/partial + Markdown summary

### Pattern 4: Just retrieve context (no generation)

```
> What do I need to know to manually port FlashAttention v3 to Ascend 910C?
```

Codex calls `evokernel_agent_context(model=any-llm, hardware=ascend-910c)`:
- Returns the full knowledge bundle: applicable ops with formal_semantics, DSL examples for ascend-c, ISA primitives (cube + vector), kernel libraries (CANN/aclnn), prior agent-learnings.

## Cost expectations

The MCP server passes API calls through to Anthropic. Typical costs:
- One full deploy: $0.05-$1.00 (depends on # of kernel-gaps to fill)
- One kernel generation: $0.01-$0.05
- Cache hits (subsequent same-(model, hw) runs): $0

Set `EVOKERNEL_OFFLINE_ONLY=true` to force cache-only mode (good for development without API spend).

## Comparison: v2.x query MCP vs v3.7 productized

| Capability | v2.x MCP | v3.7 Productized |
|---|---|---|
| Query hardware/op/ISA spec | ✅ | ✅ (same tools) |
| Constraint solve (model, hw → engine/quant) | ✅ | ✅ |
| Plan deployment (artifacts) | ✅ (skeleton kernels) | ✅ (real kernels via LLM) |
| Verify kernels | ❌ | ✅ (V1/V2/V3 gates) |
| Auto-retry on failure | ❌ | ✅ (diagnostic-driven) |
| Auto-feedback to corpus | ❌ | ✅ (agent-learning YAML) |
| Cost model | $0 (no API calls) | $0.05-$1 per deploy |

## Slash command shortcut (Codex 0.7+)

```toml
# ~/.config/codex/slash_commands.toml

[deploy]
description = "Productized end-to-end deploy: model × hardware → real kernels + verify"
mcp_tool = "evokernel-productized.evokernel_agent_full_pipeline"
prompt_template = "Deploy ${MODEL} on ${HARDWARE} for ${WORKLOAD:-chat} workload using the productized agent."
```

Then in Codex:

```
> /deploy MODEL=deepseek-v4-pro HARDWARE=mlu590
```

## Troubleshooting

### "Layer G falls back to skeleton mode every time"

Check `ANTHROPIC_API_KEY` is set in the MCP server's `env` (not your shell). MCP servers run as subprocesses with their own env.

### "All retries exhausted"

The kernel-gap-blocked outcome means even after 3 LLM retries with diagnostics, V verification kept failing. This typically signals:
- DSL example missing for this (op, target_arch) pair → contribute one
- formal_semantics rule missing → add a numerical_rule documenting the constraint
- Op-class invariant in `verify/correctness.ts` is wrong / too strict

The `agent-learning.yaml` output flags this with a `proposed_corpus_update` field — review + open a PR.

### "Pages deploy not updating"

(Internal note for maintainers.) See `CLAUDE.md` Pitfall #5 — never `git checkout -- pnpm-lock.yaml`.

## See also

- `plugins/claude-code-productized/SKILL.md` — Claude Code equivalent
- `plugins/mcp-server/index.ts` — the MCP server source (where `agent_full_pipeline` is wired)
- `docs/superpowers/specs/2026-05-03-productized-agent.md` — full architecture spec
- `scripts/agent-deploy/feedback.ts` — the underlying `generateAndVerify()` orchestrator
- `CHANGELOG.md` v3.3-v3.7 — implementation history per layer
