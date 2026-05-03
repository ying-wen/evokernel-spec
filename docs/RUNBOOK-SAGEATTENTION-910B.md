# Runbook — port SageAttention to Ascend 910B + serve CogVideoX1.5-5B end-to-end

> **Status**: v3.27 — first end-to-end runbook for the v3.24 spec's north-star scenario.
>
> **What this is**: a step-by-step walkthrough that any fresh Claude Code or Codex session can execute (or that you can run yourself) to take SageAttention from CUDA reference impl → first-pass Ascend-C port → cross-arch numerical verify → on-device profiling → CogVideoX1.5-5B serving on Ascend 910B → local sanity test.
>
> **Honest expectation for the FIRST run**: the v3.27 harness will likely produce a *partial* outcome — generated kernel may compile but produce numerically-incorrect results, or fail Layer V cross-arch verify. That's *exactly what the Ralph-Loop architecture is for*: the first run produces an `agent-learning.yaml` capturing the failure; subsequent iterations refine. The point of v3.27 is making the loop runnable, not making the first iteration succeed.

## Prerequisites

1. **Local machine** (your laptop / dev box):
   - Node.js >= 22, pnpm >= 9
   - SSH access to your Ascend 910B server configured in `~/.ssh/config` with an alias (e.g. `Host my-ascend-910b ...`)
   - Optional: `ANTHROPIC_API_KEY` set if you want real-mode generation outside CC/Codex

2. **Ascend 910B server**:
   - CANN toolkit installed (`/usr/local/Ascend/ascend-toolkit/latest`)
   - `npu-smi info` works
   - `msprof` on PATH (or set `EVOKERNEL_PROFILER_MSPROF=/path/to/msprof`)
   - Python + PyTorch + torch_npu (for the CogVideoX serving step)
   - Internet access to `huggingface.co` (for downloading CogVideoX1.5-5B weights)
   - Disk: 50+ GB free (CogVideoX weights ~15GB, intermediate buffers ~10GB, work dirs ~5GB)

## Step 0 — One-time install (skip if already done)

```bash
# Local machine
git clone https://github.com/ying-wen/evokernel-spec.git
cd evokernel-spec
pnpm install
pnpm --filter @evokernel/web build              # builds 2176+ pre-bundled (model, hw) pairs

# Install harness as plugin (Codex bin + CC slash command)
pnpm agent:install -- --target both

# Health check — should be ~12 PASS / 0 FAIL (some WARNs OK)
pnpm agent:doctor
```

## Step 1 — Configure your SSH target

**This is the only step where YOUR private SSH host info enters the picture. It goes in `~/.config/evokernel/targets.yaml` which is git-ignored (see `docs/SECURITY-NOTES.md`). NEVER commit real host info to the repo.**

```bash
# Local machine
mkdir -p ~/.config/evokernel
cp scripts/agent-deploy/remote/targets.yaml.example ~/.config/evokernel/targets.yaml
$EDITOR ~/.config/evokernel/targets.yaml
```

Edit the `ascend-test` entry to match your real ssh-config alias:

```yaml
schema_version: '0.1'
targets:
  - id: my-ascend-910b                       # use this id as --remote argument
    hardware: ascend-910b                    # MUST match a corpus hardware id
    ssh: <your-ssh-config-alias>             # e.g. "my-ascend-910b" — defined in ~/.ssh/config
    toolchain:
      cann_version: '8.0.RC1'                # auto-detected on first connect
      profiler: msprof
      work_dir: /root/evokernel-work
```

**Tip**: use an `~/.ssh/config` alias rather than a raw `user@ip` so you can rotate keys without touching the targets config. Example:

```sshconfig
# ~/.ssh/config
Host my-ascend-910b
  HostName <your-real-ip-or-dns>
  User root
  IdentityFile ~/.ssh/your-key
  StrictHostKeyChecking accept-new
```

Then `targets.yaml` just references `ssh: my-ascend-910b`. Real IP stays out of any harness file.

## Step 2 — Verify the SageAttention technique loads

