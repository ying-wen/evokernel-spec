import type { Hardware, Model, Case } from '@evokernel/schemas';
import type {
  CalcInput, CalcOutput, Precision, CaseMatch, RooflineOutput,
  OperatorBreakdown, DisaggregatedOutput
} from './types.ts';
import { buildEfficiencyMap, getEfficiency, type EfficiencyEntry } from './calibration.ts';

export type { CalcInput, CalcOutput, Precision, CaseMatch, RooflineOutput, OperatorBreakdown, DisaggregatedOutput, EfficiencyEntry };
export { buildEfficiencyMap, getEfficiency };

const PEAK_BY_PRECISION = (h: Hardware, p: Precision): number | null => {
  const c = h.compute;
  switch (p) {
    case 'fp4': return c.fp4_tflops?.value ?? null;
    case 'fp8': return c.fp8_tflops?.value ?? null;
    case 'bf16': return c.bf16_tflops?.value ?? null;
    case 'fp16': return c.fp16_tflops?.value ?? null;
    case 'int8': return c.int8_tops?.value ?? null;
  }
};

const BYTES_PER_WEIGHT: Record<Precision, number> = {
  fp4: 0.5, fp8: 1, bf16: 2, fp16: 2, int8: 1
};

export function computeRoofline(input: {
  flopsPerToken: number;
  bytesPerToken: number;
  peakComputeTflops: number;
  peakMemoryBwGbps: number;
  efficiencyFactor?: number;
}): RooflineOutput {
  if (input.peakComputeTflops <= 0 || input.peakMemoryBwGbps <= 0 || input.bytesPerToken <= 0) {
    return {
      arithmeticIntensity: 0,
      peakComputeTflops: input.peakComputeTflops,
      peakMemoryBwGbps: input.peakMemoryBwGbps,
      ridgePoint: 0,
      isComputeBound: false,
      utilizationCeiling: 0,
      decodeThroughputUpperBound: 0,
      prefillThroughputUpperBound: 0
    };
  }
  const eff = input.efficiencyFactor ?? 0.5;
  const arithmeticIntensity = input.flopsPerToken / input.bytesPerToken;
  const peakFlops = input.peakComputeTflops * 1e12;
  const peakBytes = input.peakMemoryBwGbps * 1e9;
  const ridgePoint = peakFlops / peakBytes;
  const isComputeBound = arithmeticIntensity >= ridgePoint;
  const memBoundT = peakBytes / input.bytesPerToken;
  const computeBoundT = peakFlops / input.flopsPerToken;
  const upper = Math.min(memBoundT, computeBoundT);
  return {
    arithmeticIntensity,
    peakComputeTflops: input.peakComputeTflops,
    peakMemoryBwGbps: input.peakMemoryBwGbps,
    ridgePoint,
    isComputeBound,
    utilizationCeiling: eff,
    decodeThroughputUpperBound: upper * eff,
    prefillThroughputUpperBound: upper * eff
  };
}

const WEIGHTS = { model: 0.30, hardware: 0.25, precision: 0.15, engine: 0.10, parallel: 0.10, scenario: 0.10 };

export function findSimilarCases(cases: Case[], input: CalcInput, topN = 3): CaseMatch[] {
  const scored = cases.map((c): CaseMatch => {
    let score = 0;
    if (c.stack.model.id === input.modelId) score += WEIGHTS.model;
    if (c.stack.hardware.id === input.hardware.id) score += WEIGHTS.hardware;
    if (c.stack.quantization === input.precision) score += WEIGHTS.precision;
    if (c.stack.engine.id === input.engineId) score += WEIGHTS.engine;
    let pSame = 0;
    for (const k of ['tp', 'pp', 'ep', 'sp'] as const) if (c.stack.parallel[k] === input.parallel[k]) pSame++;
    score += WEIGHTS.parallel * (pSame / 4);
    const dPre = 1 - Math.min(1, Math.abs(c.scenario.prefill_seq_len - input.scenario.prefillSeqLen) / Math.max(c.scenario.prefill_seq_len, input.scenario.prefillSeqLen, 1));
    const dDec = 1 - Math.min(1, Math.abs(c.scenario.decode_seq_len - input.scenario.decodeSeqLen) / Math.max(c.scenario.decode_seq_len, input.scenario.decodeSeqLen, 1));
    const dBat = 1 - Math.min(1, Math.abs(c.scenario.batch_size - input.scenario.batchSize) / Math.max(c.scenario.batch_size, input.scenario.batchSize, 1));
    score += WEIGHTS.scenario * ((dPre + dDec + dBat) / 3);
    return {
      caseId: c.id,
      caseTitle: c.title,
      throughputDecode: c.results.throughput_tokens_per_sec.decode,
      throughputPrefill: c.results.throughput_tokens_per_sec.prefill,
      matchScore: score
    };
  });
  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, topN).filter((m) => m.matchScore > 0.3);
}

