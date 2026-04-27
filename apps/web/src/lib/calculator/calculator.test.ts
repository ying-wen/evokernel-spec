import { describe, it, expect } from 'vitest';
import { computeRoofline, findSimilarCases, calculate } from './index';
import type { Case, Hardware, Model } from '@evokernel/schemas';
import type { CalcInput } from './types';

describe('computeRoofline', () => {
  it('marks compute-bound when intensity > ridge', () => {
    const r = computeRoofline({ flopsPerToken: 1e10, bytesPerToken: 1e7, peakComputeTflops: 1000, peakMemoryBwGbps: 3000 });
    expect(r.isComputeBound).toBe(true);
  });
  it('marks memory-bound when intensity < ridge', () => {
    const r = computeRoofline({ flopsPerToken: 1e8, bytesPerToken: 1e8, peakComputeTflops: 1000, peakMemoryBwGbps: 3000 });
    expect(r.isComputeBound).toBe(false);
  });
  it('returns zeros for invalid inputs', () => {
    const r = computeRoofline({ flopsPerToken: 1, bytesPerToken: 1, peakComputeTflops: 0, peakMemoryBwGbps: 100 });
    expect(r.decodeThroughputUpperBound).toBe(0);
  });
});

describe('findSimilarCases', () => {
  const mkCase = (over: Partial<Case> = {}): Case => ({
    id: over.id ?? 'case-x',
    title: 't',
    submitted_at: '2026-04-01',
    submitter: { github: '@x' },
    stack: {
      hardware: { id: 'h100-sxm5', count: 8, topology: '1n' },
      interconnect: { intra_node: 'nvlink-4', inter_node: 'none' },
      model: { id: 'llama-4-scout', weight_format: 'bf16' },
      engine: { id: 'vllm', version: '0.6' },
      quantization: 'bf16',
      parallel: { tp: 8, pp: 1, ep: 1, sp: 1, disaggregated: false },
      driver: 'cuda',
      os: 'ubuntu',
      ...(over.stack ?? {})
    },
    scenario: { prefill_seq_len: 1024, decode_seq_len: 256, batch_size: 16, max_concurrent_requests: 64, ...(over.scenario ?? {}) },
    results: { throughput_tokens_per_sec: { decode: 1000, prefill: 15000 }, latency_ms: { ttft_p50: 0, ttft_p99: 0, tbt_p50: 0, tbt_p99: 0 }, memory_per_card_gb: 0, power_per_card_w: 0, utilization: { compute_pct: 0, memory_bw_pct: 0 } },
    bottleneck: 'memory-bandwidth',
    reproduction: { startup_command: 'x', config_files: [], benchmark_tool: 'x' },
    issues_encountered: [],
    patterns: [],
    evidence: []
  });

  const baseInput: CalcInput = {
    modelId: 'llama-4-scout',
    hardware: { id: 'h100-sxm5', count: 8 },
    precision: 'bf16',
    engineId: 'vllm',
    parallel: { tp: 8, pp: 1, ep: 1, sp: 1 },
    scenario: { prefillSeqLen: 1024, decodeSeqLen: 256, batchSize: 16, concurrency: 64 },
    disaggregated: { enabled: false }
  };

  it('exact match scores ~1.0', () => {
    const out = findSimilarCases([mkCase({ id: 'a' })], baseInput);
    expect(out.length).toBeGreaterThan(0);
    const first = out[0];
    if (!first) throw new Error('expected at least one match');
    expect(first.caseId).toBe('a');
    expect(first.matchScore).toBeCloseTo(1, 1);
  });

  it('returns at most 3', () => {
    const cases = ['a', 'b', 'c', 'd', 'e'].map((id) => mkCase({ id }));
    const out = findSimilarCases(cases, baseInput, 3);
    expect(out.length).toBeLessThanOrEqual(3);
  });
});

