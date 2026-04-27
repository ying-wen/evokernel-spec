import { describe, it, expect } from 'vitest';
import {
  TierSchema, EvidenceSchema, ValueWithEvidenceSchema,
  VendorSchema, HardwareSchema, ServerSchema, InterconnectSchema,
  OperatorSchema, EngineSchema, QuantizationSchema, ParallelStrategySchema,
  ModelSchema, CaseSchema, PatternSchema
} from './index';
import { z } from 'zod';

describe('Tier', () => {
  it('accepts the three valid tiers', () => {
    expect(TierSchema.parse('official')).toBe('official');
    expect(TierSchema.parse('measured')).toBe('measured');
    expect(TierSchema.parse('estimated')).toBe('estimated');
  });
  it('rejects unknown tier', () => {
    expect(() => TierSchema.parse('rumor')).toThrow();
  });
});

describe('Evidence', () => {
  const valid = {
    id: 'ev-h100-001',
    tier: 'official' as const,
    source_type: 'vendor-whitepaper' as const,
    url: 'https://nvidia.com/h100-spec.pdf',
    accessed: '2026-04-15',
    citation: 'NVIDIA H100 datasheet, p.4'
  };

  it('accepts a complete record', () => {
    expect(() => EvidenceSchema.parse(valid)).not.toThrow();
  });

  it('requires id with ev- prefix', () => {
    expect(() => EvidenceSchema.parse({ ...valid, id: 'h100-001' })).toThrow();
  });

  it('requires reachable-looking URL', () => {
    expect(() => EvidenceSchema.parse({ ...valid, url: 'not-a-url' })).toThrow();
  });

  it('requires ISO date for accessed', () => {
    expect(() => EvidenceSchema.parse({ ...valid, accessed: '15/04/2026' })).toThrow();
  });

  it('requires contributor_attestation when tier=measured', () => {
    expect(() =>
      EvidenceSchema.parse({ ...valid, tier: 'measured', source_type: 'community-benchmark' })
    ).toThrow();
  });

  it('allows tier=measured with attestation', () => {
    expect(() =>
      EvidenceSchema.parse({
        ...valid,
        tier: 'measured',
        source_type: 'community-benchmark',
        contributor_attestation: 'I personally ran this on company hardware, reproducible.'
      })
    ).not.toThrow();
  });
});

describe('ValueWithEvidence', () => {
  const schema = ValueWithEvidenceSchema(z.number());
  it('accepts {value, evidence_ref}', () => {
    expect(schema.parse({ value: 320, evidence_ref: 'ev-h100-001' })).toEqual({
      value: 320,
      evidence_ref: 'ev-h100-001'
    });
  });
  it('accepts null', () => {
    expect(schema.parse(null)).toBeNull();
  });
  it('rejects bare number', () => {
    expect(() => schema.parse(320)).toThrow();
  });
});

describe('Vendor', () => {
  const valid = {
    id: 'huawei',
    name: 'Huawei Ascend',
    chinese_names: ['华为昇腾'],
    country: 'CN',
    type: 'hardware' as const,
    website: 'https://www.huawei.com/en/products/ascend'
  };
  it('accepts complete vendor', () => {
    expect(() => VendorSchema.parse(valid)).not.toThrow();
  });
  it('id must be kebab-case', () => {
    expect(() => VendorSchema.parse({ ...valid, id: 'Huawei_Ascend' })).toThrow();
  });
  it('country must be ISO-3166', () => {
    expect(() => VendorSchema.parse({ ...valid, country: 'china' })).toThrow();
  });
});

