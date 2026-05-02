import type { APIRoute } from 'astro';
import {
  getResolvedCases,
  getPlaybooks,
  getResolvedHardware,
  getModels,
  getEngines
} from '~/lib/data';

/**
 * v2.4: /api/solve.json — flat enumeration of all known configurations,
 * normalized into a queryable shape so external agents can rank-and-filter
 * client-side without scraping per-page HTML.
 *
 * Each entry combines:
 *   - measured cases (tier=measured, source=case) — real benchmark data
 *   - playbook recommendations (tier=estimated, source=playbook) — recipes
 *
 * Both are normalized into a shared `Configuration` shape with derived
 * fields like `dollars_per_m_tokens_estimate` (computed from $/hour ÷
 * throughput when both are known).
 *
 * Consumers query by filtering the `configurations` array — e.g.
 *   configs.filter(c => c.metrics.decode_throughput_tok_s > 10000
 *                    && c.hardware.id === 'h100-sxm5'
 *                    && c.metrics.dollars_per_m_tokens_estimate < 0.50)
 *
 * Static SSG limitation: the endpoint can't accept query params, so
 * consumers do all filtering client-side. This is fine for the corpus size
 * (< 100 entries currently) and works equally well for caching layers.
 */

interface Configuration {
  source: 'case' | 'playbook';
  source_id: string;
  source_url: string;

  model: { id: string; family?: string };
  hardware: { id: string; vendor?: string; arch?: string; count?: number };
  hardware_class?: string; // playbook only
  model_archetype?: string; // playbook only

  engine: { id: string; version?: string };
  quantization: string;
  parallel: { tp: number | string; pp?: number | string; ep?: number | string; sp?: number | string; disaggregated?: boolean };

  workload_profile?: string[]; // playbook only

  metrics: {
    /** measured (case) or midpoint (playbook range), in tokens / sec / card */
    decode_throughput_tok_s_per_card?: number;
    /** measured TTFT p99 in ms (case only) */
    ttft_p99_ms?: number;
    /** measured TBT p99 in ms (case only) */
    tbt_p99_ms?: number;
    /** measured memory per card in GB (case only) */
    memory_per_card_gb?: number;
    /** measured power per card in W (case only) */
    power_per_card_w?: number;
    /** measured compute utilization % (case only) */
    compute_utilization_pct?: number;
    /** derived $/M tokens estimate — case: from rent + power; playbook: midpoint of range */
    dollars_per_m_tokens_estimate?: number;
    /** playbook range — min */
    dollars_per_m_tokens_min?: number;
    /** playbook range — max */
    dollars_per_m_tokens_max?: number;
  };

  tier: 'measured' | 'estimated';
  bottleneck?: string; // case only
  patterns?: string[]; // both
}

/**
 * Rough rent estimates by hardware id (USD/hour, on-demand cloud or rack-equiv).
 * Used to derive dollars_per_m_tokens for measured cases when the case doesn't
 * include a $/hour field. Numbers come from public cloud pricing snapshots
 * (AWS / Azure / OCI / RunPod / TensorWave / 阿里云) — accessed 2026-04.
 *
 * Inexact by design: ±25%. Surfaces relative ranking, not absolute quote.
 */
const HARDWARE_HOURLY_USD: Record<string, number> = {
  'h100-sxm5': 3.5,
  'h200-sxm': 4.0,
  'b200-sxm': 6.0,
  'b300-sxm': 8.0,
  'a100-sxm4': 2.0,
  'l40s': 1.0,
  'mi300x': 3.0,
  'mi325x': 4.0,
  'mi355x': 6.0,
  'gaudi-3': 2.5,
  'ascend-910b': 2.5,
  'ascend-910c': 3.5,
  'mlu590': 2.5,
  'trainium-2': 2.0
};

const HARDWARE_RENT_NOTE =
  'dollars_per_m_tokens_estimate is derived as (rent $/hr × card_count + power_kW × $0.10) ÷ (decode_tok_s × 3600 / 1e6). Rent is approximate cloud / cabinet-equivalent (±25%). For a precise number, run /pricing/by-engine/ or /calculator/.';

