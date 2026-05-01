// Centralized site IA. The Nav header dropdowns and the homepage entry
// sections both consume this so they cannot drift — if you discover a page is
// "hard to find," the fix is in one place.
//
// `topPath` is the canonical Astro path (no locale prefix, no base prefix).
// Consumers wrap it through `localePath(locale, ...)` and `pathname(...)` as
// appropriate.
//
// Translation keys are validated by t() — adding a group with a missing key
// fails loudly rather than silently rendering an empty label.

import type { TKey, Locale } from './i18n';

export type NavLink = {
  /** Path under site root, e.g. '/learn/tours/'. Always trailing-slashed. */
  path: string;
  /** i18n key for the visible label. */
  labelKey: TKey;
  /** Optional 1-line description shown on the homepage (Chinese only — English mirror is identical structure but unlocalized for now). */
  desc_zh?: string;
  desc_en?: string;
  /** Color theme: accent (highlight) or china (red, 国产 path). Default: neutral. */
  theme?: 'accent' | 'china';
};

export type NavGroup = {
  id: string;
  /** i18n key for the group name (used as nav dropdown trigger and homepage section header). */
  labelKey: TKey;
  /** One-liner shown beneath the group header on homepage. */
  blurb_zh: string;
  blurb_en: string;
  /** Cards / dropdown items in display order. */
  items: NavLink[];
};

