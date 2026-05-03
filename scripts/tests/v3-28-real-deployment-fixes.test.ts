/**
 * v3.28 — regression tests for the five findings exposed by the v3.27
 * SageAttention/CogVideoX/910B real-deployment runs (Codex + Claude Code).
 * Each test maps to one finding number from the v3.28 spec:
 *
 *   F1 — Diffusers config layout (model_index.json + transformer/config.json)
 *   F3 — Diffusers model classification (CogVideoX is not dense-llm-small)
 *   F4 — Technique arch_family candidate-list matching (ascend → ascend-da-vinci-3)
 *   F6 — --technique forces port attempt when generic gaps are zero
 *   F8 — agent-learning outcome reflects actual execution_state
 *
 * F9 + F10 have their own files (v3-28-execute-substitution.test.ts +
 * implicit coverage in scripts/agent-deploy/remote/ascend/build.sh).
 */

import { describe, expect, it } from 'vitest';
import {
  classifyModel,
  detectModelKind,
  type HFConfig,
} from '../agent-deploy/index';
import {
  describeTechniquePortStatus,
  deriveArchCandidates,
} from '../agent-deploy/load-technique';
import type { Technique } from '@evokernel/schemas';

// ─────────────────────────────────────────────────────────────────────
// F3 — model-kind detection registry
// ─────────────────────────────────────────────────────────────────────

