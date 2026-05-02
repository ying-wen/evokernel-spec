# EvoKernel Productized Agent Harness — End-to-End Guide

> Status: **v3.18+ stable** (the v3.17 release shipped the missing pieces; v3.18 added fuzzy-matching, auto-PR, plugin install, and per-deploy manifest).

This is the operator manual for the **real productized agent harness** — a closed-loop pipeline that takes `(any model, any hardware)` and emits production-grade deployment artifacts plus real generated kernels with verification + retry + corpus feedback.

It is **not** an MCP query service (corpus has one of those too — separate tool). The harness goes one step further: it produces the actual code you ship and the actual provenance you audit.

## What the harness does (one paragraph)

```
   any HF model id  ─┐
                      ├──►  Layer R: fetch (model, hardware) bundle from corpus
   hardware id ──────┘                  (model arch + hw arch + ops + DSL examples)
                            │
                            ▼
                      Layer P: classify, plan engine + quant + parallelism
                            │
                            ▼
                      Layer G: LLM-orchestrator generates real kernel code
                                 for each ops-coverage gap (cite corpus refs)
                            │
                            ▼
                      Layer V: V1 build + V2 correctness + V3 perf gates
                                 (structural-only without target HW; real with)
                            │
                            ▼
                      Layer F: synthesize agent-learning.yaml; on V failure,
                                 retry G with diagnostic; bounded MAX_RETRIES.
                            │
                            ▼
                      Outcomes: shipped / partial / kernel-gap-blocked
                       + agent-deploy-output/  (manifest + kernels + artifacts)
```

## Five-minute quickstart

```bash
# Step 1 — clone + build the corpus (one-time, ~2 min)
git clone https://github.com/ying-wen/evokernel-spec.git
cd evokernel-spec
pnpm install
pnpm --filter @evokernel/web build         # builds 2176+ pre-bundled (model, hw) pairs

# Step 2 — install the harness as a real plugin (one-time)
pnpm agent:install -- --target both        # both Codex CLI + Claude Code
# - symlinks evokernel-deploy → ~/.local/bin/
# - symlinks /agent-deploy slash command → ~/.claude/commands/

# Step 3 — discover what's deployable
pnpm agent:list-bundles -- --hardware h100-sxm5
# 34 agent-context bundles (of 2176 total):
#   alphafold-3 on h100-sxm5
#   boltz-1 on h100-sxm5
#   ... etc

# Step 4 — deploy (skeleton mode — no API key required)
pnpm agent:deploy --model llama-3.3-70b --hardware h100-sxm5
# OR via the installed binary, from any cwd:
evokernel-deploy --model llama-3.3-70b --hardware h100-sxm5

# Step 5 — deploy productized (real-code generation, requires Anthropic API key)
ANTHROPIC_API_KEY=sk-ant-... pnpm agent:deploy:productized \
  --model meta-llama/Llama-3.3-70B-Instruct \
  --hardware h100-sxm5
# v3.18 fuzzy-match: "meta-llama/Llama-3.3-70B-Instruct" → "llama-3.3-70b" auto-resolved.
```

After step 5, inspect `agent-deploy-output/`:

```
agent-deploy-output/
├── evokernel-deploy.json        # v3.18 canonical manifest (machine-readable)
├── deployment_plan.json         # full structured plan (Stage 1-4 output)
├── launch.sh                    # ready-to-source engine startup script
├── kernel_gaps.md               # ops needing codegen (input to Layer G)
├── verification_plan.md         # eval + canary stages (input to Layer V)
├── kernels-generated/           # real production kernel code (productized mode)
│   ├── matmul_hopper.cu
│   ├── matmul_hopper.cu.verify.md
│   └── ...
├── agent-learnings-productized.md  # one entry per gap, ready for triage
├── agent-learning.yaml          # v2.24 stub (per-deploy aggregate)
├── Dockerfile                   # reproducible build, version-pinned
├── kubernetes/deployment.yaml   # K8s deploy + service + HPA
├── monitoring/prometheus-rules.yaml  # SLA / cost / quality alerts
├── runbook.md                   # on-call response procedures
├── rollback-plan.md             # failure recovery
├── provenance.json              # versioned everything (audit)
├── license-audit.md             # compliance gate
├── production-checklist.md      # 53-item gating checklist
└── sbom.json                    # SPDX 2.3 software bill of materials
```

## Closed-loop feedback to the corpus

Once you've run a few deploys, the F-loop has produced agent-learning entries. Run:

```bash
# Move the productized agent-learnings into the corpus
mv agent-deploy-output/agent-learnings-productized.md \
   data/agent-learnings/<id>-on-<hw>-<date>.yaml
# (Or split it into per-cluster files; the auto-pr aggregator handles either layout.)

# After ≥2 independent runs report similar observations, aggregate:
pnpm agent:auto-pr -- --output ./pr-drafts.md
# Reads data/agent-learnings/*.yaml, clusters observations by
# (kind, op_or_kernel, arch_family), filters to signal_strength ≥ 2,
# emits PR-ready Markdown for each emergent pattern.
```

