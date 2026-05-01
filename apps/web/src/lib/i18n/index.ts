// Minimal i18n: zh (default) and en. Translations are inline keys; no runtime
// loader, no extra dependency. Astro picks the locale from the URL prefix
// (/ → zh, /en/ → en) and pages thread it through.

export type Locale = 'zh' | 'en';

const dict = {
  zh: {
    'nav.hardware': '硬件',
    'nav.servers': '超节点',
    'nav.compare': '对比',
    'nav.models': '模型',
    'nav.cases': '案例',
    'nav.playbooks': 'Playbook',
    'nav.calculator': '计算器',
    'nav.china': '国产专题',
    'nav.pricing': '价格',
    'nav.contribute': '贡献',
    'nav.search': '搜索',
    'nav.menu': '菜单',
    'nav.learn': '学习中心',
    'nav.tools': '工具',
    'nav.more': '更多',
    'nav.tours': '实战巡游',
    'nav.pipeline': '部署链路',
    'nav.patterns': '优化模式',
    'nav.operators': '算子目录',
    'nav.fusedKernels': '融合 Kernel',
    'nav.quantizations': '量化方案',
    'nav.engines': '推理引擎',
    'nav.vendors': '厂商',
    'nav.showcase': '精选发现',
    'nav.quality': '数据质量',
    'nav.impact': '影响力',
    'nav.about': '关于',
    'nav.changelog': '版本日志',
    'nav.hostCpuMatrix': 'Host CPU 矩阵',
    'nav.serversCompare': '超节点对比',
    'nav.networkTopoMatrix': '网络拓扑矩阵',
    'nav.storageMatrix': '存储架构矩阵',
    'nav.clusterInternals': '集群内部架构总览',
    'nav.pricingByEngine': '按引擎对照成本',
    'footer.tagline': 'AI 推理硬件 × 模型 × 部署的开源知识库',
    'footer.browse': '浏览',
    'footer.participate': '参与',
    'footer.license': '许可',
    'footer.about': '关于',
    'footer.learn': '学习中心',
    'footer.quality': '数据质量',
    'footer.calculator': '计算器',
    'footer.disclaimer': '本站数字均带 evidence 标签 (官方 / 实测 / 估算)。所有 vendor-claimed 数据未经独立验证, 不构成投资或采购建议。',
    'home.eyebrow': 'EvoKernel · Spec',
    'home.heroLine1': '任意模型 → 任意硬件',
    'home.heroLine2': '的可计算知识库',
    'home.subtitle': 'AI 推理硬件、模型和部署案例的开源知识资产。每个数字带 evidence 引证。国产芯片覆盖最全。',
    'home.ctaCalc': '打开计算器 →',
    'home.ctaChina': '国产专题 →',
    'home.latest': '最新案例',
    'home.entry.hardware': '硬件目录',
    'home.entry.models': '模型目录',
    'home.entry.cases': '部署案例',
    'home.entry.calculator': '计算器',
    'home.entry.china': '国产芯片专题',
    'home.entry.china.desc': '热力图 · 谱系 · 生态对照',
    'home.entry.calculator.desc': 'Tier 0 实测 + Tier 1 上界',
    'home.entry.cases.desc': '完整复现 recipe',
    'home.entry.quantTree': '量化决策树',
    'home.entry.parallelism': '并行 cheatsheet',
    'home.entry.pickEngine': '推理引擎选择',
    'home.entry.attention': 'Attention 变体',
    'home.entry.failures': '部署失败模式',
    'home.entry.observability': '生产可观测性',
    'home.entry.lifecycle': '生产生命周期',
    'home.entry.capacityPlanning': '容量规划',
    'home.entry.capacityCalculator': '容量规划计算器',
    'home.section.browse': '浏览数据',
    'home.section.optimize': '部署优化',
    'home.section.learn': '学习中心',
    'home.section.tools': '工具',
    'home.section.about': '关于项目',
    'home.stats.hardware': '加速卡',
    'home.stats.models': '模型',
    'home.stats.cases': '部署案例',
    'home.stats.vendors': '厂商',
    'page.hardware.title': '硬件目录',
    'page.hardware.subtitle': '张加速卡',
    'page.hardware.cn': '国产',
    'page.hardware.overseas': '海外',
    'page.hardware.timeline': '硬件发布时间线',
    'page.models.title': '模型目录',
    'page.models.subtitle': '个 frontier 开源模型 · 含算子拆解 · 发布时间线',
    'page.cases.title': '部署案例 · 排行榜',
    'page.cases.subtitle': '条实测部署 recipe · 表格 / 散点图 / 柱状图 · 多维筛选 · CSV 导出',
    'page.cases.compare': '⇄ 对比案例',
    'page.calculator.title': '部署计算器',
    'page.calculator.subtitle': 'Tier 0 实测查表 + Tier 1 校准 Roofline 上界 · 公式公开',
    'page.china.title': '国产 AI 推理硬件全景',
    'page.china.subtitle': '矩阵热力图 · 代际谱系 · 生态对照 · 超节点',
    'page.compare.title': '硬件对比',
    'page.compare.subtitle': '选最多 5 张卡, 切换雷达图 / 柱状图 / Roofline 叠加 / 表格',
    'page.showcase.title': '精选发现 · 数据告诉我们什么',
    'page.showcase.subtitle': '从数据实体中自动计算的洞察, 每次构建时刷新',
    'page.pricing.title': '$ / M tokens 排名',
    'page.pricing.subtitle': '基于实测案例自动计算每张卡的成本效率, 答案随案例库增长持续更新',
    'page.pricing.formula': '公式 / Formula',
    'page.pricing.disclaimer': '⚠ 这是纯推理 BoM 估算 — 不含数据中心摊销、网络、运维、license 等。实际生产 $/M tokens 通常 1.5-3× of this。用于横向对比, 不用于绝对采购报价。',
    'page.pricing.bestPerHw': '每张卡最佳成本',
    'page.pricing.allCases': '全部案例 · 按 $/M tokens 升序',
    'page.pricing.cta': '想自己调整假设? 打开计算器'
  },
  en: {
    'nav.hardware': 'Hardware',
    'nav.servers': 'Super-pods',
    'nav.compare': 'Compare',
    'nav.models': 'Models',
    'nav.cases': 'Cases',
    'nav.playbooks': 'Playbooks',
    'nav.calculator': 'Calculator',
    'nav.china': 'China Hub',
    'nav.pricing': 'Pricing',
    'nav.contribute': 'Contribute',
    'nav.search': 'Search',
    'nav.menu': 'Menu',
    'nav.learn': 'Learn',
    'nav.tools': 'Tools',
    'nav.more': 'More',
    'nav.tours': 'Tours',
    'nav.pipeline': 'Pipeline',
    'nav.patterns': 'Patterns',
    'nav.operators': 'Operators',
    'nav.fusedKernels': 'Fused kernels',
    'nav.quantizations': 'Quantizations',
    'nav.engines': 'Engines',
    'nav.vendors': 'Vendors',
    'nav.showcase': 'Showcase',
    'nav.quality': 'Data quality',
    'nav.impact': 'Impact',
    'nav.about': 'About',
    'nav.changelog': 'Changelog',
    'nav.hostCpuMatrix': 'Host-CPU matrix',
    'nav.serversCompare': 'Compare super-pods',
    'nav.networkTopoMatrix': 'Network-topology matrix',
    'nav.storageMatrix': 'Storage matrix',
    'nav.clusterInternals': 'Cluster internals overview',
    'nav.pricingByEngine': 'Pricing by engine',
    'footer.tagline': 'Open knowledge base for AI inference hardware × models × deployment',
    'footer.browse': 'Browse',
    'footer.participate': 'Participate',
    'footer.license': 'License',
    'footer.about': 'About',
    'footer.learn': 'Learn',
    'footer.quality': 'Data quality',
    'footer.calculator': 'Calculator',
    'footer.disclaimer': 'All numbers are evidence-tagged (official / measured / estimated). Vendor-claimed values are unverified — not investment or procurement advice.',
    'home.eyebrow': 'EvoKernel · Spec',
    'home.heroLine1': 'Any model → any hardware',
    'home.heroLine2': 'A computable knowledge base',
    'home.subtitle': 'Open data on AI inference hardware, frontier models, and deployment cases. Every number carries an evidence citation. Most comprehensive Chinese accelerator coverage.',
    'home.ctaCalc': 'Open calculator →',
    'home.ctaChina': 'China Hub →',
    'home.latest': 'Latest cases',
    'home.entry.hardware': 'Hardware catalog',
    'home.entry.models': 'Model catalog',
    'home.entry.cases': 'Deployment cases',
    'home.entry.calculator': 'Calculator',
    'home.entry.china': 'China Hub',
    'home.entry.china.desc': 'Heatmap · genealogy · ecosystem',
    'home.entry.calculator.desc': 'Tier 0 measured + Tier 1 upper bound',
    'home.entry.cases.desc': 'Reproducible recipes',
    'home.entry.quantTree': 'Quantization decision tree',
    'home.entry.parallelism': 'Parallelism cheatsheet',
    'home.entry.pickEngine': 'Pick an inference engine',
    'home.entry.attention': 'Attention variants',
    'home.entry.failures': 'Deployment failure modes',
    'home.entry.observability': 'Production observability',
    'home.entry.lifecycle': 'Production lifecycle',
    'home.entry.capacityPlanning': 'Capacity planning',
    'home.entry.capacityCalculator': 'Capacity calculator',
    'home.section.browse': 'Browse data',
    'home.section.optimize': 'Deployment optimization',
    'home.section.learn': 'Learn',
    'home.section.tools': 'Tools',
    'home.section.about': 'About this project',
    'home.stats.hardware': 'Accelerators',
    'home.stats.models': 'Models',
    'home.stats.cases': 'Cases',
    'home.stats.vendors': 'Vendors',
    'page.hardware.title': 'Hardware catalog',
    'page.hardware.subtitle': 'accelerators',
    'page.hardware.cn': 'China',
    'page.hardware.overseas': 'Overseas',
    'page.hardware.timeline': 'Hardware release timeline',
    'page.models.title': 'Model catalog',
    'page.models.subtitle': 'frontier open-source models · with operator decomposition · release timeline',
    'page.cases.title': 'Deployment cases · leaderboard',
    'page.cases.subtitle': 'reproducible deployment recipes · table / scatter / bar · multi-facet filter · CSV export',
    'page.cases.compare': '⇄ Compare cases',
    'page.calculator.title': 'Deployment calculator',
    'page.calculator.subtitle': 'Tier 0 measured + Tier 1 calibrated Roofline upper bound · transparent formulas',
    'page.china.title': 'Chinese AI inference hardware',
    'page.china.subtitle': 'Matrix heatmap · genealogy · ecosystem · super-pods',
    'page.compare.title': 'Hardware compare',
    'page.compare.subtitle': 'Pick up to 5 cards, toggle Radar / Bar / Roofline overlay / Table',
    'page.showcase.title': 'Showcase · what the data tells us',
    'page.showcase.subtitle': 'Insights auto-computed from the data corpus, refreshed every build',
    'page.pricing.title': '$ / M tokens leaderboard',
    'page.pricing.subtitle': 'TCO efficiency per accelerator, recomputed on every build from the live case corpus',
    'page.pricing.formula': 'Formula',
    'page.pricing.disclaimer': '⚠ Compute-only BoM estimate — excludes datacenter amortization, networking, ops, licensing. Real production $/M tokens are typically 1.5–3× of this. Use for relative ranking, not absolute procurement quotes.',
    'page.pricing.bestPerHw': 'Best cost per card',
    'page.pricing.allCases': 'All cases · sorted by $/M tokens',
    'page.pricing.cta': 'Want to tweak the assumptions? Open the calculator'
  }
} as const;