```bash
# Local machine
pnpm exec tsx -e "
  import('./scripts/agent-deploy/load-technique.js').then(async (m) => {
    const tech = await m.loadTechnique('sageattention');
    console.log('Loaded:', tech.name);
    console.log('Port targets:');
    for (const p of tech.port_targets) console.log('  ', p.arch_family, '→', p.status);
  });
"
```

Expected output:
```
Loaded: SageAttention
Port targets:
   hopper → reference-impl
   ada → production-ready
   ampere → experimental
   ascend-da-vinci-3 → planned     # ← this is the one we're going to attempt
   cdna3 → planned
   cambricon-mlu → planned
```

## Step 3 — Generate the first-pass Ascend-C port (host-LLM mode)

**Inside Claude Code or Codex** (the host LLM is detected via env vars; no `ANTHROPIC_API_KEY` required):

```bash
pnpm agent:deploy:productized \
  --use-host-llm \
  --technique sageattention \
  --model zai-org/CogVideoX1.5-5B \
  --hardware ascend-910b \
  --output ./out/sageattn-port
```

**Outside CC/Codex** (need `ANTHROPIC_API_KEY` for real-mode generation):

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm agent:deploy:productized \
  --technique sageattention \
  --model zai-org/CogVideoX1.5-5B \
  --hardware ascend-910b \
  --output ./out/sageattn-port
