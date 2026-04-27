import { useState, useMemo } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import type { Hardware } from '@evokernel/schemas';

interface ResolvedHw extends Hardware {
  vendor: { id: string; name: string; country: string; chinese_names: string[] };
}

interface Props { hardware: ResolvedHw[]; }

const PALETTE = [
  'oklch(58% 0.18 255)',
  'oklch(54% 0.22 25)',
  'oklch(58% 0.16 145)',
  'oklch(70% 0.16 80)',
  'oklch(50% 0.18 320)',
  'oklch(62% 0.14 200)'
];

type Metric = 'bf16_tflops' | 'fp8_tflops' | 'fp4_tflops' | 'memory_gb' | 'memory_bw_tbs' | 'tdp_w' | 'scale_up_gbps';

const METRICS: Array<{ key: Metric; label: string; unit: string }> = [
  { key: 'bf16_tflops', label: 'BF16', unit: 'TFLOP/s' },
  { key: 'fp8_tflops', label: 'FP8', unit: 'TFLOP/s' },
  { key: 'fp4_tflops', label: 'FP4', unit: 'TFLOP/s' },
  { key: 'memory_gb', label: '显存', unit: 'GB' },
  { key: 'memory_bw_tbs', label: '内存带宽', unit: 'TB/s' },
  { key: 'tdp_w', label: 'TDP', unit: 'W' },
  { key: 'scale_up_gbps', label: 'Scale-Up', unit: 'GB/s' }
];

function getMetric(h: ResolvedHw, k: Metric): number {
  switch (k) {
    case 'bf16_tflops': return h.compute.bf16_tflops?.value ?? 0;
    case 'fp8_tflops': return h.compute.fp8_tflops?.value ?? 0;
    case 'fp4_tflops': return h.compute.fp4_tflops?.value ?? 0;
    case 'memory_gb': return h.memory.capacity_gb?.value ?? 0;
    case 'memory_bw_tbs': return (h.memory.bandwidth_gbps?.value ?? 0) / 1000;
    case 'tdp_w': return h.power.tdp_w?.value ?? 0;
    case 'scale_up_gbps': return h.scale_up.bandwidth_gbps;
  }
}

const MAX_PICK = 5;