describe('Hardware', () => {
  const valid = {
    id: 'h100-sxm5',
    name: 'NVIDIA H100 SXM5 80GB',
    vendor: 'nvidia',
    generation: 'hopper-gen1',
    status: 'in-production' as const,
    release_year: 2022,
    form_factor: 'sxm' as const,
    compute: {
      fp4_tflops: null,
      fp8_tflops: { value: 1979, evidence_ref: 'ev-h100-001' },
      bf16_tflops: { value: 989, evidence_ref: 'ev-h100-001' },
      fp16_tflops: { value: 989, evidence_ref: 'ev-h100-001' },
      int8_tops: { value: 1979, evidence_ref: 'ev-h100-001' }
    },
    memory: {
      capacity_gb: { value: 80, evidence_ref: 'ev-h100-002' },
      bandwidth_gbps: { value: 3350, evidence_ref: 'ev-h100-002' },
      type: 'HBM3' as const
    },
    scale_up: {
      protocol: 'NVLink-4.0',
      bandwidth_gbps: 900,
      world_size: 8,
      topology: 'switched',
      switch: 'nvswitch-gen3'
    },
    scale_out: {
      bandwidth_gbps_per_card: 400,
      protocol: 'InfiniBand-NDR',
      nic: 'cx7-400g'
    },
    power: { tdp_w: { value: 700, evidence_ref: 'ev-h100-003' } },
    software_support: {
      drivers: ['CUDA-12.x'],
      engines: [{ id: 'vllm', status: 'officially-supported' as const, versions: ['0.6'] }],
      quantizations: ['fp16', 'bf16', 'fp8-e4m3'],
      parallelism: ['tp', 'pp', 'ep']
    },
    evidence: [{
      id: 'ev-h100-001',
      tier: 'official' as const,
      source_type: 'vendor-datasheet' as const,
      url: 'https://nvidia.com/h100-datasheet.pdf',
      accessed: '2026-04-15',
      citation: 'H100 datasheet'
    }]
  };

  it('accepts minimal valid hardware', () => {
    expect(() => HardwareSchema.parse(valid)).not.toThrow();
  });
  it('rejects unknown form_factor', () => {
    expect(() => HardwareSchema.parse({ ...valid, form_factor: 'gpu' })).toThrow();
  });
  it('rejects unknown status', () => {
    expect(() => HardwareSchema.parse({ ...valid, status: 'launched' })).toThrow();
  });
});

describe('Server (super-pod)', () => {
  const valid = {
    id: 'huawei-cloudmatrix-384',
    name: 'Huawei CloudMatrix 384',
    vendor: 'huawei',
    type: 'super-pod' as const,
    card: 'ascend-910c',
    card_count: 384,
    scale_up_domain_size: 384,
    intra_node_interconnect: 'HCCS-fabric',
    inter_node_interconnect: 'optical-roce',
    cooling: 'liquid' as const,
    rack_power_kw: 600,
    release_year: 2025,
    evidence: [{
      id: 'ev-cm384-001',
      tier: 'official' as const,
      source_type: 'vendor-press-release' as const,
      url: 'https://www.huawei.com/en/news/cloudmatrix-384',
      accessed: '2026-04-15',
      citation: 'Huawei CloudMatrix 384 launch'
    }]
  };

  it('accepts a super-pod with 384 cards', () => {
    expect(() => ServerSchema.parse(valid)).not.toThrow();
  });
  it('rejects unknown type', () => {
    expect(() => ServerSchema.parse({ ...valid, type: 'rack' })).toThrow();
  });
});

describe('Interconnect', () => {
  it('accepts NVLink-4', () => {
    expect(() =>
      InterconnectSchema.parse({
        id: 'nvlink-4',
        name: 'NVLink 4.0',
        family: 'nvlink',
        typical_bandwidth_gbps: 900,
        vendor: 'nvidia',
        evidence: [{
          id: 'ev-nvl4-001',
          tier: 'official',
          source_type: 'vendor-whitepaper',
          url: 'https://nvidia.com/x',
          accessed: '2026-04-15',
          citation: 'NVLink whitepaper'
        }]
      })
    ).not.toThrow();
  });
});

describe('Operator', () => {
  it('accepts attention with FLOPs formula', () => {
    expect(() =>
      OperatorSchema.parse({
        id: 'attention',
        name: 'Multi-Head Attention',
        category: 'attention',
        flops_formula: '4 * batch * seq * hidden^2',
        bytes_formula: '2 * batch * seq * hidden * (1 + 2/heads)',
        description: 'Standard MHA'
      })
    ).not.toThrow();
  });
});

describe('Engine', () => {
  it('accepts vllm', () => {
    expect(() =>
      EngineSchema.parse({
        id: 'vllm',
        name: 'vLLM',
        maintainer: 'community',
        source_url: 'https://github.com/vllm-project/vllm',
        supported_hardware_vendors: ['nvidia', 'amd'],
        latest_version: '0.6.0'
      })
    ).not.toThrow();
  });
});

describe('Quantization', () => {
  it('accepts fp8-e4m3', () => {
    expect(() =>
      QuantizationSchema.parse({
        id: 'fp8-e4m3',
        name: 'FP8 E4M3',
        bits_per_weight: 8,
        bits_per_activation: 8,
        family: 'fp8',
        lossless: false
      })
    ).not.toThrow();
  });

  it('accepts fp4 with fractional bits', () => {
    expect(() =>
      QuantizationSchema.parse({
        id: 'fp4',
        name: 'FP4',
        bits_per_weight: 4,
        bits_per_activation: 8,
        family: 'fp4',
        lossless: false
      })
    ).not.toThrow();
  });
});

