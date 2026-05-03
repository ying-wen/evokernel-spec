# EvoKernel Spec — 设计文档

- **项目代号**: EvoKernel Spec
- **文档版本**: v1.0 (设计冻结)
- **撰写日期**: 2026-04-28
- **状态**: 已与用户对齐,等待用户最终 review,然后进入实施 plan 编写

---

## 1. 概述与愿景

### 1.1 一句话价值主张

**"任意模型 → 任意硬件" 的可计算、可引证、可贡献的开源 AI 推理部署知识资产**——尤其覆盖 InferenceX 等海外站点不会涉及的国产芯片生态。

### 1.2 与对标 (InferenceX) 的差异化

| 维度 | InferenceX | EvoKernel Spec |
|---|---|---|
| 硬件覆盖 | NVIDIA + AMD,9 张卡 | NVIDIA + AMD + Intel + AWS + Google + 9 家国产 ≈ 28 张卡 |
| 国产硬件 | 无 | **核心差异化** (昇腾 / 寒武纪 / 海光 / 摩尔线程 / 燧原 / 壁仞 / 沐曦 / 天数智芯 / 平头哥) |
| 数据可信度模型 | 单一源 | Evidence graph + 三档 tier (官方 / 实测 / 估算) |
| 形态 | 商业站,Dashboard 为主 | 开源 + SaaS 公共站,知识库为主 + 计算器为辅 |
| 贡献 | 闭源 | GitHub PR 唯一入口 + DCO,数据 CC-BY-SA 4.0 + 代码 Apache 2.0 |
| 知识形态 | benchmark 数据集 | 实体卡 (骨架) + 部署案例 (节点) + 优化模式 (横向标签) |

### 1.3 核心命题

1. **知识库为主,计算器为辅** — 数据本身是产品,计算器是查询入口
2. **国产硬件覆盖最全** — 9 家厂商
3. **可信度作为一等公民** — 每个数字都有 evidence 链
4. **代码即数据** — 全 git 仓库,纯 PR 贡献,零后端,完全静态部署

### 1.4 双轮飞轮

```
社区贡献 case → 校准 efficiency 系数 → 计算器更准 →
吸引更多用户 → 更多 case → 沉淀优化模式 → 抽象出可迁移知识
```

---

## 2. V1 范围

### 2.1 In Scope

- **场景**: 推理 (inference) only
- **硬件实体**: 加速卡 + 服务器 + 互联拓扑 (含 scale-up/scale-out)
- **软件实体**: 模型 + 算子 (粗粒度) + 推理引擎 + 量化方案 + 并行策略
- **计算器**: Tier 0 (查表) + Tier 1 (静态 Roofline)
- **页面**: 10 个核心页 (含国产专题)
- **部署模式**: 单节点 / 多节点同构 / Disaggregated (prefill/decode 分离)
- **国际化**: 中英双语 (中文为主)

### 2.2 Out of Scope (V1)

- ❌ 训练场景
- ❌ Tier 2+ 计算器 (算子级 roofline / KV-cache 仿真 / 完整 simulator)
- ❌ Die 级硬件 / 机柜级拓扑详细建模
- ❌ 编译器 / 算子库实体
- ❌ 站内编辑 / 用户系统 / moderation 工具
- ❌ 优化模式独立浏览页 (D 标签先做字段)
- ❌ GPU Reliability 模块
- ❌ 政策动态时间线 / 采购可得性追踪
- ❌ Articles / 长文板块
- ❌ 自定义集群构建器、对比页 (合并到目录)、changelog 页

---

## 3. 信息架构

### 3.1 实体关系图

```
┌─────────────┐         ┌─────────────┐
│  Vendor     │ 1───n   │  Hardware   │
│  (厂商)     │         │  (加速卡)   │
└─────────────┘         └─────┬───────┘
                              │ 1
                              │ n
                        ┌─────▼───────┐         ┌─────────────┐
                        │  Server     │ 1───n   │  Engine     │
                        │ (整机/POD)  │         │ (推理引擎)  │
                        └─────────────┘         └─────┬───────┘
                                                      │
              ┌──────────┐                            │
              │ Pattern  │  n───n                     │
              │(优化模式)│◄─┐                         │
              └──────────┘  │                         │
              ┌──────────┐  │   ┌─────────────┐      │
              │  Model   │  └───┤  Case       │ n────┘
              │ (LLM)    │ 1─n  │ (部署案例)  │
              └────┬─────┘      └─────────────┘
                   │ 1
                   │ n
              ┌────▼─────┐
              │ Operator │ (粗粒度: matmul / attn / norm / moe-gate / ...)
              └──────────┘

每个数字字段背后挂 Evidence (引用源 + tier 标签)
```

### 3.2 实体类型清单

