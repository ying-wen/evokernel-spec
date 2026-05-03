# v3.28 — Real-deployment fixes from the SageAttention/CogVideoX/910B north-star run

> **Status**: Spec, 2026-05-03. Driven by two independent attempts at the v3.27
> RUNBOOK against a real Ascend 910B target (Codex run logged at
> `out/sageattn-port/RUNBOOK-EXECUTION-LOG.md`; Claude Code worktree run
> at `.claude/worktrees/friendly-villani-dc07a6/out/sageattn-port-mine/`).
> Both attempts hit the same six classes of failure plus two harness bugs.
> v3.28 closes those eight findings.
>
> **Theme**: stop the harness from silently no-op'ing on the runbook's
> central scenario. The runbook says "port SageAttention to Ascend, run on
> 910B." v3.27 says "all ops covered, ship it" without generating a single
> Ascend-C kernel. v3.28 makes that path actually do what the user asked.

## Why this spec exists (motivation)

Two LLMs (Codex and Claude Code) ran the v3.27 RUNBOOK against the same
real `<ASCEND_910B_HOST>` target. Both produced almost identical output:

- `evokernel-deploy.json`: `kernel_gaps_count: 0`, `outcome: "shipped"`
- `agent-learning.yaml`: `outcome: shipped`, observation
  `success-pattern`, predicted `53.1 tok/s` decode for a video diffusion model
- No `kernels-generated/` directory, no remote-plan.json, no `--execute`
  ever ran the SageAttention port

The harness convinced itself the deployment shipped without doing the
deployment. Worse, if a reviewer had moved that `agent-learning.yaml` into
the corpus, the false claim would persist as data.

This spec defines the eight findings, their root causes, the fix shape for
each, and the acceptance tests that prove the fix works.

## Findings (numbered for cross-reference)

### F1 — Diffusers repos 404 on `config.json`

**Symptom**: `pnpm agent:deploy ... --model zai-org/CogVideoX1.5-5B` fails
in Stage 1 with `Failed to fetch HF config (HTTP 404)`.

**Root cause**: `fetchHFConfig()` in `scripts/agent-deploy/index.ts:214-229`
unconditionally fetches `https://huggingface.co/<id>/raw/main/config.json`.
Diffusers repos do not have a root `config.json`; they have
`model_index.json` plus per-component subfolder configs (e.g.
`transformer/config.json`, `vae/config.json`).

**Fix**: when root `config.json` is 404, try `model_index.json`. If found,
follow `transformer` (or `unet` for older Diffusers models) to
`<component>/config.json`. Surface the Diffusers detection signal upward
so classification can switch into a video/image archetype branch.

**Acceptance**: `pnpm agent:deploy:productized --use-host-llm --technique
sageattention --model zai-org/CogVideoX1.5-5B --hardware ascend-910b
--output ./out/test` reaches Stage 2 without `--config`.

### F3 — Diffusers config misclassified as `dense-llm-small`

