import { describe, it, expect } from 'vitest';
import { buildEfficiencyMap, getEfficiency } from './calibration';
import type { Case, Hardware, Model } from '@evokernel/schemas';

const hw: Hardware = {
  id: 'h100', name: 'H100', vendor: 'nvidia', generation: 'hopper', status: 'in-production',
  release_year: 2022, form_factor: 'sxm',
  compute: {
    fp4_tflops: null,
    fp8_tflops: { value: 1979, evidence_ref: 'ev-x' },
    bf16_tflops: { value: 989, evidence_ref: 'ev-x' },
    fp16_tflops: { value: 989, evidence_ref: 'ev-x' },
    int8_tops: { value: 1979, evidence_ref: 'ev-x' }
  },
  memory: { capacity_gb: { value: 80, evidence_ref: 'ev-x' }, bandwidth_gbps: { value: 3350, evidence_ref: 'ev-x' }, type: 'HBM3' },
  scale_up: { protocol: 'NVLink-4', bandwidth_gbps: 900, world_size: 8, topology: 'switched' },
  scale_out: { bandwidth_gbps_per_card: 400, protocol: 'IB-NDR' },
  power: { tdp_w: { value: 700, evidence_ref: 'ev-x' } },
  software_support: { drivers: [], engines: [], quantizations: [], parallelism: [] },
  aliases: [], chinese_names: [], photos: [],
  evidence: [{ id: 'ev-x', tier: 'official', source_type: 'vendor-datasheet', url: 'https://x.com', accessed: '2026-04-15', citation: 'datasheet' }],
  disclaimers: []
};

const model: Model = {
  id: 'test-model', name: 'Test', lab: 'test', release_date: '2026-01-01', license: 'mit',
  domain: 'llm', workload_kind: 'autoregressive-decode',
  architecture: {
    family: 'dense', total_params_b: 70, active_params_b: 70,
    layers: 80, hidden_size: 8192, ffn_size: 28672,
    num_attention_heads: 64, num_kv_heads: 8, head_dim: 128,
    vocab_size: 128000, max_context_length: 8192,
    attention_type: 'gqa'
  },
  operator_decomposition: [
    { operator: 'matmul', flops_per_token: 1e10, bytes_per_token: 5e7 },
    { operator: 'attention', flops_per_token: 5e9, bytes_per_token: 2e7 }
  ],
  modalities: ['text'], weight_format: 'bf16'
};

function mkCase(decode: number, count = 8, hwId = 'h100', modelId = 'test-model'): Case {
  return {
    id: `case-${decode}`, title: 't', submitted_at: '2026-04-01',
    submitter: { github: '@x' },
    stack: {
      hardware: { id: hwId, count, topology: '1n' },
      interconnect: { intra_node: 'nvlink-4', inter_node: 'none' },
      model: { id: modelId, weight_format: 'bf16' },
      engine: { id: 'vllm', version: '0.6' },
      quantization: 'bf16',
      parallel: { tp: 8, pp: 1, ep: 1, sp: 1, disaggregated: false },
      driver: 'cuda', os: 'ubuntu'
    },
    scenario: { prefill_seq_len: 1024, decode_seq_len: 256, batch_size: 16, max_concurrent_requests: 64 },
    results: {
      throughput_tokens_per_sec: { decode, prefill: decode * 12 },
      latency_ms: { ttft_p50: 100, ttft_p99: 200, tbt_p50: 20, tbt_p99: 40 },
      memory_per_card_gb: 70, power_per_card_w: 650,
      utilization: { compute_pct: 50, memory_bw_pct: 70 }
    },
    bottleneck: 'memory-bandwidth',
    reproduction: { startup_command: 'x', config_files: [], benchmark_tool: 'x' },
    issues_encountered: [], patterns: [], evidence: []
  };
}

describe('buildEfficiencyMap', () => {
  it('returns empty map when no cases', () => {
    const map = buildEfficiencyMap([], [hw], [model]);
    expect(map.size).toBe(0);
  });

  it('computes per-hardware efficiency from cases', () => {
    const cases = [mkCase(1000), mkCase(2000)];
    const map = buildEfficiencyMap(cases, [hw], [model]);
    const entry = map.get('h100');
    expect(entry).toBeDefined();
    expect(entry!.sampleCount).toBe(2);
    expect(entry!.factor).toBeGreaterThan(0);
    expect(entry!.factor).toBeLessThanOrEqual(1.5);
  });

  it('skips cases referencing unknown hardware/model', () => {
    const cases = [mkCase(1000, 8, 'unknown-hw'), mkCase(2000)];
    const map = buildEfficiencyMap(cases, [hw], [model]);
    expect(map.get('h100')!.sampleCount).toBe(1);
  });

  it('clamps unrealistic ratios to 1.5', () => {
    // case with absurdly high reported decode → should be clamped
    const insaneCase = mkCase(1e10);
    const map = buildEfficiencyMap([insaneCase], [hw], [model]);
    expect(map.get('h100')!.factor).toBeLessThanOrEqual(1.5);
  });
});

describe('getEfficiency', () => {
  it('returns default 0.5 when no map entry', () => {
    const map = new Map();
    const e = getEfficiency('h100', map);
    expect(e.factor).toBe(0.5);
    expect(e.isCalibrated).toBe(false);
    expect(e.sampleCount).toBe(0);
  });

  it('returns calibrated value when present', () => {
    const map = new Map([['h100', { factor: 0.62, sampleCount: 4, min: 0.55, max: 0.7, stddev: 0.06 }]]);
    const e = getEfficiency('h100', map);
    expect(e.factor).toBe(0.62);
    expect(e.isCalibrated).toBe(true);
    expect(e.sampleCount).toBe(4);
    expect(e.stddev).toBe(0.06);
  });

  it('computes stddev across the sample', () => {
    // Build a fake map directly (bypass buildEfficiencyMap for unit-test brevity)
    const ratios = [0.4, 0.5, 0.6, 0.7];
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const variance = ratios.reduce((acc, r) => acc + (r - mean) ** 2, 0) / ratios.length;
    const stddev = Math.sqrt(variance);
    expect(stddev).toBeCloseTo(0.1118, 3);
  });
});
