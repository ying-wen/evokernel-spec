/**
 * Model → Recommended Hardware
 *
 * Given a model, score every hardware on three axes engineers actually care
 * about: max throughput, lowest $/M tokens, and verified-by-real-cases.
 *
 * The math is intentionally the same as /calculator (so users can drill in
 * and reproduce) — this module is mostly orchestration: pick a sensible
 * default scenario, run calculate() per hardware, fold in pricing data,
 * rank, and dedupe.
 */

import type { Hardware, Model, Case, Engine } from '@evokernel/schemas';
import { calculate, buildEfficiencyMap, getEfficiency, type Precision } from './calculator';

export interface RecommendationRow {
  hw: Hardware;
  /** Optimal precision picked for this hardware (highest peak supported). */
  precision: Precision;
  /** Decode tok/s/card upper bound (Tier-1 calibrated roofline). */
  decodeTokPerSecPerCard: number;
  /** Whether the model fits in memory at the chosen TP. */
  feasible: boolean;
  /** Reason if not feasible. */
  reason?: string;
  /** Bottleneck: compute or memory. */
  bottleneck: 'compute' | 'memory' | 'n/a';
  /** Whether at least one measured case exists for this hardware × model combo. */
  hasMeasuredCase: boolean;
  /** Calibration status. */
  isCalibrated: boolean;
  /** Tier-0 measured throughput if available (per-card). */
  measuredDecodeTokPerSecPerCard?: number;
  /** $/M tokens estimate using the same formula as /pricing. */
  costPerMTokens: number;
  /** Inputs that the recommendation was computed against (so the user can
   *  click through to /calculator/?... with these knobs preset). */
  scenario: { hwCount: number; precision: Precision; tp: number };
}

/** Same TCO formula as /pricing/. Compute-only BoM lower bound. */
const HW_RENT_USD_PER_HOUR_PER_CARD = 2.5;
const POWER_USD_PER_KWH = 0.10;
const PUE = 1.3;

function computeCost(hw: Hardware, decodeTokPerSecPerCard: number): number {
  if (decodeTokPerSecPerCard <= 0) return Infinity;
  const tdpW = hw.power.tdp_w?.value ?? 700;
  const hwHourlyCost = HW_RENT_USD_PER_HOUR_PER_CARD;
  const powerHourlyCost = (tdpW * PUE / 1000) * POWER_USD_PER_KWH;
  const totalHourlyCost = hwHourlyCost + powerHourlyCost;
  const tokensPerHour = decodeTokPerSecPerCard * 3600;
  return (totalHourlyCost / tokensPerHour) * 1e6;
}

/** Pick the strongest precision the hardware supports, biased toward FP8/FP4. */
function pickPrecision(hw: Hardware): Precision {
  const supported = hw.software_support.quantizations;
  if (supported.includes('fp4') && hw.compute.fp4_tflops?.value) return 'fp4';
  if (supported.includes('fp8-e4m3') && hw.compute.fp8_tflops?.value) return 'fp8';
  if (supported.includes('bf16') && hw.compute.bf16_tflops?.value) return 'bf16';
  if (supported.includes('fp16') && hw.compute.fp16_tflops?.value) return 'fp16';
  return 'int8';
}

/**
 * Build recommendations for a model across all hardware. Default scenario:
 * 8 cards (TP=8 or world_size if smaller), batch=16, prefill=1024, decode=256.
 *
 * Returns one row per *feasible* hardware. Infeasible (memory-too-small)
 * configurations are still returned but flagged with feasible=false so the UI
 * can surface them as "wouldn't fit" rather than silently dropping them.
 */
