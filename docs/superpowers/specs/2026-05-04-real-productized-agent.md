# Real Productized Agent — Architecture Spec (v3.24+)

> **Author:** evokernel-spec maintainers
> **Date:** 2026-05-04
> **Status:** Design — implementation across v3.24 → v3.27
> **Supersedes:** Sections of [`2026-05-03-productized-agent.md`](2026-05-03-productized-agent.md) (which described the v3.6 layer functions; this spec extends them with host-LLM execution, unknown-target handling, technique entities, and remote SSH execution).

## Context

User feedback in May 2026 (paraphrased — actual SSH host + IP redacted from public docs):

> "Current implementation is too simple, not easy to use. Want one-click in Codex and Claude Code. Current scenarios and flows are too simple — end-to-end isn't really possible, UX is poor. Need to handle unknown models and unknown hardware, plus more complex user needs. Concrete example: efficiently implement [SageAttention](https://github.com/thu-ml/sageattention) on Ascend 910B hardware, validate with [CogVideoX1.5-5B](https://huggingface.co/zai-org/CogVideoX1.5-5B) (910B server reachable via SSH at a private host — credentials available out-of-band, NOT committed to repo). Codex and Claude Code should not need an additional model API KEY."

Translation (paraphrased):

1. The current implementation is too simple. UX is bad. End-to-end doesn't really work.
2. **No external API key** required for Codex / Claude Code integration. They have their own LLMs — use them.
3. Handle **unknown models + unknown hardware** + complex user needs.
4. Concrete north-star scenario: **port SageAttention to Ascend-C, validate with CogVideoX1.5-5B on Ascend 910B accessed via SSH** — should work end-to-end with one command.

This spec is the architecture that makes that scenario possible.

## North-star user story

A user types this **once**, in Codex or Claude Code:

```
/agent-deploy --technique sageattention \
              --model zai-org/CogVideoX1.5-5B \
              --hardware ascend-910b \
              --remote root@<ASCEND_910B_HOST> \
              --use-host-llm
```

Or in natural language inside the chat:

