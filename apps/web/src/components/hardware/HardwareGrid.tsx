import { useState, useMemo } from 'react';
import type { Hardware, Vendor } from '@evokernel/schemas';

type ResolvedHw = Omit<Hardware, 'vendor'> & { vendor: Pick<Vendor, 'id' | 'name' | 'country' | 'chinese_names'> };

interface Props { hardware: ResolvedHw[]; }

type Country = 'all' | 'CN' | 'overseas';
type Form = 'all' | 'sxm' | 'oam' | 'pcie' | 'nvl' | 'proprietary';
type Status = 'all' | 'in-production' | 'discontinued' | 'taping-out' | 'announced';

const FORM_OPTS: Form[] = ['all', 'sxm', 'oam', 'pcie', 'nvl', 'proprietary'];
const STATUS_OPTS: Status[] = ['all', 'in-production', 'discontinued', 'taping-out', 'announced'];
const STATUS_LABEL: Record<Status, string> = {
  all: '全部', 'in-production': '在售', discontinued: '停产', 'taping-out': '流片中', announced: '已发布'
};

function fmtBw(bw: number | null | undefined): string {
  if (!bw) return '—';
  return bw >= 1000 ? `${(bw / 1000).toFixed(1)} TB/s` : `${bw} GB/s`;
}

export default function HardwareGrid({ hardware }: Props) {
  const [country, setCountry] = useState<Country>('all');
  const [form, setForm] = useState<Form>('all');
  const [status, setStatus] = useState<Status>('all');
  const [fp8, setFp8] = useState(false);
  const [fp4, setFp4] = useState(false);
  const [minMem, setMinMem] = useState(0); // GB
  const [minBf16, setMinBf16] = useState(0); // TFLOPS
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return hardware.filter((h) => {
      if (country !== 'all') {
        const isCN = h.vendor.country === 'CN';
        if (country === 'CN' && !isCN) return false;
        if (country === 'overseas' && isCN) return false;
      }
      if (form !== 'all' && h.form_factor !== form) return false;
      if (status !== 'all' && h.status !== status) return false;
      if (fp8 && !h.compute.fp8_tflops) return false;
      if (fp4 && !h.compute.fp4_tflops) return false;
      if (minMem > 0 && (h.memory.capacity_gb?.value ?? 0) < minMem) return false;
      if (minBf16 > 0 && (h.compute.bf16_tflops?.value ?? 0) < minBf16) return false;
      if (search) {
        const needle = search.toLowerCase();
        const haystack = [
          h.name, h.id, h.vendor.id, h.vendor.name,
          ...(h.vendor.chinese_names ?? []),
          ...(h.aliases ?? []),
          ...(h.chinese_names ?? [])
        ].join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [hardware, country, form, status, fp8, fp4, minMem, minBf16, search]);

  const cn = filtered.filter((h) => h.vendor.country === 'CN').sort((a, b) => b.release_year - a.release_year);
  const overseas = filtered.filter((h) => h.vendor.country !== 'CN').sort((a, b) => b.release_year - a.release_year);

  const reset = () => {
    setCountry('all'); setForm('all'); setStatus('all');
    setFp8(false); setFp4(false); setMinMem(0); setMinBf16(0); setSearch('');
  };

  return (
    <div className="grid lg:grid-cols-[14rem,1fr] gap-8">
      <aside className="space-y-5 self-start text-sm" style={{ position: 'sticky', top: '5rem' }}>
        <div>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="搜索 (h100, 昇腾, MI3...)"
                 className="w-full px-3 py-1.5 rounded border text-sm"
                 style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>厂商国别</h4>
          <div className="flex gap-1 flex-wrap">
            {(['all', 'CN', 'overseas'] as Country[]).map((c) => (
              <button key={c} onClick={() => setCountry(c)} type="button"
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        background: country === c ? (c === 'CN' ? 'var(--color-china)' : 'var(--color-accent)') : 'var(--color-surface)',
                        color: country === c ? 'white' : 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                        cursor: 'pointer'
                      }}>
                {c === 'all' ? '全部' : c === 'CN' ? '国产' : '海外'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>形态</h4>
          <select aria-label="按形态筛选" value={form} onChange={(e) => setForm(e.target.value as Form)}
                  className="w-full px-2 py-1 rounded border text-sm"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {FORM_OPTS.map((f) => <option key={f} value={f}>{f === 'all' ? '全部' : f.toUpperCase()}</option>)}
          </select>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>状态</h4>
          <select aria-label="按状态筛选" value={status} onChange={(e) => setStatus(e.target.value as Status)}
                  className="w-full px-2 py-1 rounded border text-sm"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={fp8} onChange={(e) => setFp8(e.target.checked)} /> 支持 FP8</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fp4} onChange={(e) => setFp4(e.target.checked)} /> 支持 FP4</label>
        </div>

        <div>
          <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>最小显存 ({minMem} GB)</h4>
          <input type="range" min={0} max={300} step={16} value={minMem} onChange={(e) => setMinMem(+e.target.value)}
                 aria-label="最小显存" className="w-full" />
        </div>

        <div>
          <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>最小 BF16 ({minBf16} TF)</h4>
          <input type="range" min={0} max={5000} step={250} value={minBf16} onChange={(e) => setMinBf16(+e.target.value)}
                 aria-label="最小 BF16 TFLOPS" className="w-full" />
        </div>

        <div className="text-xs flex items-center justify-between" style={{ color: 'var(--color-text-muted)' }}>
          <span>{filtered.length} / {hardware.length} 显示</span>
          <button onClick={reset} type="button" className="underline" style={{ color: 'var(--color-accent)' }}>重置</button>
        </div>
      </aside>

      <div>
        {cn.length > 0 && <>
          <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-china)' }}>国产 ({cn.length})</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-12">
            {cn.map((h) => <HwCard key={h.id} h={h} isCN />)}
          </div>
        </>}
        {overseas.length > 0 && <>
          <h3 className="text-xl font-semibold mb-4">海外 ({overseas.length})</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overseas.map((h) => <HwCard key={h.id} h={h} />)}
          </div>
        </>}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            没有匹配的硬件。<button type="button" onClick={reset} className="underline" style={{ color: 'var(--color-accent)' }}>重置筛选</button>
          </div>
        )}
      </div>
    </div>
  );
}

