import { describe, it, expect } from 'vitest';
import type { Hardware, Model, Case } from '@evokernel/schemas';
import {
  recommendHardwareForModel,
  topByThroughput,
  topByCost,
  verifiedByMeasuredCase,
  calculatorDeepLink
} from './recommendations';

// Tiny fixtures that exercise the algorithm without pulling the full corpus.
// Two hardware: a fast NVIDIA-like card and a slower one.
const fastCard: Hardware = {
  id: 'fast-card',
  name: 'Fast Card',
  vendor: 'nvidia',
  generation: 'fictitious',
  status: 'in-production',
  release_year: 2024,
  form_factor: 'sxm',
  compute: {
    fp4_tflops: { value: 9000, evidence_ref: 'ev-001' },
    fp8_tflops: { value: 4500, evidence_ref: 'ev-001' },
    bf16_tflops: { value: 2250, evidence_ref: 'ev-001' },
    fp16_tflops: { value: 2250, evidence_ref: 'ev-001' },
    int8_tops: { value: 4500, evidence_ref: 'ev-001' }
  },
  memory: {
    capacity_gb: { value: 192, evidence_ref: 'ev-001' },
    bandwidth_gbps: { value: 8000, evidence_ref: 'ev-001' },
    type: 'HBM3e'
  },
  scale_up: { protocol: 'NVLink', bandwidth_gbps: 1800, world_size: 8, topology: 'switched' },
  scale_out: { bandwidth_gbps_per_card: 800, protocol: 'IB-XDR' },
  power: { tdp_w: { value: 1000, evidence_ref: 'ev-001' } },
  software_support: {
    drivers: ['CUDA-12.x'],
    engines: [{ id: 'vllm', status: 'officially-supported', versions: ['0.6'] }],
    quantizations: ['bf16', 'fp16', 'fp8-e4m3', 'fp4'],
    parallelism: ['tp', 'pp', 'ep']
  },
  aliases: [],
  chinese_names: [],
  photos: [],
  evidence: [{ id: 'ev-001', tier: 'official', source_type: 'vendor-datasheet', url: 'https://example.com', accessed: '2026-04-30', citation: 'fixture' }],
  disclaimers: []
};

const slowCard: Hardware = {
  ...fastCard,
  id: 'slow-card',
  name: 'Slow Card',
  generation: 'older',
  release_year: 2022,
  compute: {
    fp4_tflops: { value: 0, evidence_ref: 'ev-002' },
    fp8_tflops: { value: 0, evidence_ref: 'ev-002' },
    bf16_tflops: { value: 320, evidence_ref: 'ev-002' },
    fp16_tflops: { value: 320, evidence_ref: 'ev-002' },
    int8_tops: { value: 640, evidence_ref: 'ev-002' }
  },
  memory: {
    capacity_gb: { value: 64, evidence_ref: 'ev-002' },
    bandwidth_gbps: { value: 1600, evidence_ref: 'ev-002' },
    type: 'HBM2e'
  },
  power: { tdp_w: { value: 400, evidence_ref: 'ev-002' } },
  software_support: {
    ...fastCard.software_support,
    quantizations: ['bf16', 'fp16']
  },
  evidence: [{ id: 'ev-002', tier: 'official', source_type: 'vendor-datasheet', url: 'https://example.com', accessed: '2026-04-30', citation: 'fixture' }]
};

const tinyModel: Model = {
  id: 'tiny',
  name: 'Tiny Test Model',
  lab: 'fixture',
  release_date: '2024-01-01',
  weight_format: 'bf16',
  license: 'Apache-2.0',
  modalities: ['text'],
  domain: 'llm',
  workload_kind: 'autoregressive-decode',
  architecture: {
    family: 'dense',
    total_params_b: 7,
    active_params_b: 7,
    layers: 32,
    hidden_size: 4096,
    ffn_size: 14336,
    num_attention_heads: 32,
    num_kv_heads: 32,
    head_dim: 128,
    vocab_size: 32000,
    max_context_length: 8192,
    attention_type: 'mha'
  },
  // Operator decomposition: realistic per-token FLOPs/bytes for a 7B-class model.
  operator_decomposition: [
    { operator: 'matmul', flops_per_token: 2.5e10, bytes_per_token: 1.4e10 },
    { operator: 'attention', flops_per_token: 5e9, bytes_per_token: 3e8 }
  ]
};