| Entity | 复数路径 | V1 数量 | 说明 |
|---|---|---|---|
| Vendor | `data/vendors/*.yaml` | ~22 家 | 9 国产硬件 + 5 海外硬件 (NVIDIA/AMD/Intel/AWS/Google) + 8 模型 lab (DeepSeek/Moonshot/Zhipu/Alibaba/MiniMax/Meta/Mistral/OpenAI; Google 与硬件 vendor 复用) |
| Hardware (加速卡) | `data/hardware/<vendor>/*.yaml` | 28 张 | 见 §3.3 |
| Server | `data/servers/*.yaml` | ~15-20 | 含整机 + Pod + **超节点 (super-pod)**;海外: HGX H100/H200/B200, NVL72/NVL576;国产: Atlas 800T/I, Atlas 900 SuperPoD, **CloudMatrix 384** (昇腾超节点), 寒武纪思元集群机, 海光超节点等;详见 §3.6 |
| Interconnect | `data/interconnects/*.yaml` | ~10 | NVLink / NVSwitch / HCCS / IB / RoCE / 灵衢 / Infinity Fabric |
| Model | `data/models/<lab>/*.yaml` | 14+ | 见 §3.4 |
| Operator | `data/operators/*.yaml` | ~10 | matmul / attention / fa3 / rmsnorm / rope / moe-gate / allreduce / all2all / softmax / silu |
| Engine | `data/engines/*.yaml` | 7 | 见 §3.5 |
| Quantization | `data/quantizations/*.yaml` | ~9 | bf16 / fp16 / fp8-e4m3 / fp8-e5m2 / fp4 / int8 / int4-awq / int4-gptq / w4a16 |
| ParallelStrategy | `data/parallel-strategies/*.yaml` | ~5 | tp / pp / ep / sp / disaggregated |
| Case | `data/cases/<year>/<month>/*.yaml` | ≥ 5 (种子) | 完整部署 recipe |
| Pattern | `data/patterns/*.yaml` | ≥ 3 (种子) | 横向优化标签 |
| Evidence | 嵌入实体内 | 每实体 ≥ 1 | 引用源 + tier |

### 3.3 V1 硬件清单 (28 张)

**海外 (15 张)**
| 厂商 | 卡 |
|---|---|
| NVIDIA (6) | H100 SXM, H200 SXM, B200 SXM, B300 SXM, GB200 NVL72, GB300 NVL72 |
| AMD (3) | MI300X, MI325X, MI355X |
| Intel (2) | Gaudi 2, Gaudi 3 |
| AWS (2) | Trainium 2, Inferentia 2 |
| Google (2) | TPU v5p, Trillium (v6e) |

**国产 (13 张, 9 家厂商)**
| 厂商 | 卡 |
|---|---|
| 华为昇腾 (2) | 910B, 910C |
| 寒武纪 (2) | MLU370-X8, MLU590 |
| 海光 (2) | DCU Z100, DCU K100 |
| 摩尔线程 (1) | MTT S4000 |
| 燧原 (1) | T20 / T21 (取最新) |
| 壁仞 (2) | BR100, BR104 |
| 沐曦 (1) | 曦云 C500 |
| 天数智芯 (1) | 天垓 100 |
| 平头哥 (1) | 含光 800 |

> Phase 0 数据稀缺度排序 (高→低): 平头哥 / 天数 / 沐曦 (信息最少) → 摩尔 / 燧原 / 壁仞 → 海光 / 寒武纪 / 华为 (信息最多)。最稀缺者允许字段 `null` + 注释 "data not publicly available, contributions welcome"。

### 3.4 V1 模型清单 (基于 2026-04 frontier 开源模型)

| Lab | 模型 | 关键特性 |
|---|---|---|
| DeepSeek | DeepSeek-V4-Pro | 1.6T total / 49B active MoE, 1M context, CSA+HCA 混合注意力 |
| DeepSeek | DeepSeek-V4-Flash | 284B / 13B active MoE |
| DeepSeek | DeepSeek-R1 | 推理特化 |
| Moonshot | Kimi K2.6 | 1T MoE / 32B active, 262K context, 原生视觉 (MoonViT) |
| Zhipu | GLM-5.1 | 754B MoE, MIT 许可证 (2026-04-07) |
| Zhipu | GLM-5 (Reasoning) | 推理特化 |
| Alibaba | Qwen3.6 Plus | 1M context |
| Alibaba | Qwen3.5 397B (Reasoning) | |
| MiniMax | MiniMax M2.7 | |
| Meta | Llama 4 Scout | 109B / 17B active, 多模态 |
| Meta | Llama 4 Maverick | 400B MoE, 多模态 |
| Mistral | Mistral Small 4 | 119B MoE, Apache 2.0 (2026-03-16) |
| Google | Gemma 4 | 26B MoE |
| OpenAI | gpt-oss | InferenceX 已收录 |

> 模型生态变化快,设计支持快速 add;允许"未拆解"模型先进库。

### 3.5 V1 推理引擎清单

| 引擎 | 主要适用 | 备注 |
|---|---|---|
| vLLM | 通用 | 含 vllm-ascend / vllm-rocm / vllm-musa 等社区 fork |
| SGLang | 高性能 | InferenceX 已收录 |
| TensorRT-LLM (Dynamo) | NVIDIA | InferenceX 已收录 |
| MoRI | 新引擎 | InferenceX 已收录 |
| LMDeploy | 国产生态友好 | |
| MindIE | 华为昇腾官方 | |
| 含光适配引擎 | 平头哥 | 引擎名称以官方公开为准 (Phase 0 抓取时确认) |

