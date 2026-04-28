# EvoKernel Spec

> AI 推理硬件 × 模型 × 部署的开源知识库 — 国产芯片覆盖最全 / 可信度可引证 / 计算器透明

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Data: CC-BY-SA 4.0](https://img.shields.io/badge/Data-CC--BY--SA_4.0-green.svg)](DATA_LICENSE)
[![Tests](https://img.shields.io/badge/tests-117_passing-success)](#)
[![Pages](https://img.shields.io/badge/pages-134-blue)](#)

![Home](docs/screenshots/home.png)

## Highlights

- **28 加速卡**: NVIDIA / AMD / Intel / AWS / Google + **9 家国产** (昇腾 · 寒武纪 · 海光 · 摩尔线程 · 燧原 · 壁仞 · 沐曦 · 天数智芯 · 平头哥)
- **14 frontier 开源模型**: DeepSeek V4 Pro / Flash / R1, Kimi K2.6, GLM-5.1, Qwen 3.5/3.6, Llama 4, Mistral Small 4, Gemma 4, MiniMax M2.7, gpt-oss
- **20 部署案例**: 含 CloudMatrix 384 超节点、disaggregated 部署、所有 9 家国产卡
- **Tier 0 实测查表 + Tier 1 透明 Roofline 计算器**: 含 per-operator breakdown / concurrency sweep / TCO ($/M tokens) / disaggregated mode
- **国产芯片专题**: 矩阵热力图 + 代际谱系 + 软件生态对照
- **数据可信度三档**: 📄 官方声称 · ✅ 实测验证 · ⚠️ 社区估算
- **5 个 JSON API**: `/api/{index,hardware,models,cases,openapi}.json` (CC-BY-SA 4.0)
- **WCAG 2 AA 兼容**, 中文+英文, 支持深色主题
- **完整 CI**: 5 jobs, 117 测试, 0 类型错误, 周度 evidence 链接健康检查

## 截图

### 首页 + 计算器
| | |
|---|---|
| ![Home](docs/screenshots/home.png) | ![Calculator](docs/screenshots/calculator.png) |
| **首页** — 数据规模 + 入口 + 最新案例 | **计算器** — Tier 0 + Tier 1 + Roofline + 算子拆解 + concurrency + TCO |

### 国产专题 + 硬件对比
| | |
|---|---|
| ![China Hub](docs/screenshots/china-hub.png) | ![Compare](docs/screenshots/compare-roofline.png) |
| **国产专题** — 矩阵热力图 + 代际谱系 + 生态对照 | **对比** — 雷达图 / 柱状图 / Roofline 叠加 / 表格 |

### 案例库 + 数据质量
| | |
|---|---|
| ![Cases](docs/screenshots/cases.png) | ![Quality](docs/screenshots/quality.png) |
| **案例排行榜** — 多维筛选 + 排序 | **数据质量** — 实时审计 + 覆盖缺口 |

## 本地开发

```bash
git clone https://github.com/evokernel/evokernel-spec
cd evokernel-spec
pnpm install

# Development
pnpm dev          # http://localhost:4321
pnpm build        # static build to apps/web/dist
pnpm preview      # serve dist locally

# Data quality
pnpm validate     # zod schema + cross-references
pnpm check-links  # evidence URL reachability
pnpm audit:data   # outliers + coverage gaps

# Testing
pnpm test                                       # unit (vitest)
pnpm --filter web exec playwright test          # e2e + a11y + perf
```

## 数据 API

所有数据通过静态 JSON API 提供 (CC-BY-SA 4.0):

```bash
curl https://evokernel.dev/api/hardware.json | jq '.items[] | select(.vendor.country=="CN") | .id'
# ascend-910b, ascend-910c, mlu370-x8, mlu590, dcu-z100, dcu-k100, ...

curl https://evokernel.dev/api/openapi.json | jq '.info.version'
# "1.0.0"
```

完整 OpenAPI 3.1 规范: [`/api/openapi.json`](https://evokernel.dev/api/openapi.json)

## 贡献

每个数字都需要 evidence 引证。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

最高优先级贡献机会: [实时 /quality 数据质量页](https://evokernel.dev/quality/) 中标记的国产硬件无 case 的卡。

## 部署

详见 [DEPLOYMENT.md](DEPLOYMENT.md)。推荐 Cloudflare Pages (本项目静态构建, 完全适配)。

## 已知限制

- **React island 内部文案**: `/en/calculator/`, `/en/cases/`, `/en/hardware/` 等页面的页面 chrome (导航 / 页头 / 段落标题) 均已英文化, 但交互式 React island 内部按钮 ("选模型" / "选硬件" / 视图切换 等) 当前仍为中文。这是已知 cosmetic gap, 不影响功能 (硬件名/模型名/数据值天生即英文)。后续会通过 `locale` prop 逐 island 改造。
- **公网域名**: 当前仅本地 `pnpm preview` 上线; `evokernel.dev` 域名为示意, 真公网部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## English

Open-source knowledge base for AI inference deployment across hardware (incl. 9 Chinese vendors) and frontier open-source models, with transparent Tier 0/1 calculator. Inspired by [SemiAnalysis InferenceX](https://inferencex.semianalysis.com/), differentiated by Chinese accelerator coverage + evidence-backed data + open API.

## License

- 代码 / Code: [Apache 2.0](LICENSE)
- 数据 / Data: [CC-BY-SA 4.0](DATA_LICENSE)