describe('detectModelKind (v3.28 / F3)', () => {
  it('classifies CogVideoX1.5-5B as diffusion-video by _class_name', () => {
    const cfg: HFConfig = {
      _class_name: 'CogVideoXTransformer3DModel',
      _diffusers_version: '0.32.0.dev0',
      attention_head_dim: 64,
      num_attention_heads: 48,
      num_layers: 42,
    };
    const result = detectModelKind(cfg);
    expect(result.kind).toBe('diffusion-video');
    expect(result.reason).toMatch(/_class_name/);
  });

  it('classifies HunyuanVideo as diffusion-video', () => {
    const cfg: HFConfig = { _class_name: 'HunyuanVideoTransformer3DModel' };
    expect(detectModelKind(cfg).kind).toBe('diffusion-video');
  });

  it('classifies Mochi as diffusion-video', () => {
    const cfg: HFConfig = { _class_name: 'MochiTransformer3DModel' };
    expect(detectModelKind(cfg).kind).toBe('diffusion-video');
  });

  it('classifies FluxTransformer as diffusion-image (not video)', () => {
    const cfg: HFConfig = { _class_name: 'FluxTransformer2DModel' };
    expect(detectModelKind(cfg).kind).toBe('diffusion-image');
  });

  it('classifies StableDiffusion3 as diffusion-image', () => {
    const cfg: HFConfig = { _class_name: 'SD3Transformer2DModel' };
    expect(detectModelKind(cfg).kind).toBe('diffusion-image');
  });

  it('classifies Whisper as asr-whisper by model_type', () => {
    const cfg: HFConfig = { model_type: 'whisper', architectures: ['WhisperForConditionalGeneration'] };
    expect(detectModelKind(cfg).kind).toBe('asr-whisper');
  });

  it('classifies Qwen-VL as vlm', () => {
    const cfg: HFConfig = { architectures: ['Qwen2VLForConditionalGeneration'] };
    expect(detectModelKind(cfg).kind).toBe('vlm');
  });

  it('classifies LLaVA as vlm', () => {
    const cfg: HFConfig = { architectures: ['LlavaForConditionalGeneration'] };
    expect(detectModelKind(cfg).kind).toBe('vlm');
  });

  it('classifies T5 as llm-encoder-decoder', () => {
    const cfg: HFConfig = { architectures: ['T5ForConditionalGeneration'] };
    expect(detectModelKind(cfg).kind).toBe('llm-encoder-decoder');
  });

  it('classifies BgeM3 as embedding', () => {
    const cfg: HFConfig = { architectures: ['XLMRobertaSentenceModel'] };
    expect(detectModelKind(cfg).kind).toBe('embedding');
  });

  it('classifies generic Llama-3 as llm-causal (the existing path)', () => {
    const cfg: HFConfig = { architectures: ['LlamaForCausalLM'] };
    expect(detectModelKind(cfg).kind).toBe('llm-causal');
  });

  it('returns unknown for empty config (graceful fallback, not crash)', () => {
    expect(detectModelKind({}).kind).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────
// F3 — classifyModel for diffusion DOES NOT use hidden_size
// ─────────────────────────────────────────────────────────────────────

describe('classifyModel for diffusion configs (v3.28 / F3)', () => {
  it('CogVideoX1.5-5B reports head_dim=64 (NOT 85 from text_embed_dim/num_heads)', () => {
    // Real CogVideoX1.5-5B transformer/config.json fields
    const cfg: HFConfig = {
      _class_name: 'CogVideoXTransformer3DModel',
      _diffusers_version: '0.32.0.dev0',
      attention_head_dim: 64,
      num_attention_heads: 48,
      num_layers: 42,
      text_embed_dim: 4096, // The pre-v3.28 trap: this is NOT d_model
      sample_frames: 81,
      sample_height: 96,
      sample_width: 170,
      in_channels: 16,
    };
    const m = classifyModel('zai-org/CogVideoX1.5-5B', cfg);
    expect(m.archetype).toBe('diffusion');
    expect(m.head_dim).toBe(64);
    expect(m.num_heads).toBe(48);
    expect(m.d_model).toBe(64 * 48); // 3072 — the real DiT d_model
    expect(m.num_layers).toBe(42);
    expect(m.model_kind).toBe('diffusion-video');
    expect(m.diffusion_meta).toBeDefined();
    expect(m.diffusion_meta?.class_name).toBe('CogVideoXTransformer3DModel');
    expect(m.diffusion_meta?.sample_frames).toBe(81);
  });

  it('does not regress LLM classification (Llama-style config still works)', () => {
    const cfg: HFConfig = {
      architectures: ['LlamaForCausalLM'],
      hidden_size: 4096,
      num_attention_heads: 32,
      num_key_value_heads: 8, // GQA
      num_hidden_layers: 32,
      intermediate_size: 14336,
      vocab_size: 128256,
    };
    const m = classifyModel('meta-llama/Llama-3-8B', cfg);
    expect(m.archetype).toBe('dense-llm-small');
    expect(m.attention_variant).toBe('gqa');
    expect(m.head_dim).toBe(128);
    expect(m.num_kv_heads).toBe(8);
    expect(m.model_kind).toBe('llm-causal');
    expect(m.diffusion_meta).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// F4 — technique arch_family candidate-list matching
// ─────────────────────────────────────────────────────────────────────

describe('deriveArchCandidates (v3.28 / F4)', () => {
  it('prefers microarchitecture over generation prefix', () => {
    expect(
      deriveArchCandidates({
        microarchitecture: 'ascend-da-vinci-3',
        generation: 'ascend-910-gen2',
        vendor: 'huawei',
      }),
    ).toEqual(['ascend-da-vinci-3', 'ascend-910-gen2', 'ascend', 'huawei']);
  });

  it('handles missing microarchitecture (legacy hardware YAMLs)', () => {
    expect(
      deriveArchCandidates({ generation: 'hopper-gen1', vendor: 'nvidia' }),
    ).toEqual(['hopper-gen1', 'hopper', 'nvidia']);
  });

  it('deduplicates when truncated generation equals full generation', () => {
    expect(deriveArchCandidates({ generation: 'cdna3', vendor: 'amd' })).toEqual([
      'cdna3',
      'amd',
    ]);
  });

  it('returns empty array for empty input (no NaN / undefined leaking)', () => {
    expect(deriveArchCandidates({})).toEqual([]);
  });
});

describe('describeTechniquePortStatus candidate-list matching (v3.28 / F4)', () => {
  const fakeSageAttention: Technique = {
    id: 'sageattention',
    name: 'SageAttention',
    technique_kind: 'attention-optimization',
    reference_url: 'https://github.com/thu-ml/sageattention',
    origin_year: 2024,
    authors_or_org: 'THU-ML',
    applicable_to: {
      model_archetypes: ['diffusion'],
      ops: ['attention'],
      hardware_arch_families: ['hopper', 'ada', 'ampere'],
    },
    port_targets: [
      { arch_family: 'hopper', status: 'reference-impl' },
      { arch_family: 'ada', status: 'production-ready' },
      { arch_family: 'ascend-da-vinci-3', status: 'planned' },
    ],
    port_complexity: 'medium',
  } as unknown as Technique;

  it('matches via microarchitecture (the SageAttention/Ascend case after v3.28 schema update)', () => {
    const ctx = describeTechniquePortStatus(fakeSageAttention, [
      'ascend-da-vinci-3',
      'ascend-910-gen2',
      'ascend',
      'huawei',
    ]);
    expect(ctx.matched_port_target?.arch_family).toBe('ascend-da-vinci-3');
    expect(ctx.matched_port_target?.status).toBe('planned');
    expect(ctx.target_arch_family).toBe('ascend-da-vinci-3');
    expect(ctx.summary).toMatch(/planned port \(greenfield\)/);
  });

  it('matches via truncated generation prefix (the H100/hopper accidental match)', () => {
    const ctx = describeTechniquePortStatus(fakeSageAttention, [
      'hopper-gen1',
      'hopper',
      'nvidia',
    ]);
    expect(ctx.matched_port_target?.arch_family).toBe('hopper');
    expect(ctx.matched_port_target?.status).toBe('reference-impl');
  });

  it('reports no-match without crashing when no candidate matches', () => {
    const ctx = describeTechniquePortStatus(fakeSageAttention, [
      'tenstorrent-wormhole',
      'tenstorrent',
    ]);
    expect(ctx.matched_port_target).toBeUndefined();
    expect(ctx.arch_family_candidates).toEqual([
      'tenstorrent-wormhole',
      'tenstorrent',
    ]);
    expect(ctx.summary).toMatch(/no port_target/);
  });

  it('backwards-compatible single-string call still works (existing callers)', () => {
    const ctx = describeTechniquePortStatus(fakeSageAttention, 'hopper');
    expect(ctx.matched_port_target?.arch_family).toBe('hopper');
  });
});

// ─────────────────────────────────────────────────────────────────────
// F1 — HF layout probing (network test, gated on env to avoid CI flakes)
// ─────────────────────────────────────────────────────────────────────

describe('fetchHFConfig layout probing (v3.28 / F1)', () => {
  // Network tests are off by default in CI to avoid flakes. Enable
  // locally with EVOKERNEL_NET_TEST=1 to verify against real HF.
  if (process.env.EVOKERNEL_NET_TEST !== '1') {
    it.skip('online: CogVideoX1.5-5B (Diffusers) resolves via model_index → transformer/config.json');
    return;
  }

  it('online: CogVideoX1.5-5B resolves via diffusers-component layout', async () => {
    const { fetchHFConfig } = await import('../agent-deploy/index');
    const cfg = await fetchHFConfig('zai-org/CogVideoX1.5-5B');
    expect(cfg._evokernel_layout).toBe('diffusers-component');
    expect(cfg._evokernel_diffusers_component).toBe('transformer');
    expect(cfg._class_name).toMatch(/CogVideoX/);
    expect(cfg.attention_head_dim).toBe(64);
  }, 30_000);
});
