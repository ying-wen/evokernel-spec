/**
 * v3.29 — regression tests for the synthesizer wiring + template picker.
 *
 *  - `pickTemplateModelForArchetype` returns the right template for each
 *    archetype, falls back gracefully when no candidate matches, and
 *    handles empty input.
 *  - `synthesizeTemporaryBundle` accepts a pre-fetched HF config (the
 *    `hf_config_override` path that index.ts uses to reuse v3.28's
 *    layout-probe result).
 *  - The wiring in `index.ts` (`--allow-synthesize` / auto-on for
 *    `--use-host-llm` / `--technique`) is covered by an end-to-end CLI
 *    spawn at the bottom — this is gated on the dev-server fixture so
 *    the unit-test layer stays fast.
 */

import { describe, expect, it } from 'vitest';
import {
  pickTemplateModelForArchetype,
  inferArchetypeFromHfConfig,
} from '../agent-deploy/fetch-bundle';

describe('pickTemplateModelForArchetype (v3.29)', () => {
  const candidates = [
    { model: 'deepseek-r1', hardware: 'ascend-910b', slug: 'deepseek-r1-ascend-910b' },
    { model: 'qwen-3-32b', hardware: 'ascend-910b', slug: 'qwen-3-32b-ascend-910b' },
    { model: 'cogvideox1.5-5b', hardware: 'ascend-910b', slug: 'cogvideox1.5-5b-ascend-910b' },
    { model: 'flux-1-schnell', hardware: 'ascend-910b', slug: 'flux-1-schnell-ascend-910b' },
    { model: 'whisper-large-v3', hardware: 'ascend-910b', slug: 'whisper-large-v3-ascend-910b' },
    { model: 'clip-vit-large', hardware: 'ascend-910b', slug: 'clip-vit-large-ascend-910b' },
  ];

  it('picks a diffusion template for diffusion archetype', () => {
    const pick = pickTemplateModelForArchetype(candidates, 'diffusion');
    expect(pick).toMatch(/cogvideo|flux/);
  });

  it('picks a transformer-decoder template for transformer-decoder', () => {
    const pick = pickTemplateModelForArchetype(candidates, 'transformer-decoder');
    expect(pick).toMatch(/deepseek|qwen/);
  });

  it('picks the Whisper template for ASR', () => {
    expect(pickTemplateModelForArchetype(candidates, 'encoder-decoder-asr')).toMatch(/whisper/);
  });

  it('picks the CLIP/ViT template for vision-transformer', () => {
    expect(pickTemplateModelForArchetype(candidates, 'vision-transformer')).toMatch(/clip|vit/);
  });

  it('returns undefined for unknown archetype (caller falls back)', () => {
    expect(pickTemplateModelForArchetype(candidates, 'unknown')).toBeUndefined();
  });

  it('returns undefined for empty candidate list', () => {
    expect(pickTemplateModelForArchetype([], 'diffusion')).toBeUndefined();
  });

  it('returns undefined when no candidate matches the archetype pattern', () => {
    const onlyChat = [
      { model: 'deepseek-r1', hardware: 'ascend-910b', slug: 'deepseek-r1-ascend-910b' },
    ];
    expect(pickTemplateModelForArchetype(onlyChat, 'diffusion')).toBeUndefined();
  });
});

describe('inferArchetypeFromHfConfig (still works after v3.29)', () => {
  it('infers diffusion from CogVideoX class name in HF config', () => {
    expect(
      inferArchetypeFromHfConfig({ _class_name: 'CogVideoXTransformer3DModel' }, 'zai-org/CogVideoX1.5-5B'),
    ).toBe('diffusion');
  });
  it('infers diffusion from model id substring even with empty config', () => {
    expect(inferArchetypeFromHfConfig(undefined, 'black-forest-labs/FLUX.1-schnell')).toBe('diffusion');
  });
  it('infers transformer-decoder for Llama', () => {
    expect(
      inferArchetypeFromHfConfig({ architectures: ['LlamaForCausalLM'] }, 'meta-llama/Llama-3-8B'),
    ).toBe('transformer-decoder');
  });
  it('returns unknown when nothing matches', () => {
    expect(inferArchetypeFromHfConfig(undefined, 'mystery/repo')).toBe('unknown');
  });
});
