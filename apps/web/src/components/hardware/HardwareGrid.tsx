import { useState, useMemo } from 'react';
import type { Hardware, Vendor } from '@evokernel/schemas';
import { toCsv, downloadCsv } from '~/lib/csv';
import { tr, type Locale } from '~/lib/i18n/island';

type ResolvedHw = Omit<Hardware, 'vendor'> & { vendor: Pick<Vendor, 'id' | 'name' | 'country' | 'chinese_names'> };

interface Props { hardware: ResolvedHw[]; locale?: Locale; }

type Country = 'all' | 'CN' | 'overseas';
type Form = 'all' | 'sxm' | 'oam' | 'pcie' | 'nvl' | 'proprietary';
type Status = 'all' | 'in-production' | 'discontinued' | 'taping-out' | 'announced';

const FORM_OPTS: Form[] = ['all', 'sxm', 'oam', 'pcie', 'nvl', 'proprietary'];
const STATUS_OPTS: Status[] = ['all', 'in-production', 'discontinued', 'taping-out', 'announced'];
const STATUS_LABEL_ZH: Record<Status, string> = {
  all: '全部', 'in-production': '在售', discontinued: '停产', 'taping-out': '流片中', announced: '已发布'
};
const STATUS_LABEL_EN: Record<Status, string> = {
  all: 'All', 'in-production': 'In production', discontinued: 'Discontinued', 'taping-out': 'Taping out', announced: 'Announced'
};

function fmtBw(bw: number | null | undefined): string {
  if (!bw) return '—';
  return bw >= 1000 ? `${(bw / 1000).toFixed(1)} TB/s` : `${bw} GB/s`;
}

