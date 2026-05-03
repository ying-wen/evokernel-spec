import { useMemo, useState } from 'react';

/**
 * Interactive capacity planner — applies the 7-step sizing math from
 * /learn/capacity-planning/ to user-selected (model × hardware × workload × SLO).
 *
 * Design principle: make the math VISIBLE, not hidden. Each line of the output
 * shows the formula + numbers + result. Users can audit + override mentally.
 *
 * No async / no fetch — pure computation on props passed from .astro page.
 */

interface ModelSummary {
  id: string;
  name: string;
  /** Total params in billions. */
  total_params_b: number;
  /** Active params for MoE; equal to total for dense. */
  active_params_b?: number;
  layers: number;
  hidden_size?: number;
  num_kv_heads?: number;
  head_dim?: number;
  attention_type?: string;
}

interface HardwareSummary {
  id: string;
  name: string;
  /** HBM capacity in GB. */
  hbm_gb: number;
  /** HBM bandwidth in TB/s. */
  hbm_bandwidth_tbs?: number;
  /** Vendor name. */
  vendor: string;
  /** Best decode tok/s/card we have on record (median across cases). */
  decode_tok_s_per_card?: number;
}

interface CapacityPlannerProps {
  models: ModelSummary[];
  hardware: HardwareSummary[];
}

type Precision = 'bf16' | 'fp8' | 'fp4' | 'int4';

const PRECISION_BYTES: Record<Precision, number> = {
  bf16: 2,
  fp8: 1,
  fp4: 0.5,
  int4: 0.5
};

const PRECISION_LABEL: Record<Precision, string> = {
  bf16: 'BF16 (2 byte/参数)',
  fp8: 'FP8 (1 byte/参数)',
  fp4: 'FP4 (0.5 byte/参数 — Blackwell)',
  int4: 'INT4 (0.5 byte/参数 — AWQ/GPTQ)'
};

interface SizingResult {
  weight_gb: number;
  kv_per_session_gb: number;
  activation_gb: number;
  total_per_card_gb_at_tp1: number;
  fits_single_card: boolean;
  recommended_tp: number;
  cards_for_throughput: number;
  cards_recommended: number;
  warnings: string[];
}

function computeSizing(
  model: ModelSummary,
  hw: HardwareSummary,
  precision: Precision,
  qps: number,
  avgOutputTokens: number,
  maxContext: number,
  concurrentSessions: number,
  kvPrecision: Precision,
  headroomPct: number
): SizingResult {
  const warnings: string[] = [];

  // A: Weight HBM (active params for MoE — only loaded experts count)
  const paramsForWeight = model.active_params_b ?? model.total_params_b;
  const weight_gb = paramsForWeight * PRECISION_BYTES[precision];

  // B: KV cache per session
  // KV size = 2 (K+V) × layers × kv_heads × head_dim × seq × bytes
  const kv_heads = model.num_kv_heads ?? 8; // fallback for older models
  const head_dim = model.head_dim ?? 128;
  const layers = model.layers;
  const kv_per_session_gb =
    (2 * layers * kv_heads * head_dim * maxContext * PRECISION_BYTES[kvPrecision]) / 1e9;

  // C: Activation + buffer (heuristic: ~10% of weight + 8GB engine buffer)
  const activation_gb = weight_gb * 0.1 + 8;

  // D: Total per card if TP=1
  const total_per_card_gb_at_tp1 = weight_gb + kv_per_session_gb * concurrentSessions + activation_gb;
  const fits_single_card = total_per_card_gb_at_tp1 <= hw.hbm_gb * 0.92; // 92% safe utilization

  // E: Recommended TP — power of 2, smallest that fits
  let recommended_tp = 1;
  while (
    weight_gb / recommended_tp +
      (kv_per_session_gb * concurrentSessions) / recommended_tp +
      activation_gb >
      hw.hbm_gb * 0.92 &&
    recommended_tp < 16
  ) {
    recommended_tp *= 2;
  }
  if (recommended_tp >= 16) {
    warnings.push('TP=16 仍装不下 — 考虑 PP 跨节点, 或上 KV-INT8 + FP8 量化先压到单节点.');
  }

  // F: Throughput → cards needed
  const decodeRate = hw.decode_tok_s_per_card ?? 1500; // fallback if no case data
  const tokensPerSec = qps * avgOutputTokens;
  const cards_for_throughput = Math.ceil(tokensPerSec / decodeRate);

  // G: Recommended (max of TP requirement, throughput requirement, with headroom)
  const headroomMult = 1 + headroomPct / 100;
  const cards_min = Math.max(recommended_tp, cards_for_throughput);
  const cards_recommended = Math.ceil(cards_min * headroomMult);

  // Warnings
  if (kv_per_session_gb * concurrentSessions > hw.hbm_gb) {
    warnings.push('KV cache 总占用超过单卡 HBM — 必须启用 KV-INT8 (减半) 或 hot-cold tiering (host RAM offload).');
  }
  if (kvPrecision === 'bf16' && model.attention_type !== 'mla') {
    warnings.push('当前 KV 走 BF16. 切到 INT8 可减半 HBM 占用 (质量损失 < 0.3 pt MMLU 在大模型上).');
  }
  if (precision === 'fp4' && hw.vendor !== 'nvidia') {
    warnings.push('FP4 在非 Blackwell 硬件上走 emulation, 性能折损; 推荐切到 FP8 或 INT4-AWQ.');
  }
  if (qps > decodeRate * cards_recommended / avgOutputTokens) {
    warnings.push('目标 QPS 接近卡数极限 — 可能 SLO 违反, 加 headroom 或减并发.');
  }
  if (cards_recommended > 64 && hw.vendor !== 'nvidia') {
    warnings.push('64+ 卡部署需要超节点 fabric (NVL72 / CloudMatrix 384), 普通 RoCE 集群跨节点通信会成为瓶颈.');
  }

  return {
    weight_gb,
    kv_per_session_gb,
    activation_gb,
    total_per_card_gb_at_tp1,
    fits_single_card,
    recommended_tp,
    cards_for_throughput,
    cards_recommended,
    warnings
  };
}

