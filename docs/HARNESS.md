# EvoKernel Productized Agent Harness — End-to-End Guide

> Status: **v3.23+ stable** — surface area through 7 release iterations:
> v3.17 (real harness pivot), v3.18 (polish: fuzzy + auto-PR + install + manifest + walkthrough), v3.19 (discoverable: doctor + 3 MCP tools + landing page), v3.20 (UI sprint #1 + agent:status), v3.21 (UI sprint #2 + --profile), v3.22 (continuous mode + NCU CSV parser + Apple cross-link), **v3.23 (vendor profiler parity: rocprof + msprof + cnperf, `zh:agent-deploy` slash command).**

This is the operator manual for the **real productized agent harness** — a closed-loop pipeline that takes `(any model, any hardware)` and emits production-grade deployment artifacts plus real generated kernels with verification + retry + corpus feedback.

It is **not** an MCP query service (corpus has one of those too — separate tool). The harness goes one step further: it produces the actual code you ship and the actual provenance you audit.

## ⚠️ Known limits (v3.23 — what doesn't yet work)

These were called out by users as "harness is too simple to be a real product". The full design for closing them is at [`docs/superpowers/specs/2026-05-04-real-productized-agent.md`](superpowers/specs/2026-05-04-real-productized-agent.md):

- **Productized real-mode requires `ANTHROPIC_API_KEY`**. When invoking from inside Claude Code or Codex (which have their own LLMs), the external key requirement is friction. The v3.25 `--use-host-llm` flag closes this.
- **Unknown models error out**. If your model isn't in `data/models/`, `BundleNotFoundError` fires. v3.25 adds HF auto-import via `synthesizeTemporaryBundle`.
- **No "technique" entity**. Porting research libraries (e.g. SageAttention) to a new arch isn't expressible — corpus has models, hardware, ops, fused-kernels, but no entity for "research technique to port to a new ISA". v3.25 adds `data/techniques/`.
- **No remote-target SSH executor**. V3 perf gate consumes pre-collected profiler CSVs via env vars; can't yet SSH to a target machine, compile, run, profile, and pull back metrics. v3.26 adds `scripts/agent-deploy/remote-target.ts`.
- **No cross-arch numerical verify**. V2 compares to a per-op `formal_semantics.reference_impl`. When porting a *technique*, the numerics that matter are the technique's (e.g. SageAttention's INT8+FP8 outliers), not the underlying op's. v3.27 adds cross-arch comparison.
- **suprof + instruments parsers missing**. 4/6 vendors today (NCU + rocprof + msprof + cnperf as of v3.23). 6/6 in v3.24.

If your use case hits one of these limits, the v3.24-v3.27 plan addresses it; PRs welcome.

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

## V3 perf gate: vendor profiler ingestion (v3.21-v3.23)

When you pass `--profile`, the V3 perf gate runs in **execution mode** instead of structural-only. It auto-detects the profiler binary for the target arch family (v3.21), then either invokes it or consumes a pre-collected output via env vars (v3.22-v3.23).

| Vendor | Arch family | Profiler | Env var (consume existing capture) | Parser shipped |
|---|---|---|---|---|
| NVIDIA | hopper / blackwell / ampere / ada | `ncu` | `EVOKERNEL_NCU_INPUT_CSV` | ✓ v3.22 |
| AMD | cdna / rdna | `rocprof` | `EVOKERNEL_ROCPROF_INPUT_CSV` | ✓ v3.23 |
| Huawei | ascend / da-vinci | `msprof` | `EVOKERNEL_MSPROF_INPUT_CSV` | ✓ v3.23 |
| Cambricon | mlu / bang-c | `cnperf` | `EVOKERNEL_CNPERF_INPUT_CSV` | ✓ v3.23 |
| Moore Threads | musa / mtt | `suprof` | (v3.24+) | — |
| Apple | m-series / neural-engine | `instruments` | (v3.24+) | — |

**All parsers share the unified `ProfilerParseResult` shape** (`scripts/agent-deploy/verify/profiler-shared.ts`):
- `vendor`: which profiler produced this
- `per_metric[]`: array of `{ name, value, assessment: good|ok|warn|unknown }`
- `perf_score ∈ [0, 1]`: weighted average across present metrics; **gate passes at >=0.5**
- `summary`: single-line human-readable
- `launches_captured`: post-`--launch-skip` count

The dispatch in `runPerfGate` is one switch keyed on `profiler.binary` — adding a new vendor (suprof / instruments) is one parser file plus one switch case, no shape negotiation.

**Bandwidth normalization for non-pct metrics**: msprof + cnperf report bandwidth in GB/s (not pct of peak). Each parser ships a hardcoded peak table per SKU/gen and exposes a `cambricon_sku` / `ascend_gen` option to override:

```ts
import { parseMsprofCsv } from './scripts/agent-deploy/verify/msprof-parser';
parseMsprofCsv(csv, { ascend_gen: '950' });   // 2400 GB/s peak

import { parseCnperfCsv } from './scripts/agent-deploy/verify/cnperf-parser';
parseCnperfCsv(csv, { cambricon_sku: 'mlu220' });  // 26 GB/s peak (LPDDR4X edge)
```

Without override they default to `910b` / `mlu590` (frontier datacenter).

## i18n: zh-CN slash command

`/agent-deploy` (English) and `/zh:agent-deploy` (中文) ship side-by-side. Both bind to the same underlying `pnpm agent:deploy` pipeline. Pick whichever matches your operator's preferred language; output (verification summary, agent-learning YAML) is identical regardless of which slash command launched the run.

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