> Port SageAttention (https://github.com/thu-ml/sageattention) to run efficiently on Ascend 910B, validate it with CogVideoX1.5-5B, the 910B is reachable at ssh root@<ASCEND_910B_HOST>.

The harness then:

1. **Resolves** the technique (`sageattention` → corpus `data/techniques/sageattention.yaml` OR fetches the GitHub repo and synthesizes a temporary technique entry)
2. **Resolves** the model (`zai-org/CogVideoX1.5-5B` → fuzzy-match corpus OR fetches HF config + decomposes operator graph + synthesizes temporary model bundle)
3. **Resolves** the hardware (`ascend-910b` → corpus entry — already present)
4. **Plans** the port: identifies which CUDA constructs in SageAttention map to which Ascend-C primitives, what the kernel-runner needs (CANN version, msprof, etc), what verification expects (FP16/BF16 numerical bounds inherited from SageAttention's reference)
5. **Generates** the Ascend-C kernel using **the host LLM** (Claude Code's Claude or Codex's GPT-5) — no `ANTHROPIC_API_KEY` required
6. **SSHs** to `root@<ASCEND_910B_HOST>`, detects the toolchain (CANN version, profiler availability), uploads the generated kernel, compiles it, runs the verifier, runs msprof
7. **Compares** measured tok/s against SageAttention's CUDA baseline (or the CogVideoX FA-3 baseline on 910B if that's the realistic comparison)
8. **Iterates** if V verification fails (retry Layer G with the diagnostic; bounded to 3 attempts)
9. **Emits** an `agent-learning.yaml` with: outcome (shipped / partial / blocked), measured perf, observations (e.g. "Cube unit underutilized at this op shape — needs Vector fallback"), proposed corpus updates
10. **Surfaces** a one-click PR draft to land the technique + the new Ascend-C DSL example back into corpus

Total user friction: **one command + an SSH key**. Today's friction: read 3 docs, set 4 env vars, hand-build a bundle, hand-run msprof, hand-write the agent-learning.

## Architecture changes (v3.24-v3.27)

### Change 1: Host-LLM execution mode (v3.24-v3.25)

**Today's reality**: `llm-orchestrator.ts` calls Anthropic API directly via `fetch`.

**The change**: introduce a 5th operating mode `host-llm` (alongside `real`/`cache`/`test`/`skeleton`). When set, `generateProductionKernel()` returns a structured **prompt + tool spec** instead of a generated kernel. The host (Claude Code or Codex) consumes the prompt with its own model and posts back the kernel via a callback / file write.

**Detection**:
- If running inside Claude Code (env var `CLAUDE_PROJECT_DIR` set + invoked from a slash command): host-llm mode default
- If running inside Codex (env var `CODEX_SESSION_ID` set or similar): host-llm mode default
- Standalone CLI: keep `real` mode default (with API key) or `skeleton` fallback

**Files**:
- `scripts/agent-deploy/llm-orchestrator.ts` — add `host-llm` mode branch
- `scripts/agent-deploy/host-llm-adapter.ts` (NEW) — the protocol for host-LLM exchange (write prompt to a file, host writes kernel response to another file, harness picks it up)
- `.claude/commands/agent-deploy.md` — when host-llm mode active, the slash command itself drives the LLM exchange (no subprocess hand-off)
- `plugins/codex-productized/bin/evokernel-deploy` — same for Codex

**Test**: `agent:deploy --use-host-llm` runs to completion in test mode without any API key set; the host-llm-adapter test stubs the host's response.

### Change 2: Unknown-model auto-import (v3.25)

**Today's reality**: `resolveBundleId` errors with "BundleNotFoundError" when the model isn't in `data/models/`. HF auto-fetch in `index.ts` exists but only fetches `config.json`; it doesn't synthesize a Layer R bundle.

**The change**:

1. **Extend `fetch-bundle.ts`**: when `resolveBundleId` returns `none`, try `synthesizeTemporaryBundle({ model_hf_id, hardware })`:
   - Fetch HF config + tokenizer + (optionally) modeling code
   - Decompose into operator graph (use existing `scripts/decompose-operators.ts`)
   - Combine with corpus hardware entry → in-memory `AgentContextBundle`
   - Mark bundle as `synthesized: true` so the agent surfaces "this is a best-effort synthesized bundle; landing the model in corpus would improve recommendations"

2. **NEW entity type**: `data/techniques/` with schema:
   ```yaml
   id: sageattention
   name: SageAttention
   reference_url: https://github.com/thu-ml/sageattention
   reference_paper: https://arxiv.org/abs/...
   technique_kind: attention-optimization | quantization | fused-kernel | scheduling
   applicable_to:
     model_archetypes: [diffusion, transformer-decoder]
     ops: [attention, scaled-dot-product-attention]
     hardware_arch_families: [hopper, ada, ampere]   # where it currently works
   port_targets: [ascend-da-vinci-3, cdna3, cambricon-mlu]   # where this spec wants it
   reference_impl:
     framework: cuda-cpp
     repo: https://github.com/thu-ml/sageattention
     entry: csrc/sageattention.cu
   numerical_rules:
     - aspect: accumulator_dtype
       per_library: { all_libs: 'FP32 with FP8 inputs (E4M3)' }
   port_complexity: high  # how much work to port to a new arch
   notes: |
     SageAttention combines INT8 attention + FP8 outliers for ~2x speed on
     Hopper. Porting to Ascend-C requires Cube-unit awareness for INT8 MMA.
   ```

3. **CLI extension**: `agent:deploy --technique <id> --model <id> --hardware <id>`. The `--technique` flag is what makes "port SageAttention to 910B" expressible.

**Files**:
- `schemas/technique.ts` (NEW) — zod schema for `data/techniques/`
- `scripts/agent-deploy/fetch-bundle.ts` — extend with `synthesizeTemporaryBundle`
- `scripts/agent-deploy/index.ts` — add `--technique` flag handling
- `data/techniques/sageattention.yaml` (NEW) — first technique entry, drives the v3.25 milestone

**Test**: `agent:deploy --technique sageattention --model unknown-model --hardware ascend-910b` synthesizes a bundle without erroring; the bundle's applicable_ops include the technique's reference_impl op shape.

### Change 3: Remote-target SSH executor (v3.26)

**Today's reality**: V3 perf gate consumes pre-collected profiler CSVs via env vars. There's no integration that runs your generated kernel on a remote machine.

**The change**: NEW `scripts/agent-deploy/remote-target.ts` with these capabilities:

1. **SSH config**: `~/.config/evokernel/targets.yaml` describes reachable hosts:
   ```yaml
   - id: ascend-910b-test
     hardware: ascend-910b
     ssh: root@<ASCEND_910B_HOST>
     toolchain:
       cann_version: 8.0.RC1   # auto-detected on first connect
       profiler: msprof
       work_dir: /root/evokernel-work
   - id: h100-cluster-1
     hardware: h100-sxm5
     ssh: yingwen@gpu1.example.com
     toolchain:
       cuda_version: 12.6
       profiler: ncu
   ```

2. **Workflow** for `--remote <id>`:
   - SSH connect + sanity-check toolchain (run `which msprof`, `nvcc --version`, etc.)
   - `scp` generated kernel sources + a generated build script to remote `work_dir`
   - Run build remotely; capture stdout/stderr
   - If build OK: run a small test harness that invokes the kernel + correctness check
   - If correctness OK: run the profiler (`msprof` for Ascend, `ncu` for NVIDIA, etc.)
   - `scp` profiler output back to local `agent-deploy-output/<run>/profile.csv`
   - Feed profile.csv into V3 perf gate via the env hook (auto-set, no manual export)

3. **Per-vendor build/run scripts** in `scripts/agent-deploy/remote/<vendor>/`:
   - `nvidia/build.sh` (nvcc), `ascend/build.sh` (msrun + Ascend-C compiler), `amd/build.sh` (hipcc), `cambricon/build.sh` (cnrtc)
   - Vendor-agnostic dispatcher in `remote-target.ts` keyed on hardware → vendor

4. **Test harness shape**: each technique needs a way to be invoked as a unit kernel. We use the technique's `reference_impl.entry` field for the canonical invocation shape; the synthesizer wraps it in a build script.

**Files**:
- `scripts/agent-deploy/remote-target.ts` (NEW)
- `scripts/agent-deploy/remote/{nvidia,amd,ascend,cambricon}/build.sh`
- `~/.config/evokernel/targets.yaml` example shipped in repo + git-ignored user copy

**Test**: `agent:deploy --remote <fake-host> --dry-run` prints the SSH command + scp + build commands without executing. Real-host integration tests gated behind a `EVOKERNEL_REMOTE_INTEGRATION_TEST=1` env (so CI doesn't try to SSH to random hosts).

### Change 4: Verification chain that tracks back to the technique (v3.27)

**Today's reality**: V verification compares output to a reference `pytorch` snippet from `formal_semantics.reference_impl`.

**The change**: when running with `--technique`, V2 also compares to the **technique's reference impl** (not just the op's). For SageAttention specifically: V2 runs the generated Ascend-C kernel + the SageAttention CUDA kernel side-by-side on (model, batch, seq_len) tuples and asserts numerical agreement to within `numerical_rules.tolerance`.

This needs:
- A canonical input-shape generator per (model archetype, technique) — e.g. CogVideoX-style attention input shapes
- Cross-arch numerical comparison (run reference on remote NVIDIA target, run new impl on remote Ascend target, diff)

**Files**:
- `scripts/agent-deploy/verify/cross-arch-compare.ts` (NEW)
- `data/techniques/<id>.yaml` extended with `verification_inputs[]` (canonical input shapes)

## Concrete implementation roadmap

| Version | Theme | Deliverables | Tests target |
|---|---|---|---|
| v3.24 | Doc cleanup + this spec | Archive 5 stale docs, rewrite README + ROADMAP, write this spec, add `Known limits` to README + HARNESS.md | unchanged (172) |
| v3.25 | Host-LLM mode + technique entity | `host-llm-adapter.ts` + `--use-host-llm` flag + `data/techniques/` + `synthesizeTemporaryBundle` + first technique YAML (sageattention) | 172 → ~190 |
| v3.26 | Remote-target executor | `remote-target.ts` + per-vendor build scripts + `~/.config/evokernel/targets.yaml` schema + dry-run integration | ~190 → ~210 |
| v3.27 | End-to-end on north-star scenario | Real run of `agent:deploy --technique sageattention --model cogvideox-1.5-5b --hardware ascend-910b --remote root@<ASCEND_910B_HOST> --use-host-llm` against the user's actual 910B server. Generated kernel compiles, runs, profiles, comes back with measured tok/s vs CUDA baseline. Cross-arch verify. agent-learning lands. | ~210 → ~225 |
| v3.28 | UI surface for harness state | Web dashboard for `agent:status` (browse past runs, drill into per-gap diagnostics, see auto-PR clusters); `/agents/runs/` page | ~225 → ~240 |

Each version is independently shippable; v3.27 is the milestone that closes the user's north-star scenario.

## Why this design (vs. the current one)

| Decision | Why |
|---|---|
| Host-LLM mode (not "always API key") | Codex + CC have first-class LLMs. Requiring an external key is friction that defeats the "one-click" promise. The harness should be a **thin orchestration layer** when running inside an LLM IDE, not a self-contained LLM client. |
| Technique entity (not "another op") | SageAttention isn't an op — it's a *recipe* that *applies* attention in a particular way. Modelling it as an op would conflate "what is the op" (attention) with "how do I implement it well on hardware X" (the technique). Separating these keeps op semantics clean. |
| HF auto-import for unknown models | The corpus can never cover every model. The realistic ask is "best-effort bundle from HF config", not "we'll add your model to corpus first then you can deploy". This unblocks long-tail use. |
| Remote SSH (not "user runs profiler manually + sets env var") | The current flow is a placeholder — real productized agents own the kernel-runner. SSH is the lowest-common-denominator integration that works with any hardware that has shell access. |
| Cross-arch verify (not "trust the per-op formal_semantics") | When porting a technique, the numerics that matter are *the technique's* (e.g. SageAttention's INT8+FP8 outliers), not the underlying op's. Cross-arch comparison is the only honest correctness check. |

## What this spec does NOT change

- Layer R / Layer P / Layer F architecture (already stable since v3.6 / v3.18)
- Corpus schema for hardware / models / ops / fused-kernels (no breaking changes)
- 5-layer hw-sw gap framework (still the right mental model)
- The 11 existing CLI commands (additive only — `--use-host-llm`, `--technique`, `--remote` flags)
- Existing tests (must continue passing)

## Open questions for v3.25+ implementation

1. **Host-LLM exchange protocol**: write to a file? STDIN/STDOUT? Anthropic Tool Use formats vs OpenAI JSON Schema? The CC vs Codex difference matters here.
2. **Technique YAML schema specifics**: does `port_targets` belong on the technique or on a separate `port-attempts` entity? (Suggest the latter once we have N>1 ports per technique.)
3. **Remote-target permission model**: SSH agent forwarding? Stored keys? Per-target auth config? Probably "use the user's existing `~/.ssh/config`" — least surprise.
4. **Cross-arch comparison floor**: what's an acceptable numerical difference between SageAttention CUDA and SageAttention Ascend-C ports? Probably `max_abs_diff < 1e-2` for FP16, but technique-author-specified is better.

These are surfaced explicitly so v3.25 implementation has a forcing function for each decision.