describe('calculate orchestrator', () => {
  const hardware: Hardware = {
    id: 'h100-sxm5', name: 'H100 SXM', vendor: 'nvidia', generation: 'hopper', status: 'in-production',
    release_year: 2022, form_factor: 'sxm',
    compute: {
      fp4_tflops: null, fp8_tflops: { value: 1979, evidence_ref: 'ev-x' },
      bf16_tflops: { value: 989, evidence_ref: 'ev-x' }, fp16_tflops: { value: 989, evidence_ref: 'ev-x' },
      int8_tops: { value: 1979, evidence_ref: 'ev-x' }
    },
    memory: { capacity_gb: { value: 80, evidence_ref: 'ev-x' }, bandwidth_gbps: { value: 3350, evidence_ref: 'ev-x' }, type: 'HBM3' },
    scale_up: { protocol: 'NVLink-4', bandwidth_gbps: 900, world_size: 8, topology: 'switched' },
    scale_out: { bandwidth_gbps_per_card: 400, protocol: 'IB-NDR' },
    power: { tdp_w: { value: 700, evidence_ref: 'ev-x' } },
    software_support: { drivers: [], engines: [], quantizations: [], parallelism: [] },
    aliases: [], chinese_names: [], photos: [],
    evidence: [{ id: 'ev-x', tier: 'official', source_type: 'vendor-datasheet', url: 'https://nvidia.com', accessed: '2026-04-15', citation: 'datasheet' }],
    disclaimers: []
  };

  const model: Model = {
    id: 'llama-4-scout', name: 'Llama 4 Scout', lab: 'meta', release_date: '2025-04-05', license: 'community',
    architecture: {
      family: 'moe', total_params_b: 109, active_params_b: 17, layers: 48, hidden_size: 5120, ffn_size: 16384,
      num_attention_heads: 40, num_kv_heads: 8, head_dim: 128, vocab_size: 200000, max_context_length: 1048576,
      moe: { num_experts: 16, top_k: 1, expert_hidden_size: 8192, shared_experts: 0 },
      attention_type: 'gqa'
    },
    operator_decomposition: [
      { operator: 'matmul', flops_per_token: 1e9, bytes_per_token: 5e6 },
      { operator: 'attention', flops_per_token: 5e8, bytes_per_token: 2e6 }
    ],
    modalities: ['text'], weight_format: 'bf16'
  };

  it('produces a roofline output', () => {
    const out = calculate({
      calc: {
        modelId: 'llama-4-scout',
        hardware: { id: 'h100-sxm5', count: 8 },
        precision: 'bf16',
        engineId: 'vllm',
        parallel: { tp: 8, pp: 1, ep: 1, sp: 1 },
        scenario: { prefillSeqLen: 1024, decodeSeqLen: 256, batchSize: 16, concurrency: 64 },
        disaggregated: { enabled: false }
      },
      hardware, model, cases: []
    });
    expect(out.tier1Roofline.peakComputeTflops).toBe(989);
    expect(out.configCheck.feasible).toBe(true);
    expect(out.formulaTrace.length).toBeGreaterThan(0);
  });

  it('warns when configuration runs out of memory', () => {
    const tinyHw: Hardware = { ...hardware, memory: { ...hardware.memory, capacity_gb: { value: 8, evidence_ref: 'ev-x' } } };
    const out = calculate({
      calc: {
        modelId: 'llama-4-scout',
        hardware: { id: 'h100-sxm5', count: 1 },
        precision: 'bf16',
        engineId: 'vllm',
        parallel: { tp: 1, pp: 1, ep: 1, sp: 1 },
        scenario: { prefillSeqLen: 1024, decodeSeqLen: 256, batchSize: 16, concurrency: 64 },
        disaggregated: { enabled: false }
      },
      hardware: tinyHw, model, cases: []
    });
    expect(out.configCheck.feasible).toBe(false);
    expect(out.recommendations.some((r) => r.includes('显存不足'))).toBe(true);
  });
});
