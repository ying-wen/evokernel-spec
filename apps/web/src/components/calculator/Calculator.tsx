import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, ResponsiveContainer, Legend
} from 'recharts';
import type { Hardware, Model, Case, Engine } from '@evokernel/schemas';
import { calculate } from '~/lib/calculator';
import type { Precision } from '~/lib/calculator';

interface Props {
  models: Model[];
  hardware: Hardware[];
  cases: Case[];
  engines: Engine[];
}

type Step = 1 | 2 | 3;

export default function Calculator({ models, hardware, cases, engines }: Props) {
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

  const result = useMemo(() => {
    if (!modelId || !hwId) return null;
    const m = models.find((x) => x.id === modelId);
    const h = hardware.find((x) => x.id === hwId);
    if (!m || !h) return null;
    return calculate({
      calc: {
        modelId,
        hardware: { id: hwId, count: hwCount },
        scenario: { prefillSeqLen: prefill, decodeSeqLen: decode, batchSize: batch, concurrency: 64 },
        precision,
        parallel: { tp, pp, ep, sp: 1 },
        engineId,
        disaggregated: { enabled: false }
      },
      hardware: h, model: m, cases
    });
  }, [modelId, hwId, hwCount, precision, tp, pp, ep, batch, prefill, decode, engineId, models, hardware, cases]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[14rem,1fr] gap-8">
      <nav className="space-y-2 sticky top-4 self-start" style={{ alignSelf: 'start' }}>
        {[
          { n: 1 as Step, label: '选模型', done: !!modelId },
          { n: 2 as Step, label: '选硬件', done: !!hwId },
          { n: 3 as Step, label: '选场景', done: true }
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
      </nav>

      <div className="space-y-6">
        {step === 1 && (
          <section>
            <h3 className="text-lg font-semibold mb-3">1. 选模型</h3>
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
            <h3 className="text-lg font-semibold mb-3">2. 选硬件</h3>
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
              <label>卡数 <input type="number" min={1} max={384} value={hwCount} onChange={(e) => setHwCount(+e.target.value || 1)}
                                className="ml-2 w-20 px-2 py-1 rounded border"
                                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} /></label>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h3 className="text-lg font-semibold mb-3">3. 选场景</h3>
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
          </section>
        )}

        {result && <ResultPanel result={result} cases={cases} hwCount={hwCount} hwTdpW={hardware.find((h) => h.id === hwId)?.power.tdp_w?.value ?? 700} />}
      </div>
    </div>
  );
}

function ResultPanel({ result, cases: _cases, hwCount, hwTdpW }: { result: NonNullable<ReturnType<typeof calculate>>; cases: Case[]; hwCount: number; hwTdpW: number }) {
  // pass hwTdpW down via TCOPanel default prop trick: not needed since component reads its own state.
  void hwTdpW;
  const r = result;
  return (
    <section className="mt-6 space-y-6">
      {/* Tier 0 */}
      <div className="rounded-lg border p-5"
           style={{ borderColor: 'var(--color-tier-measured)', background: 'color-mix(in oklch, var(--color-tier-measured) 5%, var(--color-bg))' }}>
        <h4 className="font-semibold mb-3">实测案例 (Tier 0) — {r.tier0Cases.length} 条</h4>
        {r.tier0Cases.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            尚无匹配的实测案例。<a href="https://github.com/evokernel/evokernel-spec" className="underline" style={{ color: 'var(--color-accent)' }}>贡献你的实测?</a>
          </p>
        ) : (
          <ul className="space-y-2">
            {r.tier0Cases.map((m) => {
              return (
                <li key={m.caseId}>
                  <a href={`/cases/${m.caseId}`} className="block p-3 rounded text-sm" style={{ background: 'var(--color-surface-raised)' }}>
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
        <h4 className="font-semibold mb-3">理论上界 (Tier 1, Roofline)</h4>
        <p className="text-xs mb-4 p-2 rounded" style={{ background: 'color-mix(in oklch, var(--color-tier-estimated) 12%, var(--color-bg))', color: 'var(--color-tier-estimated)' }}>
          ⚠️ 理论上界, 真实场景通常达 40-70% of this. 已应用 efficiency=0.5 的粗略系数。
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Decode 吞吐上界</dt><dd className="font-mono text-xl">{r.tier1Roofline.decodeThroughputUpperBound.toFixed(0)} <span className="text-sm opacity-60">tok/s/card</span></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>瓶颈</dt><dd className="text-xl">{r.tier1Roofline.isComputeBound ? '计算受限' : '内存带宽受限'}</dd></div>
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
          <div><dt style={{ color: 'var(--color-text-muted)' }}>单卡显存</dt><dd className="font-mono">{r.configCheck.memoryAvailableGb} GB</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>权重</dt><dd className="font-mono">{r.configCheck.weightsGb.toFixed(1)} GB</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>KV cache</dt><dd className="font-mono">{r.configCheck.kvCacheGb.toFixed(1)} GB</dd></div>
        </dl>
        {!r.configCheck.feasible && <p className="mt-3 text-sm" style={{ color: 'oklch(55% 0.2 25)' }}>❌ 配置不可行 (见下方建议)</p>}
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
