# EvoKernel Productized Agent Harness — End-to-End Guide

> Status: **v3.27+ stable** — 11 release iterations through the productized-agent arc. Latest: **v3.27 (--execute flag for remote-target real SSH execution; tensor-diff utility for cross-arch numerical compare; --description flag for fuzzy-intent host-LLM clarification loop).** Full runbook for the SageAttention/CogVideoX/Ascend-910B north-star scenario at [`docs/RUNBOOK-SAGEATTENTION-910B.md`](RUNBOOK-SAGEATTENTION-910B.md).

This is the operator manual for the **real productized agent harness** — a closed-loop pipeline that takes `(any model, any hardware)` and emits production-grade deployment artifacts plus real generated kernels with verification + retry + corpus feedback.

It is **not** an MCP query service (corpus has one of those too — separate tool). The harness goes one step further: it produces the actual code you ship and the actual provenance you audit.

## ⚠️ Known limits (v3.27 — what works, what's still gap)

All 6 of the original v3.23 gaps now have working surface, plus the v3.27 north-star deliverables (`--execute`, tensor-diff, `--description` fuzzy intent). The remaining v3.28-v3.30 work is depth (cross-arch verify execution, richer input types, automated serving + client-test orchestration). Full runbook for the SageAttention/CogVideoX/910B north-star at [`RUNBOOK-SAGEATTENTION-910B.md`](RUNBOOK-SAGEATTENTION-910B.md).

**✅ Closed in v3.25-v3.27:**
- ~~`ANTHROPIC_API_KEY` requirement~~ → `--use-host-llm` (v3.25) routes through host LLM
- ~~Unknown models error out~~ → `synthesizeTemporaryBundle` (v3.25)
- ~~No "technique" entity~~ → `data/techniques/` (v3.25) + first SageAttention YAML
- ~~`--technique` CLI not wired~~ → wired in v3.26 (`agent:deploy --technique sageattention --hardware <arch> --use-host-llm` works)
- ~~No remote-target SSH executor~~ → `remote-target.ts` (v3.26) emits dry-run plan + per-vendor build scripts (`nvidia/build.sh`, `ascend/build.sh`, `amd/build.sh`, `cambricon/build.sh`)
- ~~No cross-arch verify~~ → scaffold (v3.26) + tensor-diff utility (v3.27); cross-arch EXECUTION via remote-target lands in v3.28
- ~~`--execute` for remote-target~~ → wired in **v3.27** (actual SSH + scp + remote build/run/profile + scp-back). Auto-suggests `EVOKERNEL_<PROFILER>_INPUT_CSV` env after scp-down so V3 perf gate ingests profile.
- ~~No fuzzy-intent input~~ → `--description "natural language intent"` wired in **v3.27**: routes through host-LLM clarification loop (no API key in CC/Codex), resolves to canonical args or surfaces structured questions.

**Still open (v3.28-v3.30):**
- **End-to-end serving on real hardware**. v3.28 will template `--serve` flag wrapping the deployed model in FastAPI/Triton + emit a client test script.
- **Cross-arch numerical verify EXECUTION**. v3.28 wires "run reference on Hopper via SSH + run new impl on Ascend via SSH + diff tensors with tolerance from technique YAML" using v3.27's tensor-diff utility.
- **suprof + instruments parsers**. 4/6 vendors today (NCU/rocprof/msprof/cnperf); 6/6 in a follow-up (Moore Threads + Apple).
- **Richer input types**: `--from-repo` / `--from-code` / `--from-paper` flags (v3.28-v3.29).
- **First-class user requirement flags** (`--target-tok-s` / `--target-latency-ms` / `--target-accuracy` / `--dtype`) — v3.29.
- **Auto-emit `agent-run-summary.md`** at end of each deploy (v3.30).

The full design is at [`docs/superpowers/specs/2026-05-04-real-productized-agent.md`](superpowers/specs/2026-05-04-real-productized-agent.md). PRs welcome.

## v3.26 --technique walkthrough

`pnpm agent:deploy --technique sageattention --hardware ascend-910b --use-host-llm` now loads `data/techniques/sageattention.yaml`, identifies the per-arch port status, and surfaces a summary like:

```
🧪 Stage 4.5 — technique loaded: SageAttention (attention-optimization)
   Technique "SageAttention" → arch "ascend-da-vinci-3": planned port (greenfield).
   Agent will generate a first-pass kernel from the technique reference impl
   + corpus DSL examples for ascend-da-vinci-3, then iterate via Layer V verify
   (target effort: high).
```