### 3.6 V1 服务器 / Pod / 超节点清单 (~15-20)

V1 必须覆盖的"超节点"——这是国产硬件对标 GB200 NVL72 的关键展示位。

**海外 (5-6)**
| 类型 | 名称 | 说明 |
|---|---|---|
| 8-GPU 整机 | NVIDIA HGX H100 / H200 | NVLink 4.0 |
| 8-GPU 整机 | NVIDIA HGX B200 | NVLink 5.0 |
| 超节点 | GB200 NVL72 | 72 张 B200, NVSwitch Gen 4 |
| 超节点 | GB300 NVL72 (NVL576 配置) | InferenceX 已覆盖 |
| 8-GPU 整机 | AMD MI300X / MI325X / MI355X 平台 | Infinity Fabric |
| Pod | TPU v5p / Trillium 集群 | 自研 ICI |

**国产 (10-12, 含超节点)**
| 厂商 | 类型 | 名称 / 备注 |
|---|---|---|
| 华为昇腾 | 整机 | Atlas 800I A2 (推理) / 800T A2 (训推) |
| 华为昇腾 | Pod | Atlas 900 PoD A2 (机柜级集群) |
| 华为昇腾 | **超节点** | **CloudMatrix 384** (384 张昇腾,机架级,2025 发布,对标 NVL72) |
| 华为昇腾 | 超节点 | Atlas 900 SuperPoD A2 / SuperCluster (训推一体) |
| 寒武纪 | 整机 | 思元 X8 推理服务器 |
| 寒武纪 | Pod | 思元 590 训推集群 |
| 海光 | 整机 | 曙光 / 浪潮 DCU 服务器 |
| 海光 | 超节点 | 海光超节点方案 (具体名称 Phase 0 抓取确认) |
| 摩尔线程 | 整机 | KUAE 智算集群 |
| 摩尔线程 | 超节点 | KUAE 万卡集群方案 |
| 燧原 | 整机 | 云燧 i20 服务器 |
| 壁仞 | 整机 | 海玄 (HaiXuan) 服务器 |
| 沐曦 | 整机 | 曦云 C500 服务器 |
| 浪潮 / 华勤 / 联想 / 新华三 等 OEM | 整机 / Pod | 多 vendor 兼容方案 |

> 超节点的关键 schema 字段: 单节点卡数 / scale-up 域大小 / 互联拓扑 / 整机柜功耗 / 总显存 / 总互联带宽 / 制冷方式 (液冷 / 风冷)。

---

## 4. 数据 Schema

### 4.1 存储结构

```
data/
├── vendors/                       # ~22 家厂商 (硬件 + 模型 lab)
├── hardware/<vendor-slug>/        # 28 张加速卡
├── servers/                       # ~15-20 整机/Pod/超节点
├── interconnects/                 # ~10 互联协议
├── models/<lab-slug>/             # 14+ 模型
├── operators/                     # ~10 算子
├── engines/                       # 7 推理引擎
├── quantizations/                 # ~9 量化方案
├── parallel-strategies/           # ~5 并行策略
├── cases/<year>/<month>/          # 部署案例 (起始 ≥ 5 种子)
└── patterns/                      # 优化模式 (起始 ≥ 3 种子, V1 不开放 PR)

schemas/                           # Zod schema (单一真相源)
content/                           # MDX (case 详情、pattern 长文)
```

### 4.2 可信度模型 (Evidence + Tier)

每个数字字段都引用一个 `evidence_ref`,evidence 含:

- `id`: 唯一标识 (例: `ev-asc910b-001`)
- `tier`: `official` | `measured` | `estimated`
- `source_type`: 例 `vendor-whitepaper` / `vendor-press-release` / `mlperf-submission` / `community-benchmark` / `paper`
- `url`: 可访问链接 (CI 校验)
- `accessed`: ISO 日期
- `citation`: 文字引用 (例: "华为昇腾 910B 产品白皮书 v2.0, p.4")
- `contributor_attestation`: 仅 measured 时,贡献者声明
- `raw_data_url`: 仅 measured 时,原始 log 链接

**Tier UI 表现**:

| Tier | 颜色 | 图标 | UI 默认行为 |
|------|------|------|-------------|
| `official` | 灰 | 📄 | 显示数字 + "厂商声称" |
| `measured` | 绿 | ✅ | 显示数字 + "实测验证" + case 链接 |
| `estimated` | 黄 | ⚠️ | 显示数字 + "社区估算" + 可选范围 |

数字 hover 弹出 evidence 卡片,展示来源、引用、访问时间、原文片段。

**冲突处理**: 同一指标多 evidence 并存,UI 默认显示 maintainer 标记的"主推值",可展开看其他声明。

### 4.3 Hardware 卡 Schema (示例)

