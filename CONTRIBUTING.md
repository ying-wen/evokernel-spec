# Contributing to EvoKernel Spec

感谢你考虑贡献! 本项目的每个数据条目都需要 **evidence** 引证, 我们才能保持长期可信。

## 三种贡献入口

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

每个 PR 自动运行:

1. **validate-data** — schema + 跨实体引用
2. **type-check** — `astro check` 0 错误
3. **unit-tests** — schema + web vitest
4. **build** — Astro 静态构建
5. **e2e** — Playwright 全套

PR 通过后 maintainer 会 review 内容质量, 通常 48h 内合并。

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
