import { useState, useMemo } from 'react';
import type { Case } from '@evokernel/schemas';

interface Props { cases: Case[]; }

type SortKey = 'submitted' | 'decode' | 'prefill' | 'ttft' | 'tbt';

export default function Leaderboard({ cases }: Props) {
  const [sort, setSort] = useState<SortKey>('submitted');
  const [hwFilter, setHwFilter] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [precisionFilter, setPrecisionFilter] = useState<string>('');
  const [disagg, setDisagg] = useState<'all' | 'yes' | 'no'>('all');

  const hwOptions = useMemo(() => Array.from(new Set(cases.map((c) => c.stack.hardware.id))).sort(), [cases]);
  const modelOptions = useMemo(() => Array.from(new Set(cases.map((c) => c.stack.model.id))).sort(), [cases]);
  const precisionOptions = useMemo(() => Array.from(new Set(cases.map((c) => c.stack.quantization))).sort(), [cases]);

  const filtered = useMemo(() => {
    return cases
      .filter((c) => !hwFilter || c.stack.hardware.id === hwFilter)
      .filter((c) => !modelFilter || c.stack.model.id === modelFilter)
      .filter((c) => !precisionFilter || c.stack.quantization === precisionFilter)
      .filter((c) =>
        disagg === 'all' ? true : disagg === 'yes' ? c.stack.parallel.disaggregated : !c.stack.parallel.disaggregated
      )
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
  }, [cases, sort, hwFilter, modelFilter, precisionFilter, disagg]);

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
        <select aria-label="按硬件筛选" value={hwFilter} onChange={(e) => setHwFilter(e.target.value)}
                className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">所有硬件</option>
          {hwOptions.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select aria-label="按模型筛选" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}
                className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">所有模型</option>
          {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="按精度筛选" value={precisionFilter} onChange={(e) => setPrecisionFilter(e.target.value)}
                className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">所有精度</option>
          {precisionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-1">
          <span style={{ color: 'var(--color-text-muted)' }}>解耦:</span>
          <select aria-label="按解耦部署筛选" value={disagg} onChange={(e) => setDisagg(e.target.value as 'all' | 'yes' | 'no')}
                  className="px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            <option value="all">全部</option>
            <option value="yes">disagg</option>
            <option value="no">co-located</option>
          </select>
        </label>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {filtered.length} / {cases.length} 显示
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-surface)' }}>
            <tr>
              <th className="text-left px-3 py-2 font-medium">案例</th>
              <Th k="decode">Decode tok/s</Th>
              <Th k="prefill">Prefill tok/s</Th>
              <Th k="ttft">TTFT p50 ms</Th>
              <Th k="tbt">TBT p50 ms</Th>
              <Th k="submitted">日期</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>未匹配任何案例</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-3 py-2">
                  <a href={`/cases/${c.id}`} className="font-medium" style={{ color: 'var(--color-text)' }}>{c.title}</a>
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
    </div>
  );
}
