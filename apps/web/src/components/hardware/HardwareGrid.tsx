import { useState, useMemo, useId } from 'react';
import type { Hardware, Vendor } from '@evokernel/schemas';
import { toCsv, downloadCsv } from '~/lib/csv';
import { tr, type Locale } from '~/lib/i18n/island';
import { pathname } from '~/lib/i18n';

type ResolvedHw = Omit<Hardware, 'vendor'> & { vendor: Pick<Vendor, 'id' | 'name' | 'country' | 'chinese_names'> };

interface Props { hardware: ResolvedHw[]; locale?: Locale; }

type Country = 'all' | 'CN' | 'overseas';
type Form = 'all' | 'sxm' | 'oam' | 'pcie' | 'nvl' | 'proprietary';
type Status = 'all' | 'in-production' | 'discontinued' | 'taping-out' | 'announced';

// v3.20 — additional filter dimensions per user ask: process node + memory
// type + software stack + TDP range. Each derived from existing YAML fields,
// no schema change needed.
type ProcessNode = 'all' | '3nm' | '5nm' | '7nm' | '12nm' | '16nm';
type MemType = 'all' | 'HBM3e' | 'HBM3' | 'HBM2e' | 'HBM2' | 'GDDR7' | 'GDDR6' | 'LPDDR5X' | 'LPDDR5' | 'LPDDR4X' | 'unified';
type SwStack = 'all' | 'cuda' | 'rocm' | 'cann' | 'neuware' | 'corex' | 'musa' | 'mlx' | 'metal';

const FORM_OPTS: Form[] = ['all', 'sxm', 'oam', 'pcie', 'nvl', 'proprietary'];
const STATUS_OPTS: Status[] = ['all', 'in-production', 'discontinued', 'taping-out', 'announced'];
const PROCESS_NODE_OPTS: ProcessNode[] = ['all', '3nm', '5nm', '7nm', '12nm', '16nm'];
const MEM_TYPE_OPTS: MemType[] = ['all', 'HBM3e', 'HBM3', 'HBM2e', 'HBM2', 'GDDR7', 'GDDR6', 'LPDDR5X', 'LPDDR5', 'LPDDR4X', 'unified'];
const SW_STACK_OPTS: SwStack[] = ['all', 'cuda', 'rocm', 'cann', 'neuware', 'corex', 'musa', 'mlx', 'metal'];

/**
 * Map a hardware entry's drivers list to the set of recognized software
 * stacks. Drivers are free-form strings (e.g. "CUDA 12.4", "ROCm 6.2",
 * "CNToolkit") so we substring-match. Returns lowercase stack ids.
 */
function detectSwStacks(drivers: string[] | undefined): Set<SwStack> {
  const out = new Set<SwStack>();
  if (!drivers) return out;
  const joined = drivers.join(' ').toLowerCase();
  if (joined.includes('cuda')) out.add('cuda');
  if (joined.includes('rocm')) out.add('rocm');
  if (joined.includes('cann') || joined.includes('ascend')) out.add('cann');
  if (joined.includes('neuware') || joined.includes('cntoolkit') || joined.includes('cnnl') || joined.includes('bang')) out.add('neuware');
  if (joined.includes('corex') || joined.includes('ixrt')) out.add('corex');
  if (joined.includes('musa')) out.add('musa');
  if (joined.includes('mlx')) out.add('mlx');
  if (joined.includes('metal')) out.add('metal');
  return out;
}