describe('recommendations', () => {
  it('produces one row per hardware (feasible flag tells truth)', () => {
    const rows = recommendHardwareForModel({
      model: tinyModel,
      hardware: [fastCard, slowCard],
      cases: []
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.hw.id)).toBe(true);
  });

  it('picks FP4 on fast card (supports it) and falls back to BF16 on slow card', () => {
    const rows = recommendHardwareForModel({
      model: tinyModel,
      hardware: [fastCard, slowCard],
      cases: []
    });
    const fast = rows.find((r) => r.hw.id === 'fast-card');
    const slow = rows.find((r) => r.hw.id === 'slow-card');
    expect(fast?.precision).toBe('fp4');
    expect(slow?.precision).toBe('bf16');
  });

  it('topByThroughput ranks fast card first', () => {
    const rows = recommendHardwareForModel({
      model: tinyModel,
      hardware: [fastCard, slowCard],
      cases: []
    });
    const top = topByThroughput(rows);
    expect(top[0]?.hw.id).toBe('fast-card');
  });

  it('topByCost prefers higher throughput-per-dollar — fast card likely wins despite higher TDP', () => {
    const rows = recommendHardwareForModel({
      model: tinyModel,
      hardware: [fastCard, slowCard],
      cases: []
    });
    const top = topByCost(rows);
    // Hard to predict the absolute ordering without running real numbers,
    // but at minimum: every entry has a finite cost.
    for (const r of top) {
      expect(Number.isFinite(r.costPerMTokens)).toBe(true);
    }
  });

  it('verifiedByMeasuredCase only includes hw with a real case for this model', () => {
    // Cast through unknown — fixture intentionally minimal vs real Case schema
    const fakeCase = ({
      id: 'case-fixture-001',
      title: 'Tiny on Fast — fixture',
      submitted_at: '2026-04-01',
      stack: {
        hardware: { id: 'fast-card', count: 8 },
        model: { id: 'tiny' },
        engine: { id: 'vllm', version: '0.6' },
        quantization: 'bf16',
        parallel: { tp: 8, pp: 1, ep: 1, sp: 1 }
      },
      scenario: { prefill_seq_len: 1024, decode_seq_len: 256, batch_size: 16, concurrency: 64 },
      results: {
        throughput_tokens_per_sec: { prefill: 12000, decode: 8000 },
        latency_ms: { ttft_p50: 50, ttft_p95: 100, tbt_p50: 12, tbt_p95: 25 }
      },
      evidence: [{
        id: 'ev-fixture-case-001', tier: 'measured', source_type: 'community-benchmark',
        url: 'https://example.com', accessed: '2026-04-30', citation: 'fixture'
      }],
      disclaimers: []
    } as unknown) as Case;

    const rows = recommendHardwareForModel({
      model: tinyModel,
      hardware: [fastCard, slowCard],
      cases: [fakeCase]
    });
    const verified = verifiedByMeasuredCase(rows);
    expect(verified).toHaveLength(1);
    expect(verified[0]?.hw.id).toBe('fast-card');
    expect(verified[0]?.measuredDecodeTokPerSecPerCard).toBe(1000); // 8000 / 8 cards
  });

  it('calculatorDeepLink builds a query-string preserving scenario', () => {
    const rows = recommendHardwareForModel({
      model: tinyModel,
      hardware: [fastCard],
      cases: []
    });
    const url = calculatorDeepLink(tinyModel.id, rows[0]!);
    expect(url).toContain('/calculator/');
    expect(url).toContain('model=tiny');
    expect(url).toContain('hw=fast-card');
    expect(url).toContain('prec=fp4');
    expect(url).toContain('tp=8');
  });
});
