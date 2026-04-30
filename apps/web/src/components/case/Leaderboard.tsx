import { useState, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ResponsiveContainer, Cell
} from 'recharts';
import type { Case } from '@evokernel/schemas';
import { toCsv, downloadCsv } from '~/lib/csv';
import { tr, type Locale } from '~/lib/i18n/island';
import { pathname } from '~/lib/i18n';

interface Props { cases: Case[]; locale?: Locale; }

type SortKey = 'submitted' | 'decode' | 'prefill' | 'ttft' | 'tbt';
type ViewMode = 'table' | 'scatter' | 'bar';
type YMetric = 'decode' | 'prefill' | 'ttft' | 'tbt';
type GroupBy = 'precision' | 'engine' | 'country' | 'model';

const METRIC_LABEL_ZH: Record<YMetric, { label: string; unit: string }> = {
  decode: { label: 'Decode 吞吐', unit: 'tok/s' },
  prefill: { label: 'Prefill 吞吐', unit: 'tok/s' },
  ttft: { label: 'TTFT p50', unit: 'ms' },
  tbt: { label: 'TBT p50', unit: 'ms' }
};
const METRIC_LABEL_EN: Record<YMetric, { label: string; unit: string }> = {
  decode: { label: 'Decode throughput', unit: 'tok/s' },
  prefill: { label: 'Prefill throughput', unit: 'tok/s' },
  ttft: { label: 'TTFT p50', unit: 'ms' },
  tbt: { label: 'TBT p50', unit: 'ms' }
};

function metricValue(c: Case, m: YMetric): number {
  switch (m) {
    case 'decode': return c.results.throughput_tokens_per_sec.decode;
    case 'prefill': return c.results.throughput_tokens_per_sec.prefill;
    case 'ttft': return c.results.latency_ms.ttft_p50;
    case 'tbt': return c.results.latency_ms.tbt_p50;
  }
}

const GROUP_PALETTE = [
  'oklch(48% 0.18 255)',  // accent
  'oklch(46% 0.22 25)',   // china
  'oklch(45% 0.16 145)',  // measured-green
  'oklch(45% 0.16 80)',   // estimated-amber
  'oklch(50% 0.18 320)',  // magenta
  'oklch(45% 0.14 200)',  // teal
  'oklch(50% 0.18 60)',   // orange
  'oklch(50% 0.16 165)'
];

