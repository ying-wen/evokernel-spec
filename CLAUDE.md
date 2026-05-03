# CLAUDE.md — EvoKernel Spec project guide for Claude Code

> Project-specific instructions for Claude Code agents working on this repo.
> Reads CLAUDE.md before any task. For human-readable overview see [README.md](README.md);
> for detailed dev workflow see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Project shape (2026-05-04, v3.23 — see [README.md](README.md) + [docs/ROADMAP.md](docs/ROADMAP.md) for full state)

EvoKernel Spec has two parts:

1. **Structured knowledge base** — 419 entities across 24 entity types covering AI inference hardware × models × ops × DSL examples × deployment cases. 608 SSG pages + 21 JSON API endpoints. Stable since v3.0.

2. **Productized agent harness** (v3.17 → v3.23, 7 release iterations) — 11 CLI commands (`agent:deploy`, `:productized`, `list-bundles`, `auto-pr`, `install`, `doctor`, `status`, `watch`, ...), 12 MCP tools, 2 plugin executables (Codex `evokernel-deploy` Node binary + Claude Code `/agent-deploy` slash command in en + zh), 4/6 vendor profiler parsers wired (NCU + rocprof + msprof + cnperf). 172 harness tests + 49 web tests = 221 total, all green.

**v3.24+ direction**: see [`docs/superpowers/specs/2026-05-04-real-productized-agent.md`](docs/superpowers/specs/2026-05-04-real-productized-agent.md) — closes the gaps user feedback called out (host-LLM mode so no `ANTHROPIC_API_KEY` needed inside CC/Codex; HF auto-import for unknown models; `data/techniques/` entity for porting research libraries; SSH remote-target executor; cross-arch numerical verify).

**🔒 Security note for AI agents working here**: see [`docs/SECURITY-NOTES.md`](docs/SECURITY-NOTES.md). Never commit real API keys, real SSH host IPs, or real credentials. Use placeholders (`<ASCEND_910B_HOST>`, `sk-ant-...`) in docs and config files.

### Original project description (kept for context)

EvoKernel Spec is a **structured knowledge base** that lets an AI agent take
**any model** and ship it on **any hardware** — by combining 419+ data entities,
a productized agent CLI (v3.17+), and a feedback loop that grows the corpus
from real deployment runs.

### Three layers

```
┌────────────────────────────────────────────────────────────────────┐
│ Layer 1 — Data (data/*.yaml)                                       │
│   16 entity types, ~360 entries, 100% Layer D coverage on ops/     │
│   fused-kernels (formal_semantics: signature + edge_cases +        │
│   numerical_rules + reference_impl)                                │
├────────────────────────────────────────────────────────────────────┤
│ Layer 2 — Surfaces (apps/web/, plugins/)                           │
│   505 SSG pages · 21 JSON API endpoints · 4 plugins (MCP, Claude   │
│   Code, Cursor, Codex)                                             │
├────────────────────────────────────────────────────────────────────┤
│ Layer 3 — Agent (scripts/agent-deploy/)                            │
│   7-stage CLI pipeline: fetch model → query corpus → feasibility   │
│   → plan → kernel-codegen → verification → production artifacts.   │
│   Stage 8 (v2.24): emit agent-learning.yaml stub for feedback.     │
└────────────────────────────────────────────────────────────────────┘
```

### The 5-layer hw-sw gap framework

When reasoning about cross-hardware ports, every op/kernel maps to 5 layers:

| Layer | What | Example |
|---|---|---|
| A — ISA primitive | The actual silicon instruction | `nvidia-hopper-wgmma`, `huawei-ascend-cube`, `cambricon-mlu-mma` |
| B — DSL | How you write a kernel | CUDA C++, Ascend-C, HIP, BANG-C, Triton |
| C — Kernel library | Vendor-blessed packaged paths | cuBLAS, CUTLASS, aclnn, rocBLAS |
| D — Formal semantics | Correctness rules across vendors | Per-op `formal_semantics.numerical_rules` |
| E — Coverage matrix | Which (op × arch) cells are filled | `data/coverage-matrix.ts` |

When you write code or data, identify which layer it lives in. The agent's
recommendations chain through all 5.

---

## Three operating modes

### Mode 1 — Add or fix data (most common)

```
data/<entity-type>/<slug>.yaml          # Edit YAML
pnpm exec tsx scripts/validate-data.ts  # Schema check
pnpm --filter @evokernel/web build      # Site rebuild (catches render errors)
```

**Schema is enforced.** New fields require updating `schemas/*.ts` first,
then propagating to `apps/web/src/lib/data/index.ts` loaders if the field
is consumed at render time.