The auto-PR output is what closes the **knowledge feedback loop**: real deployments produce real observations; ≥2 independent observations of the same pattern surface a corpus update; humans review + commit.

## Operating modes (for cost + reproducibility control)

The harness has 4 modes for kernel generation, controlled by env vars:

| Mode | Trigger | Cost | Determinism | Use case |
|---|---|---|---|---|
| **real** | `ANTHROPIC_API_KEY=sk-ant-...` | ~$0.01-0.10 per kernel | Non-det (LLM) | Production deploys |
| **cache** | `EVOKERNEL_OFFLINE_ONLY=true` + cache hit | $0 | Deterministic | Repeat deploys / CI |
| **test** | `EVOKERNEL_TEST_MODE=true` | $0 | Deterministic | Unit tests |
| **skeleton** | None of the above (default fallback) | $0 | Deterministic | Offline contributors |

**Default behavior**: if `ANTHROPIC_API_KEY` is unset and `--use-llm-orchestrator` is passed, the harness falls back to skeleton mode and clearly marks the output (`source: 'skeleton-fallback'` in the manifest).

## Bundle slug fuzzy-match (v3.18)

You can pass any of these for `--model`:

| Input | Resolves to | Strategy |
|---|---|---|
| `llama-3.3-70b` | `llama-3.3-70b` | exact |
| `Llama-3.3-70B-Instruct` | `llama-3.3-70b` | normalized |
| `meta-llama/Llama-3.3-70B` | `llama-3.3-70b` | normalized |
| `boltz` | `boltz-1` | substring (single match) |
| `gpt` | (multiple bundles) | ambiguous → candidates list |

Ambiguous inputs print the candidates and exit with code 2 — agent + user can correct.

## Plugin distribution

| Plugin | Surface | Install |
|---|---|---|
| Codex CLI | `evokernel-deploy` Node binary | `pnpm agent:install -- --target codex` |
| Claude Code | `/agent-deploy <model> <hardware>` slash command | `pnpm agent:install -- --target claude-code` |
| Both | both above | `pnpm agent:install -- --target both` |

Uninstall: pass `--uninstall` to the same command. Dry-run: pass `--dry-run`.

## Per-deploy manifest format

`evokernel-deploy.json` (v3.18 schema 0.1):

```jsonc
{
  "schema_version": "0.1",
  "generated_at": "2026-05-03T18:42:33Z",
  "request": {
    "model": "meta-llama/Llama-3.3-70B-Instruct",
    "hardware": "h100-sxm5",
    "workload": "chat",
    "use_llm_orchestrator": true,
    "target_cost": null,
    "target_ttft_ms": null
  },
  "classification": { /* archetype, params, attn_variant */ },
  "recommended": { /* engine, quant, parallelism, perf prediction */ },
  "feasibility": { "fits": true, "card_count": 2, "notes": [...] },
  "kernel_gaps_count": 3,
  "productized": {
    "mode": "real",
    "shipped": 2,
    "partial": 1,
    "blocked": 0,
    "per_gap": [
      { "filename": "fused-rope-qkv.cu", "outcome": "shipped", "attempts": 1, "source": "llm-generated" },
      ...
    ]
  },
  "artifacts": {
    "planning": ["deployment_plan.json", "launch.sh", "kernel_gaps.md", "verification_plan.md"],
    "production": [/* 9 files */],
    "knowledge_feedback": ["agent-learning.yaml", "agent-learnings-productized.md"]
  }
}
```

This is the file to consume from CI: it tells you the deploy outcome with one read.

## Troubleshooting

**"Could not resolve <model> to a bundle for <hardware>"**: run `pnpm agent:list-bundles -- --hardware <hardware>` to see what's available. If the (model, hardware) pair isn't in corpus, either:
- Build local bundles: `pnpm --filter @evokernel/web build`
- Or add the model + hardware YAMLs to `data/` first.

**"Failed to fetch HF config (HTTP 401)"**: the model id you passed isn't a public HuggingFace id. Use `--source-type=local --model /path/to/local/dir/with/config.json` for offline mode.

**"All retries exhausted (kernel-gap-blocked)"**: the LLM couldn't produce code that passes verification after 3 attempts. Inspect `kernels-generated/<file>.verify.md` for the failure-diagnostic chain. Most common causes:
- Missing DSL example for `<arch_family>` → add one to `data/dsl-examples/`
- Numerical_rules edge case not in `formal_semantics` → extend the op entry

Both are exactly the corpus updates the F-loop is supposed to surface.

## See also

- [`docs/superpowers/specs/2026-05-03-productized-agent.md`](superpowers/specs/2026-05-03-productized-agent.md) — full architecture spec
- [`docs/CLEANUP-TODO.md`](CLEANUP-TODO.md) — known issues + UI cleanup queue
- [`CHANGELOG.md`](../CHANGELOG.md) — version-by-version evolution from v3.3 through v3.18+