export function calculate(input: {
  calc: CalcInput;
  hardware: Hardware;
  model: Model;
  cases: Case[];
  /** Optional pre-built efficiency map from cases. If omitted, uses default 0.5. */
  efficiencyMap?: Map<string, EfficiencyEntry>;
}): CalcOutput {
  const { calc, hardware, model, cases, efficiencyMap } = input;
  const trace: string[] = [];

  const efficiency = efficiencyMap
    ? getEfficiency(hardware.id, efficiencyMap)
    : { factor: 0.5, isCalibrated: false, sampleCount: 0 };
  if (efficiency.isCalibrated) {
    trace.push(`efficiency: ${efficiency.factor.toFixed(2)} (calibrated from ${efficiency.sampleCount} case${efficiency.sampleCount === 1 ? '' : 's'} on ${hardware.id})`);
  } else {
    trace.push('efficiency: 0.5 (default — no measured cases for this hardware yet)');
  }

  const totalFlops = model.operator_decomposition.reduce((a, op) => a + op.flops_per_token, 0);
  const totalBytes = model.operator_decomposition.reduce((a, op) => a + op.bytes_per_token, 0);
  trace.push(`per-token FLOPs = ${totalFlops.toExponential(3)}, bytes = ${totalBytes.toExponential(3)}`);

  const peakTflops = PEAK_BY_PRECISION(hardware, calc.precision) ?? 0;
  const peakBwGbps = hardware.memory.bandwidth_gbps?.value ?? 0;
  trace.push(`peak ${calc.precision}: ${peakTflops} TFLOPS · BW: ${peakBwGbps} GB/s`);

  const roofline = computeRoofline({
    flopsPerToken: totalFlops || 1,
    bytesPerToken: totalBytes || 1,
    peakComputeTflops: peakTflops,
    peakMemoryBwGbps: peakBwGbps,
    efficiencyFactor: efficiency.factor
  });

  const tier0 = findSimilarCases(cases, calc);

  const bytesPerWeight = BYTES_PER_WEIGHT[calc.precision];
  // Memory uses TOTAL params (full weights must reside in HBM); EP distributes experts across devices.
  const ep = Math.max(calc.parallel.ep, 1);
  const weightsGb = (model.architecture.total_params_b * 1e9 * bytesPerWeight) / (calc.parallel.tp * calc.parallel.pp * ep) / 1e9;
  const totalCacheTokens = calc.scenario.batchSize * (calc.scenario.prefillSeqLen + calc.scenario.decodeSeqLen);
  const kvBytes = 2 * model.architecture.layers * model.architecture.num_kv_heads * model.architecture.head_dim * 2 * totalCacheTokens / calc.parallel.tp;
  const kvCacheGb = kvBytes / 1e9;
  const totalGb = weightsGb + kvCacheGb + 2;
  const memAvail = hardware.memory.capacity_gb?.value ?? 0;
  trace.push(`memory: weights ${weightsGb.toFixed(1)} GB + KV cache ${kvCacheGb.toFixed(1)} GB + activation 2 GB = ${totalGb.toFixed(1)} GB; available ${memAvail} GB`);

  const recommendations: string[] = [];
  if (totalGb > memAvail) {
    const needed = Math.ceil(totalGb / memAvail);
    recommendations.push(`显存不足 (需 ${totalGb.toFixed(1)} GB, 单卡 ${memAvail} GB)。考虑 TP=${needed}, 或更激进量化 (FP8/INT4)。`);
  }
  if (!roofline.isComputeBound && (calc.precision === 'bf16' || calc.precision === 'fp16')) {
    recommendations.push('memory-bound 的 decode 场景, 切换到 INT8/INT4 量化通常显著提升吞吐 (1.5-2.5x)。');
  }
  if (calc.parallel.tp >= 8 && hardware.scale_up.bandwidth_gbps < 600) {
    recommendations.push(`TP=${calc.parallel.tp} 但 scale-up 带宽 (${hardware.scale_up.bandwidth_gbps} GB/s) 较低, 通信开销可能显著。`);
  }
  if (model.architecture.family === 'moe' && calc.parallel.ep === 1 && calc.scenario.batchSize >= 32) {
    recommendations.push('MoE 模型 + 大 batch 下, 启用 EP > 1 可能减少单卡 expert 内存压力。');
  }

  const warnings: string[] = [];
  if (peakTflops === 0) warnings.push(`硬件 ${hardware.id} 不支持 ${calc.precision} 精度。`);

  // Per-operator timing breakdown
  const peakFlops = peakTflops * 1e12;
  const peakBytes = peakBwGbps * 1e9;
  const opEfficiency = roofline.utilizationCeiling || 0.5;
  const breakdown: OperatorBreakdown[] = model.operator_decomposition.map((op) => {
    const computeMs = peakFlops > 0 ? (op.flops_per_token / (peakFlops * opEfficiency)) * 1000 : 0;
    const memoryMs = peakBytes > 0 ? (op.bytes_per_token / (peakBytes * opEfficiency)) * 1000 : 0;
    const timeMsPerToken = Math.max(computeMs, memoryMs);
    return {
      operator: op.operator,
      flopsPerToken: op.flops_per_token,
      bytesPerToken: op.bytes_per_token,
      timeMsPerToken,
      share: 0,
      isComputeBound: computeMs >= memoryMs
    };
  });
  const totalMs = breakdown.reduce((a, b) => a + b.timeMsPerToken, 0) || 1;
  for (const b of breakdown) b.share = b.timeMsPerToken / totalMs;

  // Disaggregated output (only if enabled)
  let disagg: DisaggregatedOutput | null = null;
  if (calc.disaggregated.enabled && calc.disaggregated.prefillCards && calc.disaggregated.decodeCards) {
    const perCardUpper = roofline.decodeThroughputUpperBound;
    // KV cache transfer: per token, layers × kv_heads × head_dim × 2 × bytesPerWeight
    const kvBytesPerToken = 2 * model.architecture.layers * model.architecture.num_kv_heads * model.architecture.head_dim * bytesPerWeight;
    const interconnectBwBytes = hardware.scale_out.bandwidth_gbps_per_card * 1e9 / 8;
    disagg = {
      enabled: true,
      prefillThroughput: perCardUpper * calc.disaggregated.prefillCards,
      decodeThroughput: perCardUpper * calc.disaggregated.decodeCards,
      kvTransferLatencyMs: interconnectBwBytes > 0 ? (kvBytesPerToken / interconnectBwBytes) * 1000 : 0
    };
    trace.push(`disaggregated: prefill ${calc.disaggregated.prefillCards} + decode ${calc.disaggregated.decodeCards} cards, KV transfer ${disagg.kvTransferLatencyMs.toFixed(2)} ms/token`);
  }

  return {
    tier0Cases: tier0,
    tier1Roofline: roofline,
    operatorBreakdown: breakdown,
    disaggregated: disagg,
    configCheck: {
      feasible: totalGb <= memAvail && peakTflops > 0,
      warnings,
      memoryRequiredGb: totalGb,
      memoryAvailableGb: memAvail,
      weightsGb,
      kvCacheGb
    },
    recommendations,
    formulaTrace: trace
  };
}