```

What this does:
1. Loads `data/techniques/sageattention.yaml`
2. Resolves `zai-org/CogVideoX1.5-5B` against corpus (likely synthesized — CogVideoX1.5-5B may not yet have a real `data/models/` entry, so v3.25's `synthesizeTemporaryBundle` builds an in-memory bundle from HF config + the ascend-910b hardware template)
3. Identifies the SageAttention port_target for `ascend-da-vinci-3` → status `planned`, summary "greenfield port"
4. Stage 5.5 productized loop: for each kernel-gap (attention op on ascend), generates Ascend-C code via host LLM
5. Layer V structural verify (V1 build-friendliness checks)
6. Emits to `./out/sageattn-port/`:
   - `kernels-generated/<op>_ascend-da-vinci-3.cce` (the Ascend-C kernel)
   - `kernels-generated/<op>_ascend-da-vinci-3.cce.verify.md` (V1 results)
   - `agent-learnings-productized.md` (one entry per gap, ready for triage)
   - `evokernel-deploy.json` (manifest with `ralph_loop_iterations[]`)

**What's likely to happen**: the LLM will produce *plausible-looking* Ascend-C code that may or may not actually port SageAttention's INT8 outlier-aware algorithm correctly. This is OK — the next steps are about discovering that.

## Step 4 — Inspect the generated kernel + decide if it's worth running

```bash
ls ./out/sageattn-port/kernels-generated/
cat ./out/sageattn-port/kernels-generated/*.cce
cat ./out/sageattn-port/kernels-generated/*.verify.md
```

Look for:
- Did the kernel cite SageAttention's INT8 + outlier path? (technique numerical_rules)
- Does it use Ascend Cube unit for INT8 MMA + Vector unit for outlier softmax?
- Are there any `// TODO` markers indicating skipped sections?

If the kernel looks like a stub or copy of the CUDA reference without porting effort, **skip to Step 8** (record agent-learning, iterate). If it looks like a genuine port attempt, proceed.

## Step 5 — Dry-run the SSH execution plan

```bash
pnpm agent:deploy --use-llm-orchestrator --use-host-llm \
  --technique sageattention \
  --model zai-org/CogVideoX1.5-5B \
  --hardware ascend-910b \
  --remote my-ascend-910b \
  --output ./out/sageattn-port
```

This emits a 7-step plan (ssh-check / mkdir / scp-up / build / run / profile / scp-down) with each command shown. Verify:
- The SSH alias resolves correctly
- The work_dir path is sensible
- The msprof invocation looks right for your CANN version

The plan is also persisted to `./out/sageattn-port/remote-plan.json` for replay / audit.

## Step 6 — Execute on the 910B

Once the dry-run plan looks right, add `--execute`:

```bash
pnpm agent:deploy --use-llm-orchestrator --use-host-llm \
  --technique sageattention \
  --model zai-org/CogVideoX1.5-5B \
  --hardware ascend-910b \
  --remote my-ascend-910b \
  --execute \
  --output ./out/sageattn-port
```

Halt-on-error semantics: if step N fails, the harness stops + prints the failure. You can re-run just the failed step manually using the persisted plan in `remote-plan.json`.

**Likely outcomes for FIRST run**:
- ✅ ssh-check passes
- ✅ mkdir succeeds
- ✅ scp-up succeeds
- ⚠ remote-build: the generated `.cce` file may have syntax errors; ccec compile fails → halt
- (if build succeeds) ⚠ remote-run: kernel produces wrong output → exits non-zero → halt
- (if both succeed) ⚠ remote-profile: msprof generates CSV → scp-down pulls it back

Each failure is captured + becomes the diagnostic chain for next iteration.

## Step 7 — (If profile pulled back) Feed into V3 perf gate

If Step 6 reached `scp-down`:

```bash
EVOKERNEL_MSPROF_INPUT_CSV=./out/sageattn-port/profile.csv \
  pnpm agent:deploy --use-llm-orchestrator --profile \
  --model zai-org/CogVideoX1.5-5B --hardware ascend-910b \
  --output ./out/sageattn-port-with-perf
```

The V3 perf gate parses the CSV (Cube/Vector utilization + GM/UB bandwidth) and reports a pass/fail against the `perf_score >= 0.5` gate. Cross-arch numerical compare (Step 8) is currently scaffold-only — **v3.28 wires the actual reference-vs-new-impl tensor-diff via remote-target**. For now, after `--execute` succeeds for compile + run, the `cross-arch-compare.ts` returns the plan with `ready_to_execute: false` (correct for v3.27).

## Step 8 — Land the agent-learning back in corpus

```bash
# Inspect the auto-generated learning
cat ./out/sageattn-port/agent-learnings-productized.md

# After triage (set triage_status, fill in actuals), move into corpus
mv ./out/sageattn-port/agent-learnings-productized.md \
   data/agent-learnings/sageattn-on-ascend-910b-$(date +%Y-%m-%d).yaml

# Validate
pnpm exec tsx scripts/validate-data.ts

# When 2+ independent runs cluster on the same observation:
pnpm agent:auto-pr -- --output ./pr-drafts.md
cat ./pr-drafts.md
```

The auto-PR clusters identify emergent patterns (e.g. "Ascend Cube unit underutilized for SageAttention's shape — SageAttention's INT8 MMA tile-size doesn't fit Cube's preferred 16x16x16; need to re-tile") that warrant either a corpus DSL example update or a `port_targets[].notes` update on `data/techniques/sageattention.yaml`.

## Step 9 — Serve CogVideoX1.5-5B on the 910B

This is the "actually use the model" step. Even if Step 6's port has issues, you can still serve CogVideoX1.5-5B with the *baseline* attention (CANN's built-in `aclnnFlashAttention` or PyTorch fallback) and have a working serving baseline to A/B against future SageAttention port iterations.

```bash
# SSH to the 910B
ssh my-ascend-910b

# (on the 910B) Set up a Python venv + install torch_npu + diffusers
python -m venv ~/cogvx-venv
source ~/cogvx-venv/bin/activate
pip install torch torch_npu diffusers accelerate transformers
# (Adjust torch versions per your CANN version's compatibility matrix)

# (on the 910B) Download + run CogVideoX1.5-5B
python -c "
from diffusers import CogVideoXPipeline
import torch
pipe = CogVideoXPipeline.from_pretrained(
    'zai-org/CogVideoX1.5-5B',
    torch_dtype=torch.bfloat16
).to('npu:0')
video = pipe('a serene mountain landscape at sunrise', num_inference_steps=50).frames[0]
print(f'Generated {len(video)} frames')
"
```

Expected first-run challenges (Ascend-specific):
- `torch_npu` version mismatch with `diffusers` — pin compatible versions per your CANN
- Some diffusers ops may fall back to CPU on Ascend — `npu-smi info` and check utilization during inference
- Memory pressure: CogVideoX1.5-5B is 5B params + a video has many timesteps; 64GB HBM may be tight at fp16 + long video

## Step 10 — Test from local

Once Step 9's pipeline runs on the 910B, expose it as a serving endpoint and test from your laptop:

```bash
# (on the 910B) Run a small FastAPI/Flask server wrapping the pipeline
# (Example skeleton; adjust to your auth model)
pip install fastapi uvicorn
cat > server.py <<'PY'
from fastapi import FastAPI
from diffusers import CogVideoXPipeline
import torch
app = FastAPI()
pipe = CogVideoXPipeline.from_pretrained('zai-org/CogVideoX1.5-5B', torch_dtype=torch.bfloat16).to('npu:0')

@app.post('/generate')
def gen(prompt: str, steps: int = 50):
    video = pipe(prompt, num_inference_steps=steps).frames[0]
    return {'frame_count': len(video)}
PY
uvicorn server:app --host 0.0.0.0 --port 8000
```

```bash
# (on local) Test the endpoint
curl -X POST 'http://my-ascend-910b:8000/generate?prompt=hello&steps=20' --max-time 600
```

Sanity checks:
- Response time should be roughly proportional to `steps × per-step-latency` (CogVideoX1.5-5B at ~50 steps × ~1-3s/step on 910B = 50-150s for a single video)
- `npu-smi info` on the 910B during the request should show one Ascend chip at high utilization
- If you ported SageAttention successfully (or by v3.28+ once cross-arch verify works), the per-step latency should drop ~30-50% vs the baseline

## What this runbook does NOT yet automate (v3.28+)

- **Step 9 + 10 fully automated**: serving + local-test orchestration. v3.28 will add `--serve` flag that templates a `serving_pipeline.py` + `client_test.sh` for the deployed model.
- **Cross-arch numerical verify executed**: v3.27 ships scaffold + tensor-diff utility; v3.28 wires the run-reference-on-Hopper-via-SSH-+-run-new-impl-on-Ascend-via-SSH-+-diff flow.
- **Iterative re-run on V failure**: v3.27's `feedback.ts:generateAndVerify()` retries up to 3× on Layer V failure but each retry is a fresh kernel generation — v3.29 will add diagnostic-aware iteration where the F-loop also updates the corpus DSL examples between retries.
- **Throughput / latency target enforcement**: v3.29 wires `--target-tok-s N` / `--target-latency-ms N` gates that fail the deploy if measured perf misses the target.

## Honest expectation summary

For the SageAttention/CogVideoX/910B north-star, v3.27 lets you:

| Step | v3.27 status |
|---|---|
| Local install + SSH config | ✅ One command (`agent:install` + edit `targets.yaml`) |
| Load technique YAML + plan port | ✅ One command (`agent:deploy --technique sageattention ...`) |
| Generate first-pass Ascend-C kernel | ✅ Via host-LLM in CC/Codex (no API key) |
| Dry-run SSH execution plan | ✅ One command (`--remote my-ascend-910b`) |
| Execute SSH plan on real 910B | ✅ NEW in v3.27 (`--execute` flag) |
| Build remotely | ✅ `scripts/agent-deploy/remote/ascend/build.sh` (auto-detects CANN env) |
| Run remotely + profile remotely | ✅ Per-vendor msprof invocation in plan |
| Pull profile back + feed V3 perf gate | ✅ `EVOKERNEL_MSPROF_INPUT_CSV` env hook |
| Cross-arch numerical verify (run reference + new + diff) | ⚠ Scaffold only; **v3.28** wires execution |
| Serve CogVideoX1.5-5B end-to-end | Manual (Step 9 above); **v3.28** automates via `--serve` |
| Local test sanity | Manual (Step 10 above); **v3.28** templates client test |

**The honest summary**: v3.27 makes the *workflow* runnable end-to-end. The *first run will likely produce a partial port that needs iteration*. That iteration is what the corpus + agent-learnings + auto-PR loop is for. The point isn't that v3.27 ports SageAttention to Ascend perfectly on the first try; the point is that v3.27 makes each iteration cheap and recorded.

## When this runbook fails

If you hit a step that doesn't work as documented, please open an issue with:
- Which step
- The exact command you ran
- The output (sanitized — no real SSH host info)
- What you expected
- The git commit you were on

The runbook is itself a piece of v3.27 — issues drive improvements, exactly like the Ralph-Loop architecture for the harness itself.