### Mode 2 — Add a feature / page

```
apps/web/src/pages/<route>.astro        # New route (SSG by default)
apps/web/src/components/<ui>.tsx        # React islands (client-only as needed)
apps/web/tests/<feature>.test.ts        # Vitest unit (preferred)
                                        # or playwright E2E for visual flows
```

See [docs/DEVELOPMENT.md § Adding a New Page or Route](docs/DEVELOPMENT.md#adding-a-new-page-or-route).

### Mode 3 — Extend the agent / plugins

```
scripts/agent-deploy/                   # CLI agent pipeline
plugins/{mcp-server,claude-code-skill,cursor-rules,codex}/
schemas/agent-learning.ts               # Knowledge-feedback schema
```

The agent is the production surface. Changes here go through:
1. Update `kernel-codegen.ts` / `index.ts` / plugin code
2. Run `pnpm --filter @evokernel/scripts test` (11 dispatch assertions)
3. Verify CI `agent-regression` job passes
4. If touching ISA primitive cross-vendor mappings: hand-verify on at least
   one new (op, arch) pair before merging.

---

## Decision rules for AI agents working on this repo

### When to add a new ISA primitive (Layer A)

- A real instruction or programming-model unit is missing from `data/isa-primitives/`
- AND a real `cross_vendor_equivalents` mapping ratio is documentable
- AND at least one fused-kernel or operator references it via `used_by_kernels`

Example: v2.21 added `huawei-ascend-vector-fp32` because the `qwen3-6-on-ascend`
agent-learning surfaced it as a missing-primitive observation. Always document
provenance in the entry's `notes:` field when the source is a feedback loop run.

### When to add a new DSL example (Layer B)

- Demonstrates a structural pattern not already covered (we have GEMM × 5
  archs already; new = attention/norm/scatter/collective shape)
- Compiles in principle (use the build_command field; CI doesn't actually
  compile but readers will)
- Includes a `walkthrough` field — at least 5 steps, each ≤ 2 sentences
- Cross-references at least 1 ISA primitive and 1 kernel library

### When to add `formal_semantics` to an op or fused-kernel

You're done when:
- `signature:` is a 1-3 line type signature (PyTorch-ish or pseudocode)
- `edge_cases:` covers 2-4 cases where libraries diverge (named libraries
  in `behaviors:` map; mitigation written for the human reviewer)
- `numerical_rules:` covers 1-2 dtype/precision rules with `per_library:` map
- `reference_impl:` has a working PyTorch snippet (does not need to compile;
  must be readable)

For fused kernels, also include `fusion_lifecycle:` (one of: `compile-time-template`,
`jit-trace`, `runtime-graph`, `manual-kernel`) and `unfused_penalty:` prose
explaining the HBM round-trip cost.

### When to add an `agent-learning` entry

- A real (or simulated) deployment ran
- Captured at least 1 structured `observation` (kind from the 8-element enum)
- Has at least the model_id, hardware_id, engine_id, outcome
- `triage_status: open` initially — set to `merged` only when a corpus update
  derived from the observation has actually landed (link via `evidence:` field)

This is the **knowledge feedback loop**. Every agent run is an opportunity
to write back what it learned.

---

## Common pitfalls (and how to avoid)

### 1. YAML apostrophe trap

`'foo's bar'` breaks YAML parse. Use double-quotes: `"foo's bar"`.
Found this 3 times in the v2.x arc — common enough to call out.

### 2. Schema drift between schemas/ and data/

If you add a field to `schemas/operator.ts`, you must also:
- Run `pnpm exec tsx scripts/validate-data.ts` to confirm no entries break
- Update `apps/web/src/lib/data/index.ts` if the field is consumed in pages
- Update `apps/web/src/pages/operators/[slug].astro` if the field is rendered

### 3. Cross-references must resolve

Every `engine_id`, `hardware_arch`, `vendor`, `op_or_kernel` reference must
match an existing ID. `validate-data.ts` catches dangling-evidence-ref but
not all cross-refs. Run `pnpm audit:data` for the complete pass.

### 4. Don't break the dispatch tests

`scripts/tests/kernel-codegen-dispatch.test.ts` has 11 assertions on
`classifyOp()` and `emitCudaInnerByOpClass()`. If you change either function,
re-run the test and update assertions if the comment text changes.

### 5. Never `git checkout -- pnpm-lock.yaml`

🚨 **Critical lesson learned in v3.2 (2026-05-03)**: when `plugins/mcp-server/package.json` or any other package.json adds dependencies, `pnpm-lock.yaml` updates with them. Reverting the lockfile (because it "looked like a transient diff") breaks CI:

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because
pnpm-lock.yaml is not up to date with <ROOT>/plugins/mcp-server/package.json
```

This regression silently broke CI + Pages auto-deploy for 8 releases (v2.24 → v3.1) — the live site was stuck while the local repo kept advancing. **Always commit lockfile changes alongside the package.json changes that triggered them.** If the diff is genuinely transient (e.g., timestamp-only churn), inspect it first; usually it's real.

After every release, verify: `gh run list --workflow pages.yml --limit 1` should show `success`.

### 6. Keep agent-learning entries terse

The 3 seed entries in `data/agent-learnings/` are 50-100 lines each. Don't
write essays; the structured fields (kind, op_or_kernel, evidence,
proposed_corpus_update) are what the agent queries. Long `notes:` fields
are fine for human readers but don't drive automation.

---

## Build commands quick reference

```bash
pnpm install                                    # Install (workspace root)
pnpm exec tsx scripts/validate-data.ts          # Schema check (~3s)
pnpm --filter @evokernel/scripts test           # Dispatch unit tests (11 assertions)
pnpm --filter @evokernel/schemas test           # Schema unit tests
pnpm --filter @evokernel/web test               # Web unit tests
pnpm --filter @evokernel/web build              # Full SSG build (~7s, 505 pages)
pnpm --filter @evokernel/web dev                # Dev server (localhost:4321)
pnpm exec tsx scripts/agent-deploy/index.ts \   # Agent CLI (requires running site for Stage 2 API)
  --model <hf-id> --hardware <hw-slug> --workload chat
```

---

## Ralph loop pattern (what we use for autonomous iteration)

This project uses the **Ralph loop** for autonomous Claude Code iteration:
on session stop, the same recurring directive ("持续完善...") is fed back to
the agent. Productive Ralph loop sessions look like:

1. **Survey** — git log, file counts, what's changed since last iteration
2. **Identify the highest-leverage gap** — usually the worst-coverage entity
   field, or the most-recent agent-learning observation
3. **Ship a focused minor release** (v2.x.y) — one theme, < 1000 LOC diff
4. **Update CHANGELOG, ROADMAP, README** — keep the story current
5. **Tag + push** — production CI catches regressions

The v2.18 → v2.24 arc was 7 releases in one autonomous session. Each had a
narrow theme (op-class codegen, collective ops, DSL expansion, fused-kernel
depth, knowledge writeback). **Don't try to ship more than one theme per
release** — the constraint forces good factoring.

---

## Where to look when you're stuck

| Symptom | Read |
|---|---|
| Schema validation fails | `schemas/<entity>.ts` (zod definitions) |
| Page won't render new data | `apps/web/src/lib/data/index.ts` (loader) + `apps/web/src/pages/<route>.astro` (consumer) |
| Agent dispatch wrong | `scripts/agent-deploy/kernel-codegen.ts` `classifyOp()` |
| CI agent-regression fails | `.github/workflows/ci.yml` `agent-regression` job, then the failing test |
| Cross-vendor mapping unclear | `data/isa-primitives/<vendor>-*.yaml` `cross_vendor_equivalents:` |
| Plugin behavior surprising | `plugins/mcp-server/index.ts` (the canonical one; others mirror) |
| What changed in vN | `CHANGELOG.md` |
| Future direction | `docs/ROADMAP.md` |
| Real deployment learnings | `data/agent-learnings/` + `/agents/learnings/` page |

---

## Useful project-specific facts

- **Hardware slugs** are kebab-case based on the marketing name + form factor:
  `h100-sxm5`, `mi300x`, `ascend-910c`, `mlu590`, `b200`. Always lower-case.
- **Op IDs** match the model-architecture nomenclature: `attention`, `mla-attention`,
  `expert-permute`, `paged-attention-decode`. **Not** PyTorch op names.
- **Engine IDs** are short: `vllm`, `sglang`, `mindie`, `trtllm`, `lmdeploy`, `mori`, `hanguangai`.
- **Quantization slugs**: `bf16`, `fp16`, `fp8-e4m3`, `fp8-e5m2`, `nvfp4`, `mxfp4`, `int8`,
  `int4-awq`, `int4-gptq`. Don't invent new ones; extend `data/quantizations/` first.
- **Pipeline stages** (`applies_at_stage`): `acquire`, `convert`, `quantize`, `compile`,
  `shard`, `serve`, `observe`. 7 stages, fixed.
- **Fusion lifecycle**: `compile-time-template`, `jit-trace`, `runtime-graph`, `manual-kernel`.
  4 enum values, fixed. **`runtime-fused` is NOT valid** (don't invent it; v2.18 trap).
