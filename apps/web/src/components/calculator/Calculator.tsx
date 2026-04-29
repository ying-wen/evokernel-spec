import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, ResponsiveContainer, Legend,
  BarChart, Bar
} from 'recharts';
import type { Hardware, Model, Case, Engine } from '@evokernel/schemas';
import { calculate, buildEfficiencyMap } from '~/lib/calculator';
import type { Precision } from '~/lib/calculator';
import { tr, type Locale } from '~/lib/i18n/island';
import { pathname } from '~/lib/i18n';

interface HistoryEntry {
  key: string;
  ts: number;
  modelId: string; modelName: string;
  hwId: string; hwName: string; hwCount: number;
  precision: Precision;
  tp: number; pp: number; ep: number;
  batch: number; prefill: number; decode: number;
  engineId: string;
  decodeUpper: number;
  feasible: boolean;
}

interface Props {
  models: Model[];
  hardware: Hardware[];
  cases: Case[];
  engines: Engine[];
  locale?: Locale;
}

type Step = 1 | 2 | 3;

export default function Calculator({ models, hardware, cases, engines, locale = 'zh' }: Props) {
  const t = (k: Parameters<typeof tr>[1], v?: Parameters<typeof tr>[2]) => tr(locale, k, v);
  const [step, setStep] = useState<Step>(1);
  const [modelId, setModelId] = useState('');

  // Read ?model=... at hydration time (SSG can't read query params at build).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('model');
    if (m && models.some((x) => x.id === m)) {
      setModelId(m);
      setStep(2);
    }
  }, [models]);
  const [hwId, setHwId] = useState('');
  const [hwCount, setHwCount] = useState(8);
  const [precision, setPrecision] = useState<Precision>('bf16');
  const [tp, setTp] = useState(8);
  const [pp, setPp] = useState(1);
  const [ep, setEp] = useState(1);
  const [batch, setBatch] = useState(16);
  const [prefill, setPrefill] = useState(1024);
  const [decode, setDecode] = useState(256);
  const [engineId, setEngineId] = useState('vllm');
  const [disagg, setDisagg] = useState(false);
  const [disaggPrefill, setDisaggPrefill] = useState(8);
  const [disaggDecode, setDisaggDecode] = useState(8);

  // Hydrate full state from URL (?model=...&hw=...&hwCount=...&prec=...&tp=...&pp=...&ep=...&batch=...&prefill=...&decode=...&engine=...)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const hw = p.get('hw'); if (hw && hardware.some((h) => h.id === hw)) setHwId(hw);
    const hc = p.get('hwCount'); if (hc) setHwCount(Math.max(1, Math.min(384, +hc)));
    const pr = p.get('prec'); if (pr && ['fp4', 'fp8', 'bf16', 'fp16', 'int8'].includes(pr)) setPrecision(pr as Precision);
    const tpv = p.get('tp'); if (tpv) setTp(Math.max(1, +tpv));
    const ppv = p.get('pp'); if (ppv) setPp(Math.max(1, +ppv));
    const epv = p.get('ep'); if (epv) setEp(Math.max(1, +epv));
    const bv = p.get('batch'); if (bv) setBatch(Math.max(1, +bv));
    const pre = p.get('prefill'); if (pre) setPrefill(Math.max(1, +pre));
    const dec = p.get('decode'); if (dec) setDecode(Math.max(1, +dec));
    const en = p.get('engine'); if (en && engines.some((e) => e.id === en)) setEngineId(en);
    // If hw and model both present → jump to step 3 to show result immediately
    const m = p.get('model');
    if (m && hw) setStep(3);
  }, [hardware, engines]);

  // Sync state to URL on every change (replaceState — clean history)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (modelId) p.set('model', modelId);
    if (hwId) p.set('hw', hwId);
    if (hwCount !== 8) p.set('hwCount', String(hwCount));
    if (precision !== 'bf16') p.set('prec', precision);
    if (tp !== 8) p.set('tp', String(tp));
    if (pp !== 1) p.set('pp', String(pp));
    if (ep !== 1) p.set('ep', String(ep));
    if (batch !== 16) p.set('batch', String(batch));
    if (prefill !== 1024) p.set('prefill', String(prefill));
    if (decode !== 256) p.set('decode', String(decode));
    if (engineId !== 'vllm') p.set('engine', engineId);
    const qs = p.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }, [modelId, hwId, hwCount, precision, tp, pp, ep, batch, prefill, decode, engineId]);

  // Keep an in-memory copy of the last result so we can persist it to history
  // exactly when it changes (rather than every keystroke triggering a write).
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('evokernel-calc-history');
      if (raw) setHistory(JSON.parse(raw) as HistoryEntry[]);
    } catch { /* ignore parse errors */ }
  }, []);

  // Build efficiency map once per session — derived from cases corpus.
  const efficiencyMap = useMemo(() => buildEfficiencyMap(cases, hardware, models), [cases, hardware, models]);

  const result = useMemo(() => {
    if (!modelId || !hwId) return null;
    const m = models.find((x) => x.id === modelId);
    const h = hardware.find((x) => x.id === hwId);
    if (!m || !h) return null;
    return calculate({
      efficiencyMap,
      calc: {
        modelId,
        hardware: { id: hwId, count: hwCount },
        scenario: { prefillSeqLen: prefill, decodeSeqLen: decode, batchSize: batch, concurrency: 64 },
        precision,
        parallel: { tp, pp, ep, sp: 1 },
        engineId,
        disaggregated: disagg ? { enabled: true, prefillCards: disaggPrefill, decodeCards: disaggDecode } : { enabled: false }
      },
      hardware: h, model: m, cases
    });
  }, [modelId, hwId, hwCount, precision, tp, pp, ep, batch, prefill, decode, engineId, disagg, disaggPrefill, disaggDecode, models, hardware, cases]);

  // Push current config to history (deduped, capped at 8) when result is fresh
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!result || !modelId || !hwId) return;
    const key = `${modelId}|${hwId}|${hwCount}|${precision}|${tp}|${pp}|${ep}|${batch}|${prefill}|${decode}|${engineId}`;
    setHistory((prev) => {
      if (prev[0]?.key === key) return prev; // already top
      const m = models.find((x) => x.id === modelId);
      const h = hardware.find((x) => x.id === hwId);
      const entry: HistoryEntry = {
        key,
        ts: Date.now(),
        modelId, modelName: m?.name ?? modelId,
        hwId, hwName: h?.name ?? hwId, hwCount,
        precision, tp, pp, ep, batch, prefill, decode, engineId,
        decodeUpper: Math.round(result.tier1Roofline.decodeThroughputUpperBound),
        feasible: result.configCheck.feasible
      };
      const filtered = prev.filter((p) => p.key !== key);
      const next = [entry, ...filtered].slice(0, 8);
      try { localStorage.setItem('evokernel-calc-history', JSON.stringify(next)); } catch { /* ignore quota */ }
      return next;
    });
  }, [result, modelId, hwId, hwCount, precision, tp, pp, ep, batch, prefill, decode, engineId, models, hardware]);

  const loadFromHistory = (e: HistoryEntry) => {
    setModelId(e.modelId);
    setHwId(e.hwId);
    setHwCount(e.hwCount);
    setPrecision(e.precision);
    setTp(e.tp); setPp(e.pp); setEp(e.ep);
    setBatch(e.batch); setPrefill(e.prefill); setDecode(e.decode);
    setEngineId(e.engineId);
    setStep(3);
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem('evokernel-calc-history'); } catch { /* ignore */ }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[14rem,1fr] gap-8">
      <nav className="space-y-2 sticky top-4 self-start" style={{ alignSelf: 'start', maxHeight: 'calc(100vh - 5rem)', overflowY: 'auto' }}>
        {[
          { n: 1 as Step, label: t('calc.step.model'), done: !!modelId },
          { n: 2 as Step, label: t('calc.step.hardware'), done: !!hwId },
          { n: 3 as Step, label: t('calc.step.scenario'), done: true }
        ].map((s) => (
          <button key={s.n} onClick={() => setStep(s.n)} type="button"
                  className="block w-full text-left px-3 py-2 rounded text-sm transition-colors"
                  style={{
                    background: step === s.n ? 'var(--color-accent-soft)' : 'transparent',
                    color: step === s.n ? 'var(--color-accent)' : 'var(--color-text)',
                    fontWeight: step === s.n ? 600 : 400,
                    border: 'none', cursor: 'pointer'
                  }}>
            <span style={{ fontFamily: 'var(--font-mono)', marginRight: '0.5rem' }}>{s.n}.</span>
            {s.label}
            {s.done && <span style={{ color: 'var(--color-tier-measured)', marginLeft: '0.5rem' }}>✓</span>}
          </button>
        ))}

        {history.length > 0 && (
          <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--color-text-muted)' }}>{t('calc.history')}</h4>
              <button type="button" onClick={clearHistory} className="text-xs underline" style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }}>{locale === 'en' ? 'Clear' : '清空'}</button>
            </div>
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.key}>
                  <button type="button" onClick={() => loadFromHistory(h)}
                          className="w-full text-left px-2 py-1.5 rounded text-xs transition-colors hover:opacity-80"
                          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                    <div className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{h.modelName}</div>
                    <div className="text-[0.65rem] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {h.hwName} ×{h.hwCount} · {h.precision.toUpperCase()} · TP{h.tp}
                    </div>
                    <div className="text-[0.65rem] mt-0.5 font-mono" style={{ color: h.feasible ? 'var(--color-tier-measured)' : 'oklch(55% 0.2 25)' }}>
                      {h.feasible ? `${h.decodeUpper} tok/s` : t('calc.infeasible')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="space-y-6">
        {step === 1 && (
          <section>
            <h3 className="text-lg font-semibold mb-3">{t('calc.step.model.title')}</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {models.map((m) => (
                <button key={m.id} type="button"
                        onClick={() => { setModelId(m.id); setStep(2); }}
                        className="text-left p-3 rounded border transition-colors"
                        style={{
                          borderColor: modelId === m.id ? 'var(--color-accent)' : 'var(--color-border)',
                          background: modelId === m.id ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
                          cursor: 'pointer'
                        }}>
                  <div className="font-medium text-sm">{m.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {m.architecture.total_params_b}B {m.architecture.family.toUpperCase()} · {m.lab}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h3 className="text-lg font-semibold mb-3">{t('calc.step.hardware.title')}</h3>
            <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-2">
              {hardware.map((h) => (
                <button key={h.id} type="button"
                        onClick={() => { setHwId(h.id); setStep(3); }}
                        className="text-left p-3 rounded border transition-colors"
                        style={{
                          borderColor: hwId === h.id ? 'var(--color-accent)' : 'var(--color-border)',
                          background: hwId === h.id ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
                          cursor: 'pointer'
                        }}>
                  <div className="font-medium text-sm">{h.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    BF16 {h.compute.bf16_tflops?.value ?? '—'} TF · {h.memory.capacity_gb?.value ?? '—'} GB
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <label>{t('calc.cards')} <input type="number" min={1} max={384} value={hwCount} onChange={(e) => setHwCount(+e.target.value || 1)}
                                className="ml-2 w-20 px-2 py-1 rounded border"
                                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} /></label>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h3 className="text-lg font-semibold mb-3">{t('calc.step.scenario.title')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <label className="flex items-center gap-2">Prefill seq<input type="number" min={1} value={prefill} onChange={(e) => setPrefill(+e.target.value || 1)} className="ml-1 w-24 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
              <label className="flex items-center gap-2">Decode seq<input type="number" min={1} value={decode} onChange={(e) => setDecode(+e.target.value || 1)} className="ml-1 w-24 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
              <label className="flex items-center gap-2">Batch<input type="number" min={1} value={batch} onChange={(e) => setBatch(+e.target.value || 1)} className="ml-1 w-20 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
              <label className="flex items-center gap-2">TP<input type="number" min={1} value={tp} onChange={(e) => setTp(+e.target.value || 1)} className="ml-1 w-16 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
              <label className="flex items-center gap-2">PP<input type="number" min={1} value={pp} onChange={(e) => setPp(+e.target.value || 1)} className="ml-1 w-16 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
              <label className="flex items-center gap-2">EP<input type="number" min={1} value={ep} onChange={(e) => setEp(+e.target.value || 1)} className="ml-1 w-16 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <label>精度
                <select value={precision} onChange={(e) => setPrecision(e.target.value as Precision)} className="ml-2 px-2 py-1 border rounded" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                  {(['fp4', 'fp8', 'bf16', 'fp16', 'int8'] as const).map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
              </label>
              <label>引擎
                <select value={engineId} onChange={(e) => setEngineId(e.target.value)} className="ml-2 px-2 py-1 border rounded" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                  {engines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-6 p-4 rounded border" style={{ borderColor: disagg ? 'var(--color-china)' : 'var(--color-border)', background: disagg ? 'color-mix(in oklch, var(--color-china) 5%, var(--color-bg))' : 'var(--color-surface)' }}>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={disagg} onChange={(e) => setDisagg(e.target.checked)} />
                <span>解耦部署 (Disaggregated prefill/decode)</span>
              </label>
              {disagg && (
                <>
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                    Prefill 池 (compute-heavy) + Decode 池 (memory-bw heavy) 分离, KV cache 通过 scale-out 网络传输 (Mooncake / DistServe / SGLang disagg)。
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <label>Prefill 卡数
                      <input type="number" min={1} max={384} value={disaggPrefill} onChange={(e) => setDisaggPrefill(Math.max(1, +e.target.value))}
                             className="ml-2 w-20 px-2 py-1 border rounded font-mono" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
                    </label>
                    <label>Decode 卡数
                      <input type="number" min={1} max={384} value={disaggDecode} onChange={(e) => setDisaggDecode(Math.max(1, +e.target.value))}
                             className="ml-2 w-20 px-2 py-1 border rounded font-mono" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
                    </label>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {result && (
          <>
            <ShareExport
              modelId={modelId}
              hwId={hwId}
              hwCount={hwCount}
              precision={precision}
              tp={tp} pp={pp} ep={ep}
              batch={batch} prefill={prefill} decode={decode}
              engineId={engineId}
              result={result}
              locale={locale}
            />
            <ResultPanel result={result} cases={cases} hwCount={hwCount} selectedHw={hardware.find((h) => h.id === hwId) ?? null} locale={locale} />
          </>
        )}
      </div>
    </div>
  );
}

function ResultPanel({ result, cases, hwCount, selectedHw, locale = 'zh' }: {
  result: NonNullable<ReturnType<typeof calculate>>;
  cases: Case[];
  hwCount: number;
  selectedHw: Hardware | null;
  locale?: Locale;
}) {
  const t = (k: Parameters<typeof tr>[1]) => tr(locale, k);
  const en = locale === 'en';
  const hwTdpW = selectedHw?.power.tdp_w?.value ?? 700;
  // CN-vendor "no Tier 0 yet" notice — if the selected card is a Chinese accelerator
  // and the corpus contains zero cases for THIS specific hardware (any model), the
  // calculator falls back to the default 0.5 efficiency. Surface this so users
  // understand the calibration gap and the high value of contributing first measurement.
  const CN_VENDORS = new Set(['huawei', 'cambricon', 'hygon', 'moore-threads', 'enflame', 'biren', 'metax', 'iluvatar', 'pingtouge']);
  const hasAnyCaseForThisHw = !!selectedHw && cases.some((c) => c.stack.hardware.id === selectedHw.id);
  const showCnNoTier0 = !!selectedHw && CN_VENDORS.has(selectedHw.vendor) && !hasAnyCaseForThisHw;
  const r = result;
  return (
    <section className="mt-6 space-y-6">
      {/* Tier 0 */}
      <div className="rounded-lg border p-5"
           style={{ borderColor: 'var(--color-tier-measured)', background: 'color-mix(in oklch, var(--color-tier-measured) 5%, var(--color-bg))' }}>
        <h4 className="font-semibold mb-3">{t('calc.tier0.title')} — {r.tier0Cases.length}</h4>
        {showCnNoTier0 && (
          <div className="mb-3 p-3 rounded text-xs" style={{ background: 'color-mix(in oklch, var(--color-china) 8%, var(--color-bg))', color: 'var(--color-china)' }}>
            {en
              ? <>🇨🇳 No measured cases yet for this Chinese accelerator. Tier 1 below uses the default <strong>0.5</strong> efficiency factor; expect 30-50% real-world throughput. Software stacks like CANN / MUSA / MindIE close this gap year-over-year — first measurement contribution is high-value.</>
              : <>🇨🇳 该国产加速器暂无实测案例。下方 Tier 1 使用默认 <strong>0.5</strong> efficiency, 预计实测可达理论上界的 30-50%。CANN / MUSA / MindIE 等软件栈每年迭代显著缩小该差距 — 首个实测贡献价值最高。</>}
          </div>
        )}
        {r.tier0Cases.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('calc.tier0.empty.prefix')}<a href="https://github.com/evokernel/evokernel-spec" className="underline" style={{ color: 'var(--color-accent)' }}>{t('calc.tier0.empty.contribute')}</a>
          </p>
        ) : (
          <ul className="space-y-2">
            {r.tier0Cases.map((m) => {
              return (
                <li key={m.caseId}>
                  <a href={pathname(`/cases/${m.caseId}`)} className="block p-3 rounded text-sm" style={{ background: 'var(--color-surface-raised)' }}>
                    <div className="font-medium">{m.caseTitle}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {m.throughputDecode} tok/s · 相似度 {(m.matchScore * 100).toFixed(0)}%
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Tier 1 */}
      <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
        <h4 className="font-semibold mb-3">{t('calc.tier1.title')}</h4>
        <p className="text-xs mb-4 p-2 rounded" style={{ background: 'color-mix(in oklch, var(--color-tier-estimated) 12%, var(--color-bg))', color: 'var(--color-tier-estimated)' }}>
          ⚠️ 理论上界, 真实场景通常达 40-70% of this. 已应用 efficiency=0.5 的粗略系数。
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div><dt style={{ color: 'var(--color-text-muted)' }}>{t('calc.decode.upper')}</dt><dd className="font-mono text-xl">{r.tier1Roofline.decodeThroughputUpperBound.toFixed(0)} <span className="text-sm opacity-60">tok/s/card</span></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>{t('calc.bottleneck')}</dt><dd className="text-xl">{r.tier1Roofline.isComputeBound ? t('calc.bottleneck.compute') : t('calc.bottleneck.memory')}</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>算术强度</dt><dd className="font-mono">{r.tier1Roofline.arithmeticIntensity.toFixed(1)} FLOP/byte</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Ridge point</dt><dd className="font-mono">{r.tier1Roofline.ridgePoint.toFixed(1)}</dd></div>
        </dl>
        <RooflineChart roofline={r.tier1Roofline} />
      </div>

      {/* Config check */}
      <div className="rounded-lg border p-5"
           style={{ borderColor: r.configCheck.feasible ? 'var(--color-border)' : 'oklch(55% 0.2 25)', background: 'var(--color-surface-raised)' }}>
        <h4 className="font-semibold mb-3">配置检查</h4>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><dt style={{ color: 'var(--color-text-muted)' }}>需求</dt><dd className="font-mono">{r.configCheck.memoryRequiredGb.toFixed(1)} GB</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>{t('calc.memory.percard')}</dt><dd className="font-mono">{r.configCheck.memoryAvailableGb} GB</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>权重</dt><dd className="font-mono">{r.configCheck.weightsGb.toFixed(1)} GB</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>KV cache</dt><dd className="font-mono">{r.configCheck.kvCacheGb.toFixed(1)} GB</dd></div>
        </dl>
        {!r.configCheck.feasible && <p className="mt-3 text-sm" style={{ color: 'oklch(55% 0.2 25)' }}>{t('calc.memory.infeasible')}</p>}
        {r.configCheck.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">{r.configCheck.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        )}
      </div>

      {r.recommendations.length > 0 && (
        <div className="rounded-lg border p-5"
             style={{ borderColor: 'var(--color-accent)', background: 'color-mix(in oklch, var(--color-accent) 6%, var(--color-bg))' }}>
          <h4 className="font-semibold mb-3">建议</h4>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {r.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ul>
        </div>
      )}

      <OperatorBreakdownChart result={result} />
      {result.disaggregated && <DisaggregatedPanel disagg={result.disaggregated} />}
      <ConcurrencySweep result={result} hwCount={hwCount} />
      <TCOPanel result={result} hwCount={hwCount} defaultTdpW={hwTdpW} />

      <details className="text-xs">
        <summary style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }}>展示公式与假设</summary>
        <pre className="mt-2 p-3 rounded font-mono whitespace-pre-wrap" style={{ background: 'var(--color-surface)' }}>
{r.formulaTrace.join('\n')}
        </pre>
      </details>
    </section>
  );
}

function OperatorBreakdownChart({ result }: { result: NonNullable<ReturnType<typeof calculate>> }) {
  const data = result.operatorBreakdown.slice().sort((a, b) => b.share - a.share);
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
        <h4 className="font-semibold mb-2">算子级时间分布</h4>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          此模型尚无 operator_decomposition 数据。
          <a href="https://github.com/evokernel/evokernel-spec" className="underline ml-1" style={{ color: 'var(--color-accent)' }}>贡献拆解 →</a>
        </p>
      </div>
    );
  }
  const chartData = data.map((d) => ({
    operator: d.operator,
    'time ms/token': Number(d.timeMsPerToken.toFixed(3)),
    bound: d.isComputeBound ? 'compute' : 'memory'
  }));
  return (
    <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
      <h4 className="font-semibold mb-2">算子级时间分布 (per token)</h4>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        每个算子 = max(FLOPs/peakCompute, bytes/peakBW) × efficiency · 总和 = 单 token 理想步进时间
      </p>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32 + 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fontSize: 10 }} label={{ value: 'ms/token', position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
          <YAxis type="category" dataKey="operator" tick={{ fontSize: 11 }} width={120} />
          <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', fontSize: 11 }} />
          <Bar dataKey="time ms/token" fill="var(--color-accent)" />
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-3 text-xs space-y-1" style={{ color: 'var(--color-text-muted)' }}>
        {data.slice(0, 5).map((d) => (
          <li key={d.operator}>
            <span style={{ color: 'var(--color-text)' }}>{d.operator}</span>
            {' — '}
            {(d.share * 100).toFixed(0)}% 占比 · {d.isComputeBound ? '计算受限' : '内存带宽受限'}
            {' · '}
            <a href={pathname(`/operators/${d.operator}/`)} className="underline" style={{ color: 'var(--color-accent)' }}>详情 →</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DisaggregatedPanel({ disagg }: { disagg: NonNullable<NonNullable<ReturnType<typeof calculate>>['disaggregated']> }) {
  return (
    <div className="rounded-lg border p-5"
         style={{ borderColor: 'var(--color-china)', background: 'color-mix(in oklch, var(--color-china) 5%, var(--color-bg))' }}>
      <h4 className="font-semibold mb-2">解耦部署估算 (Disaggregated)</h4>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        Prefill 池 + Decode 池分离 · KV cache 通过 scale-out 网络传输
      </p>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt style={{ color: 'var(--color-text-muted)' }}>Prefill 池吞吐</dt>
          <dd className="font-mono text-lg">{disagg.prefillThroughput.toFixed(0)} <span className="text-xs opacity-60">tok/s</span></dd>
        </div>
        <div>
          <dt style={{ color: 'var(--color-text-muted)' }}>Decode 池吞吐</dt>
          <dd className="font-mono text-lg">{disagg.decodeThroughput.toFixed(0)} <span className="text-xs opacity-60">tok/s</span></dd>
        </div>
        <div>
          <dt style={{ color: 'var(--color-text-muted)' }}>KV transfer</dt>
          <dd className="font-mono text-lg">{disagg.kvTransferLatencyMs.toFixed(2)} <span className="text-xs opacity-60">ms/token</span></dd>
        </div>
      </dl>
      <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        参考方案: <a href={pathname('/cases/case-dsv4flash-disagg-h100-h200-001/')} className="underline" style={{ color: 'var(--color-accent)' }}>Mooncake disagg 案例</a> · <a href={pathname('/patterns/disaggregated-prefill-decode/')} className="underline" style={{ color: 'var(--color-accent)' }}>优化模式</a>
      </p>
    </div>
  );
}

interface ShareExportProps {
  modelId: string; hwId: string; hwCount: number;
  precision: Precision; tp: number; pp: number; ep: number;
  batch: number; prefill: number; decode: number;
  engineId: string;
  result: NonNullable<ReturnType<typeof calculate>>;
  locale?: Locale;
}

function ShareExport(p: ShareExportProps) {
  const locale = p.locale ?? 'zh';
  const t = (k: Parameters<typeof tr>[1]) => tr(locale, k);
  const [copied, setCopied] = useState<'url' | 'json' | 'yaml' | null>(null);

  const flash = (k: 'url' | 'json' | 'yaml') => { setCopied(k); setTimeout(() => setCopied(null), 1500); };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    flash('url');
  };

  const buildConfig = () => ({
    model: p.modelId,
    hardware: { id: p.hwId, count: p.hwCount },
    precision: p.precision,
    parallel: { tp: p.tp, pp: p.pp, ep: p.ep, sp: 1 },
    scenario: { prefill_seq_len: p.prefill, decode_seq_len: p.decode, batch_size: p.batch, max_concurrent_requests: 64 },
    engine: p.engineId,
    expected: {
      decode_throughput_upper_bound_tok_s_per_card: Math.round(p.result.tier1Roofline.decodeThroughputUpperBound),
      bottleneck: p.result.tier1Roofline.isComputeBound ? 'compute' : 'memory-bandwidth',
      memory_required_gb: +p.result.configCheck.memoryRequiredGb.toFixed(1),
      feasible: p.result.configCheck.feasible
    }
  });

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(buildConfig(), null, 2));
    flash('json');
  };

  const copyYaml = async () => {
    const cfg = buildConfig();
    const yaml = [
      `model: ${cfg.model}`,
      `hardware:`,
      `  id: ${cfg.hardware.id}`,
      `  count: ${cfg.hardware.count}`,
      `precision: ${cfg.precision}`,
      `parallel:`,
      `  tp: ${cfg.parallel.tp}`,
      `  pp: ${cfg.parallel.pp}`,
      `  ep: ${cfg.parallel.ep}`,
      `  sp: ${cfg.parallel.sp}`,
      `scenario:`,
      `  prefill_seq_len: ${cfg.scenario.prefill_seq_len}`,
      `  decode_seq_len: ${cfg.scenario.decode_seq_len}`,
      `  batch_size: ${cfg.scenario.batch_size}`,
      `engine: ${cfg.engine}`,
      `expected:`,
      `  decode_throughput_upper_bound_tok_s_per_card: ${cfg.expected.decode_throughput_upper_bound_tok_s_per_card}`,
      `  bottleneck: ${cfg.expected.bottleneck}`,
      `  memory_required_gb: ${cfg.expected.memory_required_gb}`,
      `  feasible: ${cfg.expected.feasible}`
    ].join('\n');
    await navigator.clipboard.writeText(yaml);
    flash('yaml');
  };

  const btnCls = 'text-xs px-3 py-1.5 rounded border inline-flex items-center gap-1';
  const btnStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' } as const;

  return (
    <div className="flex flex-wrap gap-2 items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('calc.share.label')}</span>
      <button type="button" onClick={copyUrl} className={btnCls} style={btnStyle}>
        🔗 {copied === 'url' ? t('calc.share.copied') : (locale === 'en' ? 'Copy link' : '复制链接')}
      </button>
      <button type="button" onClick={copyJson} className={btnCls} style={btnStyle}>
        {} {copied === 'json' ? t('calc.share.copied') : t('calc.share.exportJson')}
      </button>
      <button type="button" onClick={copyYaml} className={btnCls} style={btnStyle}>
        ≣ {copied === 'yaml' ? t('calc.share.copied') : t('calc.share.exportYaml')}
      </button>
      <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
        {t('calc.share.urlnote')}
      </span>
    </div>
  );
}

function ConcurrencySweep({ result, hwCount }: { result: NonNullable<ReturnType<typeof calculate>>; hwCount: number }) {
  // Throughput vs concurrency: assumes linear scaling up to a saturation knee
  // determined by per-card upper bound × hwCount, with logistic falloff above.
  const perCardUpper = result.tier1Roofline.decodeThroughputUpperBound;
  const peakAggregate = perCardUpper * hwCount;
  const knee = Math.max(8, hwCount * 4); // saturation begins around 4 concurrent reqs/card
  const data = Array.from({ length: 20 }, (_, i) => {
    const c = Math.round(2 ** (i / 2)); // 1..1024 log spacing
    const ramp = c <= knee ? c / knee : 1;
    const decay = c <= knee ? 1 : 1 - Math.min(0.4, 0.4 * (1 - knee / c));
    const throughput = Math.round(peakAggregate * ramp * decay);
    const latency = Math.round(20 + 200 * Math.max(0, c - knee) / Math.max(knee, 1));
    return { concurrency: c, throughput, latency };
  });
  return (
    <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
      <h4 className="font-semibold mb-2">并发扫描 (concurrency sweep)</h4>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        基于 Roofline 上界 × {hwCount} 卡 × 饱和点估算。saturation knee ≈ {knee} 并发请求。
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="concurrency" type="number" scale="log" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10 }} label={{ value: '并发请求', position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: 'tok/s', position: 'insideTopLeft', offset: 8, fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} label={{ value: 'TBT ms', position: 'insideTopRight', offset: 8, fontSize: 10 }} />
          <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line yAxisId="left" type="monotone" dataKey="throughput" name="集群吞吐 tok/s" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="latency" name="预估 TBT ms" stroke="var(--color-china)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TCOPanel({ result, hwCount, defaultTdpW }: { result: NonNullable<ReturnType<typeof calculate>>; hwCount: number; defaultTdpW: number }) {
  const [hwHourly, setHwHourly] = useState(2.5); // $/h per card (rental ballpark)
  const [powerPrice, setPowerPrice] = useState(0.1); // $/kWh
  const [pue, setPue] = useState(1.3);
  const [tdpW, setTdpW] = useState(defaultTdpW);
  // Update TDP when defaultTdpW changes (e.g., user re-selects hardware)
  useEffect(() => { setTdpW(defaultTdpW); }, [defaultTdpW]);
  const decodeTokPerSec = result.tier1Roofline.decodeThroughputUpperBound * hwCount;
  if (!decodeTokPerSec) return null;
  const tokensPerHour = decodeTokPerSec * 3600;
  const hwCost = hwHourly * hwCount;
  const powerCostHr = (tdpW * pue * hwCount / 1000) * powerPrice;
  const totalCostHr = hwCost + powerCostHr;
  const costPerMTok = (totalCostHr / tokensPerHour) * 1e6;

  return (
    <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
      <h4 className="font-semibold mb-2">TCO 估算 ($/M tokens)</h4>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        基于 Tier 1 上界 × {hwCount} 卡 × 用户调整的硬件租金 + 功耗。100% 透明公式。
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
        <label className="block">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$/卡/小时</span>
          <input type="number" step="0.1" min={0} value={hwHourly} onChange={(e) => setHwHourly(+e.target.value || 0)}
                 className="w-full mt-1 px-2 py-1 rounded border font-mono"
                 style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
        </label>
        <label className="block">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$/kWh</span>
          <input type="number" step="0.01" min={0} value={powerPrice} onChange={(e) => setPowerPrice(+e.target.value || 0)}
                 className="w-full mt-1 px-2 py-1 rounded border font-mono"
                 style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
        </label>
        <label className="block">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PUE</span>
          <input type="number" step="0.05" min={1} value={pue} onChange={(e) => setPue(+e.target.value || 1)}
                 className="w-full mt-1 px-2 py-1 rounded border font-mono"
                 style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
        </label>
        <label className="block">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>TDP W/卡</span>
          <input type="number" step="50" min={0} value={tdpW} onChange={(e) => setTdpW(+e.target.value || 0)}
                 className="w-full mt-1 px-2 py-1 rounded border font-mono"
                 style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
        </label>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><dt style={{ color: 'var(--color-text-muted)' }}>硬件 $/h</dt><dd className="font-mono">${hwCost.toFixed(2)}</dd></div>
        <div><dt style={{ color: 'var(--color-text-muted)' }}>功耗 $/h</dt><dd className="font-mono">${powerCostHr.toFixed(2)}</dd></div>
        <div><dt style={{ color: 'var(--color-text-muted)' }}>合计 $/h</dt><dd className="font-mono">${totalCostHr.toFixed(2)}</dd></div>
        <div><dt style={{ color: 'var(--color-text-muted)' }}>$/M tokens</dt><dd className="font-mono text-lg" style={{ color: 'var(--color-accent)' }}>${costPerMTok.toFixed(2)}</dd></div>
      </dl>
    </div>
  );
}

function RooflineChart({ roofline }: { roofline: NonNullable<ReturnType<typeof calculate>>['tier1Roofline'] }) {
  // X axis: arithmetic intensity (FLOP/byte), log-style sample points
  // Y axis: throughput (TFLOPS effective)
  const peakCompute = roofline.peakComputeTflops; // TF
  const peakBw = roofline.peakMemoryBwGbps; // GB/s
  const ridge = roofline.ridgePoint;
  if (!peakCompute || !peakBw) return null;
  const xMin = Math.max(0.1, ridge / 100);
  const xMax = ridge * 100;
  const points = 60;
  const data = Array.from({ length: points }, (_, i) => {
    const x = xMin * Math.pow(xMax / xMin, i / (points - 1));
    const memBound = (peakBw * x) / 1000; // GB/s × FLOP/byte → GFLOP/s → divide by 1000 → TFLOP/s
    const ceiling = Math.min(peakCompute, memBound);
    return { x: Number(x.toFixed(2)), ceiling: Number(ceiling.toFixed(1)) };
  });
  const opPoint = { x: roofline.arithmeticIntensity, y: Math.min(peakCompute, (peakBw * roofline.arithmeticIntensity) / 1000) };
  return (
    <div className="mt-2">
      <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Roofline 图 (横轴: 算术强度 FLOP/byte; 纵轴: 吞吐 TFLOP/s)</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="x" type="number" scale="log" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10 }} label={{ value: 'FLOP/byte', position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
          <YAxis type="number" scale="log" domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'TFLOP/s', position: 'insideTopLeft', offset: 8, fontSize: 10 }} />
          <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="ceiling" name="Roofline 上界" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
          <ReferenceDot x={opPoint.x} y={opPoint.y} r={5} fill="var(--color-china)" stroke="var(--color-china)" label={{ value: '工作点', fontSize: 10, position: 'top' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
