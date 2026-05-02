---
description: Deploy any model to any hardware end-to-end via the v3.17 productized agent loop (Layer R/G/V/F). Reads $1 (model id) + $2 (hardware id) + optional flags, runs the full pipeline, surfaces verification + agent-learning results.
argument-hint: <model> <hardware> [--use-llm-orchestrator] [--workload chat|rag|code|math|long-context]
allowed-tools: Bash(pnpm agent:*), Bash(pnpm tsx scripts/agent-deploy/*), Bash(cat agent-deploy-output/*), Bash(ls agent-deploy-output/*), Read
---

# /agent-deploy — EvoKernel productized deploy

You will deploy `$1` (model) onto `$2` (hardware) using the EvoKernel v3.17 productized agent loop. This is **not** a planning-only flow — when `--use-llm-orchestrator` is in the args, real production kernels are generated, verified, and emitted with agent-learnings.

## Step 1 — Verify the (model, hardware) pair exists in the corpus

Run `pnpm agent:list-bundles -- --hardware $2` and check that `$1` is in the list. If not, surface the closest matches and ask the user to either correct the slug or build local bundles via `pnpm --filter @evokernel/web build`.

## Step 2 — Run the deploy

If args include `--use-llm-orchestrator`:

```bash
pnpm agent:deploy:productized --model "$1" --hardware "$2" $WORKLOAD_FLAGS
```

Otherwise (faster, no API key required, skeleton-only):

```bash
pnpm agent:deploy --model "$1" --hardware "$2" $WORKLOAD_FLAGS
```

## Step 3 — Surface results

After the run completes, show the user:

1. **Outcomes summary** — how many `shipped` / `partial` / `kernel-gap-blocked` (read from CLI stderr).
2. **Per-kernel verification summaries** — `cat agent-deploy-output/kernels-generated/*.verify.md` (only when productized mode ran).
3. **Agent-learnings ready for corpus** — `cat agent-deploy-output/agent-learnings-productized.md`. Tell the user: review, fill in any post-deploy perf actuals, then `git mv` the entries into `data/agent-learnings/<id>.yaml`.
4. **Production artifacts** — point to `agent-deploy-output/{Dockerfile,kubernetes/,monitoring/,runbook.md,sbom.json}` for the deployment side.

## Step 4 — Offer the closed-loop next step

If any kernel is `kernel-gap-blocked` after retries, suggest:
- Inspect `agent-deploy-output/kernels-generated/<filename>.verify.md` for the failure diagnostic chain.
- If the gap is a missing DSL example for `<arch_family>` — propose adding a new entry under `data/dsl-examples/`.
- If the gap is a numerical_rules violation — propose extending `formal_semantics.numerical_rules` for the op.

Both close the spec → plan → dev → test → **feedback** → spec cycle that distinguishes this productized agent from a vanilla MCP query service.

## Mode flags (environment)

- `ANTHROPIC_API_KEY` — required for **real-mode** code generation. Without it, falls back to skeleton-fallback mode (output is clearly marked).
- `EVOKERNEL_OFFLINE_ONLY=true` — disables the remote-bundle fallback. Reproducible builds set this.
- `EVOKERNEL_TEST_MODE=true` — deterministic stubs only, used by CI tests.

## When to use this vs. plain MCP query

| Need | Use |
|---|---|
| "What's the best engine for X on Y?" | MCP `query_hardware` / `solve` (no codegen) |
| "Generate the actual kernel for X on Y" | this command with `--use-llm-orchestrator` |
| "Iterate until the kernel passes verification" | this command (the V → F retry loop is built in) |
| "Land the result in the corpus" | this command emits an agent-learning YAML ready for `git mv` |
