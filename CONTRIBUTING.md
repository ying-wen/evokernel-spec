# Contributing to EvoKernel Spec

感谢你考虑贡献! 本项目的每个数据条目都需要 **evidence** 引证, 我们才能保持长期可信。

> **For Claude Code agents working on this repo**: read [CLAUDE.md](CLAUDE.md)
> first. It captures project-specific decision rules, common pitfalls, and the
> Ralph loop iteration pattern.

> **For dev workflow** (architecture, build commands, debugging tips, performance
> budget): see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## 五种贡献入口

### 1. 修正数据 / 补充字段 (最简单)

发现某个硬件规格写错了? 缺数据? 直接提 PR:

1. Fork 仓库
2. 编辑相应的 `data/**/*.yaml`
3. 在 `evidence:` 下加一条引证 (来源 URL + 引用文字 + tier)
4. 本地跑 `pnpm validate` 确认 schema 通过
5. 提 PR

### 2. 新增硬件 / 模型 / 服务器

走 GitHub issue → 讨论 → PR 流程:

1. 开 issue: 选 "新增硬件" / "新增模型" 模板
2. 等 maintainer 反馈 (通常 24h 内)
3. 一旦 maintainer 确认有价值, fork + 创建 yaml + 提 PR
4. PR 必须满足:
   - schema 校验通过 (CI 自动)
   - 至少 1 条 evidence (建议 2+)
   - 命名 kebab-case
   - 利益冲突已声明

### 3. 新增部署案例 (case)

这是最有价值的贡献——真实跑出来的实测数据。

1. **必须**: 完整的 stack 配置 (硬件、模型、引擎、量化、并行)
2. **必须**: reproduction 步骤 (命令、配置文件)
3. **必须**: raw log URL (gist / pastebin / s3)
4. **必须**: `contributor_attestation` 声明 ("I personally ran this on...")
5. tier 设为 `measured`

参考 [`data/cases/2026/04/llama4-scout-on-h100x8-vllm-bf16.yaml`](data/cases/2026/04/llama4-scout-on-h100x8-vllm-bf16.yaml) 作为模板。

### 4. 添加 Layer D `formal_semantics` (高价值, v2.5+)

每个 op + fused-kernel 都可以有一个 `formal_semantics` block, 让 agent 在
跨硬件 port 时能形式化推理 numerical correctness:

```yaml
formal_semantics:
  signature: |
    op_name(args) -> output       # 1-3 行 type signature
  fusion_lifecycle: manual-kernel  # 仅 fused-kernel; 4 enum 值之一
  unfused_penalty: |               # 仅 fused-kernel
    HBM round-trip cost description
  edge_cases:
    - input: 'edge case prose'
      behaviors:
        library-name: 'how this lib handles it'
      mitigation: 'what reviewer should do'
  numerical_rules:
    - aspect: 'precision_or_dtype_concern'
      per_library:
        lib1: 'what lib1 does'
        lib2: 'what lib2 does'
      notes: 'when this matters'
  reference_impl:
    framework: pytorch
    snippet: |
      def op_name(args):
          # readable PyTorch reference
          return ...
```

**质量 bar**:
- `signature` 必填, 1-3 行
- `edge_cases` 至少 2 个 (libraries 真正分歧的地方)
- `numerical_rules` 至少 1 个 dtype/precision 规则
- `reference_impl.snippet` 必须可读 (不要求可编译)

参考: [`data/operators/silu.yaml`](data/operators/silu.yaml) (op),
[`data/fused-kernels/flash-attention-v3.yaml`](data/fused-kernels/flash-attention-v3.yaml) (fused).