**Symptom**: `parsed_model.archetype: "dense-llm-small"`,
`attention_variant: "mha"`, `head_dim: 85` (which is `4096/48` — wrong
because `4096` is `text_embed_dim`, not the transformer's `d_model`).

**Root cause**: `classifyModel()` in `scripts/agent-deploy/index.ts:274-341`
reads `cfg.hidden_size`. Diffusers configs don't have a `hidden_size` field
— they have `attention_head_dim` (real head dim, e.g. 64) and
`num_attention_heads`. The classifier ignores `_class_name`
("CogVideoXTransformer3DModel") which is the strongest signal that this is
a video DiT, not an LLM.

**Fix**: when the config has `_class_name` or `_diffusers_version`, route
through a `classifyDiffusersModel()` branch that:

1. Sets `archetype` to `diffusion-video` or `diffusion-image` based on
   `sample_frames` / patch fields
2. Reads `attention_head_dim` and `num_attention_heads` directly
3. Computes `total_params_b` from `num_layers × (per_layer_attn +
   per_layer_ffn)` using `attention_head_dim × num_attention_heads` as
   d_model
4. Skips KV-cache computation (diffusion has no token-by-token decode)

The `ParsedModel` type gains an optional `diffusion_meta` field so
downstream perf prediction can switch units (frames/s vs tok/s) without
breaking the existing LLM path.

**Acceptance**: `parsed_model.archetype === "diffusion-video"` for
CogVideoX, `head_dim === 64`, `total_params_b ≈ 5` (close to the model's
"5B" naming).

### F4 — Technique `port_targets[].arch_family` doesn't match hardware-derived `arch_family`

**Symptom**: `evokernel-deploy.json` says `Technique "SageAttention" has
no port_target for arch "ascend"`. But `data/techniques/sageattention.yaml`
*does* declare a `planned` port for `ascend-da-vinci-3` — same chip family,
just labeled at the microarchitecture level.

**Root cause**: at `scripts/agent-deploy/index.ts:1011-1013`,
`arch_family` is derived as `hw.generation.split('-')[0]`, which yields
`ascend` for `generation: ascend-910-gen2`. But technique YAMLs use the
microarchitecture-level label (`ascend-da-vinci-3`, `cdna3`, `cambricon-mlu`).
For NVIDIA cards `hopper-gen1` happens to truncate to `hopper` which
matches by accident; the convention breaks for every other vendor.

**Fix**: hardware schema gains a new optional field `microarchitecture:
Slug`. Hardware YAMLs declare it explicitly:

| Hardware | `generation` | `microarchitecture` |
|---|---|---|
| `h100-sxm5` | `hopper-gen1` | `hopper` |
| `b200` | `blackwell-gen1` | `blackwell` |
| `ascend-910b` | `ascend-910-gen2` | `ascend-da-vinci-3` |
| `mi300x` | `cdna3-mi300` | `cdna3` |
| `mlu590` | `mlu-3.0` | `cambricon-mlu` |

`describeTechniquePortStatus()` accepts an array of candidate arch_family
strings (microarchitecture first, then truncated generation, then bare
vendor) and returns the first match.

**Acceptance**: `--technique sageattention --hardware ascend-910b` matches
the `planned` port_target on `ascend-da-vinci-3` and the summary string
contains `"planned port (greenfield)"`.

### F6 — `--technique` doesn't trigger kernel-codegen when generic gaps are zero

**Symptom**: even after F4 is fixed, the productized loop is gated on
`if (gapsReport.gaps.length > 0 && useLlmOrchestrator)`. Generic gap
detection looks at coverage matrix for `ascend` — finds nothing missing
(library covers attention) — gaps = 0 — productized loop never runs even
though we explicitly asked for a SageAttention port.

**Root cause**: the technique-driven path is bolted on top of the generic
coverage-gap path, not parallel to it. v3.26 added technique loading but
did not add a force-port-when-status-is-planned bypass.

**Fix**: when `--technique` is passed and the matched port_target has
status `planned` or `experimental`, synthesize a virtual gap entry per
`technique.applicable_to.ops` so the productized loop runs. The gap's
`reason` field becomes `"technique-driven port"` so downstream artifacts
(agent-learning, kernels-generated/) record provenance.

**Acceptance**: same Step 3 command produces `kernels-generated/` with at
least one `.cce` file and `agent-learnings-productized.md`.

### F8 — Auto-generated `agent-learning.yaml` claims `outcome: shipped` for unrun deployments

**Symptom**: when no `--execute` ran (and no actual deployment happened),
`agent-learning.yaml` still says `outcome: shipped` and observation
`success-pattern`. Predicted `53.1 tok/s` for a video model.

**Root cause**: hardcoded literal `outcome: shipped` at
`scripts/agent-deploy/index.ts:793`. The stub generator has no awareness
of execution state.

**Fix**: take an explicit `execution_state` parameter:

```ts
type ExecutionState =
  | 'planning-only'         // no kernels generated; no remote attempt
  | 'kernels-generated'     // kernels exist; remote not attempted
  | 'remote-attempted'      // --execute ran but did not complete all 7 steps
  | 'remote-completed'      // all 7 steps green
  | 'serving-validated'     // Step 9/10 green
```

Map state → `outcome`:

- `planning-only` → `outcome: planning-only` (new enum value)
- `kernels-generated` → `outcome: kernels-generated`
- `remote-attempted` → `outcome: partial`
- `remote-completed` → `outcome: shipped`
- `serving-validated` → `outcome: shipped`

The agent-learning schema in `schemas/agent-learning.ts` gains the two new
enum values. Existing literature in `data/agent-learnings/` is unaffected
because they all set `outcome` explicitly.

**Acceptance**: when Step 6 fails or is not run, the resulting
`agent-learning.yaml` says `outcome: planning-only` or `outcome:
kernels-generated`, never `shipped`.

### F9 — Executor `<local>` placeholder never substituted

**Status**: ALREADY FIXED in this worktree (see prior session diff at
`scripts/agent-deploy/remote-target.ts`). v3.28 lands the fix and the
regression test (`scripts/tests/v3-28-execute-substitution.test.ts`).

**Root cause**: `executeRemoteRun` passed `<local>` placeholder verbatim
to `bash -c`. Bash interpreted `<local>` as input redirection from a file
named `local` → `bash: local: No such file or directory`.

**Fix**: materialize kernels into a tmpdir, substitute `<local>` →
tmpdir before invoking bash.

### F10 — Ascend `build.sh` has multiple CANN-version bugs

**Status**: ALREADY FIXED in this worktree (see prior session diff at
`scripts/agent-deploy/remote/ascend/build.sh`).

**Root cause**: chip-name regex didn't match real `npu-smi` output;
`ccec --target Ascend910B` is not a real ccec flag (real is
`--cce-aicore-arch=...`); `ccel` fallback is a fictional binary; no .cpp
fallback for skeleton-mode kernels.

**Fix**: parse `npu-smi info` for chip name (handles `910B1`, `910A`,
`950`); map to `--cce-aicore-arch=<dav-c220-cube|...>`; fallback to g++
for non-aicore .cpp; emit stub `./bench` if both fail so downstream
profile/scp-down still complete (with 0% AI Core util — visible signal,
not a halt).

### F11 — Step 9 install instructions install CUDA, not Ascend

**Symptom**: `pip install torch torch_npu diffusers accelerate
transformers` on aarch64 default Python (3.13) resolves `torch==2.11.0`
and pulls `nvidia-cublas`, `nvidia-cudnn`, etc. — completely wrong stack
for an Ascend deployment.

**Root cause**: the runbook's Step 9 prose is unpinned. PyTorch's
`torch_npu` adapter pins specific `torch` versions; without pinning, pip
picks generic latest which has CUDA deps.

**Fix**: rewrite `docs/RUNBOOK-SAGEATTENTION-910B.md` Step 9 with:

1. Use Python 3.9 venv (matches CANN's tested matrix)
2. Pin `torch==2.4.0 torch_npu==2.4.0.post2`
   (or whatever pair matches your CANN version — read
   `/usr/local/Ascend/.../version.info`)
3. Use China region pip mirror when `<ASCEND_910B_HOST>` is in CN region
   (`-i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple` or similar)
4. Add a Dockerfile alternative that pre-bakes the env to avoid network
   dependency entirely

**Acceptance**: a fresh CN-region 910B can complete Step 9 install in
under 5 minutes.

## Out of scope for v3.28

Deferred to v3.29+:

- **Cross-arch numerical verify execution** (already deferred; spec says
  v3.28; we're realistic — tensor-diff utility is here, but the
  run-on-Hopper-via-SSH-and-diff orchestration remains scaffold).
- **Iterative re-run on V failure with corpus DSL update** (v3.29).
- **`--target-tok-s N` / `--target-frame-s N` perf gates** (v3.29).
- **Auto-generation of HF model entry into `data/models/`** when fetched
  from HF (we don't yet write `data/models/zai-org-cogvideox1-5-5b.yaml`
  even after a successful classify — manual import is still required).

## Implementation order (dependencies first)

1. **F8** (1 hour) — small isolated change to `generateAgentLearningStub`
   signature; unblocks honest reporting in subsequent fixes' tests.
2. **F4** (2 hours) — schema field + 5 hardware YAML edits + lookup
   change. No surface-area risk.
3. **F1** (1 hour) — `fetchHFConfig` extension; touches one function and
   adds two follow-up fetches.
4. **F3** (3 hours) — biggest of the v3.28 fixes. Adds
   `classifyDiffusersModel` branch and `diffusion_meta` to ParsedModel.
   Risk: must not break the dense-LLM path. Gate on `_class_name` /
   `_diffusers_version` presence.
5. **F6** (1 hour) — synthesize virtual gaps from technique
   `applicable_to.ops` when port status is `planned`. Trivial after F4.
6. **F11** (30 minutes) — RUNBOOK prose rewrite of Step 9.
7. **Verify**: re-run RUNBOOK Step 3 — must produce `kernels-generated/`,
   `outcome: kernels-generated` (not `shipped`), and the technique-
   context summary must say "planned port (greenfield)".

## Acceptance test (full v3.28 release gate)

```bash
# Reset
rm -rf out/sageattn-port-v328-test

# Re-run RUNBOOK Step 3 verbatim — no --config workaround needed
pnpm agent:deploy:productized \
  --use-host-llm \
  --technique sageattention \
  --model zai-org/CogVideoX1.5-5B \
  --hardware ascend-910b \
  --output ./out/sageattn-port-v328-test

# Must hold:
test -d out/sageattn-port-v328-test/kernels-generated
test -f out/sageattn-port-v328-test/kernels-generated/*.cce
grep "diffusion-video" out/sageattn-port-v328-test/evokernel-deploy.json
grep "ascend-da-vinci-3" out/sageattn-port-v328-test/evokernel-deploy.json
grep "planned port (greenfield)" out/sageattn-port-v328-test/evokernel-deploy.json
grep "outcome: kernels-generated" out/sageattn-port-v328-test/agent-learning.yaml
! grep "outcome: shipped" out/sageattn-port-v328-test/agent-learning.yaml
```

If all eight assertions pass, v3.28 is shippable.

## Risk register

| Risk | Probability | Mitigation |
|---|---|---|
| F3 breaks the dense-LLM classification path | medium | Branch only when `_class_name` / `_diffusers_version` present; existing 250+ tests guard the LLM path. |
| F4 hardware YAML edits ripple through SSG pages | low | `microarchitecture` is optional; pages render the existing `generation` field today. Add as additive field. |
| F8 enum extension breaks existing `data/agent-learnings/` validation | low | Existing entries set `outcome` explicitly to one of the original values; extending the union is backward compatible. |
| F1 loops forever on weird Diffusers repos | low | Cap follow-up fetches at 2 (model_index → component config). No recursion. |

## Honest closing note

The biggest meta-insight from this exercise: **two LLMs running the same
runbook against the same real target produced the same false-positive.**
That suggests the harness's failure mode is structural, not LLM-specific.
The fix isn't "better prompting" — it's the eight findings above.

If we ship v3.28 without F3 (Diffusers classification), then v3.29's
"automate Step 9 serving" will inherit the same problem: the harness will
predict tok/s for video models, miscount params, and produce serving
artifacts shaped for chat workloads. F3 is the one that truly unblocks the
north-star scenario.