```yaml
# data/hardware/huawei/ascend-910b.yaml
id: ascend-910b
name: 昇腾 910B
vendor: huawei
generation: ascend-9-series-gen2
status: in-production         # in-production | discontinued | taping-out
release_year: 2023
form_factor: oam              # oam | sxm | pcie | nvl | proprietary

compute:
  fp4_tflops: null            # 不支持
  fp8_tflops: null            # 不支持
  bf16_tflops: { value: 320, evidence_ref: ev-asc910b-001 }
  fp16_tflops: { value: 320, evidence_ref: ev-asc910b-001 }
  int8_tops:   { value: 640, evidence_ref: ev-asc910b-002 }

memory:
  capacity_gb:    { value: 64,   evidence_ref: ev-asc910b-003 }
  bandwidth_gbps: { value: 1600, evidence_ref: ev-asc910b-004 }
  type: HBM2e

scale_up:
  protocol: HCCS
  bandwidth_gbps: 392
  world_size: 8
  topology: switched
  switch: huawei-hccs-switch

scale_out:
  bandwidth_gbps_per_card: 200
  protocol: RoCEv2
  nic: huawei-200ge-nic

power:
  tdp_w: { value: 400, evidence_ref: ev-asc910b-005 }

software_support:
  drivers: [CANN-7.0, CANN-8.0]
  engines:
    - id: mindie
      versions: ["1.0.RC2", "1.0.RC3"]
      status: officially-supported
    - id: vllm
      status: community-port
      notes: "vllm-ascend fork"
  quantizations: [fp16, bf16, int8]
  parallelism: [tp, pp]

aliases: ["910B", "Ascend910B"]
chinese_names: ["昇腾910B"]
photos: ["./assets/ascend-910b.webp"]

evidence:
  - id: ev-asc910b-001
    tier: official
    source_type: vendor-whitepaper
    url: "https://www.hisilicon.com/.../ascend-910b-spec-v2.pdf"
    accessed: "2026-04-01"
    citation: "华为昇腾 910B 产品白皮书 v2.0, p.4"
  # ... 其他 evidence

disclaimers:
  - "All performance figures are vendor-claimed unless tier=measured."
```

### 4.4 Case Schema (示例)

```yaml
# data/cases/2026/04/dsv4-pro-on-ascend-910b-x16-mindie.yaml
id: case-dsv4-asc910b-x16-mindie-001
title: DeepSeek-V4-Pro 在 16 张昇腾 910B 上 MindIE 推理实测
submitted_at: 2026-04-15
submitter:
  github: "@example-user"
  affiliation: "<optional>"

stack:
  hardware: { id: ascend-910b, count: 16, topology: "2 nodes x 8 cards" }
  server: { id: huawei-atlas-800t-a3 }
  interconnect:
    intra_node: HCCS
    inter_node: RoCE-200G
  model: { id: deepseek-v4-pro, weight_format: bf16 }
  engine: { id: mindie, version: "1.0.RC3" }
  quantization: bf16
  parallel:
    tp: 8
    pp: 2
    ep: 1
    disaggregated: false
  driver: CANN-8.0
  os: "openEuler 22.03 LTS"

scenario:
  prefill_seq_len: 1024
  decode_seq_len: 256
  batch_size: 32
  max_concurrent_requests: 64

results:
  throughput_tokens_per_sec:
    decode: 850
    prefill: 12000
  latency_ms:
    ttft_p50: 280
    ttft_p99: 410
    tbt_p50: 38
    tbt_p99: 62
  memory_per_card_gb: 58
  power_per_card_w: 380
  utilization:
    compute_pct: 41
    memory_bw_pct: 78

bottleneck: memory-bandwidth   # compute | memory | interconnect | software

reproduction:
  startup_command: "..."
  config_files: ["./config/mindie-dsv4.json"]
  benchmark_tool: "vllm benchmark_serving.py + sharegpt"
  notes_md: "./notes.md"

issues_encountered:
  - "EP=2 时 expert 路由不均衡, 长 prompt 出现负载倾斜, 改回 EP=1"
  - "首次启动加载耗时 11min, 需提前 warmup"

patterns:
  - moe-expert-routing-on-domestic
  - memory-bound-decode-prefer-int8

evidence:
  - id: ev-case-001
    tier: measured
    source_type: community-benchmark
    contributor_attestation: "I personally ran this on company hardware, results are reproducible."
    raw_data_url: "https://github.com/.../benchmark-logs/run-2026-04-15.json"
```

### 4.5 Schema 校验

- 每实体类型对应 `schemas/*.ts` Zod schema
- CI 校验: schema 合法性 + evidence URL 可达性 + 引用 ID 完整性 + 命名规范
- **任一失败 → PR block**

---

## 5. 页面与 UX

### 5.1 路由树 (V1, 10 个核心页)

```
/                       # 首页
/hardware               # 硬件目录
/hardware/[slug]        # 单卡详情
/models                 # 模型目录
/models/[slug]          # 单模型详情
/cases                  # 部署案例库
/cases/[slug]           # 单 case 详情 (MDX)
/calculator             # 计算器
/china                  # 国产芯片专题
/about                  # 关于 + 贡献指南
```