export default function HardwareGrid({ hardware, locale = 'zh' }: Props) {
  const t = (k: Parameters<typeof tr>[1]) => tr(locale, k);
  const STATUS_LABEL = locale === 'en' ? STATUS_LABEL_EN : STATUS_LABEL_ZH;
  const en = locale === 'en';
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
                 placeholder={en ? 'Search (h100, ascend, MI3...)' : '搜索 (h100, 昇腾, MI3...)'}
                 className="w-full px-3 py-1.5 rounded border text-sm"
                 style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{t('filter.country')}</h4>
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
                {c === 'all' ? (en ? 'All' : '全部') : c === 'CN' ? t('filter.country.cn') : t('filter.country.overseas')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{en ? 'Form factor' : '形态'}</h4>
          <select aria-label={en ? 'Filter by form factor' : '按形态筛选'} value={form} onChange={(e) => setForm(e.target.value as Form)}
                  className="w-full px-2 py-1 rounded border text-sm"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {FORM_OPTS.map((f) => <option key={f} value={f}>{f === 'all' ? (en ? 'All' : '全部') : f.toUpperCase()}</option>)}
          </select>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{en ? 'Status' : '状态'}</h4>
          <select aria-label={en ? 'Filter by status' : '按状态筛选'} value={status} onChange={(e) => setStatus(e.target.value as Status)}
                  className="w-full px-2 py-1 rounded border text-sm"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={fp8} onChange={(e) => setFp8(e.target.checked)} /> {en ? 'Supports FP8' : '支持 FP8'}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fp4} onChange={(e) => setFp4(e.target.checked)} /> {en ? 'Supports FP4' : '支持 FP4'}</label>
        </div>

        <div>
          <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{en ? `Min memory (${minMem} GB)` : `最小显存 (${minMem} GB)`}</h4>
          <input type="range" min={0} max={300} step={16} value={minMem} onChange={(e) => setMinMem(+e.target.value)}
                 aria-label={en ? 'Min memory' : '最小显存'} className="w-full" />
        </div>

        <div>
          <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{en ? `Min BF16 (${minBf16} TF)` : `最小 BF16 (${minBf16} TF)`}</h4>
          <input type="range" min={0} max={5000} step={250} value={minBf16} onChange={(e) => setMinBf16(+e.target.value)}
                 aria-label={en ? 'Min BF16 TFLOPS' : '最小 BF16 TFLOPS'} className="w-full" />
        </div>

        <div className="text-xs flex items-center justify-between" style={{ color: 'var(--color-text-muted)' }}>
          <span>{filtered.length} / {hardware.length} {en ? 'shown' : '显示'}</span>
          <button onClick={reset} type="button" className="underline" style={{ color: 'var(--color-accent)' }}>{t('filter.reset')}</button>
        </div>

        <button type="button"
                onClick={() => {
                  const rows = filtered.map((h) => ({
                    id: h.id, name: h.name, vendor: h.vendor.id, country: h.vendor.country,
                    form_factor: h.form_factor, status: h.status, release_year: h.release_year,
                    bf16_tflops: h.compute.bf16_tflops?.value ?? '',
                    fp8_tflops: h.compute.fp8_tflops?.value ?? '',
                    fp4_tflops: h.compute.fp4_tflops?.value ?? '',
                    int8_tops: h.compute.int8_tops?.value ?? '',
                    memory_gb: h.memory.capacity_gb?.value ?? '',
                    memory_bw_gbps: h.memory.bandwidth_gbps?.value ?? '',
                    memory_type: h.memory.type,
                    scale_up_protocol: h.scale_up.protocol,
                    scale_up_bw_gbps: h.scale_up.bandwidth_gbps,
                    scale_up_world_size: h.scale_up.world_size,
                    scale_out_protocol: h.scale_out.protocol,
                    scale_out_bw_gbps: h.scale_out.bandwidth_gbps_per_card,
                    tdp_w: h.power.tdp_w?.value ?? ''
                  }));
                  const cols = Object.keys(rows[0] ?? {});
                  if (cols.length === 0) return;
                  const csv = toCsv(rows, cols);
                  downloadCsv(`evokernel-hardware-${new Date().toISOString().slice(0, 10)}.csv`, csv);
                }}
                className="text-xs w-full px-3 py-1.5 rounded border mt-2"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer' }}>
          ⬇ {t('filter.export.csv')} ({filtered.length})
        </button>
      </aside>

      <div>
        {cn.length > 0 && <>
          <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-china)' }}>{en ? 'China' : '国产'} ({cn.length})</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-12">
            {cn.map((h) => <HwCard key={h.id} h={h} isCN locale={locale} />)}
          </div>
        </>}
        {overseas.length > 0 && <>
          <h3 className="text-xl font-semibold mb-4">{en ? 'Overseas' : '海外'} ({overseas.length})</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overseas.map((h) => <HwCard key={h.id} h={h} locale={locale} />)}
          </div>
        </>}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {en ? 'No hardware matches. ' : '没有匹配的硬件。'}<button type="button" onClick={reset} className="underline" style={{ color: 'var(--color-accent)' }}>{en ? 'Reset filter' : '重置筛选'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function VendorBadgeInline({ vendorId, vendorName, country }: { vendorId: string; vendorName: string; country: string }) {
  let hash = 0;
  for (let i = 0; i < vendorId.length; i++) hash = (hash * 31 + vendorId.charCodeAt(i)) | 0;
  const base = Math.abs(hash) % 360;
  const hue = country === 'CN' ? base % 60 : ((base % 200) + 200) % 360;
  const initial = vendorName.charAt(0).toUpperCase();
  const id = `vg-${vendorId}-card`;
  return (
    <svg viewBox="0 0 36 36" width={32} height={32} aria-label={`${vendorName} logo`}
         xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: 'inline-block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`oklch(60% 0.18 ${hue})`} />
          <stop offset="100%" stopColor={`oklch(40% 0.18 ${(hue + 30) % 360})`} />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="16" fill={`url(#${id})`} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      <text x="18" y="18" textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="700" fill="white"
            fontFamily="system-ui, sans-serif" letterSpacing="-0.02em">{initial}</text>
    </svg>
  );
}

function HwCard({ h, isCN = false, locale = 'zh' }: { h: ResolvedHw; isCN?: boolean; locale?: Locale }) {
  const en = locale === 'en';
  const detailHref = en ? `/en/hardware/${h.id}/` : `/hardware/${h.id}/`;
  return (
    <a href={detailHref} className="block">
      <article className="rounded-lg p-5 border h-full transition-transform hover:-translate-y-0.5"
               style={{
                 background: 'var(--color-surface-raised)',
                 borderColor: isCN ? 'color-mix(in oklch, var(--color-china) 25%, var(--color-border))' : 'var(--color-border)'
               }}>
        <div className="flex justify-between items-start mb-3 gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <VendorBadgeInline vendorId={h.vendor.id} vendorName={h.vendor.name} country={h.vendor.country} />
            <div className="min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: isCN ? 'var(--color-china)' : 'var(--color-text-muted)' }}>
                {isCN ? (h.vendor.chinese_names[0] ?? h.vendor.name) : h.vendor.name}
              </div>
              <h4 className="text-base font-semibold mt-0.5">{h.name}</h4>
            </div>
          </div>
          {isCN && <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{ background: 'color-mix(in oklch, var(--color-china) 14%, var(--color-bg))', color: 'var(--color-china)' }}>{en ? 'China' : '国产'}</span>}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt style={{ color: 'var(--color-text-muted)' }}>BF16</dt><dd className="font-mono mt-0.5">{h.compute.bf16_tflops?.value ?? '—'}<span style={{ color: 'var(--color-text-muted)' }}> TF</span></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Memory</dt><dd className="font-mono mt-0.5">{h.memory.capacity_gb?.value ?? '—'}<span style={{ color: 'var(--color-text-muted)' }}> GB</span></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>BW</dt><dd className="font-mono mt-0.5">{fmtBw(h.memory.bandwidth_gbps?.value)}</dd></div>
        </dl>
        <div className="flex gap-1 mt-3 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-text-muted) 14%, var(--color-bg))', color: 'var(--color-text-muted)' }}>{h.form_factor.toUpperCase()}</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-text-muted) 14%, var(--color-bg))', color: 'var(--color-text-muted)' }}>{h.status === 'in-production' ? (en ? 'In production' : '在售') : h.status}</span>
          {h.compute.fp8_tflops && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-tier-measured) 14%, var(--color-bg))', color: 'var(--color-tier-measured)' }}>FP8</span>}
          {h.compute.fp4_tflops && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'color-mix(in oklch, var(--color-tier-measured) 14%, var(--color-bg))', color: 'var(--color-tier-measured)' }}>FP4</span>}
        </div>
      </article>
    </a>
  );
}
