import { useState, useMemo, useEffect } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer
} from 'recharts';
import type { Case } from '@evokernel/schemas';

interface Props { cases: Case[]; }

const PALETTE = [
  'oklch(48% 0.18 255)',
  'oklch(46% 0.22 25)',
  'oklch(45% 0.16 145)',
  'oklch(45% 0.16 80)'
];

const MAX_PICK = 4;

interface Row {
  label: string;
  values: Array<number | string | null>;
  highlight?: 'higher-better' | 'lower-better';
}

function valueAt<K extends keyof Case['results']['latency_ms']>(c: Case, k: K): number {
  return c.results.latency_ms[k];
}

export default function CaseCompare({ cases }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  // Hydrate from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ids = (params.get('ids') ?? '').split(',').filter(Boolean).filter((id) => cases.some((c) => c.id === id));
    if (ids.length > 0) setSelected(ids);
  }, [cases]);

  // Sync selection back to URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (selected.length > 0) params.set('ids', selected.join(','));
    else params.delete('ids');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }, [selected]);

  const candidates = useMemo(() => {
    if (!filter) return cases;
    const needle = filter.toLowerCase();
    return cases.filter((c) =>
      [c.title, c.id, c.stack.hardware.id, c.stack.model.id, c.stack.engine.id, c.stack.quantization]
        .join(' ').toLowerCase().includes(needle)
    );
  }, [cases, filter]);

  const selectedCases = selected.map((id) => cases.find((c) => c.id === id)).filter(Boolean) as Case[];

  function toggle(id: string) {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= MAX_PICK) return s;
      return [...s, id];
    });
  }

  const rows: Row[] = [
    { label: '硬件 × 数量', values: selectedCases.map((c) => `${c.stack.hardware.id} × ${c.stack.hardware.count}`) },
    { label: '模型', values: selectedCases.map((c) => c.stack.model.id) },
    { label: '引擎', values: selectedCases.map((c) => `${c.stack.engine.id} ${c.stack.engine.version}`) },
    { label: '量化', values: selectedCases.map((c) => c.stack.quantization) },
    { label: '并行', values: selectedCases.map((c) => `TP=${c.stack.parallel.tp} PP=${c.stack.parallel.pp} EP=${c.stack.parallel.ep}`) },
    { label: 'Disaggregated', values: selectedCases.map((c) => c.stack.parallel.disaggregated ? 'yes' : 'no') },
    { label: 'Prefill seq', values: selectedCases.map((c) => c.scenario.prefill_seq_len) },
    { label: 'Decode seq', values: selectedCases.map((c) => c.scenario.decode_seq_len) },
    { label: 'Batch', values: selectedCases.map((c) => c.scenario.batch_size) },
    { label: 'Decode tok/s', values: selectedCases.map((c) => c.results.throughput_tokens_per_sec.decode), highlight: 'higher-better' },
    { label: 'Prefill tok/s', values: selectedCases.map((c) => c.results.throughput_tokens_per_sec.prefill), highlight: 'higher-better' },
    { label: 'TTFT p50 (ms)', values: selectedCases.map((c) => valueAt(c, 'ttft_p50')), highlight: 'lower-better' },
    { label: 'TTFT p99 (ms)', values: selectedCases.map((c) => valueAt(c, 'ttft_p99')), highlight: 'lower-better' },
    { label: 'TBT p50 (ms)', values: selectedCases.map((c) => valueAt(c, 'tbt_p50')), highlight: 'lower-better' },
    { label: 'TBT p99 (ms)', values: selectedCases.map((c) => valueAt(c, 'tbt_p99')), highlight: 'lower-better' },
    { label: 'Memory/card (GB)', values: selectedCases.map((c) => c.results.memory_per_card_gb) },
    { label: 'Power/card (W)', values: selectedCases.map((c) => c.results.power_per_card_w), highlight: 'lower-better' },
    { label: 'Compute util %', values: selectedCases.map((c) => c.results.utilization.compute_pct) },
    { label: 'Mem BW util %', values: selectedCases.map((c) => c.results.utilization.memory_bw_pct) },
    { label: '瓶颈', values: selectedCases.map((c) => c.bottleneck) }
  ];

  // Find best value index per row for highlighting
  function bestIdxFor(row: Row): number | null {
    if (!row.highlight) return null;
    const numeric = row.values.map((v) => (typeof v === 'number' ? v : NaN));
    if (numeric.every(isNaN)) return null;
    if (row.highlight === 'higher-better') {
      const max = Math.max(...numeric.filter((n) => !isNaN(n)));
      return numeric.findIndex((n) => n === max);
    } else {
      const min = Math.min(...numeric.filter((n) => !isNaN(n)));
      return numeric.findIndex((n) => n === min);
    }
  }

  // Radar data: normalize 4 perf metrics across selected (higher = better)
  const radarMetrics: Array<{ name: string; getValue: (c: Case) => number; invert?: boolean }> = [
    { name: 'Decode tok/s', getValue: (c) => c.results.throughput_tokens_per_sec.decode },
    { name: 'Prefill tok/s', getValue: (c) => c.results.throughput_tokens_per_sec.prefill },
    { name: 'TTFT p50', getValue: (c) => c.results.latency_ms.ttft_p50, invert: true },
    { name: 'TBT p50', getValue: (c) => c.results.latency_ms.tbt_p50, invert: true },
    { name: 'Compute util', getValue: (c) => c.results.utilization.compute_pct },
    { name: 'Mem BW util', getValue: (c) => c.results.utilization.memory_bw_pct }
  ];
  const radarData = radarMetrics.map((m) => {
    const row: Record<string, number | string> = { metric: m.name };
    const vals = selectedCases.map(m.getValue);
    if (m.invert) {
      // smaller is better → invert by dividing min by value
      const min = Math.min(...vals);
      selectedCases.forEach((c, i) => {
        row[c.id] = vals[i] === 0 ? 0 : (min / vals[i]!) * 100;
      });
    } else {
      const max = Math.max(...vals, 1);
      selectedCases.forEach((c, i) => {
        row[c.id] = (vals[i]! / max) * 100;
      });
    }
    return row;
  });

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[18rem,1fr] gap-6">
        <aside>
          <div className="mb-3">
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
                   placeholder="搜索案例..."
                   className="w-full px-3 py-1.5 rounded border text-sm"
                   style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
          </div>
          <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
            {candidates.map((c) => {
              const idx = selected.indexOf(c.id);
              const isSel = idx >= 0;
              const color = isSel ? PALETTE[idx]! : 'transparent';
              return (
                <button key={c.id} type="button" onClick={() => toggle(c.id)}
                        className="w-full text-left px-2 py-2 rounded text-xs border flex items-start gap-2"
                        style={{
                          borderColor: isSel ? color : 'var(--color-border)',
                          background: isSel ? `color-mix(in oklch, ${color} 8%, var(--color-bg))` : 'var(--color-surface)',
                          cursor: 'pointer'
                        }}>
                  <span className="w-2 h-2 rounded-full inline-block flex-shrink-0 mt-1" style={{ background: color, border: isSel ? 'none' : '1px solid var(--color-border)' }}></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate" style={{ color: 'var(--color-text)' }}>{c.title}</span>
                    <span className="text-[0.65rem] block" style={{ color: 'var(--color-text-muted)' }}>{c.stack.hardware.id} ×{c.stack.hardware.count} · {c.stack.model.id}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>{selected.length}/{MAX_PICK} 选中</p>
        </aside>

        <div className="rounded-lg border p-4 min-h-[28rem]"
             style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
          {selectedCases.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-sm" style={{ color: 'var(--color-text-muted)' }}>请从左侧选择 2-{MAX_PICK} 个案例对比</div>
          ) : selectedCases.length === 1 ? (
            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>再选一个案例开始对比 →</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--color-border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: 'var(--color-text)' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }} />
                  {selectedCases.map((c, i) => (
                    <Radar key={c.id} name={c.title.slice(0, 36)} dataKey={c.id} stroke={PALETTE[i]} fill={PALETTE[i]} fillOpacity={0.2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
              <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
                每个轴归一化到 [0, 100]：吞吐越大越好；延迟使用 min/value 反转 (越大越好)
              </p>
            </>
          )}
        </div>
      </div>

      {selectedCases.length >= 2 && (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--color-surface)' }}>
              <tr>
                <th className="text-left px-3 py-2 font-medium">指标</th>
                {selectedCases.map((c, i) => (
                  <th key={c.id} className="text-right px-3 py-2 font-medium" style={{ color: PALETTE[i] }}>
                    <a href={`/cases/${c.id}/`} className="underline">{c.title.slice(0, 24)}</a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const bestIdx = bestIdxFor(row);
                return (
                  <tr key={row.label} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-3 py-2">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className="text-right px-3 py-2 font-mono"
                          style={i === bestIdx ? { color: 'var(--color-tier-measured)', fontWeight: 600 } : {}}>
                        {typeof v === 'number' ? v.toLocaleString() : (v ?? '—')}
                        {i === bestIdx && row.highlight && <span className="ml-1">★</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
