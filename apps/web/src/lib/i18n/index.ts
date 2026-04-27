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
    'home.stats.vendors': '厂商'
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
    'home.stats.vendors': 'Vendors'
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