每页底部"贡献此页/纠错"按钮 → 跳转对应 yaml 的 GitHub edit URL。

### 5.2 设计语言原则

- 编辑/技术杂志感 (Stripe / Vercel docs / Hugging Face 风格混合)
- 不做 dark-mode-by-default
- Typography 有节奏 (clamp 流体字号)
- 数据密度高,但层级清晰
- 国产芯片相关 UI 元素视觉强化 (高亮 chip / 专属配色)
- 严格遵守 `~/.claude/rules/web/design-quality.md` 反模板政策

### 5.3 关键页面要点

**首页**: 双栏不对称 hero + 5 个入口卡片(国产专题视觉强化) + 数据规模实时统计 + 30 天 case 增长趋势。

**硬件目录** (`/hardware`): 三列响应式 (sticky 筛选栏 + 卡片网格 + 对比抽屉)。筛选维度: 厂商 (按国别分组) / 形态 / 显存 / 算力 / FP8/FP4 支持 / 状态 / 互联协议。多选对比最多 4 张。

**硬件详情** (`/hardware/[slug]`): 头部 → KPI 卡组 → 完整规格表 (折叠) → 软件栈支持矩阵 → 同代竞品对比 → 关联 case → 代际谱系 → 引证全表 (含 BibTeX 下载)。

**模型目录 + 详情**: 类似硬件,详情页含算子拆解表 + "在哪些卡上能跑" 矩阵。

**case 详情** (MDX,允许嵌入交互组件):
- 元数据栏 / Stack 配置块 / 场景 / 结果可视化 (吞吐 + 延迟 + 瓶颈分析图 + 利用率) / 复现步骤 / 踩坑笔记 / 关联模式 / Evidence

### 5.4 计算器 (`/calculator`)

**三步线性流程**:

1. **选模型** (搜索 + 推荐)
2. **选硬件配置** (单卡 / 集群 / **Disaggregated**)
3. **选场景** (prefill_seq_len / decode_seq_len / batch / 量化 / 并行 / 引擎)

**结果区**:

- **A. Tier 0 (查表) 优先** — 有匹配 case 显示前 3 条最相近 case;无 case 显示 "no real-world case yet, see theoretical estimate below"
- **B. Tier 1 (Roofline 理论上界)** — 三个核心数字 + Roofline 图 (D3) + 瓶颈拆解堆叠条 + ⚠️ 显著免责 banner ("理论上界, 真实通常 40-70%")
- **C. 配置健全性检查** — 显存够否 / KV cache 估算 / 通信开销
- **D. 推荐** — 基于规则的优化建议

**透明性**: 页面底部"公式与假设"折叠区,展示完整 Roofline 公式 + efficiency 假设 + 引用源。

### 5.5 国产芯片专题页 (`/china`)

**仅含 3 个组件** (按用户确认):

**5.5.1 国产芯片 × 主流模型 矩阵热力图** (主视觉)

- 横轴: 主流模型 (按 toggle 筛选: 规模 / MoE / 多模态)
- 纵轴: 9 家国产 vendor 的卡
- 格子: 🟢 有实测 case / 🟡 厂商声称未实测 / ❌ 不支持
- 格子点击 → 跳转对应 case 列表 或 "成为第一个贡献者!" CTA

**5.5.2 代际谱系图** (第二屏)

- 每家厂商的代际演进时间轴
- D3 timeline / force layout
- 节点点击跳转硬件详情
- 旁边可视化关键指标的代际提升 (例: 每代 BF16 算力曲线)

**5.5.3 生态对照表**

每行一家厂商,列: 编程模型 / 算子库 / 推理引擎 / 训练框架 / model zoo。可展开查看更多。

---

## 6. 计算器逻辑细节

### 6.1 Tier 0 (查表)

输入: (model_id, hardware_id, count, batch, seq_len, quantization, parallel, engine)

逻辑:
1. 在 `data/cases/**` 中按 stack 字段精确 + 模糊匹配
2. 计算每条 case 与查询的"距离" (字段差异加权)
3. 返回最近 3 条,显示完整 results 字段

### 6.2 Tier 1 (静态 Roofline)

公式 (公开):

```
peak_compute = hardware.compute[precision]            # TFLOPS
peak_memory_bw = hardware.memory.bandwidth_gbps       # GB/s
arithmetic_intensity = ops_per_token / bytes_per_token

# Roofline:
throughput_per_card = min(
    peak_compute,
    peak_memory_bw * arithmetic_intensity
)

is_compute_bound = (arithmetic_intensity > peak_compute / peak_memory_bw)
```

per-token FLOPs / bytes 从模型卡的算子拆解表自动推导。

通信开销估算:
- TP all-reduce: `2 * (TP-1)/TP * activations / scale_up_bw`
- PP send-recv: `activations / scale_out_bw`
- EP all2all: `tokens_per_step * routing_overhead / scale_up_bw`