export function recommendHardwareForModel(input: {
  model: Model;
  hardware: Hardware[];
  cases: Case[];
  /** Optional engine pin; defaults to vllm. Affects nothing in the math but
   *  surfaces in the deep-link query string. */
  engineId?: string;
}): RecommendationRow[] {
  const { model, hardware, cases, engineId = 'vllm' } = input;

  const efficiencyMap = buildEfficiencyMap(cases, hardware, [model]);

  const rows: RecommendationRow[] = hardware.map((hw): RecommendationRow => {
    const precision = pickPrecision(hw);
    // 8 cards with TP=8 if world_size allows, else fall back to world_size.
    const tp = Math.min(8, hw.scale_up.world_size);
    const hwCount = tp;

    const result = calculate({
      calc: {
        modelId: model.id,
        hardware: { id: hw.id, count: hwCount },
        scenario: { prefillSeqLen: 1024, decodeSeqLen: 256, batchSize: 16, concurrency: 64 },
        precision,
        parallel: { tp, pp: 1, ep: 1, sp: 1 },
        engineId,
        disaggregated: { enabled: false }
      },
      hardware: hw, model, cases, efficiencyMap
    });

    const decodeTokPerSecPerCard = result.tier1Roofline.decodeThroughputUpperBound;
    const feasible = result.configCheck.feasible;
    const isCalibrated = getEfficiency(hw.id, efficiencyMap).isCalibrated;
    const bottleneck = feasible
      ? (result.tier1Roofline.isComputeBound ? 'compute' : 'memory')
      : 'n/a';

    // Look up Tier-0 (measured) case for this hw × model
    const directCase = cases.find((c) =>
      c.stack.hardware.id === hw.id && c.stack.model.id === model.id
    );
    const hasMeasuredCase = !!directCase;
    const measuredDecodeTokPerSecPerCard = directCase
      ? directCase.results.throughput_tokens_per_sec.decode / Math.max(directCase.stack.hardware.count, 1)
      : undefined;

    // Use measured throughput for cost computation when available; else upper bound.
    const throughputForCost = measuredDecodeTokPerSecPerCard ?? decodeTokPerSecPerCard;
    const costPerMTokens = feasible ? computeCost(hw, throughputForCost) : Infinity;

    return {
      hw, precision,
      decodeTokPerSecPerCard,
      feasible,
      reason: feasible ? undefined : (result.configCheck.warnings[0] ?? 'configuration infeasible'),
      bottleneck,
      hasMeasuredCase,
      isCalibrated,
      measuredDecodeTokPerSecPerCard,
      costPerMTokens,
      scenario: { hwCount, precision, tp }
    };
  });

  return rows;
}

/** Top-N by decode throughput (only feasible). */
export function topByThroughput(rows: RecommendationRow[], n = 5): RecommendationRow[] {
  return rows
    .filter((r) => r.feasible)
    .sort((a, b) => b.decodeTokPerSecPerCard - a.decodeTokPerSecPerCard)
    .slice(0, n);
}

/** Top-N by lowest $/M tokens (only feasible). */
export function topByCost(rows: RecommendationRow[], n = 5): RecommendationRow[] {
  return rows
    .filter((r) => r.feasible && Number.isFinite(r.costPerMTokens))
    .sort((a, b) => a.costPerMTokens - b.costPerMTokens)
    .slice(0, n);
}

/** All hardware with at least one measured case for the model, sorted by measured throughput. */
export function verifiedByMeasuredCase(rows: RecommendationRow[]): RecommendationRow[] {
  return rows
    .filter((r) => r.hasMeasuredCase)
    .sort((a, b) =>
      (b.measuredDecodeTokPerSecPerCard ?? 0) - (a.measuredDecodeTokPerSecPerCard ?? 0)
    );
}

/** Build the deep-link URL into /calculator preserving the chosen scenario. */
export function calculatorDeepLink(
  modelId: string,
  row: RecommendationRow,
  base: string = ''
): string {
  const params = new URLSearchParams({
    model: modelId,
    hw: row.hw.id,
    hwCount: String(row.scenario.hwCount),
    prec: row.scenario.precision,
    tp: String(row.scenario.tp)
  });
  return `${base}/calculator/?${params.toString()}`;
}