/**
 * The site's top-level information architecture.
 *
 * 5 groups × 4-7 items each = full coverage of every navigable page.
 * Top nav surfaces the group names; homepage surfaces the group + items.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'browse',
    labelKey: 'home.section.browse',
    blurb_zh: '从五种实体直接挖数据 — 加速卡 / 超节点 / 模型 / 案例 / Playbook',
    blurb_en: 'Browse the five entity types directly — cards, super-pods, models, cases, playbooks.',
    items: [
      { path: '/hardware/', labelKey: 'nav.hardware', desc_zh: '加速卡目录 · 多维筛选 · 时间线', desc_en: 'Accelerator catalog · multi-axis filter · timeline' },
      { path: '/servers/', labelKey: 'nav.servers', desc_zh: '超节点 / 集群 · 内部拓扑 · Host CPU', desc_en: 'Super-pods · internal fabric · host CPU' },
      { path: '/models/', labelKey: 'nav.models', desc_zh: 'Frontier 开源模型 · 算子拆解', desc_en: 'Frontier open-source models · operator breakdown' },
      { path: '/cases/', labelKey: 'nav.cases', desc_zh: '实测部署 · 排行榜 · 散点图', desc_en: 'Measured deployments · leaderboard · scatter plot' },
      { path: '/playbooks/', labelKey: 'nav.playbooks', desc_zh: '(model × hardware) 配方', desc_en: '(model × hardware) recipes', theme: 'accent' },
      { path: '/vendors/', labelKey: 'nav.vendors', desc_zh: '28 个厂商 · 路线图 · 生态', desc_en: '28 vendors · roadmap · ecosystem' }
    ]
  },
  {
    id: 'optimize',
    labelKey: 'home.section.optimize',
    blurb_zh: '部署优化的全链路 — 流水线 7 阶段、模式、算子、融合 kernel、量化、引擎',
    blurb_en: 'Full deployment optimization chain — 7-stage pipeline, patterns, operators, fused kernels, quantization, engines.',
    items: [
      { path: '/pipeline/', labelKey: 'nav.pipeline', desc_zh: '7 阶段部署链路 · 决策点 · 失败模式', desc_en: '7-stage deployment chain · decisions · failure modes' },
      { path: '/patterns/', labelKey: 'nav.patterns', desc_zh: '21 个优化模式 · 加速倍数 · trade-off', desc_en: '21 optimization patterns · speedup × trade-off' },
      { path: '/operators/', labelKey: 'nav.operators', desc_zh: '25 个算子 · 模型映射 · 硬件适配度', desc_en: '25 operators · model mapping · hardware fitness' },
      { path: '/fused-kernels/', labelKey: 'nav.fusedKernels', desc_zh: '24 个融合 kernel · 实现路径 · 引擎支持', desc_en: '24 fused kernels · implementations · engine support' },
      { path: '/operators/fusion-graph/', labelKey: 'nav.fusionGraph', desc_zh: '算子-Kernel 二分图 · 找 hub / heavy-fusion / 数据漂移', desc_en: 'Operator-Kernel bipartite graph · hubs / heavy-fusion / drift' },
      { path: '/quantizations/', labelKey: 'nav.quantizations', desc_zh: 'BF16 / FP8 / FP4 / INT8 / INT4 全谱', desc_en: 'BF16 / FP8 / FP4 / INT8 / INT4 spectrum' },
      { path: '/engines/', labelKey: 'nav.engines', desc_zh: 'vLLM · SGLang · TRT-LLM · MindIE · …', desc_en: 'vLLM · SGLang · TRT-LLM · MindIE · …' }
    ]
  },
  {
    id: 'learn',
    labelKey: 'home.section.learn',
    blurb_zh: '从空白到上线的学习路径 — 7 个实战巡游 + 6 个决策指南',
    blurb_en: 'From zero to production — 7 hands-on tours + 6 decision-tree guides.',
    items: [
      { path: '/learn/', labelKey: 'nav.learn', desc_zh: '学习总览 · 全部巡游与指南', desc_en: 'Overview · all tours and guides', theme: 'accent' },
      { path: '/learn/tours/', labelKey: 'nav.tours', desc_zh: '7 个实战巡游 · 端侧 → super-pod', desc_en: '7 tours · edge → super-pod' },
      { path: '/learn/quantization-decision-tree/', labelKey: 'home.entry.quantTree', desc_zh: '量化决策树 · 硬件 × 模型 × 工作负载', desc_en: 'Quantization decision tree · hardware × model × workload' },
      { path: '/learn/parallelism-cheatsheet/', labelKey: 'home.entry.parallelism', desc_zh: 'TP / PP / EP / SP 选择 cheatsheet', desc_en: 'TP / PP / EP / SP cheatsheet' },
      { path: '/learn/picking-engine/', labelKey: 'home.entry.pickEngine', desc_zh: '推理引擎选择 · 硬件 × 任务匹配', desc_en: 'Engine picking · hardware × task fit' },
      { path: '/learn/attention-variants/', labelKey: 'home.entry.attention', desc_zh: 'Attention 变体 · MHA / GQA / MQA / MLA', desc_en: 'Attention variants · MHA / GQA / MQA / MLA' },
      { path: '/learn/deployment-failures/', labelKey: 'home.entry.failures', desc_zh: '部署失败模式 · 阶段化 gotcha 索引', desc_en: 'Deployment failures · staged gotcha index' },
      { path: '/learn/observability/', labelKey: 'home.entry.observability', desc_zh: '生产可观测性 · 4 层指标 + 5 栈工具 + 6 故障 playbook', desc_en: 'Production observability · 4 metric tiers + 5 stack tools + 6 playbooks' },
      { path: '/learn/production-lifecycle/', labelKey: 'home.entry.lifecycle', desc_zh: '生产生命周期 · rollout / A/B / 迁移 / 回滚', desc_en: 'Production lifecycle · rollout / A/B / migration / rollback' },
      { path: '/learn/capacity-planning/', labelKey: 'home.entry.capacityPlanning', desc_zh: '容量规划 · 部署链路 step 0 · 7-step sizing 推导', desc_en: 'Capacity planning · deployment chain step 0 · 7-step sizing math' }
    ]
  },
  {
    id: 'tools',
    labelKey: 'home.section.tools',
    blurb_zh: '把数据用起来 — 计算器 / 对比 / Host CPU 矩阵 / 价格',
    blurb_en: 'Put the data to work — calculator, compares, host-CPU matrix, pricing.',
    items: [
      { path: '/calculator/', labelKey: 'nav.calculator', desc_zh: 'Tier-0 实测查表 + Tier-1 Roofline 上界', desc_en: 'Tier-0 lookup + Tier-1 Roofline ceiling' },
      { path: '/calculator/capacity-planner/', labelKey: 'home.entry.capacityCalculator', desc_zh: '容量规划计算器 · 选模型/硬件 → 推荐卡数', desc_en: 'Capacity planner · pick (model × hw) → recommended cards' },
      { path: '/compare/', labelKey: 'nav.compare', desc_zh: '硬件对比 · 雷达图 / 表格 / Roofline 叠加', desc_en: 'Hardware compare · radar / table / Roofline overlay' },
      { path: '/servers/compare/', labelKey: 'nav.serversCompare', desc_zh: '超节点对比 · NVL72 vs Atlas vs CM384', desc_en: 'Compare super-pods · NVL72 vs Atlas vs CM384' },
      { path: '/servers/host-cpu-matrix/', labelKey: 'nav.hostCpuMatrix', desc_zh: 'Host CPU 矩阵 · 14/14 super-pod 全填', desc_en: 'Host-CPU matrix · 14/14 super-pods covered' },
      { path: '/servers/network-topology-matrix/', labelKey: 'nav.networkTopoMatrix', desc_zh: '网络拓扑矩阵 · fat-tree / dragonfly+ / torus / mesh', desc_en: 'Network-topology matrix · fat-tree / dragonfly+ / torus / mesh' },
      { path: '/servers/storage-matrix/', labelKey: 'nav.storageMatrix', desc_zh: '存储架构矩阵 · GDS / Lustre / Weka / OceanStor', desc_en: 'Storage matrix · GDS / Lustre / Weka / OceanStor' },
      { path: '/servers/cluster-internals/', labelKey: 'nav.clusterInternals', desc_zh: '集群内部架构总览 · 三轴 per-pod 速览 (compute/fabric/storage)', desc_en: 'Cluster internals overview · 3-axis per-pod summary' },
      { path: '/pricing/', labelKey: 'nav.pricing', desc_zh: '$ / M tokens 排名 · 自动从案例计算', desc_en: '$/M tokens ranking · auto-computed from cases' },
      { path: '/pricing/by-engine/', labelKey: 'nav.pricingByEngine', desc_zh: '按引擎对照成本 · vLLM vs SGLang vs MindIE on same hw', desc_en: 'Pricing by engine · vLLM vs SGLang vs MindIE on same hw' },
      { path: '/showcase/', labelKey: 'nav.showcase', desc_zh: '精选发现 · 数据告诉我们什么', desc_en: 'Showcase · what the data tells us', theme: 'accent' }
    ]
  },
  {
    id: 'about',
    labelKey: 'home.section.about',
    blurb_zh: '项目元信息 — 数据质量 / 影响力 / 贡献 / 关于',
    blurb_en: 'Project meta — data quality, impact, contribution, about.',
    items: [
      { path: '/quality/', labelKey: 'nav.quality', desc_zh: '数据质量 · 引证度量 · 缺失 entity', desc_en: 'Data quality · evidence metrics · missing entities' },
      { path: '/impact/', labelKey: 'nav.impact', desc_zh: 'GitHub Stars · 贡献者 · 引证', desc_en: 'GitHub stars · contributors · citations' },
      { path: '/contribute/', labelKey: 'nav.contribute', desc_zh: '贡献指南 · 三种 PR 路径', desc_en: 'Contributing · 3 PR tracks' },
      { path: '/about/', labelKey: 'nav.about', desc_zh: '项目设计原则 · evidence tier · 公式', desc_en: 'Design principles · evidence tier · formulas' },
      { path: '/changelog/', labelKey: 'nav.changelog', desc_zh: '版本日志 · RSS 订阅 · 每个版本一个主题', desc_en: 'Release log · RSS feed · single-theme releases' }
    ]
  }
];

/**
 * Convenience helper: top-nav prominent links shown left-to-right before the
 * dropdowns. Kept tight (5 items) — everything else lives behind dropdowns.
 */
export const NAV_TOP_LINKS: NavLink[] = [
  { path: '/hardware/', labelKey: 'nav.hardware' },
  { path: '/servers/', labelKey: 'nav.servers' },
  { path: '/models/', labelKey: 'nav.models' },
  { path: '/cases/', labelKey: 'nav.cases' },
  { path: '/playbooks/', labelKey: 'nav.playbooks', theme: 'accent' }
];

/**
 * Special "China Hub" link gets red/accent treatment and sits at the right of
 * the top nav, after the dropdowns.
 */
export const NAV_CHINA_LINK: NavLink = {
  path: '/china/',
  labelKey: 'nav.china',
  theme: 'china'
};

/**
 * Top-nav dropdowns. Each maps to the homepage group above so the user's
 * mental model is the same in both surfaces.
 *
 * 'browse' is omitted because it lives in NAV_TOP_LINKS — it would be
 * redundant to also have a dropdown for it.
 */
export const NAV_DROPDOWNS: NavGroup[] = NAV_GROUPS.filter((g) => g.id !== 'browse');