### 6.3 Efficiency 系数 (V1 简化版)

V1 阶段全局 efficiency = 0.5 (作为粗略 fallback)。V1.5 引入 per (op, hw, engine, quant) 系数,需要积累 case 数据校准。

公开免责: "Tier 1 给出理论上界,真实场景通常达 40-70%,具体取决于软件栈成熟度。"

### 6.4 Disaggregated 模式

Prefill 池 + Decode 池分别配置:
- 输出 prefill 吞吐 / decode 吞吐分别估算
- KV cache 传输带宽消耗
- 端到端延迟估算 (TTFT 包含 KV transfer)

---

## 7. 技术栈

### 7.1 选型

| 层 | 选择 |
|---|---|
| 前端框架 | Astro 5 (静态 SSG) |
| Islands | React 19 (仅计算器、对比抽屉、热力图) |
| 样式 | Tailwind v4 + 自定义 design tokens |
| 数据格式 | YAML |
| schema 校验 | Zod 4 |
| MDX | @astrojs/mdx |
| 图表 | Recharts (基础) + D3.js (roofline / 谱系图 / 拓扑) |
| 搜索 | Pagefind (静态全文) + 自定义 facet 索引 |
| i18n | astro-i18n (中文 `/`,英文 `/en/`) |
| 计算器 | 纯 TS,`lib/calculator/`,100% 单测 |
| 部署 | Cloudflare Pages (主) / Vercel (备) |
| CDN | Cloudflare Images / `astro:assets` |
| CI | GitHub Actions |
| 包管理 | pnpm |
| Lint | Biome |
| 类型 | TypeScript 5.x strict |
| Node | 22 LTS |

### 7.2 关键架构决策

- 整站 SSG,无服务端渲染、无 API 路由、无数据库
- 计算器完全在浏览器运行,公式可被审计
- Astro content collections 加载 yaml,Zod 校验失败 = build 失败
- 数据更新 = git push = 自动 redeploy (Cloudflare Pages git integration)

### 7.3 仓库结构

```
evokernel-spec-app/
├── apps/web/                      # Astro 站点
│   ├── src/
│   │   ├── components/{hardware,model,case,calculator,china-hub,ui}/
│   │   ├── pages/
│   │   ├── content/               # MDX
│   │   ├── lib/{calculator,data,search,i18n}/
│   │   └── styles/
│   ├── tests/                     # Vitest
│   └── e2e/                       # Playwright
├── data/
│   ├── vendors/ hardware/ servers/ interconnects/
│   ├── models/ operators/ engines/
│   ├── quantizations/ parallel-strategies/
│   ├── cases/ patterns/
├── schemas/                       # Zod
├── scripts/
│   ├── validate-data.ts
│   ├── check-evidence-links.ts
│   ├── generate-docs.ts
│   ├── seed-from-templates.ts
│   ├── decompose-operators.ts
│   └── ai-scrape/                 # Phase 0 AI 抓取脚本
├── docs/
│   ├── superpowers/specs/         # 本设计文档
│   ├── contributing.md
│   ├── data-model.md              # 自动生成
│   └── calculator-formulas.md
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/{new-hardware,new-model,new-case}.yaml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── biome.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── LICENSE                        # Apache 2.0
├── DATA_LICENSE                   # CC-BY-SA 4.0
└── README.md (中英)
```

---

## 8. 治理与贡献流程

### 8.1 贡献入口 (3 类)

- **新硬件 / 新模型 / 修正实体卡**: GitHub Issue (模板) → maintainer 确认 → 贡献者 PR
- **新部署 case**: 直接 PR (用模板),要求 reproduction 步骤 + raw log
- **优化模式 (D)**: V1 maintainer-only (从 case 提炼);V1.5 开放 PR (需 ≥ 3 case 支撑)

### 8.2 PR Review Checklist

- [ ] schema 校验通过 (CI 自动)
- [ ] 所有数字字段有 evidence_ref
- [ ] evidence URL 可达 (CI 自动)
- [ ] tier 标签合理
- [ ] 命名遵循规范
- [ ] 利益冲突披露 (vendor 员工 / sponsored content)

### 8.3 团队结构 (启动)

- 至少 2 位核心 maintainer
- 子领域 reviewer (国产硬件 / NV-AMD / 模型 / 引擎)
- CODEOWNERS 文件按目录划分

### 8.4 冲突解决

- 数据冲突: 不替换,新增 evidence,UI 同时显示
- vendor 投诉删除: 仅在数据明显错误时纠正,不删历史 commit
- 命名争议: maintainer 投票

### 8.5 反 spam

- CI 强校验阻止缺 evidence 的 PR
- maintainer 审核 case 内容质量
- bot 自动 close 24h 无活动 + CI 失败的 PR

### 8.6 License

- 代码: **Apache 2.0**
- 数据: **CC-BY-SA 4.0** (署名 + 同许可证传播)
- 贡献者: **DCO** (Developer Certificate of Origin),无 CLA

---

## 9. Phase 0: 数据预填 (核心新增阶段)

