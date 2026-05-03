---
description: 通过 v3.17+ productized 流水线 (Layer R/G/V/F) 端到端把任意模型部署到任意硬件。读取 $1 (model id) + $2 (hardware id) + 可选 flags，跑完整 pipeline，输出 verification + agent-learning 结果。
argument-hint: <model> <hardware> [--use-llm-orchestrator] [--profile] [--workload chat|rag|code|math|long-context]
allowed-tools: Bash(pnpm agent:*), Bash(pnpm tsx scripts/agent-deploy/*), Bash(cat agent-deploy-output/*), Bash(ls agent-deploy-output/*), Read
---

# /agent-deploy — EvoKernel productized 部署 (中文版)

把 `$1` (model) 部署到 `$2` (hardware)。**不仅仅是 planning** — 当 args 包含 `--use-llm-orchestrator` 时, 真正的生产 kernel 会被生成、验证、并写出 agent-learning.

**注意**: 本命令是 [`.claude/commands/agent-deploy.md`](../agent-deploy.md) 的中文翻译版。两者在 `.claude/commands/` 与 `~/.claude/commands/` 下都可用 — 用户可以根据语言习惯选择.

## 第 1 步 — 检查 (model, hardware) 对在 corpus 中存在

执行 `pnpm agent:list-bundles -- --hardware $2` 并确认 `$1` 在列表里. 如果不在, 列出最接近的候选并提示用户:
- 修正 slug, 或
- 跑 `pnpm --filter @evokernel/web build` 重新生成本地 bundle

可以先跑 `pnpm agent:doctor` 做一次 12-check 健康诊断，避免环境问题导致后续步骤失败.

## 第 2 步 — 跑 deploy

如果 args 包含 `--use-llm-orchestrator`:

```bash
pnpm agent:deploy:productized --model "$1" --hardware "$2" $WORKLOAD_FLAGS
```

否则 (skeleton-only, 不需要 API key, 更快):

```bash
pnpm agent:deploy --model "$1" --hardware "$2" $WORKLOAD_FLAGS
```

如果 args 还包含 `--profile` (v3.21+): V3 perf gate 进入 execution 模式 — 自动检测 NCU/rocprof/msprof/cnperf 并调用. v3.22-23 已实现 4 个 vendor parser.

## 第 3 步 — 展示结果

deploy 完成后, 给用户呈现:

1. **Outcomes 总结** — `shipped` / `partial` / `kernel-gap-blocked` 各多少 (从 CLI stderr 读取)
2. **每个 kernel 的 verification 摘要** — `cat agent-deploy-output/kernels-generated/*.verify.md` (仅在 productized 模式下产生)
3. **Agent-learnings 待写入 corpus** — `cat agent-deploy-output/agent-learnings-productized.md`. 提示用户: 检查 + 填入实测 perf 数据, 然后 `git mv` 到 `data/agent-learnings/<id>.yaml`
4. **Production artifacts** — 指向 `agent-deploy-output/{Dockerfile,kubernetes/,monitoring/,runbook.md,sbom.json}` 用于实际上线部署
5. **Manifest** (v3.18+) — `cat agent-deploy-output/evokernel-deploy.json` 一个文件包含本次 deploy 的全部 provenance

## 第 4 步 — 提供 closed-loop 下一步

如果某个 kernel 在重试后仍然 `kernel-gap-blocked`, 提示用户:
- 看 `agent-deploy-output/kernels-generated/<filename>.verify.md` 找到失败的 diagnostic chain
- 如果是 `<arch_family>` 缺 DSL example → 建议在 `data/dsl-examples/` 加一个新 entry
- 如果是 `formal_semantics.numerical_rules` 没覆盖到的边界 → 建议扩展 op entry 的 numerical_rules

两者都闭合 spec → plan → dev → test → **feedback** → spec 这个循环 — 这是 productized agent 与普通 MCP query 服务的核心差异.

## 模式 flags (env)

- `ANTHROPIC_API_KEY` — productized real-mode 必需. 不设置则 fallback 到 skeleton 模式 (输出会显式标注)
- `EVOKERNEL_OFFLINE_ONLY=true` — 禁用 remote bundle fallback. 可复现 build 必设
- `EVOKERNEL_TEST_MODE=true` — 确定性 stub, CI/test 用
- `EVOKERNEL_NCU_INPUT_CSV=path/to/ncu.csv` — v3.22 NCU 解析路径
- `EVOKERNEL_ROCPROF_INPUT_CSV=path/to/rocprof.csv` — v3.23 AMD
- `EVOKERNEL_MSPROF_INPUT_CSV=path/to/msprof.csv` — v3.23 华为
- `EVOKERNEL_CNPERF_INPUT_CSV=path/to/cnperf.csv` — v3.23 寒武纪

## 何时用本命令 vs 单纯 MCP query

| 需求 | 用什么 |
|---|---|
| "X 在 Y 上最佳 engine 是什么?" | MCP `query_hardware` / `solve` (无 codegen) |
| "给 X × Y 生成实际 kernel" | 本命令 + `--use-llm-orchestrator` |
| "迭代到 kernel 通过 verification" | 本命令 (V → F retry loop 内置) |
| "把结果落到 corpus" | 本命令输出 agent-learning YAML, 等 `git mv` |
| "持续根据 corpus 变化重新部署" | `pnpm agent:watch` (v3.22+) |