The technique enters the manifest's `ralph_loop_iterations[]` as a `technique-context` step. v3.27 will use the technique's `numerical_rules` to gate cross-arch verify.

## v3.26 --remote walkthrough (dry-run mode)

```bash
# 1. One-time setup: copy example + fill in YOUR targets
cp scripts/agent-deploy/remote/targets.yaml.example ~/.config/evokernel/targets.yaml
$EDITOR ~/.config/evokernel/targets.yaml      # replace <ASCEND_910B_HOST> etc with your real ssh-config aliases

# 2. Run a deploy + emit the SSH execution plan (dry-run by default in v3.26)
pnpm agent:deploy --use-llm-orchestrator \
  --model llama-3.3-70b --hardware h100-sxm5 \
  --remote h100-test
```

Output (excerpt):

```
╔═══════════════════════════════════════════════════════════════════════════════
║ remote-target dry-run: h100-test
║   hardware: h100-sxm5 (vendor: nvidia)
║   ssh: <H100_HOST>
║   work dir: /tmp/evokernel-work/llama-3.3-70b__h100-sxm5__1714680000000
║   kernel files: matmul_hopper.cu, fused-rope-qkv_hopper.cu
╚═══════════════════════════════════════════════════════════════════════════════

Plan (each step would run sequentially; halt-on-error):

  [1] Sanity-check SSH + toolchain on remote
      $ ssh <H100_HOST> 'echo OK && which ncu 2>/dev/null || echo "<no profiler found>"'

  [2] Create work dir /tmp/evokernel-work/llama-3.3-70b__...
      $ ssh <H100_HOST> 'mkdir -p ...'

  [3] Upload 2 kernel file(s) + build script to remote
      $ scp <local>/matmul_hopper.cu <local>/fused-rope-qkv_hopper.cu \
            scripts/agent-deploy/remote/nvidia/build.sh \
            <H100_HOST>:.../

  [4] Run per-vendor build script on remote
      $ ssh <H100_HOST> 'cd ... && bash build.sh 2>&1'

  [5] Run the compiled binary (correctness check)
      $ ssh <H100_HOST> 'cd ... && ./bench --check 2>&1'

  [6] Run ncu and capture metrics
      $ ssh <H100_HOST> 'cd ... && ncu --csv --metrics ... ./bench > profile.csv 2>&1'

  [7] Pull profiler output back to ./agent-deploy-output/profile.csv
      $ scp <H100_HOST>:.../profile.csv ./agent-deploy-output/profile.csv

To actually execute: re-run with --execute (omit --dry-run).
```

**Why dry-run is the v3.26 default**: real-hardware execution allocates GPU memory + writes files on remote. First-time invocation of a new target id deserves user inspection of the plan before any state mutation. v3.27 wires `--execute` once users have validated the plan format + per-vendor build scripts work for their toolchain.

`agent-deploy-output/remote-plan.json` persists the plan for v3.27 `--execute` pickup.

## v3.26 Ralph-Loop step recording (manifest extension)

`evokernel-deploy.json` (the per-deploy manifest, schema v0.1) now includes a `ralph_loop_iterations[]` array recording each major stage's outcome. Example:

```jsonc
{
  "schema_version": "0.1",
  "request": { "model": "llama-3.3-70b", "hardware": "h100-sxm5", ... },
  "technique": { "id": "sageattention", "port_status": "planned", "summary": "..." },
  "ralph_loop_iterations": [
    { "stage": "classify", "status": "ok", "summary": "dense 70.0B params, gqa attention" },
    { "stage": "feasibility", "status": "ok", "summary": "Fits at TP=2" },
    { "stage": "plan", "status": "ok", "summary": "vllm, bf16, TP=2" },
    { "stage": "technique-context", "status": "ok", "summary": "..." },
    { "stage": "productized-generation", "status": "ok", "summary": "2 shipped, 1 partial, 0 blocked" },
    { "stage": "remote-target-plan", "status": "dry-run", "summary": "SSH plan emitted for h100-test (run --execute in v3.27)" }
  ],
  "productized": { ... },
  "artifacts": { ... }
}
```

This is the "every step recorded" surface the user's broader Ralph-Loop vision requires. v3.27 deepens this with per-step verification details + diagnostic chains; v3.30 emits a final `agent-run-summary.md` that synthesizes this into human-readable form.

## v3.25 host-LLM mode walkthrough

**One-click integration with Claude Code / Codex (no Anthropic API key).**

The harness emits a structured prompt + bundle excerpt to `~/.cache/evokernel/host-llm-exchange/<request_id>.request.json`. The host LLM (the one already running your CC/Codex session) reads it, generates the kernel, writes the response to a sibling `.response.json`. The harness picks up the response (5-min poll timeout) and continues the verification chain.