### 9.1 目标

Launch 前自主把数据填到尽可能全,做到"已有规模的知识库"启动,而非空壳。

### 9.2 启用 AI 协助抓取 (用户已确认)

**架构**:
- 每家 vendor 一个并行 agent (一次性运行)
- agent 输入: vendor 名 + 已知卡型号清单 + schema 模板
- agent 行为: WebFetch + WebSearch 公开资料 (白皮书 / product page / paper / blog) → 输出 yaml 草稿 + evidence 引用
- **强制**: 人工 review 每个数字,evidence URL 必须可达,缺数据宁可 `null`
- **禁止**: AI 杜撰数字

**风险控制**:
- 每张卡 review 时, 至少抽样 3 个数字回到原 source 校对
- AI 输出标注 `tier: official` 必须能在 evidence URL 找到原文
- maintainer 在 commit message 标注 "AI-assisted draft, human-reviewed by @xxx"

### 9.3 数据来源优先级

| 优先级 | 来源 | 适用 |
|---|---|---|
| 1 | 官方白皮书 PDF | 多数硬件 |
| 2 | 官方 product page | URL 稳定 |
| 3 | 官方 datasheet | 深度技术指标 |
| 4 | 代际官方对比稿 | 偶尔披露未公开数据 |
| 5 | MLPerf 提交描述 | 互联拓扑、软件栈 |
| 6 | HotChips / ISSCC 演讲 | 架构细节 |
| 7 | 第三方深度评测 (SemiAnalysis / ServeTheHome / 知乎专栏) | 实测数据 |

### 9.4 Phase 0 任务清单

| 子阶段 | 内容 | 工作量 (含 AI 加速) |
|---|---|---|
| 0.1 | ~22 vendor + 28 硬件实体卡 | 4-5 天 |
| 0.2 | 14+ 模型卡 + 算子拆解 | 3-4 天 |
| 0.3 | 7 引擎 + 9 量化 + 5 并行 | 1-2 天 |
| 0.4 | 15-20 服务器/Pod/超节点实体 (含 CloudMatrix 384 等) | 2-3 天 |
| 0.5 | 10 互联拓扑实体 | 1 天 |
| 0.6 | 5-10 种子 case (公开 benchmark 提取) | 3-5 天 |
| **总计** | | **~2 周 (压缩版)** |

### 9.5 种子 case 来源

- MLPerf Inference v4.x (NVIDIA / AMD / 华为)
- vLLM / SGLang 官方 benchmark page
- TensorRT-LLM 性能博客
- 昇腾官方推理性能数据
- 知乎专栏国产卡实测文章 (引用时严格标注)
- Mooncake / DistServe 论文 (disaggregated 案例)

---

## 10. 路线图 (压缩版,目标 6 周到 launch)

```
Week 1-2: Phase 0 数据预填
├─ AI agents 并行抓取 (每 vendor 一个 agent)
├─ 实体骨架 + 模型 + 引擎 + 服务器 + 互联
├─ 5-10 种子 case 从公开 benchmark 提取
└─ 校验脚本 + 引证检查

Week 1-4: Phase 1 站点开发 (与 Phase 0 部分重叠)
├─ Astro 骨架 + design system + 路由
├─ 数据加载 + Zod 校验 + Pagefind 索引
├─ 硬件 / 模型 / case 目录与详情页
├─ 计算器 (Tier 0 + Tier 1)
├─ 国产专题页 (热力图 + 谱系图 + 生态对照)
├─ 关于 + 贡献页
├─ i18n (中英)
├─ CI: schema + link check + Lighthouse
└─ Cloudflare Pages 部署

Week 5: Phase 2 内测 + 校准
├─ 邀请 10-20 种子用户
├─ 用种子 case 校准 efficiency 系数
├─ polish UI / 修 bug / 补文档
└─ 准备发布材料

Week 6: Phase 3 公开 Launch
├─ HN / Reddit / 知乎 / B 站 / 即刻 / Twitter
├─ 联系国产 vendor DevRel
├─ "前 50 PR 公示" 激励
└─ 持续 review

Week 7+: Phase 4 飞轮期 (持续)
```

### 10.1 V1.5 路线图 (launch 后 1-3 个月)

按优先级:
1. **Tier 2 计算器** (算子级 roofline + per-context efficiency)
2. **优化模式独立浏览页** (`/patterns`,case ≥ 50 时启动)
3. **Web 表单贡献 case** (走 GitHub Actions 自动 PR)
4. **GPU Reliability 模块**
5. **Articles / 长文板块**
6. **训练场景** (基础)
7. **社区 Discussions 整合**

### 10.2 V2+ 长期愿景

- Tier 3 计算器 (KV-cache + 通信仿真)
- 离散事件 simulator 集成
- Die 级硬件 / 机柜级拓扑详细建模
- 编译器 / 算子库实体
- 反向查询 ("这个模型在哪张卡上跑得最划算?")
- 成本估算 (¥/token, $/token)
- 政策动态时间线

---

## 11. 风险登记

