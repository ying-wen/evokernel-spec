// Minimal i18n: zh (default) and en. Translations are inline keys; no runtime
// loader, no extra dependency. Astro picks the locale from the URL prefix
// (/ → zh, /en/ → en) and pages thread it through.

export type Locale = 'zh' | 'en';

const dict = {
  zh: {
    'nav.hardware': '硬件',
    'nav.compare': '对比',
    'nav.models': '模型',
    'nav.cases': '案例',
    'nav.calculator': '计算器',
    'nav.china': '国产专题',
    'nav.search': '搜索',
    'nav.menu': '菜单',
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
    'page.showcase.subtitle': '从数据实体中自动计算的洞察, 每次构建时刷新'
  },
  en: {
    'nav.hardware': 'Hardware',
    'nav.compare': 'Compare',
    'nav.models': 'Models',
    'nav.cases': 'Cases',
    'nav.calculator': 'Calculator',
    'nav.china': 'China Hub',
    'nav.search': 'Search',
    'nav.menu': 'Menu',
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
    'page.showcase.subtitle': 'Insights auto-computed from the data corpus, refreshed every build'
  }
} as const;

export type TKey = keyof typeof dict.zh;

export function t(locale: Locale, key: TKey): string {
  return dict[locale][key] ?? dict.zh[key] ?? key;
}

/** Build a path by prepending the locale prefix when locale = 'en'. */
export function localePath(locale: Locale, path: string): string {
  if (locale === 'zh') return path;
  if (path === '/') return '/en/';
  if (path.startsWith('/en/')) return path;
  return `/en${path}`;
}