function HwCard({ h, isCN = false }: { h: ResolvedHw; isCN?: boolean }) {
  return (
    <a href={`/hardware/${h.id}/`} className="block">
      <article className="rounded-lg p-5 border h-full transition-transform hover:-translate-y-0.5"
               style={{
                 background: 'var(--color-surface-raised)',
                 borderColor: isCN ? 'color-mix(in oklch, var(--color-china) 25%, var(--color-border))' : 'var(--color-border)'
               }}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-xs font-medium" style={{ color: isCN ? 'var(--color-china)' : 'var(--color-text-muted)' }}>
              {isCN ? (h.vendor.chinese_names[0] ?? h.vendor.name) : h.vendor.name}
            </div>
            <h4 className="text-base font-semibold mt-0.5">{h.name}</h4>
          </div>
          {isCN && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-china) 14%, var(--color-bg))', color: 'var(--color-china)' }}>国产</span>}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt style={{ color: 'var(--color-text-muted)' }}>BF16</dt><dd className="font-mono mt-0.5">{h.compute.bf16_tflops?.value ?? '—'}<span style={{ color: 'var(--color-text-muted)' }}> TF</span></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Memory</dt><dd className="font-mono mt-0.5">{h.memory.capacity_gb?.value ?? '—'}<span style={{ color: 'var(--color-text-muted)' }}> GB</span></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>BW</dt><dd className="font-mono mt-0.5">{fmtBw(h.memory.bandwidth_gbps?.value)}</dd></div>
        </dl>
        <div className="flex gap-1 mt-3 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-text-muted) 14%, var(--color-bg))', color: 'var(--color-text-muted)' }}>{h.form_factor.toUpperCase()}</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-text-muted) 14%, var(--color-bg))', color: 'var(--color-text-muted)' }}>{h.status === 'in-production' ? '在售' : h.status}</span>
          {h.compute.fp8_tflops && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-tier-measured) 14%, var(--color-bg))', color: 'var(--color-tier-measured)' }}>FP8</span>}
          {h.compute.fp4_tflops && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-tier-measured) 14%, var(--color-bg))', color: 'var(--color-tier-measured)' }}>FP4</span>}
        </div>
      </article>
    </a>
  );
}
