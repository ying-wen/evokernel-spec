import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Case } from '@evokernel/schemas';

interface Props {
  current: Case;
  related: Case[];   // other cases for the same model
}

export default function CaseChart({ current, related }: Props) {
  const all = [current, ...related.filter((c) => c.id !== current.id)].slice(0, 6);
  const data = all.map((c) => ({
    label: c.stack.hardware.id.split('-').slice(-2).join('-') + ` ×${c.stack.hardware.count}`,
    decode: c.results.throughput_tokens_per_sec.decode,
    prefill: c.results.throughput_tokens_per_sec.prefill,
    isCurrent: c.id === current.id
  }));
  return (
    <div className="rounded-lg border p-4" style={{ background: 'var(--color-surface-raised)', borderColor: 'var(--color-border)' }}>
      <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>本 case vs 同模型其他 case 的吞吐对比</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} label={{ value: 'tok/s', angle: -90, position: 'insideLeft', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="decode" name="Decode tok/s" fill="var(--color-accent)" />
          <Bar dataKey="prefill" name="Prefill tok/s" fill="var(--color-china)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