export default function CapacityPlanner({ models, hardware }: CapacityPlannerProps) {
  // Default to Llama 4 Scout × H200 if available, else first entries
  const defaultModelId = models.find((m) => m.id === 'llama-4-scout')?.id ?? models[0]?.id ?? '';
  const defaultHwId = hardware.find((h) => h.id === 'h200-sxm')?.id ?? hardware[0]?.id ?? '';

  const [modelId, setModelId] = useState(defaultModelId);
  const [hwId, setHwId] = useState(defaultHwId);
  const [precision, setPrecision] = useState<Precision>('fp8');
  const [kvPrecision, setKvPrecision] = useState<Precision>('bf16');
  const [qps, setQps] = useState(100);
  const [avgOutputTokens, setAvgOutputTokens] = useState(500);
  const [maxContext, setMaxContext] = useState(32768);
  const [concurrentSessions, setConcurrentSessions] = useState(32);
  const [headroomPct, setHeadroomPct] = useState(30);

  const model = useMemo(() => models.find((m) => m.id === modelId) ?? models[0], [models, modelId]);
  const hw = useMemo(() => hardware.find((h) => h.id === hwId) ?? hardware[0], [hardware, hwId]);

  const result = useMemo(
    () => model && hw
      ? computeSizing(model, hw, precision, qps, avgOutputTokens, maxContext, concurrentSessions, kvPrecision, headroomPct)
      : null,
    [model, hw, precision, qps, avgOutputTokens, maxContext, concurrentSessions, kvPrecision, headroomPct]
  );

  if (!model || !hw || !result) {
    return (
      <div className="cp-warnings">
        容量规划器缺少可用模型或硬件数据.
      </div>
    );
  }

  return (
    <div className="capacity-planner-grid">
      {/* Inputs */}
      <div className="cp-inputs">
        <h3 className="cp-section-title">1. 输入 / Inputs</h3>

        <label className="cp-field">
          <span className="cp-label">模型 / Model</span>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="cp-input">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.total_params_b}B {m.active_params_b ? `MoE A${m.active_params_b}B` : 'dense'})
              </option>
            ))}
          </select>
        </label>

        <label className="cp-field">
          <span className="cp-label">硬件 / Hardware</span>
          <select value={hwId} onChange={(e) => setHwId(e.target.value)} className="cp-input">
            {hardware.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.hbm_gb} GB HBM)
              </option>
            ))}
          </select>
        </label>

        <label className="cp-field">
          <span className="cp-label">权重精度 / Weight precision</span>
          <select value={precision} onChange={(e) => setPrecision(e.target.value as Precision)} className="cp-input">
            {(['bf16', 'fp8', 'fp4', 'int4'] as Precision[]).map((p) => (
              <option key={p} value={p}>{PRECISION_LABEL[p]}</option>
            ))}
          </select>
        </label>

        <label className="cp-field">
          <span className="cp-label">KV cache 精度</span>
          <select value={kvPrecision} onChange={(e) => setKvPrecision(e.target.value as Precision)} className="cp-input">
            <option value="bf16">BF16 (2 byte/elem)</option>
            <option value="fp8">FP8 (1 byte/elem)</option>
            <option value="int4">INT4 (0.5 byte/elem — 长 context 推荐)</option>
          </select>
        </label>

        <label className="cp-field">
          <span className="cp-label">目标 QPS</span>
          <input type="number" min={1} value={qps} onChange={(e) => setQps(Math.max(1, Number(e.target.value)))} className="cp-input" />
        </label>

        <label className="cp-field">
          <span className="cp-label">平均输出 tokens / 请求</span>
          <input type="number" min={1} value={avgOutputTokens} onChange={(e) => setAvgOutputTokens(Math.max(1, Number(e.target.value)))} className="cp-input" />
        </label>

        <label className="cp-field">
          <span className="cp-label">最大 context (tokens)</span>
          <input type="number" min={1} value={maxContext} onChange={(e) => setMaxContext(Math.max(1, Number(e.target.value)))} className="cp-input" />
        </label>

        <label className="cp-field">
          <span className="cp-label">并发活跃 session</span>
          <input type="number" min={1} value={concurrentSessions} onChange={(e) => setConcurrentSessions(Math.max(1, Number(e.target.value)))} className="cp-input" />
        </label>

        <label className="cp-field">
          <span className="cp-label">Headroom (%)</span>
          <input type="number" min={0} max={100} value={headroomPct} onChange={(e) => setHeadroomPct(Math.max(0, Math.min(100, Number(e.target.value))))} className="cp-input" />
        </label>
      </div>

      {/* Output */}
      <div className="cp-output">
        <h3 className="cp-section-title">2. 计算结果 / Result</h3>

        <div className="cp-recommendation" data-testid="cp-recommendation">
          <div className="cp-rec-label">推荐配置 / Recommended</div>
          <div className="cp-rec-value tabular-nums">
            {result.cards_recommended}× {hw.name}
          </div>
          <div className="cp-rec-subline">
            TP={result.recommended_tp} · 含 {headroomPct}% headroom
          </div>
        </div>

        <div className="cp-formula-block">
          <h4 className="cp-formula-title">推导步骤 / Derivation</h4>
          <ol className="cp-formula-list">
            <li>
              <span className="cp-formula-label">A. 权重 HBM:</span>{' '}
              <code className="cp-mono">
                {(model.active_params_b ?? model.total_params_b)}B × {PRECISION_BYTES[precision]} byte = {result.weight_gb.toFixed(1)} GB
              </code>
            </li>
            <li>
              <span className="cp-formula-label">B. KV / session ({maxContext.toLocaleString()} ctx):</span>{' '}
              <code className="cp-mono">
                2 × {model.layers} × {model.num_kv_heads ?? 8} × {model.head_dim ?? 128} × {maxContext.toLocaleString()} × {PRECISION_BYTES[kvPrecision]} = {result.kv_per_session_gb.toFixed(2)} GB
              </code>
            </li>
            <li>
              <span className="cp-formula-label">C. Activation + buffer:</span>{' '}
              <code className="cp-mono">~{result.activation_gb.toFixed(0)} GB</code>
            </li>
            <li>
              <span className="cp-formula-label">D. 单卡 TP=1:</span>{' '}
              <code className="cp-mono">
                {result.total_per_card_gb_at_tp1.toFixed(0)} GB / {hw.hbm_gb} GB HBM ={' '}
                {result.fits_single_card ? '✓ 装下' : '✗ 装不下'}
              </code>
            </li>
            <li>
              <span className="cp-formula-label">E. 推荐 TP:</span>{' '}
              <code className="cp-mono">TP={result.recommended_tp}</code>
            </li>
            <li>
              <span className="cp-formula-label">F. 吞吐 → 卡数:</span>{' '}
              <code className="cp-mono">
                {qps} QPS × {avgOutputTokens} tok = {(qps * avgOutputTokens).toLocaleString()} tok/s ÷ {hw.decode_tok_s_per_card ?? 1500} tok/s/card = {result.cards_for_throughput} cards
              </code>
            </li>
            <li>
              <span className="cp-formula-label">G. 取 max + headroom:</span>{' '}
              <code className="cp-mono">
                max({result.recommended_tp}, {result.cards_for_throughput}) × {(1 + headroomPct / 100).toFixed(2)} ={' '}
                <strong>{result.cards_recommended} cards</strong>
              </code>
            </li>
          </ol>
        </div>

        {result.warnings.length > 0 && (
          <div className="cp-warnings" data-testid="cp-warnings">
            <h4 className="cp-warnings-title">⚠️ 注意</h4>
            <ul>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="cp-disclaimer">
          <strong>免责声明:</strong> 这是 sizing 上界估算 — 实际部署受 engine 选择 / 量化校准 /
          调度策略 / cluster 网络等影响, 真实需要在 ±20% 区间. 用作 day-1 容量规划起点, 上线后用真实 metric
          校准.
        </div>
      </div>
    </div>
  );
}