| ID | 风险 | 影响 | 概率 | 对策 |
|---|---|---|---|---|
| R1 | 数据不准确被打脸 | 高 | 中 | tier 标签 + 显著免责 + 修正反馈渠道 |
| R2 | 国产 vendor 投诉/施压 | 中 | 低-中 | 严格 evidence + 不做主观评论 + 法务咨询 |
| R3 | 单人 maintainer 精疲力尽 | 高 | 高 | launch 前招 1-2 co-maintainer |
| R4 | Launch 后无社区 PR | 中 | 中 | Phase 0 充实数据 + 联系 vendor DevRel |
| R5 | 计算器公式有 bug | 高 | 中 | 单测覆盖 + 公开公式 + 用种子 case 回测 |
| R6 | 数据政治敏感 | 中 | 中 | GitHub + Gitee 双镜像;不做政策评论 |
| R7 | AI 抓取出现幻觉 | 高 | 中-高 | 强制人工 review + evidence URL 必须可达 |
| R8 | 模型生态变化太快 | 中 | 高 | model card 设计支持快速 add;允许"未拆解"模型先进库 |
| R9 | InferenceX 跟进打压 | 低 | 低 | 我们做 superset (含国产) + 不直接复制 UI;独立数据来源 |
| R10 | 流量超 CDN 免费额度 | 中 | 中 | 监控告警;预算 fallback 到付费 plan |

---

## 12. 成功指标 (V1 launch 后 3 个月)

- 数据规模: 实体 ≥ 50, 模型 ≥ 20, case ≥ 50
- 社区: contributors ≥ 20, GitHub stars ≥ 1000, monthly active visitors ≥ 5000
- 引用: 被 ≥ 3 篇技术博客 / 论文 / 媒体引用
- 计算器: 月调用 ≥ 10000 次
- 国产专题: 9 家 vendor 全部有 ≥ 1 条实测 case
- 飞轮验证: 第 90 天 case 增长率 ≥ 第 30 天的 2x

---

## 13. 开放问题 (Launch 前需决议)

> 用户已确认 V1 设计阶段不深入讨论这些,但实施时需要回答:

1. **域名**: `evokernel.dev` / `evokernel.io` / 其他?
2. **Logo + 视觉品牌**: 找设计师还是先用 wordmark?
3. **Co-maintainer 招募**: 启动前找谁?
4. **赞助 / 资金来源**: 个人项目 / sponsor / 开源基金会?
5. **国内镜像 (Gitee)**: 是否同步?如何保持双向?
6. **公司归属**: 个人 GitHub 还是新组织 (`evokernel-org`)?
7. **数据 commercial use**: CC-BY-SA 4.0 + 是否双许可?
8. **AI 协助抓取的 token 预算**: 谁的 API,多少预算?
9. **隐私模式**: 计算器 stack 配置存 localStorage 还是不持久化?

---

## 14. 附录

### 14.1 术语表

- **Tier**: 数据可信度档次 (`official` / `measured` / `estimated`)
- **Evidence**: 数字字段背后的引用源记录
- **Case**: 一次完整的部署 recipe (含实测结果)
- **Pattern**: 横向优化标签 (跨 case 的可迁移知识)
- **Scale-Up**: 节点内 / Pod 内互联 (NVLink / HCCS 等)
- **Scale-Out**: 节点间互联 (RoCE / IB 等)
- **Disaggregated**: prefill / decode 卡分离的部署模式
- **Roofline**: 算力 vs 内存带宽的双限模型

### 14.2 参考与对标

- [InferenceX (SemiAnalysis)](https://inferencex.semianalysis.com/) — 海外对标
- [InferenceX-app GitHub](https://github.com/SemiAnalysisAI/InferenceX-app)
- DeepSeek V4 release 2026-04-24
- Kimi K2.6 / GLM-5.1 / Qwen 3.6 Plus 调研 (2026-04)
- MLPerf Inference v4.x

### 14.3 关键决策回溯 (与用户对齐过程)

- Q1: 主轴 = 知识库为主,计算器为辅,开源 + SaaS 公共站
- Q2: 原子单元 = A 实体卡 (骨架) + B 部署案例 (节点) + D 优化模式 (标签)
- Q3: 实体范围 = 推理 only;9 家国产硬件全覆盖
- Q4: 可信度模型 = Evidence graph + UI 折叠为三档 tier
- Q5: 计算器深度 = MVP Tier 0 + Tier 1
- Q6: 治理 = 纯 GitHub PR + Discussions
- Q7: V1 页面 = 10 页 (含国产专题)
- Q8: 技术栈 = Astro + Tailwind + Zod + Cloudflare;国产专题页 3 组件 (热力图 / 谱系图 / 生态对照);冷启动 = 用最新模型
- 扩展决议: 加 Intel Gaudi 2/3 + AWS Trainium 2/Inferentia 2 + TPU v5p/Trillium;加集群网络 schema (scale-up/scale-out);加 disaggregated;不做 GPU Reliability;Phase 0 启用 AI 抓取;路线图压缩到 6 周