/** Bucket a measured nm value into one of the PROCESS_NODE_OPTS labels. */
function bucketProcessNode(nm: number | undefined): ProcessNode | null {
  if (nm == null) return null;
  if (nm <= 3) return '3nm';
  if (nm <= 5) return '5nm';
  if (nm <= 7) return '7nm';
  if (nm <= 12) return '12nm';
  return '16nm';
}
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
  // v3.20 — new dimensions (memory type / process node / software stack / max TDP)
  const [memType, setMemType] = useState<MemType>('all');
  const [processNode, setProcessNode] = useState<ProcessNode>('all');
  const [swStack, setSwStack] = useState<SwStack>('all');
  const [maxTdp, setMaxTdp] = useState(2000); // W; 2000 = effectively no cap
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      // v3.20 — new dimensions
      if (memType !== 'all' && h.memory.type !== memType) return false;
      if (processNode !== 'all') {
        const bucketed = bucketProcessNode(h.architecture?.process_node_nm?.value);
        if (bucketed !== processNode) return false;
      }
      if (swStack !== 'all') {
        const stacks = detectSwStacks(h.software_support?.drivers);
        if (!stacks.has(swStack)) return false;
      }
      if (maxTdp < 2000 && (h.power?.tdp_w?.value ?? 0) > maxTdp) return false;
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
  }, [hardware, country, form, status, fp8, fp4, minMem, minBf16, search, memType, processNode, swStack, maxTdp]);

  const cn = filtered.filter((h) => h.vendor.country === 'CN').sort((a, b) => b.release_year - a.release_year);
  const overseas = filtered.filter((h) => h.vendor.country !== 'CN').sort((a, b) => b.release_year - a.release_year);

  const reset = () => {
    setCountry('all'); setForm('all'); setStatus('all');
    setFp8(false); setFp4(false); setMinMem(0); setMinBf16(0); setSearch('');
    setMemType('all'); setProcessNode('all'); setSwStack('all'); setMaxTdp(2000);
  };

  const exportCsv = () => {
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
  };

  return (
    <div className="space-y-6">
      {/* Sticky horizontal filter bar — full-width, can't overlap cards */}
      <div className="hw-filter-bar rounded-lg border p-3 text-sm"
           style={{
             background: 'var(--color-surface-raised)',
             borderColor: 'var(--color-border)'
           }}>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder={en ? 'Search hardware...' : '搜索硬件...'}
                 className="flex-1 min-w-[12rem] px-3 py-1.5 rounded border text-sm"
                 style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />

          <div className="flex gap-1">
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

          <select aria-label={en ? 'Filter by form factor' : '按形态筛选'} value={form} onChange={(e) => setForm(e.target.value as Form)}
                  className="px-2 py-1 rounded border text-xs"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {FORM_OPTS.map((f) => <option key={f} value={f}>{f === 'all' ? (en ? 'Form: all' : '形态: 全部') : f.toUpperCase()}</option>)}
          </select>

          <select aria-label={en ? 'Filter by status' : '按状态筛选'} value={status} onChange={(e) => setStatus(e.target.value as Status)}
                  className="px-2 py-1 rounded border text-xs"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{en ? `Status: ${STATUS_LABEL[s].toLowerCase()}` : `状态: ${STATUS_LABEL[s]}`}</option>)}
          </select>

          <label className="flex items-center gap-1 text-xs px-2 py-1 rounded border cursor-pointer"
                 style={{ borderColor: fp8 ? 'var(--color-accent)' : 'var(--color-border)', background: fp8 ? 'color-mix(in oklch, var(--color-accent) 8%, var(--color-bg))' : 'var(--color-surface)' }}>
            <input type="checkbox" checked={fp8} onChange={(e) => setFp8(e.target.checked)} />
            FP8
          </label>
          <label className="flex items-center gap-1 text-xs px-2 py-1 rounded border cursor-pointer"
                 style={{ borderColor: fp4 ? 'var(--color-accent)' : 'var(--color-border)', background: fp4 ? 'color-mix(in oklch, var(--color-accent) 8%, var(--color-bg))' : 'var(--color-surface)' }}>
            <input type="checkbox" checked={fp4} onChange={(e) => setFp4(e.target.checked)} />
            FP4
          </label>

          <button type="button" onClick={exportCsv}
                  className="text-xs px-3 py-1 rounded border"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer' }}>
            ⬇ {t('filter.export.csv')} ({filtered.length})
          </button>

          <span className="ml-auto text-xs flex items-center gap-3" style={{ color: 'var(--color-text-muted)' }}>
            <span>{filtered.length} / {hardware.length} {en ? 'shown' : '显示'}</span>
            <button onClick={reset} type="button" className="underline" style={{ color: 'var(--color-accent)', cursor: 'pointer' }}>{t('filter.reset')}</button>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <label className="text-xs flex items-center gap-2">
            <span style={{ color: 'var(--color-text-muted)', minWidth: '8rem' }}>{en ? `Min memory: ${minMem} GB` : `最小显存: ${minMem} GB`}</span>
            <input type="range" min={0} max={300} step={16} value={minMem} onChange={(e) => setMinMem(+e.target.value)}
                   aria-label={en ? 'Min memory' : '最小显存'} className="flex-1" />
          </label>
          <label className="text-xs flex items-center gap-2">
            <span style={{ color: 'var(--color-text-muted)', minWidth: '8rem' }}>{en ? `Min BF16: ${minBf16} TF` : `最小 BF16: ${minBf16} TF`}</span>
            <input type="range" min={0} max={5000} step={250} value={minBf16} onChange={(e) => setMinBf16(+e.target.value)}
                   aria-label={en ? 'Min BF16 TFLOPS' : '最小 BF16 TFLOPS'} className="flex-1" />
          </label>
        </div>

        {/* v3.20 — advanced filter dimensions, collapsed by default */}
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-xs flex items-center gap-1 underline"
            style={{ color: 'var(--color-accent)', cursor: 'pointer' }}
            data-testid="hw-filter-advanced-toggle"
          >
            <span>{advancedOpen ? '▾' : '▸'}</span>
            <span>{en ? 'Advanced filters' : '更多筛选维度'}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>
              ({en ? 'memory type · process node · software stack · TDP' : '内存类型 · 制程 · 软件栈 · TDP'})
            </span>
          </button>
          {advancedOpen && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="hw-filter-advanced-panel">
              <select
                aria-label={en ? 'Filter by memory type' : '按内存类型筛选'}
                value={memType}
                onChange={(e) => setMemType(e.target.value as MemType)}
                className="px-2 py-1 rounded border text-xs"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                {MEM_TYPE_OPTS.map((m) => (
                  <option key={m} value={m}>
                    {m === 'all' ? (en ? 'Memory: all' : '内存: 全部') : m}
                  </option>
                ))}
              </select>

              <select
                aria-label={en ? 'Filter by process node' : '按制程筛选'}
                value={processNode}
                onChange={(e) => setProcessNode(e.target.value as ProcessNode)}
                className="px-2 py-1 rounded border text-xs"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                {PROCESS_NODE_OPTS.map((p) => (
                  <option key={p} value={p}>
                    {p === 'all' ? (en ? 'Process: all' : '制程: 全部') : p}
                  </option>
                ))}
              </select>

              <select
                aria-label={en ? 'Filter by software stack' : '按软件栈筛选'}
                value={swStack}
                onChange={(e) => setSwStack(e.target.value as SwStack)}
                className="px-2 py-1 rounded border text-xs"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                {SW_STACK_OPTS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? (en ? 'Stack: all' : '软件栈: 全部') : s.toUpperCase()}
                  </option>
                ))}
              </select>

              <label className="text-xs flex items-center gap-2">
                <span style={{ color: 'var(--color-text-muted)', minWidth: '6rem' }}>
                  {en ? `Max TDP: ${maxTdp >= 2000 ? '∞' : maxTdp + ' W'}` : `最大 TDP: ${maxTdp >= 2000 ? '∞' : maxTdp + ' W'}`}
                </span>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={50}
                  value={maxTdp}
                  onChange={(e) => setMaxTdp(+e.target.value)}
                  aria-label={en ? 'Max TDP' : '最大 TDP'}
                  className="flex-1"
                />
              </label>
            </div>
          )}
        </div>
      </div>

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
      <style>{`
        .hw-filter-bar {
          position: sticky;
          top: 4rem;
          z-index: 20;
          backdrop-filter: blur(8px);
        }
      `}</style>
    </div>
  );
}

function VendorBadgeInline({ vendorId, vendorName, country }: { vendorId: string; vendorName: string; country: string }) {
  let hash = 0;
  for (let i = 0; i < vendorId.length; i++) hash = (hash * 31 + vendorId.charCodeAt(i)) | 0;
  const base = Math.abs(hash) % 360;
  const hue = country === 'CN' ? base % 60 : ((base % 200) + 200) % 360;
  const initial = vendorName.charAt(0).toUpperCase();
  // useId returns a stable, document-unique ID per render — prevents <linearGradient>
  // collisions when the same vendor card renders multiple times.
  const reactId = useId();
  const id = `vg-${vendorId}-${reactId.replace(/:/g, '')}`;
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
  // Use pathname() so the deploy-base prefix (e.g. /evokernel-spec) gets
  // applied — Vite inlines import.meta.env.BASE_URL at build time so this
  // works in client-side React islands too.
  const detailHref = pathname(en ? `/en/hardware/${h.id}/` : `/hardware/${h.id}/`);
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