export type TKey = keyof typeof dict.zh;

export function t(locale: Locale, key: TKey): string {
  return dict[locale][key] ?? dict.zh[key] ?? key;
}

/**
 * Astro's import.meta.env.BASE_URL is "/" by default and "/evokernel-spec/"
 * (or whatever astro.config.mjs `base` is) on project-page deploys. We
 * normalize it to either "" (root) or "/foo" (no trailing slash) for easy
 * concatenation with leading-slash paths.
 *
 * On non-Astro runtimes (e.g. Vitest), import.meta.env may be undefined —
 * fall back to "" so unit tests don't blow up.
 */
const RAW_BASE = (() => {
  try {
    // Astro injects this; Vite/Vitest may or may not depending on config.
    const v = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL;
    return typeof v === 'string' ? v : '/';
  } catch {
    return '/';
  }
})();
const BASE = RAW_BASE === '/' ? '' : RAW_BASE.replace(/\/$/, '');

/**
 * Build an internal absolute path. Prepends the deploy base (e.g.
 * "/evokernel-spec" on GitHub Pages) so links don't 404 on subpath deploys.
 *
 * For non-locale-aware paths (RSS feeds, /api/*, /cases.xml). For pages
 * that should respect the user's locale, use `localePath()` instead.
 *
 * Always pass a leading-slash path: pathname('/foo') → '/evokernel-spec/foo'.
 */
export function pathname(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!path.startsWith('/')) path = '/' + path;
  return BASE + path;
}

/**
 * Build a locale-aware path. EN gets a `/en/` prefix; both forms get
 * the deploy base prepended.
 *
 *   localePath('zh', '/hardware')     → '/hardware'                (custom domain)
 *   localePath('zh', '/hardware')     → '/evokernel-spec/hardware' (GitHub Pages)
 *   localePath('en', '/hardware')     → '/evokernel-spec/en/hardware'
 */
export function localePath(locale: Locale, path: string): string {
  let p = path;
  if (locale === 'en') {
    if (p === '/') p = '/en/';
    else if (!p.startsWith('/en/')) p = '/en' + p;
  }
  return pathname(p);
}
