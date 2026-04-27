# EvoKernel Spec

> AI 推理硬件 × 模型 × 部署的开源知识库 — 国产芯片覆盖最全 / 可信度可引证 / 计算器透明

## 项目状态: 🚧 V1 开发中 (Phase 0 — 数据预填 + 站点开发并行)

详见 [设计文档](docs/superpowers/specs/2026-04-28-evokernel-spec-design.md) 和 [实施计划](docs/superpowers/plans/2026-04-28-evokernel-spec-v1.md)。

## Highlights

- **28 张加速卡**: NVIDIA / AMD / Intel / AWS / Google + 9 家国产
- **14+ frontier 开源模型**: DeepSeek V4 / Kimi K2.6 / GLM-5.1 / Qwen 3.6+ / Llama 4 / Mistral / Gemma 4 ...
- **Tier 0 + Tier 1 计算器**: 实测查表 + Roofline 上界, 公式公开
- **国产芯片专题**: 矩阵热力图 / 代际谱系 / 生态对照
- **可信度可引证**: 每个数字带 evidence 标签 (官方 / 实测 / 估算)

## 本地开发

```bash
pnpm install
pnpm dev          # 启动 dev server (http://localhost:4321)
pnpm build        # 生产构建
pnpm preview      # 预览构建结果
pnpm test         # 运行单元测试
pnpm validate     # 校验 data/ 下所有 yaml
pnpm check-links  # 检查 evidence URL 可达性
pnpm lint         # Biome lint
```

## English Summary

Open-source knowledge base for AI inference deployment across hardware (incl. 9 Chinese vendors) and frontier open-source models, with a transparent Tier 0/1 calculator. Currently in V1 development.

## License

- Code: [Apache 2.0](LICENSE)
- Data: [CC-BY-SA 4.0](DATA_LICENSE)