export default function Leaderboard({ cases, locale = 'zh' }: Props) {
  const t = (k: Parameters<typeof tr>[1]) => tr(locale, k);
  const en = locale === 'en';
  const METRIC_LABEL = en ? METRIC_LABEL_EN : METRIC_LABEL_ZH;
  const [sort, setSort] = useState<SortKey>('submitted');
  const [hwFilter, setHwFilter] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [precisionFilter, setPrecisionFilter] = useState<string>('');
  const [disagg, setDisagg] = useState<'all' | 'yes' | 'no'>('all');
  const [search, setSearch] = useState<string>('');
  const [view, setView] = useState<ViewMode>('table');
  const [yMetric, setYMetric] = useState<YMetric>('decode');
  const [groupBy, setGroupBy] = useState<GroupBy>('precision');

  const hwOptions = useMemo(() => Array.from(new Set(cases.map((c) => c.stack.hardware.id))).sort(), [cases]);
  const modelOptions = useMemo(() => Array.from(new Set(cases.map((c) => c.stack.model.id))).sort(), [cases]);
  const precisionOptions = useMemo(() => Array.from(new Set(cases.map((c) => c.stack.quantization))).sort(), [cases]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cases
      .filter((c) => !hwFilter || c.stack.hardware.id === hwFilter)
      .filter((c) => !modelFilter || c.stack.model.id === modelFilter)
      .filter((c) => !precisionFilter || c.stack.quantization === precisionFilter)
      .filter((c) =>
        disagg === 'all' ? true : disagg === 'yes' ? c.stack.parallel.disaggregated : !c.stack.parallel.disaggregated
      )
      .filter((c) => !needle || [
        c.title, c.id, c.stack.hardware.id, c.stack.model.id,
        c.stack.engine.id, c.stack.quantization, c.bottleneck,
        c.submitter.github, c.submitter.affiliation ?? '',
        ...c.patterns
      ].join(' ').toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => {
        switch (sort) {
          case 'submitted': return b.submitted_at.localeCompare(a.submitted_at);
          case 'decode': return b.results.throughput_tokens_per_sec.decode - a.results.throughput_tokens_per_sec.decode;
          case 'prefill': return b.results.throughput_tokens_per_sec.prefill - a.results.throughput_tokens_per_sec.prefill;
          case 'ttft': return a.results.latency_ms.ttft_p50 - b.results.latency_ms.ttft_p50;
          case 'tbt': return a.results.latency_ms.tbt_p50 - b.results.latency_ms.tbt_p50;
        }
      });
  }, [cases, sort, hwFilter, modelFilter, precisionFilter, disagg, search]);

  // Group key for chart coloring
  function groupKeyOf(c: Case): string {
    switch (groupBy) {
      case 'precision': return c.stack.quantization;
      case 'engine': return c.stack.engine.id;
      case 'country': return c.stack.hardware.id.startsWith('ascend') ||
                              c.stack.hardware.id.startsWith('mlu') ||
                              c.stack.hardware.id.startsWith('dcu') ||
                              c.stack.hardware.id.startsWith('mtt') ||
                              c.stack.hardware.id.startsWith('br') ||
                              c.stack.hardware.id.startsWith('metax') ||
                              c.stack.hardware.id.startsWith('iluvatar') ||
                              c.stack.hardware.id.startsWith('enflame') ||
                              c.stack.hardware.id.startsWith('pingtouge')
                              ? 'CN' : 'overseas';
      case 'model': return c.stack.model.id;
    }
  }

  const groupKeys = Array.from(new Set(filtered.map(groupKeyOf))).sort();
  const groupColor = (k: string) => GROUP_PALETTE[groupKeys.indexOf(k) % GROUP_PALETTE.length] ?? GROUP_PALETTE[0];

  // Scatter: x = batch size × cards (load), y = chosen metric, color = group
  const scatterByGroup = groupKeys.map((k) => ({
    name: k,
    color: groupColor(k),
    points: filtered
      .filter((c) => groupKeyOf(c) === k)
      .map((c) => ({
        x: c.scenario.batch_size * c.stack.hardware.count,
        y: metricValue(c, yMetric),
        z: c.stack.hardware.count,
        case: c
      }))
  }));

  // Bar: top-10 cases by chosen metric (ascending for latency, descending for throughput)
  const isLatency = yMetric === 'ttft' || yMetric === 'tbt';
  const barRows = filtered
    .slice()
    .sort((a, b) => isLatency ? metricValue(a, yMetric) - metricValue(b, yMetric) : metricValue(b, yMetric) - metricValue(a, yMetric))
    .slice(0, 10)
    .map((c) => ({
      label: `${c.stack.hardware.id} ×${c.stack.hardware.count} · ${c.stack.model.id}`.slice(0, 60),
      value: metricValue(c, yMetric),
      group: groupKeyOf(c),
      caseId: c.id
    }));

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="text-right px-3 py-2 font-medium cursor-pointer select-none"
        onClick={() => setSort(k)}
        style={{ color: sort === k ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
      {children}{sort === k && ' ↓'}
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder={en ? 'Search (h100, deepseek, fp8...)' : '搜索 (h100, deepseek, fp8...)'}
               aria-label={en ? 'Search cases' : '搜索案例'}
               className="px-2 py-1 rounded border min-w-[12rem]"
               style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
        <select aria-label={en ? 'Filter by hardware' : '按硬件筛选'} value={hwFilter} onChange={(e) => setHwFilter(e.target.value)}
                className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">{en ? 'All hardware' : '所有硬件'}</option>
          {hwOptions.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select aria-label={en ? 'Filter by model' : '按模型筛选'} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}
                className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">{en ? 'All models' : '所有模型'}</option>
          {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label={en ? 'Filter by precision' : '按精度筛选'} value={precisionFilter} onChange={(e) => setPrecisionFilter(e.target.value)}
                className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">{en ? 'All precisions' : '所有精度'}</option>
          {precisionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-1">
          <span style={{ color: 'var(--color-text-muted)' }}>{en ? 'Disagg:' : '解耦:'}</span>
          <select aria-label={en ? 'Filter by disaggregated deploy' : '按解耦部署筛选'} value={disagg} onChange={(e) => setDisagg(e.target.value as 'all' | 'yes' | 'no')}
                  className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            <option value="all">{en ? 'All' : '全部'}</option>
            <option value="yes">disagg</option>
            <option value="no">co-located</option>
          </select>
        </label>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {filtered.length} / {cases.length} {en ? 'shown' : '显示'}
        </span>
        <button type="button"
                onClick={() => {
                  const rows = filtered.map((c) => ({
                    id: c.id, title: c.title, submitted_at: c.submitted_at,
                    hardware: c.stack.hardware.id, count: c.stack.hardware.count,
                    model: c.stack.model.id, engine: c.stack.engine.id, version: c.stack.engine.version,
                    quantization: c.stack.quantization,
                    tp: c.stack.parallel.tp, pp: c.stack.parallel.pp, ep: c.stack.parallel.ep,
                    disaggregated: c.stack.parallel.disaggregated,
                    decode_tok_s: c.results.throughput_tokens_per_sec.decode,
                    prefill_tok_s: c.results.throughput_tokens_per_sec.prefill,
                    ttft_p50_ms: c.results.latency_ms.ttft_p50,
                    ttft_p99_ms: c.results.latency_ms.ttft_p99,
                    tbt_p50_ms: c.results.latency_ms.tbt_p50,
                    tbt_p99_ms: c.results.latency_ms.tbt_p99,
                    bottleneck: c.bottleneck,
                    compute_pct: c.results.utilization.compute_pct,
                    memory_bw_pct: c.results.utilization.memory_bw_pct
                  }));
                  const csv = toCsv(rows, [
                    'id', 'title', 'submitted_at', 'hardware', 'count', 'model', 'engine', 'version',
                    'quantization', 'tp', 'pp', 'ep', 'disaggregated',
                    'decode_tok_s', 'prefill_tok_s',
                    'ttft_p50_ms', 'ttft_p99_ms', 'tbt_p50_ms', 'tbt_p99_ms',
                    'bottleneck', 'compute_pct', 'memory_bw_pct'
                  ]);
                  downloadCsv(`evokernel-cases-${new Date().toISOString().slice(0, 10)}.csv`, csv);
                }}
                className="text-xs px-3 py-1 rounded border"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer' }}>
          ⬇ {t('lb.export.csv')}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <span style={{ color: 'var(--color-text-muted)' }}>{en ? 'View:' : '视图:'}</span>
        {([
          { v: 'table' as const, l: t('lb.view.table') },
          { v: 'scatter' as const, l: t('lb.view.scatter') },
          { v: 'bar' as const, l: t('lb.view.bar') }
        ]).map((opt) => (
          <button key={opt.v} type="button" onClick={() => setView(opt.v)}
                  className="px-3 py-1 rounded text-xs"
                  style={{
                    background: view === opt.v ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: view === opt.v ? 'white' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer'
                  }}>{opt.l}</button>
        ))}
        {view !== 'table' && (
          <>
            <label className="ml-3">{en ? 'Metric' : '指标'}
              <select aria-label="Y axis metric" value={yMetric} onChange={(e) => setYMetric(e.target.value as YMetric)}
                      className="ml-1 px-2 py-1 rounded border text-xs"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                <option value="decode">Decode tok/s</option>
                <option value="prefill">Prefill tok/s</option>
                <option value="ttft">TTFT p50 ms</option>
                <option value="tbt">TBT p50 ms</option>
              </select>
            </label>
            <label>{en ? 'Group by' : '分组'}
              <select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                      className="ml-1 px-2 py-1 rounded border text-xs"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                <option value="precision">{en ? 'by precision' : '按精度'}</option>
                <option value="engine">{en ? 'by engine' : '按引擎'}</option>
                <option value="country">{en ? 'by country' : '按国别'}</option>
                <option value="model">{en ? 'by model' : '按模型'}</option>
              </select>
            </label>
          </>
        )}
      </div>

      {view === 'scatter' && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {en
              ? `X = batch × cards (load) · Y = ${METRIC_LABEL[yMetric].label} ${METRIC_LABEL[yMetric].unit} · color = ${groupBy === 'precision' ? 'precision' : groupBy === 'engine' ? 'engine' : groupBy === 'country' ? 'country' : 'model'}`
              : `X = 批次 × 卡数 (负载) · Y = ${METRIC_LABEL[yMetric].label} ${METRIC_LABEL[yMetric].unit} · 颜色 = ${groupBy === 'precision' ? '精度' : groupBy === 'engine' ? '引擎' : groupBy === 'country' ? '国别' : '模型'}`}
          </p>
          <ResponsiveContainer width="100%" height={420}>
            <ScatterChart margin={{ left: 8, right: 12, top: 8, bottom: 24 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="batch×cards" tick={{ fontSize: 10 }}
                     label={{ value: 'batch × cards', position: 'insideBottomRight', offset: -8, fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name={METRIC_LABEL[yMetric].label} tick={{ fontSize: 10 }}
                     label={{ value: METRIC_LABEL[yMetric].unit, angle: -90, position: 'insideLeft', fontSize: 10 }} />
              <ZAxis type="number" dataKey="z" range={[40, 200]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }}
                       contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', fontSize: 11 }}
                       formatter={(value, name, item) => {
                         if (name === 'batch×cards' || name === METRIC_LABEL[yMetric].label) return [value, name];
                         const c = (item as { payload?: { case?: Case } }).payload?.case;
                         return c ? [c.title, ''] : [value, name];
                       }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {scatterByGroup.map((g) => (
                <Scatter key={g.name} name={g.name} data={g.points} fill={g.color} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === 'bar' && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Top 10 by {METRIC_LABEL[yMetric].label} ({isLatency ? 'lower better' : 'higher better'}) · color = {groupBy === 'precision' ? 'precision' : groupBy === 'engine' ? 'engine' : groupBy === 'country' ? 'country' : 'model'}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(280, barRows.length * 32 + 40)}>
            <BarChart data={barRows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10 }}
                     label={{ value: METRIC_LABEL[yMetric].unit, position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={260} />
              <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', fontSize: 11 }} />
              <Bar dataKey="value">
                {barRows.map((row, i) => <Cell key={i} fill={groupColor(row.group)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === 'table' && (
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-surface)' }}>
            <tr>
              <th className="text-left px-3 py-2 font-medium">{en ? 'Case' : '案例'}</th>
              <Th k="decode">Decode tok/s</Th>
              <Th k="prefill">Prefill tok/s</Th>
              <Th k="ttft">TTFT p50 ms</Th>
              <Th k="tbt">TBT p50 ms</Th>
              <Th k="submitted">{en ? 'Date' : '日期'}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>{en ? 'No cases match the current filter' : '未匹配任何案例'}</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-3 py-2">
                  <a href={pathname(`${en ? '/en' : ''}/cases/${c.id}/`)} className="font-medium" style={{ color: 'var(--color-text)' }}>{c.title}</a>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {c.stack.hardware.id} ×{c.stack.hardware.count} · {c.stack.model.id} · {c.stack.engine.id} · {c.stack.quantization}
                  </div>
                </td>
                <td className="text-right px-3 py-2 font-mono">{c.results.throughput_tokens_per_sec.decode.toLocaleString()}</td>
                <td className="text-right px-3 py-2 font-mono">{c.results.throughput_tokens_per_sec.prefill.toLocaleString()}</td>
                <td className="text-right px-3 py-2 font-mono">{c.results.latency_ms.ttft_p50}</td>
                <td className="text-right px-3 py-2 font-mono">{c.results.latency_ms.tbt_p50}</td>
                <td className="text-right px-3 py-2 font-mono text-xs">{c.submitted_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