### How to use it

```bash
# Inside Claude Code (env auto-detected) — no flag needed:
pnpm agent:deploy --model llama-3.3-70b --hardware h100-sxm5

# Standalone (explicit opt-in):
pnpm agent:deploy --use-host-llm --model llama-3.3-70b --hardware h100-sxm5

# When the harness blocks on the response file, the CC/Codex session
# is expected to read the request, run the host model, write the response.
# This is what the /agent-deploy slash command does in v3.26+.
```

### Mode selection precedence (in `selectMode`)

1. `EVOKERNEL_TEST_MODE=true` → `test` (deterministic stubs; CI default)
2. `EVOKERNEL_HOST_LLM=true` OR auto-detected CC/Codex env → `host-llm` (no API key)
3. `EVOKERNEL_OFFLINE_ONLY=true` → `cache` (cache-hit only; no network)
4. `ANTHROPIC_API_KEY` set → `real` (Anthropic API)
5. None of the above → `skeleton` (template-only fallback)

### The exchange protocol (file-based, no daemon)

Pre-v3.25 design considered sockets and stdin/stdout — both required the host LLM to be running when the harness started, and broke if the harness CLI exited. File-based exchange means:
- Request preserved on disk for replay (debugging "why did this kernel fail?")
- Host LLM tool invocation is decoupled from harness lifetime
- Test fixture writes the response.json directly — no LLM call needed in CI

Files:
- `<exchange_dir>/<request_id>.request.json` — written by harness, contains prompt + op-relevant bundle excerpt (≤ 5 DSL examples + ≤ 5 ISA primitives, each capped at 1500 chars to control prompt cost)
- `<exchange_dir>/<request_id>.response.json` — written by host, contains `{ code, references_used, review_notes, llm_model_used }`

Default exchange dir: `~/.cache/evokernel/host-llm-exchange/` (override via `EVOKERNEL_HOST_LLM_EXCHANGE_DIR`).

## v3.25 technique entity walkthrough

Use `data/techniques/<id>.yaml` to express "research method to apply" (FlashAttention, SageAttention, PagedAttention, SmoothQuant, etc.) — distinct from models / ops / fused-kernels.

```yaml
# data/techniques/sageattention.yaml
id: sageattention
name: SageAttention
technique_kind: attention-optimization
reference_url: https://github.com/thu-ml/sageattention
applicable_to:
  model_archetypes: [diffusion, transformer-decoder, vision-transformer]
  ops: [attention, scaled-dot-product-attention]
  hardware_arch_families: [hopper, ada, ampere]
port_targets:
  - { arch_family: ascend-da-vinci-3, status: planned, notes: "v3.27 north-star" }
  - { arch_family: cdna3, status: planned }
reference_impl:
  framework: cuda-cpp
  repo: https://github.com/thu-ml/sageattention
  entry: csrc/qattn/qk_int_sv_f16_cuda_sm89.cu
numerical_rules:
  - aspect: q_k_quantization
    per_library: { sageattention-cuda: 'INT8 per-head per-token' }
port_complexity: high
```

Once landed, the agent's planner reads `port_targets[].status` to identify which kernels need synthesis vs which are reference-quality already. The agent's verify chain reads `numerical_rules` to inherit technique-imposed correctness expectations.

CLI invocation (v3.26+ wires `--technique` into `index.ts`):

```bash
pnpm agent:deploy --technique sageattention --model zai-org/CogVideoX1.5-5B --hardware ascend-910b --use-host-llm
```

## v3.25 unknown-model auto-import walkthrough

Pre-v3.25, deploying an unknown model errored with `BundleNotFoundError`. v3.25 adds `synthesizeTemporaryBundle`: when `resolveBundleId` returns `none`, the harness:

1. Picks any existing bundle on the target hardware (template — hardware data is arch-specific, not model-specific)
2. Fetches HF `config.json` (best-effort; offline mode degrades gracefully)
3. Heuristically classifies the archetype (diffusion / transformer-decoder / encoder-decoder-asr / vision-transformer / unknown)
4. Filters the template's `applicable_ops` + `applicable_fused_kernels` to ones likely relevant for the archetype
5. Returns a `SynthesizedBundle` marked with caveats: `"Bundle for X was SYNTHESIZED from HuggingFace config + Y corpus hardware entry. Inferred archetype: ... Operator graph is heuristic ..."`

The caveats explicitly tell the user: best-effort, land the model in `data/models/` for a real bundle.

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