export default function CompareTool({ hardware }: Props) {
  const [selected, setSelected] = useState<string[]>(['h100-sxm5', 'b200-sxm', 'mi355x', 'ascend-910c']);
  const [chartType, setChartType] = useState<'bar' | 'radar' | 'table' | 'roofline'>('radar');
  const [filter, setFilter] = useState('');

  const cards = useMemo(() =>
    hardware.filter((h) => !filter || h.name.toLowerCase().includes(filter.toLowerCase()) || h.vendor.id.includes(filter.toLowerCase())),
    [hardware, filter]
  );
  const selectedCards = selected.map((id) => hardware.find((h) => h.id === id)).filter(Boolean) as ResolvedHw[];

  function toggle(id: string) {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= MAX_PICK) return s;
      return [...s, id];
    });
  }

  // Normalize for radar: each metric scaled to 0-100 across selected
  const radarData = useMemo(() => {
    return METRICS.map((m) => {
      const row: Record<string, number | string> = { metric: m.label };
      const max = Math.max(...selectedCards.map((h) => getMetric(h, m.key)), 1);
      for (const h of selectedCards) {
        row[h.id] = max === 0 ? 0 : (getMetric(h, m.key) / max) * 100;
      }
      return row;
    });
  }, [selectedCards]);

  const barData = useMemo(() => {
    return METRICS.map((m) => {
      const row: Record<string, number | string> = { metric: m.label };
      for (const h of selectedCards) row[h.id] = getMetric(h, m.key);
      return row;
    });
  }, [selectedCards]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium">视图:</span>
        {([
          { v: 'radar' as const, l: '雷达图' },
          { v: 'bar' as const, l: '柱状图' },
          { v: 'roofline' as const, l: 'Roofline' },
          { v: 'table' as const, l: '对比表' }
        ]).map((opt) => (
          <button key={opt.v} type="button" onClick={() => setChartType(opt.v)}
                  className="px-3 py-1 rounded text-sm"
                  style={{
                    background: chartType === opt.v ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: chartType === opt.v ? 'white' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer'
                  }}>{opt.l}</button>
        ))}
        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {selected.length}/{MAX_PICK} 选中
        </span>
      </div>

      <div className="grid lg:grid-cols-[18rem,1fr] gap-6">
        <aside>
          <div className="mb-3">
            <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
                   placeholder="搜索硬件..."
                   className="w-full px-3 py-1.5 rounded border text-sm"
                   style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {cards.map((h) => {
              const idx = selected.indexOf(h.id);
              const isSel = idx >= 0;
              const color = isSel ? PALETTE[idx]! : 'transparent';
              return (
                <button key={h.id} type="button" onClick={() => toggle(h.id)}
                        className="w-full text-left px-3 py-2 rounded text-sm border flex items-center gap-2"
                        style={{
                          borderColor: isSel ? color : 'var(--color-border)',
                          background: isSel ? `color-mix(in oklch, ${color} 8%, var(--color-bg))` : 'var(--color-surface)',
                          cursor: 'pointer'
                        }}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: color, border: isSel ? 'none' : '1px solid var(--color-border)' }}></span>
                  <span className="truncate">{h.name}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="rounded-lg border p-4 min-h-[28rem]"
             style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
          {selectedCards.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-sm" style={{ color: 'var(--color-text-muted)' }}>请从左侧选择 2-{MAX_PICK} 张卡进行对比</div>
          ) : chartType === 'radar' ? (
            <ResponsiveContainer width="100%" height={420}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12, fill: 'var(--color-text)' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                {selectedCards.map((h, i) => (
                  <Radar key={h.id} name={h.name} dataKey={h.id} stroke={PALETTE[i]} fill={PALETTE[i]} fillOpacity={0.25} />
                ))}
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          ) : chartType === 'bar' ? (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={barData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {selectedCards.map((h, i) => (
                  <Bar key={h.id} dataKey={h.id} name={h.name} fill={PALETTE[i]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : chartType === 'roofline' ? (
            <RooflineOverlay selectedCards={selectedCards} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2" style={{ color: 'var(--color-text-muted)' }}>指标</th>
                  {selectedCards.map((h, i) => (
                    <th key={h.id} className="text-right p-2 font-medium"
                        style={{ color: PALETTE[i] }}>{h.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => (
                  <tr key={m.key} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="p-2">{m.label} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{m.unit}</span></td>
                    {selectedCards.map((h) => {
                      const v = getMetric(h, m.key);
                      return <td key={h.id} className="text-right p-2 font-mono">{v ? v.toLocaleString() : '—'}</td>;
                    })}
                  </tr>
                ))}
                <tr className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="p-2">国别</td>
                  {selectedCards.map((h) => (
                    <td key={h.id} className="text-right p-2 text-xs">{h.vendor.country}</td>
                  ))}
                </tr>
                <tr className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="p-2">形态</td>
                  {selectedCards.map((h) => (
                    <td key={h.id} className="text-right p-2 text-xs">{h.form_factor.toUpperCase()}</td>
                  ))}
                </tr>
                <tr className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="p-2">代际</td>
                  {selectedCards.map((h) => (
                    <td key={h.id} className="text-right p-2 text-xs font-mono">{h.generation}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function RooflineOverlay({ selectedCards }: { selectedCards: ResolvedHw[] }) {
  // Build merged data series for log-x roofline curves per card.
  // X axis: arithmetic intensity (FLOP/byte). Y: TFLOP/s.
  const sample = 60;
  const xs: number[] = [];
  const xMin = 0.1;
  const xMax = 10000;
  for (let i = 0; i < sample; i++) {
    xs.push(xMin * Math.pow(xMax / xMin, i / (sample - 1)));
  }
  const data = xs.map((x) => {
    const row: Record<string, number> = { x: Number(x.toFixed(2)) };
    for (const h of selectedCards) {
      const peakC = h.compute.bf16_tflops?.value ?? 0;
      const peakBw = (h.memory.bandwidth_gbps?.value ?? 0) / 1; // GB/s
      if (!peakC || !peakBw) continue;
      const memBound = (peakBw * x) / 1000; // GFLOP -> TFLOP
      row[h.id] = Number(Math.min(peakC, memBound).toFixed(1));
    }
    return row;
  });
  return (
    <div>
      <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
        Roofline 上界 (BF16) — 横轴: 算术强度 FLOP/byte (log) · 纵轴: 吞吐 TFLOP/s (log)
      </div>
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="x" type="number" scale="log" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10 }}
                 label={{ value: 'FLOP/byte', position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
          <YAxis type="number" scale="log" domain={['auto', 'auto']} tick={{ fontSize: 10 }}
                 label={{ value: 'TFLOP/s', position: 'insideTopLeft', offset: 8, fontSize: 10 }} />
          <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {selectedCards.map((h, i) => (
            <Line key={h.id} type="monotone" dataKey={h.id} name={h.name} stroke={PALETTE[i]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