describe('ParallelStrategy', () => {
  it('accepts tp', () => {
    expect(() =>
      ParallelStrategySchema.parse({
        id: 'tp',
        name: 'Tensor Parallelism',
        family: 'intra-layer',
        description: 'Split tensor along feature dim'
      })
    ).not.toThrow();
  });
});

describe('Model', () => {
  const valid = {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    lab: 'deepseek',
    release_date: '2026-04-24',
    license: 'deepseek-license',
    architecture: {
      family: 'moe' as const,
      total_params_b: 1600,
      active_params_b: 49,
      layers: 64,
      hidden_size: 8192,
      ffn_size: 24576,
      num_attention_heads: 64,
      num_kv_heads: 8,
      head_dim: 128,
      vocab_size: 132000,
      max_context_length: 1048576,
      moe: { num_experts: 256, top_k: 8, expert_hidden_size: 2048 },
      attention_type: 'csa+hca'
    },
    operator_decomposition: [
      { operator: 'attention', flops_per_token: 1.2e9, bytes_per_token: 4.5e6 }
    ],
    modalities: ['text' as const],
    weight_format: 'bf16' as const
  };

  it('accepts complete record', () => {
    expect(() => ModelSchema.parse(valid)).not.toThrow();
  });

  it('rejects MoE without moe field', () => {
    const broken = { ...valid, architecture: { ...valid.architecture, moe: undefined as never } };
    expect(() => ModelSchema.parse(broken)).toThrow();
  });

  it('rejects active_params_b > total_params_b', () => {
    const broken = { ...valid, architecture: { ...valid.architecture, active_params_b: 2000 } };
    expect(() => ModelSchema.parse(broken)).toThrow();
  });
});

describe('Case', () => {
  const valid = {
    id: 'case-x',
    title: 'Test case',
    submitted_at: '2026-04-25',
    submitter: { github: '@test' },
    stack: {
      hardware: { id: 'h100-sxm5', count: 8, topology: '1n' },
      interconnect: { intra_node: 'nvlink-4', inter_node: 'none' },
      model: { id: 'llama-4-scout', weight_format: 'bf16' },
      engine: { id: 'vllm', version: '0.6' },
      quantization: 'bf16',
      parallel: { tp: 8, pp: 1, ep: 1, sp: 1, disaggregated: false },
      driver: 'cuda',
      os: 'ubuntu'
    },
    scenario: { prefill_seq_len: 1024, decode_seq_len: 256, batch_size: 16, max_concurrent_requests: 64 },
    results: {
      throughput_tokens_per_sec: { decode: 1000, prefill: 15000 },
      latency_ms: { ttft_p50: 100, ttft_p99: 200, tbt_p50: 20, tbt_p99: 40 },
      memory_per_card_gb: 70,
      power_per_card_w: 650,
      utilization: { compute_pct: 50, memory_bw_pct: 70 }
    },
    bottleneck: 'memory-bandwidth' as const,
    reproduction: { startup_command: 'vllm serve', benchmark_tool: 'benchmark_serving' },
    evidence: [{
      id: 'ev-case-001',
      tier: 'measured' as const,
      source_type: 'community-benchmark' as const,
      url: 'https://example.com/log',
      accessed: '2026-04-25',
      citation: 'Personal benchmark',
      contributor_attestation: 'I personally ran this on company hardware, reproducible.'
    }]
  };

  it('accepts a measured case', () => {
    expect(() => CaseSchema.parse(valid)).not.toThrow();
  });

  it('rejects bad bottleneck', () => {
    expect(() => CaseSchema.parse({ ...valid, bottleneck: 'cpu' })).toThrow();
  });

  it('rejects utilization > 100%', () => {
    const broken = JSON.parse(JSON.stringify(valid));
    broken.results.utilization.compute_pct = 150;
    expect(() => CaseSchema.parse(broken)).toThrow();
  });
});

describe('Pattern', () => {
  it('accepts a valid pattern', () => {
    expect(() =>
      PatternSchema.parse({
        id: 'memory-bound-decode-prefer-int8',
        name: 'Memory-bound decode: prefer INT8',
        category: 'quantization',
        description_md: '# When applicable\n\nDecode dominated by memory BW...'
      })
    ).not.toThrow();
  });
});
