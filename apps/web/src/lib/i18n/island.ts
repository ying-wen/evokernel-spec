// Island-internal i18n. Page chrome lives in ./index.ts (server-rendered);
// this dictionary covers React-island button labels and section headers that
// render client-side. Kept separate so the main dict doesn't bloat with UI
// strings that page-level Astro components never need.

export type Locale = 'zh' | 'en';

const dict = {
  zh: {
    // Calculator
    'calc.step.model': '选模型',
    'calc.step.hardware': '选硬件',
    'calc.step.scenario': '选场景',
    'calc.step.model.title': '1. 选模型',
    'calc.step.hardware.title': '2. 选硬件',
    'calc.step.scenario.title': '3. 选场景',
    'calc.history': '历史 / History',
    'calc.history.empty': '暂无历史',
    'calc.infeasible': '不可行',
    'calc.cards': '卡数',
    'calc.tier0.title': '实测案例 (Tier 0)',
    'calc.tier0.empty.prefix': '尚无匹配的实测案例。',
    'calc.tier0.empty.contribute': '贡献你的实测?',
    'calc.tier1.title': '理论上界 (Tier 1, Roofline)',
    'calc.decode.upper': 'Decode 吞吐上界',
    'calc.bottleneck': '瓶颈',
    'calc.bottleneck.compute': '计算受限',
    'calc.bottleneck.memory': '内存带宽受限',
    'calc.memory.percard': '单卡显存',
    'calc.memory.infeasible': '❌ 配置不可行 (见下方建议)',
    'calc.share.label': '分享 / 导出:',
    'calc.share.exportJson': '导出 JSON',
    'calc.share.exportYaml': '导出 YAML',
    'calc.share.copied': '已复制!',
    'calc.share.urlnote': 'URL 包含全部状态, 直接分享即可',
    'calc.disagg.title': '解耦部署估算 (Disaggregated)',
    'calc.disagg.prefillPool': 'Prefill 池吞吐',
    'calc.disagg.decodePool': 'Decode 池吞吐',
    'calc.tco.title': 'TCO 估算 ($/M tokens)',
    'calc.opbreakdown.share': '占比',
    'calc.cluster.throughput': '集群吞吐 tok/s',
    'calc.roofline.note': 'Roofline 图 (横轴: 算术强度 FLOP/byte; 纵轴: 吞吐 TFLOP/s)',
    // Filter / sidebar
    'filter.country': '国家',
    'filter.country.cn': '国产',
    'filter.country.overseas': '海外',
    'filter.precision': '精度',
    'filter.engine': '引擎',
    'filter.year': '发布年',
    'filter.export.csv': '导出 CSV',
    'filter.results': '结果',
    'filter.reset': '重置',
    'filter.search': '搜索',
    // Leaderboard
    'lb.view.table': '表格',
    'lb.view.scatter': '散点图',
    'lb.view.bar': '柱状图',
    'lb.search.placeholder': '搜索 (模型 / 硬件 / 引擎)...',
    'lb.export.csv': '导出 CSV',
    'lb.compare.cta': '⇄ 对比案例',
    // Compare
    'cmp.view.radar': '雷达图',
    'cmp.view.bar': '柱状图',
    'cmp.view.roofline': 'Roofline 叠加',
    'cmp.view.table': '表格',
    'cmp.pick.cards': '已选 {n} / 5'
  },
  en: {
    'calc.step.model': 'Pick model',
    'calc.step.hardware': 'Pick hardware',
    'calc.step.scenario': 'Configure scenario',
    'calc.step.model.title': '1. Pick model',
    'calc.step.hardware.title': '2. Pick hardware',
    'calc.step.scenario.title': '3. Configure scenario',
    'calc.history': 'History',
    'calc.history.empty': 'No history yet',
    'calc.infeasible': 'infeasible',
    'calc.cards': 'Cards',
    'calc.tier0.title': 'Measured cases (Tier 0)',
    'calc.tier0.empty.prefix': 'No matching measured cases yet. ',
    'calc.tier0.empty.contribute': 'Contribute your measurement?',
    'calc.tier1.title': 'Theoretical upper bound (Tier 1, Roofline)',
    'calc.decode.upper': 'Decode throughput upper bound',
    'calc.bottleneck': 'Bottleneck',
    'calc.bottleneck.compute': 'compute-bound',
    'calc.bottleneck.memory': 'memory-bandwidth-bound',
    'calc.memory.percard': 'Memory / card',
    'calc.memory.infeasible': '❌ Configuration infeasible (see suggestions below)',
    'calc.share.label': 'Share / export:',
    'calc.share.exportJson': 'Export JSON',
    'calc.share.exportYaml': 'Export YAML',
    'calc.share.copied': 'Copied!',
    'calc.share.urlnote': 'URL carries the full state — share it as-is',
    'calc.disagg.title': 'Disaggregated deployment estimate',
    'calc.disagg.prefillPool': 'Prefill pool throughput',
    'calc.disagg.decodePool': 'Decode pool throughput',
    'calc.tco.title': 'TCO estimate ($/M tokens)',
    'calc.opbreakdown.share': 'share',
    'calc.cluster.throughput': 'Cluster throughput tok/s',
    'calc.roofline.note': 'Roofline (x: arithmetic intensity FLOP/byte · y: throughput TFLOP/s)',
    'filter.country': 'Country',
    'filter.country.cn': 'China',
    'filter.country.overseas': 'Overseas',
    'filter.precision': 'Precision',
    'filter.engine': 'Engine',
    'filter.year': 'Release year',
    'filter.export.csv': 'Export CSV',
    'filter.results': 'Results',
    'filter.reset': 'Reset',
    'filter.search': 'Search',
    'lb.view.table': 'Table',
    'lb.view.scatter': 'Scatter',
    'lb.view.bar': 'Bar',
    'lb.search.placeholder': 'Search (model / hardware / engine)...',
    'lb.export.csv': 'Export CSV',
    'lb.compare.cta': '⇄ Compare cases',
    'cmp.view.radar': 'Radar',
    'cmp.view.bar': 'Bar',
    'cmp.view.roofline': 'Roofline overlay',
    'cmp.view.table': 'Table',
    'cmp.pick.cards': 'Selected {n} / 5'
  }
} as const;

export type IslandKey = keyof typeof dict.zh;

export function tr(locale: Locale, key: IslandKey, vars?: Record<string, string | number>): string {
  let s: string = dict[locale][key] ?? dict.zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}