详见 [CLAUDE.md § "When to add `formal_semantics`"](CLAUDE.md#when-to-add-formal_semantics-to-an-op-or-fused-kernel).

### 5. 提交 agent-learning (知识反馈回路, v2.20+)

跑过 `scripts/agent-deploy/` agent CLI? 输出目录有一个
`agent-learning.yaml` stub. 跑完实际部署后:

1. 填入 `decode_tok_per_s_actual`, `cost_per_m_tokens_actual`, `worst_delta_pct`
2. 添加 post-deploy `observations` (perf-cliff / numerical-mismatch /
   missing-primitive / fusion-opportunity)
3. 把 yaml 移到 `data/agent-learnings/`
4. `pnpm exec tsx scripts/validate-data.ts` 验证 schema
5. 提 PR; 通过后 `/agents/learnings/` 页面会 surface 它

每个 agent-learning 是一次知识沉淀回流的机会. 如果观察导致 corpus
更新 (新增 ISA primitive / fused-kernel / fusion edge case), 把对应
observation 的 `triage_status` 改为 `merged` 并在 `proposed_corpus_update`
里链接 PR.

参考: [`data/agent-learnings/qwen3-6-on-ascend-910c-2026-05-02.yaml`](data/agent-learnings/qwen3-6-on-ascend-910c-2026-05-02.yaml)
是第一个完整的反馈回路 closure 样例 (open → merged 全流程).

## Evidence Tier 标准

每条 evidence 必须有 tier:

- **`official`** 📄 — 厂商白皮书、product page、官方 datasheet
- **`measured`** ✅ — 第三方或社区贡献的实测数据 (必须有 attestation)
- **`estimated`** ⚠️ — 基于公开信息的合理估算 (推断、反算)

**不许** 把没有来源的数字标 `official`。如果搜不到来源, 就别写, 字段留 `null` 比写错好。

## 本地开发

```bash
git clone https://github.com/evokernel/evokernel-spec
cd evokernel-spec
pnpm install
pnpm dev          # localhost:4321
pnpm validate     # 校验所有 yaml
pnpm check-links  # 检查 evidence URL 可达性 (耗时)
pnpm audit:data   # 数据质量审计 (warnings + info)
pnpm test         # 跑所有测试
pnpm build        # 静态构建
```

## CI 必须通过的检查

每个 PR 自动运行 7 个 jobs:

1. **validate-data** — schema + 跨实体引用 (~3s)
2. **type-check** — `astro check` 0 错误
3. **unit-tests** — schema + web vitest
4. **agent-regression** (v2.24+) — kernel-codegen op-class dispatch (11 assertions) + agent-learning schema synth validation
5. **build** — Astro 静态构建 (505 pages 现状, < 8s)
6. **e2e** — Playwright 全套
7. **deployment-smoke** — `./launch.sh` 17 路由健康检查

每周还跑 evidence-link 检查 (周度 cron, 不阻塞 PR)。

PR 通过后 maintainer 会 review 内容质量, 通常 48h 内合并。

## v2.x architecture 速读

EvoKernel Spec 是个 **多层结构化知识库 + agent CLI + 反馈回路**:

```
┌────────────────────────────────────────────────────────────┐
│ Data layer:    16 entity types, ~360 entries              │
│   → data/{operators,fused-kernels,isa-primitives,         │
│       dsl-examples,kernel-libraries,agent-learnings,...}  │
├────────────────────────────────────────────────────────────┤
│ Schema layer:  Zod, single source of truth                │
│   → schemas/*.ts                                           │
├────────────────────────────────────────────────────────────┤
│ Surface layer: 505 SSG pages + 21 JSON API endpoints      │
│   → apps/web/src/{pages,components,lib}                   │
├────────────────────────────────────────────────────────────┤
│ Agent layer:   7-stage CLI + 4 plugins                    │
│   → scripts/agent-deploy/ + plugins/{mcp-server,           │
│       claude-code-skill,cursor-rules,codex}               │
├────────────────────────────────────────────────────────────┤
│ Feedback layer: agent-learnings as PR-shaped observations │
│   → data/agent-learnings/ + /agents/learnings/ page       │
└────────────────────────────────────────────────────────────┘
```

**5-layer hw-sw gap framework** (when reasoning about cross-hardware ports):

| Layer | What lives here |
|---|---|
| A — ISA primitive | `data/isa-primitives/` — silicon-level instructions + cross-vendor mapping ratios |
| B — DSL | `data/dsl-examples/` — CUDA / HIP / Ascend-C / BANG-C / Triton kernel skeletons |
| C — Kernel library | `data/kernel-libraries/` — cuBLAS / CUTLASS / aclnn / rocBLAS |
| D — Formal semantics | per-op + per-fused-kernel `formal_semantics` field (100% coverage as of v2.24) |
| E — Coverage matrix | `data/coverage-matrix.ts` + `/operators/coverage-matrix/` page |

详见 [docs/superpowers/specs/2026-05-02-hw-sw-gap.md](docs/superpowers/specs/2026-05-02-hw-sw-gap.md)
和 [docs/ROADMAP.md § "5-layer hw-sw gap framework"](docs/ROADMAP.md#the-v20--v217-arc--agent-layer--5-layer-hw-sw-gap-framework).

## DCO (Developer Certificate of Origin)

每个 commit 必须有 `Signed-off-by:` trailer:

```bash
git commit -s -m "feat: add Ascend 910C spec"
```

通过 [DCO](https://developercertificate.org/) 你声明:

- 你有权贡献这部分代码/数据
- 数据按 CC-BY-SA 4.0 授权 / 代码按 Apache 2.0 授权
- 你会承担作者署名责任

## License

- 代码: [Apache 2.0](LICENSE)
- 数据: [CC-BY-SA 4.0](DATA_LICENSE)

提交即同意以上许可。**不需要 CLA**, 我们用 DCO。

## 行为准则

- **尊重事实**: 不夸大、不诋毁任何 vendor 或竞品
- **透明引证**: 每个数字都能追溯到来源
- **诚实留白**: 没数据就承认, 不要编
- **建设性评论**: review 时聚焦数据正确性, 不做主观贬损

## 高优先级贡献机会

查看 [`/quality` 页面](https://evokernel.dev/quality/) 看实时缺口, 或直接关注:

- 国产硬件无 case 的卡 (高优先级)
- 单 evidence 硬件 (建议补充第二条)
- 模型缺少 operator_decomposition (用 `pnpm tsx scripts/decompose-operators.ts <path>` 自动生成)

## 联系

- Issues: <https://github.com/evokernel/evokernel-spec/issues>
- Discussions: <https://github.com/evokernel/evokernel-spec/discussions>