export const GET: APIRoute = async () => {
  const [cases, playbooks, hardware, models, engines] = await Promise.all([
    getResolvedCases(),
    getPlaybooks(),
    getResolvedHardware(),
    getModels(),
    getEngines()
  ]);

  const hwById = new Map(hardware.map((h) => [h.id, h]));
  const modelById = new Map(models.map((m) => [m.id, m]));

  const configurations: Configuration[] = [];

  // === measured cases ===
  for (const c of cases) {
    const hw = hwById.get(c.stack.hardware.id);
    const model = modelById.get(c.stack.model.id);
    const cardCount = c.stack.hardware.count;
    const decodeTokS = c.results.throughput_tokens_per_sec.decode;

    // Derive $/M tokens if we have a rent estimate
    let dollarsPerM: number | undefined;
    const hourly = HARDWARE_HOURLY_USD[c.stack.hardware.id];
    if (hourly && decodeTokS > 0 && cardCount > 0) {
      const totalCost = hourly * cardCount + (c.results.power_per_card_w / 1000) * cardCount * 0.1;
      const tokensPerHour = decodeTokS * 3600;
      dollarsPerM = (totalCost * 1e6) / tokensPerHour;
    }

    configurations.push({
      source: 'case',
      source_id: c.id,
      source_url: `/cases/${c.id}/`,
      model: { id: c.stack.model.id, family: model?.family },
      hardware: {
        id: c.stack.hardware.id,
        vendor: hw?.vendor.id,
        count: cardCount
      },
      engine: { id: c.stack.engine.id, version: c.stack.engine.version },
      quantization: c.stack.quantization,
      parallel: {
        tp: c.stack.parallel.tp,
        pp: c.stack.parallel.pp,
        ep: c.stack.parallel.ep,
        sp: c.stack.parallel.sp,
        disaggregated: c.stack.parallel.disaggregated
      },
      metrics: {
        decode_throughput_tok_s_per_card: cardCount > 0 ? decodeTokS / cardCount : decodeTokS,
        ttft_p99_ms: c.results.latency_ms.ttft_p99,
        tbt_p99_ms: c.results.latency_ms.tbt_p99,
        memory_per_card_gb: c.results.memory_per_card_gb,
        power_per_card_w: c.results.power_per_card_w,
        compute_utilization_pct: c.results.utilization.compute_pct,
        dollars_per_m_tokens_estimate: dollarsPerM != null ? Number(dollarsPerM.toFixed(3)) : undefined
      },
      tier: 'measured',
      bottleneck: c.bottleneck,
      patterns: c.patterns
    });
  }

  // === playbook recommendations ===
  for (const pb of playbooks) {
    const dMin = pb.recipe.expected_perf.cost_per_million_tokens_usd_min;
    const dMax = pb.recipe.expected_perf.cost_per_million_tokens_usd_max;
    const dMid =
      dMin != null && dMax != null ? (dMin + dMax) / 2 : dMin ?? dMax ?? undefined;

    const decodeMin = pb.recipe.expected_perf.decode_tok_s_per_gpu_min;
    const decodeMax = pb.recipe.expected_perf.decode_tok_s_per_gpu_max;
    const decodeMid =
      decodeMin != null && decodeMax != null ? (decodeMin + decodeMax) / 2 : decodeMin ?? decodeMax ?? undefined;

    configurations.push({
      source: 'playbook',
      source_id: pb.id,
      source_url: `/playbooks/${pb.id}/`,
      model: { id: pb.model_archetype }, // archetype, not specific model
      hardware: { id: pb.hardware_class }, // class, not specific card
      hardware_class: pb.hardware_class,
      model_archetype: pb.model_archetype,
      engine: { id: pb.recipe.engine_primary },
      quantization: pb.recipe.quantization,
      parallel: {
        tp: pb.recipe.parallelism.tp,
        pp: pb.recipe.parallelism.pp,
        ep: pb.recipe.parallelism.ep,
        sp: pb.recipe.parallelism.sp,
        disaggregated: pb.recipe.parallelism.disaggregated
      },
      workload_profile: pb.workload_profile,
      metrics: {
        decode_throughput_tok_s_per_card: decodeMid,
        dollars_per_m_tokens_min: dMin,
        dollars_per_m_tokens_max: dMax,
        dollars_per_m_tokens_estimate: dMid != null ? Number(dMid.toFixed(3)) : undefined
      },
      tier: 'estimated',
      patterns: pb.recipe.patterns
    });
  }

  // Annotate each entry with a sortable composite "score" — higher = better
  // for default ranking. Tunable: 0.5 throughput weight + 0.3 cost weight + 0.2 latency.
  // Skipped if metrics missing.
  const enriched = configurations.map((c) => {
    const t = c.metrics.decode_throughput_tok_s_per_card ?? 0;
    const d = c.metrics.dollars_per_m_tokens_estimate ?? 0;
    const l = c.metrics.ttft_p99_ms ?? 0;
    // Normalize naively: throughput 50K is "great", $/M 0.1 is "great", TTFT 100ms is "great"
    const tNorm = Math.min(t / 50000, 1);
    const dNorm = d > 0 ? Math.max(0, 1 - d / 5) : 0;
    const lNorm = l > 0 ? Math.max(0, 1 - l / 1000) : 0;
    const score = 0.5 * tNorm + 0.3 * dNorm + 0.2 * lNorm;
    return { ...c, default_score: Number(score.toFixed(4)) };
  });

  return new Response(
    JSON.stringify(
      {
        schema_version: '1.0',
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        count: enriched.length,
        count_by_tier: {
          measured: enriched.filter((c) => c.tier === 'measured').length,
          estimated: enriched.filter((c) => c.tier === 'estimated').length
        },
        notes: HARDWARE_RENT_NOTE,
        query_examples: [
          {
            intent: 'Cheap chat deployment on H100',
            filter:
              "configurations.filter(c => c.hardware.id === 'h100-sxm5' && (c.metrics.dollars_per_m_tokens_estimate ?? 99) < 1.0).sort((a, b) => (a.metrics.dollars_per_m_tokens_estimate ?? 99) - (b.metrics.dollars_per_m_tokens_estimate ?? 99))"
          },
          {
            intent: 'Highest decode throughput per card',
            filter:
              'configurations.filter(c => c.metrics.decode_throughput_tok_s_per_card != null).sort((a, b) => (b.metrics.decode_throughput_tok_s_per_card ?? 0) - (a.metrics.decode_throughput_tok_s_per_card ?? 0))'
          },
          {
            intent: 'Strict TTFT p99 < 300ms',
            filter:
              'configurations.filter(c => (c.metrics.ttft_p99_ms ?? 99999) < 300)'
          },
          {
            intent: 'Domestic hardware (China) options',
            filter:
              "configurations.filter(c => ['huawei','cambricon','moore-threads','hygon','biren','iluvatar','enflame','metax'].includes(c.hardware.vendor ?? ''))"
          }
        ],
        configurations: enriched
      },
      null,
      2
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*'
      }
    }
  );
};
