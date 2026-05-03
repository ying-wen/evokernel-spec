#!/usr/bin/env tsx
/**
 * agent-deploy — End-to-end sample agent demonstrating "any HuggingFace model
 * → any hardware" deployment plan generation using the EvoKernel Spec corpus.
 *
 * Usage:
 *   pnpm tsx scripts/agent-deploy/index.ts \
 *     --model meta-llama/Llama-4-Scout-17B-16E \
 *     --hardware h100-sxm5 \
 *     --workload chat \
 *     [--target-cost 0.50] \
 *     [--target-ttft 300] \
 *     [--config /path/to/local/config.json]   # offline mode
 *
 * Outputs (to ./agent-deploy-output/):
 *   - deployment_plan.json      Full structured plan
 *   - launch.sh                 Engine startup script
 *   - kernel_gaps.md            If any ops missing native kernels
 *   - verification_plan.md      Eval + canary stages
 *
 * This script demonstrates that the corpus contains enough structured
 * data for agent end-to-end deployment planning. See
 * docs/superpowers/specs/2026-05-02-agent-e2e-sample.md.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  generateDockerfile,
  generateK8sDeployment,
  generatePrometheusRules,
  generateRunbook,
  generateRollbackPlan,
  generateProvenance,
  generateLicenseAudit,
  generateProductionChecklist,
  generateSBOM
} from './production-artifacts';
import { generateKernels, type GeneratedKernel } from './kernel-codegen';
// v3.17 — wire in the v3.x productized loop (Layer R/G/V/F).
// v3.18 — fuzzy resolveBundleId so users can pass HF ids without exact slug.
import {
  fetchBundle,
  BundleNotFoundError,
  resolveBundleId,
  synthesizeTemporaryBundle,
  type SynthesizedBundle,
} from './fetch-bundle';
// v3.26 — load + describe a technique entity for "port research lib X to arch Y" flows.
import {
  loadTechnique,
  describeTechniquePortStatus,
  deriveArchCandidates,
  TechniqueNotFoundError,
  type TechniquePortContext,
} from './load-technique';
// v3.26 — SSH remote-target executor.
// v3.27 — adds executeRemoteRun for actual SSH execution.
import {
  resolveTarget,
  buildExecutionPlan,
  formatPlanForDryRun,
  executeRemoteRun,
  TargetNotFoundError,
  TargetMismatchError,
} from './remote-target';
import { generateAndVerify, type GenerateAndVerifyResult } from './feedback';
import { pickLanguageForArch } from './llm-orchestrator';

// ============================================================
// Types
// ============================================================

export interface HFConfig {
  architectures?: string[];
  hidden_size?: number;
  num_attention_heads?: number;
  num_key_value_heads?: number;
  num_hidden_layers?: number;
  intermediate_size?: number;
  vocab_size?: number;
  num_local_experts?: number;
  num_experts_per_tok?: number;
  max_position_embeddings?: number;
  rope_theta?: number;
  torch_dtype?: string;
  model_type?: string;
  // DeepSeek-specific
  q_lora_rank?: number;
  kv_lora_rank?: number;
  // Diffusers-specific (v3.28 / F3)
  _class_name?: string;
  _diffusers_version?: string;
  // Diffusers transformer fields (CogVideoX, FluxTransformer, SD3, etc.)
  attention_head_dim?: number;
  num_layers?: number;
  num_attention_heads_diffusers?: number;
  text_embed_dim?: number;
  sample_frames?: number;
  // v3.28 — annotations stamped by fetchHFConfig describing where the
  // config came from. Not raw HF fields.
  _evokernel_layout?: 'transformers-root' | 'diffusers-component' | 'transformers-subfolder';
  _evokernel_diffusers_component?: string;
  _evokernel_diffusers_root?: unknown;
  // Misc
  [k: string]: unknown;
}

type ModelArchetype =
  | 'dense-llm-small' | 'dense-llm-medium' | 'dense-llm-large'
  | 'moe-llm-medium' | 'moe-llm-large'
  | 'reasoning-llm' | 'multi-modal' | 'long-context'
  | 'diffusion' | 'ssm-mamba' | 'speculative-target';

interface ParsedModel {
  hf_id: string;
  archetype: ModelArchetype;
  total_params_b: number;
  active_params_b: number;
  attention_variant: 'mha' | 'gqa' | 'mqa' | 'mla';
  num_layers: number;
  d_model: number;
  num_heads: number;
  num_kv_heads: number;
  head_dim: number;
  ffn_intermediate: number;
  num_experts: number;
  top_k_experts: number;
  vocab_size: number;
  max_context: number;
  raw: HFConfig;
  /**
   * v3.28 (F3) — populated when the model is a non-LLM type so the
   * planner / perf model knows it can't use tok/s arithmetic. The kind
   * registry (`detectModelKind`) picks the value.
   *
   * `unknown` is the safe default for anything we don't recognise yet —
   * downstream code treats it like 'llm-causal' but logs a warning so
   * future detector additions are guided by real data.
   */
  model_kind: ModelKind;
  /**
   * v3.28 (F3) — diffusion-specific metadata. Only set when
   * `model_kind` ∈ {'diffusion-video','diffusion-image','diffusion-3d'}.
   * Lets the perf model emit frames/s instead of tok/s and the plan
   * synthesizer pick a diffusion-aware engine (CogVideoXPipeline,
   * FluxPipeline, etc.) instead of an LLM serving engine.
   */
  diffusion_meta?: {
    class_name: string;
    diffusers_version?: string;
    sample_frames?: number;
    sample_height?: number;
    sample_width?: number;
    in_channels?: number;
    text_embed_dim?: number;
  };
}

/**
 * v3.28 (F3) — model-kind discriminator. Drives the classifier into
 * the right field-extraction branch. Adding a new model family means
 * adding a new entry to `MODEL_KIND_DETECTORS` + (if needed) extending
 * the union type — both in this file.
 */
type ModelKind =
  | 'llm-causal'
  | 'llm-encoder-decoder'
  | 'diffusion-video'
  | 'diffusion-image'
  | 'diffusion-3d'
  | 'asr-whisper'
  | 'vlm'
  | 'embedding'
  | 'unknown';

interface DeploymentPlan {
  input: {
    model: string;
    hardware: string;
    workload: string;
    target_cost?: number;
    target_ttft_ms?: number;
  };
  parsed_model: ParsedModel;
  hardware: any;
  feasibility: {
    fits: boolean;
    memory_budget_gb: number;
    weights_gb: { fp16: number; fp8: number; fp4: number; int4: number };
    kv_cache_gb_at_8k: number;
    notes: string[];
  };
  recommended: {
    engine: string;
    quantization: string;
    parallelism: { tp: number; pp: number; ep: number };
    card_count: number;
    expected_decode_tok_s_per_card: number;
    estimated_dollars_per_m_tokens: number;
  };
  kernel_gaps: Array<{ op: string; missing_on: string; suggestion: string }>;
  cross_links: {
    similar_cases: string[];
    relevant_playbooks: string[];
    coverage_matrix_url: string;
    isa_primitive_for_target_arch: string[];
  };
  generated_at: string;
}

// ============================================================
// CLI parsing
// ============================================================

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

// ============================================================
// Stage 1: Fetch + classify HuggingFace model
// ============================================================

/**
 * v3.17 — derive a bundle slug from a HuggingFace-style id or a local path.
 * Bundle slugs use kebab-case (matches data/models/<id>.yaml convention).
 * Examples:
 *   "meta-llama/Llama-3.3-70B-Instruct" → "llama-3.3-70b"
 *   "deepseek-ai/DeepSeek-V4-Pro"       → "deepseek-v4-pro"
 *   "qwen3.5-397b"                       → "qwen3.5-397b" (already a slug)
 *   "/local/path/to/model"               → uses last path segment
 */
function deriveBundleSlug(model_arg: string): string {
  // Strip path prefix (HF org or local dir).
  const stem = model_arg.includes('/')
    ? model_arg.split('/').pop()!
    : model_arg;
  // Lowercase, strip "-Instruct" / "-Chat" / "-Base" suffixes the bundle slug omits.
  const cleaned = stem
    .toLowerCase()
    .replace(/-instruct$/i, '')
    .replace(/-chat$/i, '')
    .replace(/-base$/i, '');
  return cleaned;
}

/**
 * v3.27 — map a vendor family (from remote-target-schema.ts:vendorFamilyForHardware)
 * to the env var name that V3 perf gate watches for pre-collected profiler
 * output. Used by the --execute path to surface "set this env var to feed
 * the just-pulled CSV into the next agent:deploy --profile run".
 */
function profilerEnvVarFor(vendor: string): string | null {
  switch (vendor) {
    case 'nvidia':
      return 'EVOKERNEL_NCU_INPUT_CSV';
    case 'amd':
      return 'EVOKERNEL_ROCPROF_INPUT_CSV';
    case 'ascend':
      return 'EVOKERNEL_MSPROF_INPUT_CSV';
    case 'cambricon':
      return 'EVOKERNEL_CNPERF_INPUT_CSV';
    default:
      return null;
  }
}

/**
 * v3.28 (F1) — HuggingFace repo layouts vary:
 *
 *   • Standard transformers (LLMs, encoders, ViT): `config.json` at root.
 *   • Diffusers (CogVideoX, FLUX, SD3, Mochi, etc.): no root `config.json`;
 *     `model_index.json` at root + per-component subfolder configs
 *     (`transformer/config.json`, `unet/config.json`, `vae/config.json`,
 *     `text_encoder/config.json`).
 *   • Sentence-Transformers / TIMM / GGUF / MLX: their own conventions
 *     not yet covered here, but the function logs which layouts were
 *     attempted so users know what to fall back to.
 *
 * Strategy: probe the repo in priority order, return the first hit, and
 * stamp the result with `_evokernel_layout_source` so the classifier can
 * route into the right archetype branch (F3).
 */
const HF_LAYOUT_PROBES: ReadonlyArray<{
  /** Path within the repo to GET (with optional component dispatch). */
  path: string;
  /** Layout signal stamped on the returned config. */
  layout: 'transformers-root' | 'diffusers-component' | 'transformers-subfolder';
  /** Diffusers component to follow when this is `model_index.json`. */
  follow_components?: ReadonlyArray<string>;
}> = [
  { path: 'config.json', layout: 'transformers-root' },
  // Diffusers: read model_index then follow `transformer` (DiTs / video),
  // `unet` (SD-style image), or other component classes for first hit.
  { path: 'model_index.json', layout: 'diffusers-component',
    follow_components: ['transformer', 'unet', 'prior', 'decoder', 'denoiser'] },
  // Last-ditch: some repos place an LLM-style config in a subfolder
  { path: 'model/config.json', layout: 'transformers-subfolder' },
  { path: 'transformer/config.json', layout: 'transformers-subfolder' },
];

async function fetchUrlAsJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function fetchHFConfig(hfId: string, localPath?: string): Promise<HFConfig> {
  if (localPath && existsSync(localPath)) {
    console.error(`  Reading config from ${localPath}`);
    const cfg = JSON.parse(await readFile(localPath, 'utf-8'));
    // Treat local files as opaque — caller already knows what they passed.
    return cfg;
  }

  const tried: string[] = [];
  const baseUrl = `https://huggingface.co/${hfId}/raw/main`;

  for (const probe of HF_LAYOUT_PROBES) {
    const url = `${baseUrl}/${probe.path}`;
    tried.push(probe.path);
    const json = await fetchUrlAsJson(url);
    if (!json) continue;
    console.error(`  Fetched ${url} (layout: ${probe.layout})`);

    if (probe.layout === 'diffusers-component' && probe.follow_components) {
      // model_index.json maps component name → [class, version_or_path]. Pick
      // the first present component from our priority list and follow to
      // its config.json. Stamp the resulting config with the diffusers
      // class so F3 can route correctly.
      const idx = json as Record<string, unknown>;
      for (const comp of probe.follow_components) {
        if (!(comp in idx)) continue;
        const compUrl = `${baseUrl}/${comp}/config.json`;
        tried.push(`${comp}/config.json`);
        const compCfg = await fetchUrlAsJson(compUrl);
        if (!compCfg) continue;
        console.error(`  Fetched ${compUrl} (diffusers ${comp})`);
        return {
          ...(compCfg as Record<string, unknown>),
          // Annotations the classifier reads (F3); not present in the raw
          // file but useful for routing without re-fetching.
          _evokernel_layout: 'diffusers-component',
          _evokernel_diffusers_component: comp,
          _evokernel_diffusers_root: idx,
        } as HFConfig;
      }
      // model_index found but no follow-component existed; keep probing
      continue;
    }

    return {
      ...(json as Record<string, unknown>),
      _evokernel_layout: probe.layout,
    } as HFConfig;
  }

  throw new Error(
    `Failed to fetch HF config for "${hfId}". Tried layouts: ${tried.join(', ')}.\n` +
    `  • For Diffusers repos: ensure model_index.json + transformer/unet/prior/config.json exist.\n` +
    `  • For private/gated repos: pass --config /path/to/local-config.json.\n` +
    `  • For non-HF or custom repos: download config.json locally and pass --config.`
  );
}

/**
 * v2.16 — load model config from local PyTorch checkpoint or weights dir
 * (non-HF inputs). Looks for config.json / pytorch_config / model.safetensors.json
 * metadata to extract architecture.
 */
async function loadLocalModelConfig(localDir: string): Promise<{ id: string; cfg: HFConfig }> {
  const configCandidates = ['config.json', 'pytorch_config.json', 'model_config.json'];
  for (const name of configCandidates) {
    const p = path.join(localDir, name);
    if (existsSync(p)) {
      console.error(`  Reading local config from ${p}`);
      const cfg = JSON.parse(await readFile(p, 'utf-8'));
      // Synthesize an "id" from the directory name
      const id = `local:${path.basename(path.resolve(localDir))}`;
      return { id, cfg };
    }
  }
  // Fallback — try to read a safetensors index for metadata
  const safetensorsIdx = path.join(localDir, 'model.safetensors.index.json');
  if (existsSync(safetensorsIdx)) {
    console.error(`  Reading safetensors index ${safetensorsIdx}`);
    const idx = JSON.parse(await readFile(safetensorsIdx, 'utf-8'));
    const meta = idx.metadata ?? {};
    const cfg: HFConfig = {
      architectures: ['UnknownLocalModel'],
      hidden_size: meta.hidden_size ?? 4096,
      num_attention_heads: meta.num_attention_heads ?? 32,
      num_key_value_heads: meta.num_key_value_heads ?? meta.num_attention_heads ?? 32,
      num_hidden_layers: meta.num_hidden_layers ?? 32,
      intermediate_size: meta.intermediate_size ?? 11008,
      vocab_size: meta.vocab_size ?? 32000,
      max_position_embeddings: meta.max_position_embeddings ?? 8192
    };
    return { id: `local:${path.basename(path.resolve(localDir))}`, cfg };
  }
  throw new Error(
    `Local source path "${localDir}" does not contain config.json or model.safetensors.index.json. ` +
    `Provide either: (1) a HuggingFace-format directory with config.json, OR (2) the original PyTorch ` +
    `model directory with metadata. To analyze raw .pt / .pth weights, run: python -m evokernel.extract_arch ` +
    `<weights.pt> > config.json then pass --config /path/to/config.json.`
  );
}

/**
 * v3.28 (F3) — registry of detection signals → model kinds. Order matters:
 * earlier entries win on ambiguous configs. Each entry returns true when
 * the config matches; the registry's first-match-wins design keeps the
 * extension cost low (one `match` function per new family).
 *
 * Why a registry instead of nested if/else:
 *   • F3 root cause was a single hardcoded LLM branch with no extension
 *     point. Adding Diffusers / Whisper / VLM each required reading +
 *     modifying classifyModel(). With a registry, a new model family is
 *     one block of localised code.
 *   • The order encodes priority: stronger signals (`_class_name`) checked
 *     before weaker ones (`architectures` regex) to avoid false positives.
 */
const MODEL_KIND_DETECTORS: ReadonlyArray<{
  match: (cfg: HFConfig) => boolean;
  kind: ModelKind;
  reason: string;
}> = [
  // Diffusers — strongest signal first
  {
    match: (c) => /Transformer3D|CogVideoX|HunyuanVideo|Mochi|Wan|StepVideo|LTXVideo/i.test(String(c._class_name ?? '')),
    kind: 'diffusion-video',
    reason: '_class_name matches video diffusion pattern',
  },
  {
    match: (c) => /FluxTransformer|StableDiffusion[1-9]?|SD3|PixArt|Hidream|Lumina|AuraFlow|Sana/i.test(String(c._class_name ?? '')),
    kind: 'diffusion-image',
    reason: '_class_name matches image diffusion pattern',
  },
  {
    match: (c) => Boolean(c._diffusers_version) && !c.architectures,
    kind: 'diffusion-image',
    reason: '_diffusers_version present without LLM architectures (fallback diffuser)',
  },
  // Whisper / ASR
  {
    match: (c) => c.model_type === 'whisper',
    kind: 'asr-whisper',
    reason: 'model_type === "whisper"',
  },
  // VLMs
  {
    match: (c) => Array.isArray(c.architectures) && c.architectures.some((a) => /Vision|VLM|MultiModal|Llava|Qwen.*VL/i.test(a)),
    kind: 'vlm',
    reason: 'architectures includes vision/multimodal class',
  },
  // Encoder-decoder LLMs
  {
    match: (c) => Array.isArray(c.architectures) && c.architectures.some((a) => /Seq2SeqLM|EncoderDecoder|T5|Bart/i.test(a)),
    kind: 'llm-encoder-decoder',
    reason: 'architectures includes seq2seq class',
  },
  // Embedding models
  {
    match: (c) => Array.isArray(c.architectures) && c.architectures.some((a) => /SentenceEmbedding|XLMRoberta.*Sentence|BgeM3/i.test(a)),
    kind: 'embedding',
    reason: 'architectures includes embedding class',
  },
  // Default LLM (causal) — last resort match for any architectures field
  {
    match: (c) => Array.isArray(c.architectures) && c.architectures.length > 0,
    kind: 'llm-causal',
    reason: 'architectures non-empty (default LLM-causal)',
  },
];

export function detectModelKind(cfg: HFConfig): { kind: ModelKind; reason: string } {
  for (const d of MODEL_KIND_DETECTORS) {
    if (d.match(cfg)) return { kind: d.kind, reason: d.reason };
  }
  return { kind: 'unknown', reason: 'no detector matched (config has no _class_name, model_type, or architectures field)' };
}

/**
 * v3.28 (F3) — Diffusers config field extraction. Diffusers configs use
 * `attention_head_dim × num_attention_heads` for the transformer's
 * d_model, NOT `hidden_size`. The pre-v3.28 classifier was reading
 * `hidden_size` (often `text_embed_dim`, which is the *text encoder*'s
 * dim) and dividing by `num_attention_heads`, producing fake head_dims
 * like 85 for CogVideoX (real: 64).
 */
function classifyDiffusersModel(hfId: string, cfg: HFConfig, kind: ModelKind): ParsedModel {
  const head_dim = (cfg.attention_head_dim as number | undefined) ?? 64;
  const num_heads = (cfg.num_attention_heads as number | undefined) ?? 16;
  const d_model = head_dim * num_heads;
  const num_layers = (cfg.num_layers as number | undefined) ?? 28;
  // Diffusion DiTs typically have ffn ~ 4×d_model
  const ffn_intermediate = d_model * 4;
  // Param count: roughly 12 × d_model² × num_layers + text-encoder + VAE
  // (we approximate; the exact figure isn't load-bearing for feasibility,
  // and the planner emits a `diffusion_meta` so the perf model can do better)
  const params_per_layer = 12 * d_model * d_model;
  const total_params = params_per_layer * num_layers;
  const total_b = total_params / 1e9;

  return {
    hf_id: hfId,
    archetype: 'diffusion',
    total_params_b: total_b,
    active_params_b: total_b,
    attention_variant: 'mha',
    num_layers,
    d_model,
    num_heads,
    num_kv_heads: num_heads,
    head_dim,
    ffn_intermediate,
    num_experts: 1,
    top_k_experts: 1,
    vocab_size: 0, // Diffusers don't have a token vocab
    max_context: (cfg.max_text_seq_length as number | undefined) ?? 0,
    raw: cfg,
    model_kind: kind,
    diffusion_meta: {
      class_name: String(cfg._class_name ?? 'UnknownDiffuser'),
      diffusers_version: cfg._diffusers_version,
      sample_frames: cfg.sample_frames as number | undefined,
      sample_height: cfg.sample_height as number | undefined,
      sample_width: cfg.sample_width as number | undefined,
      in_channels: cfg.in_channels as number | undefined,
      text_embed_dim: cfg.text_embed_dim as number | undefined,
    },
  };
}

export function classifyModel(hfId: string, cfg: HFConfig): ParsedModel {
  // v3.28 (F3) — route on detected kind. Diffusion / non-LLM paths get
  // their own field extractors so we don't compute fake `head_dim` from
  // an LLM-shaped config layout.
  const detection = detectModelKind(cfg);
  if (detection.kind === 'diffusion-video' || detection.kind === 'diffusion-image' || detection.kind === 'diffusion-3d') {
    return classifyDiffusersModel(hfId, cfg, detection.kind);
  }
  // Existing LLM path below.
  const d_model = cfg.hidden_size ?? 4096;
  const num_heads = cfg.num_attention_heads ?? 32;
  const num_kv_heads = cfg.num_key_value_heads ?? num_heads;
  const head_dim = Math.floor(d_model / num_heads);
  const num_layers = cfg.num_hidden_layers ?? 32;
  const ffn_intermediate = cfg.intermediate_size ?? d_model * 4;
  const vocab = cfg.vocab_size ?? 32000;
  const num_experts = cfg.num_local_experts ?? 1;
  const top_k = cfg.num_experts_per_tok ?? 1;
  const max_ctx = cfg.max_position_embeddings ?? 8192;

  // Attention variant detection
  let attention_variant: ParsedModel['attention_variant'] = 'mha';
  if (cfg.kv_lora_rank != null) attention_variant = 'mla';
  else if (num_kv_heads === 1) attention_variant = 'mqa';
  else if (num_kv_heads < num_heads) attention_variant = 'gqa';

  // Total + active params (rough)
  const params_per_layer_dense_block =
    4 * d_model * d_model +                 // QKV + O projection (mha)
    3 * d_model * ffn_intermediate;         // SwiGLU gate/up/down

  const params_per_layer_moe =
    4 * d_model * d_model +                 // attention same
    num_experts * 3 * d_model * ffn_intermediate; // experts × FFN

  const params_per_layer = num_experts > 1 ? params_per_layer_moe : params_per_layer_dense_block;
  const total_params = params_per_layer * num_layers + d_model * vocab; // + lm_head
  const active_params_per_layer = num_experts > 1
    ? 4 * d_model * d_model + top_k * 3 * d_model * ffn_intermediate
    : params_per_layer_dense_block;
  const active_params = active_params_per_layer * num_layers + d_model * vocab;

  // Archetype classification
  let archetype: ModelArchetype;
  const total_b = total_params / 1e9;
  if (num_experts > 1) {
    archetype = total_b > 500 ? 'moe-llm-large' : 'moe-llm-medium';
  } else if (max_ctx > 100_000) {
    archetype = 'long-context';
  } else if (total_b < 10) {
    archetype = 'dense-llm-small';
  } else if (total_b < 100) {
    archetype = 'dense-llm-medium';
  } else {
    archetype = 'dense-llm-large';
  }

  return {
    hf_id: hfId,
    archetype,
    total_params_b: total_b,
    active_params_b: active_params / 1e9,
    attention_variant,
    num_layers,
    d_model,
    num_heads,
    num_kv_heads,
    head_dim,
    ffn_intermediate,
    num_experts,
    top_k_experts: top_k,
    vocab_size: vocab,
    max_context: max_ctx,
    raw: cfg,
    // v3.28 (F3) — record the detected model kind so downstream consumers
    // (perf model, plan synthesizer, agent-learning emitter) know they're
    // dealing with a real LLM and not a misclassified diffuser.
    model_kind: detection.kind === 'unknown' ? 'llm-causal' : detection.kind,
  };
}

// ============================================================
// Stage 2: Query corpus JSON APIs
// ============================================================

const DEFAULT_API_BASE = process.env.EVOKERNEL_API_BASE
  || 'https://yingwen.io/evokernel-spec/api';

async function queryAPI<T>(endpoint: string, base = DEFAULT_API_BASE): Promise<T> {
  const url = `${base}/${endpoint}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${url} returned ${r.status}`);
  return await r.json();
}

// ============================================================
// Stage 3: Feasibility check
// ============================================================

interface Hardware {
  id: string;
  name: string;
  memory: { capacity_gb: { value: number } };
  compute: {
    fp16_tflops?: { value: number };
    fp8_tflops?: { value: number };
    fp4_tflops?: { value: number };
  };
}

function computeFeasibility(
  m: ParsedModel,
  hw: Hardware,
  card_count: number
): DeploymentPlan['feasibility'] {
  const hbm_per_card = hw.memory.capacity_gb.value;
  const total_hbm = hbm_per_card * card_count;
  const memory_budget_gb = total_hbm * 0.9; // 10% headroom

  // Weight memory by quant (totals across cluster)
  const weights_fp16 = m.total_params_b * 2;
  const weights_fp8 = m.total_params_b * 1;
  const weights_fp4 = m.total_params_b * 0.5;
  const weights_int4 = m.total_params_b * 0.5;

  // KV cache @ 8K context, batch=1
  const kv_per_token_fp16_bytes =
    2 *                                            // K + V
    m.num_layers *
    m.num_kv_heads *
    m.head_dim *
    2;                                              // fp16 = 2 bytes
  const kv_cache_gb_at_8k = (kv_per_token_fp16_bytes * 8192) / 1e9;

  // For MLA, KV cache is ~6× smaller (compressed latent ~512 dims vs full HxD_h)
  const kv_cache_effective = m.attention_variant === 'mla'
    ? kv_cache_gb_at_8k / 6
    : kv_cache_gb_at_8k;

  const notes: string[] = [];
  let fits = false;

  // Check progression of quant options
  for (const [q, w] of [
    ['fp16', weights_fp16],
    ['fp8', weights_fp8],
    ['fp4', weights_fp4],
    ['int4', weights_int4]
  ] as const) {
    const total_required = w + kv_cache_effective;
    const required_per_card = total_required / card_count;
    if (total_required < memory_budget_gb && required_per_card < hbm_per_card * 0.9) {
      notes.push(`✓ ${q.toUpperCase()} fits at TP=${card_count}: ~${total_required.toFixed(1)} GB across ${card_count} cards`);
      fits = true;
      break;
    } else {
      notes.push(`✗ ${q.toUpperCase()} at TP=${card_count}: ~${total_required.toFixed(1)} GB > ${memory_budget_gb.toFixed(1)} GB budget — try smaller quant or more cards`);
    }
  }

  if (m.attention_variant === 'mla') {
    notes.push(`Note: MLA compressed KV cache → ~6× smaller than equivalent MHA`);
  }
  if (m.num_experts > 1) {
    notes.push(`Note: MoE active path uses ${(m.active_params_b).toFixed(1)} of ${(m.total_params_b).toFixed(1)} B params per token`);
  }

  return {
    fits,
    memory_budget_gb,
    weights_gb: { fp16: weights_fp16, fp8: weights_fp8, fp4: weights_fp4, int4: weights_int4 },
    kv_cache_gb_at_8k: kv_cache_effective,
    notes
  };
}

// ============================================================
// Stage 4: Plan synthesis
// ============================================================

function synthesizePlan(
  m: ParsedModel,
  hw: Hardware,
  feas: DeploymentPlan['feasibility'],
  card_count: number,
  workload: string,
  solveResults: any,
  engines: any
): DeploymentPlan['recommended'] {
  // Pick quant: smallest that still fits on available HBM × card_count
  let quant = 'fp16';
  if (feas.weights_gb.fp16 > feas.memory_budget_gb) quant = 'fp8-e4m3';
  if (feas.weights_gb.fp8 > feas.memory_budget_gb) quant = 'fp4-nvfp4';

  // Pick engine — heuristic. National-stack precedence on domestic hardware:
  let engine = 'vllm'; // sensible default
  if (m.archetype === 'moe-llm-large' || m.archetype === 'moe-llm-medium') {
    // SGLang has best DeepSeek / MoE path
    engine = 'sglang';
  }
  // National-stack mandate: use vendor-native engine on Chinese accelerators
  if (hw.id.startsWith('ascend-')) engine = 'mindie';        // Huawei → MindIE
  else if (hw.id.startsWith('mlu')) engine = 'lmdeploy';     // Cambricon → lmdeploy MLU fork
  else if (hw.id.startsWith('dcu-')) engine = 'vllm';        // Hygon DCU → vllm-rocm fork (CDNA-derived)
  else if (hw.id.startsWith('mtt-')) engine = 'vllm';        // Moore Threads → vllm-musa fork
  else if (hw.id.startsWith('br1')) engine = 'vllm';         // Biren BR100/104 → vllm BR fork (CUDA-similar)

  // Parallelism
  const tp = card_count;
  const ep = m.num_experts > 1 && card_count >= 4 ? Math.min(m.num_experts, card_count) : 1;
  const pp = 1; // simple plan; PP only at very large scales

  // Find similar measured config from /api/solve.json
  const similar = solveResults.configurations.filter((c: any) =>
    c.tier === 'measured' && c.hardware.id === hw.id
  );
  const similar_cost = similar.length
    ? similar.reduce((a: number, c: any) => a + (c.metrics.dollars_per_m_tokens_estimate ?? 0), 0) / similar.length
    : 1.0;
  const similar_throughput = similar.length
    ? similar.reduce((a: number, c: any) => a + (c.metrics.decode_throughput_tok_s_per_card ?? 0), 0) / similar.length
    : 1000;

  return {
    engine,
    quantization: quant,
    parallelism: { tp, pp, ep },
    card_count,
    expected_decode_tok_s_per_card: similar_throughput,
    estimated_dollars_per_m_tokens: similar_cost
  };
}

// ============================================================
// Stage 5: Codegen — launch script
// ============================================================

function generateLaunchScript(plan: DeploymentPlan): string {
  const r = plan.recommended;
  const m = plan.parsed_model;

  if (r.engine === 'vllm') {
    return `#!/bin/bash
# Launch script generated by agent-deploy
# Model: ${m.hf_id} (${m.archetype}, ${m.total_params_b.toFixed(1)}B params)
# Hardware: ${plan.input.hardware} × ${r.card_count}
# Engine: vLLM with ${r.quantization}, TP=${r.parallelism.tp}

set -e

vllm serve ${m.hf_id} \\
  --tensor-parallel-size ${r.parallelism.tp} \\
  --pipeline-parallel-size ${r.parallelism.pp} \\
  ${r.parallelism.ep > 1 ? `--enable-expert-parallel \\\n  --num-experts-per-rank ${Math.ceil(m.num_experts / r.parallelism.ep)} \\` : ''}
  --quantization ${r.quantization === 'fp16' ? 'auto' : r.quantization} \\
  --gpu-memory-utilization 0.9 \\
  --max-model-len ${m.max_context} \\
  --max-num-seqs 256 \\
  --enable-chunked-prefill \\
  --enable-prefix-caching \\
  --port 8000
`;
  }

  if (r.engine === 'sglang') {
    return `#!/bin/bash
# Launch script generated by agent-deploy
# Model: ${m.hf_id} (${m.archetype}, ${m.total_params_b.toFixed(1)}B params)
# Hardware: ${plan.input.hardware} × ${r.card_count}
# Engine: SGLang with ${r.quantization}, TP=${r.parallelism.tp}

set -e

python -m sglang.launch_server \\
  --model-path ${m.hf_id} \\
  --tp-size ${r.parallelism.tp} \\
  ${r.parallelism.ep > 1 ? `--ep-size ${r.parallelism.ep} \\` : ''}
  --quantization ${r.quantization === 'fp16' ? 'fp16' : r.quantization} \\
  --mem-fraction-static 0.9 \\
  --context-length ${m.max_context} \\
  --max-running-requests 256 \\
  --enable-chunked-prefill \\
  --port 8000
`;
  }

  if (r.engine === 'mindie') {
    return `#!/bin/bash
# Launch script generated by agent-deploy
# Model: ${m.hf_id} (${m.archetype}, ${m.total_params_b.toFixed(1)}B params)
# Hardware: ${plan.input.hardware} × ${r.card_count} (Huawei Ascend)
# Engine: MindIE with ${r.quantization}, TP=${r.parallelism.tp}

set -e

# MindIE uses HCCL collective; ensure environment is set up
export ASCEND_RT_VISIBLE_DEVICES=0,1,2,3,4,5,6,7

mindie-server \\
  --model-path ${m.hf_id} \\
  --tp-size ${r.parallelism.tp} \\
  --quantization ${r.quantization === 'fp16' ? 'fp16' : r.quantization} \\
  --max-input-length ${m.max_context} \\
  --port 8000
`;
  }

  if (r.engine === 'lmdeploy') {
    return `#!/bin/bash
# Launch script generated by agent-deploy
# Model: ${m.hf_id} (${m.archetype}, ${m.total_params_b.toFixed(1)}B params)
# Hardware: ${plan.input.hardware} × ${r.card_count} (Cambricon MLU)
# Engine: LMDeploy (TurboMind) with ${r.quantization}, TP=${r.parallelism.tp}

set -e

# MLU env setup
export MLU_VISIBLE_DEVICES=0,1,2,3,4,5,6,7

lmdeploy serve api_server ${m.hf_id} \\
  --backend turbomind \\
  --tp ${r.parallelism.tp} \\
  --model-format ${r.quantization === 'fp16' ? 'hf' : 'awq'} \\
  --session-len ${m.max_context} \\
  --max-batch-size 256 \\
  --server-port 8000
`;
  }

  return `# Engine ${r.engine} launch script not templated — generate manually`;
}

function generateKernelGapsReport(
  m: ParsedModel,
  hw_arch: string,
  coverageMatrix: any
): { gaps: Array<{ op: string; missing_on: string; suggestion: string }>; markdown: string } {
  // Find rows where this hw_arch has missing coverage for ops the model needs
  const opsNeeded = new Set<string>();
  if (m.attention_variant === 'mla') opsNeeded.add('mla-attention');
  else opsNeeded.add('scaled-dot-product-attention');
  if (m.num_experts > 1) {
    opsNeeded.add('moe-gate');
    opsNeeded.add('expert-permute');
    opsNeeded.add('grouped-matmul');
  }
  opsNeeded.add('rmsnorm');
  opsNeeded.add('rope');
  opsNeeded.add('matmul');

  const gaps: Array<{ op: string; missing_on: string; suggestion: string }> = [];
  for (const row of coverageMatrix.rows ?? []) {
    if (
      row.arch_family === hw_arch &&
      opsNeeded.has(row.operator_id) &&
      (row.library_coverage === 'missing' || row.library_coverage === 'experimental')
    ) {
      const isaList = row.isa_primitives ?? [];
      gaps.push({
        op: row.operator_id,
        missing_on: hw_arch,
        suggestion:
          isaList.length > 0
            ? `Generate kernel using ISA primitive(s): ${isaList.join(', ')}. ` +
              `Consult /isa-primitives/<id>/ for cross_vendor_equivalents to find a Hopper/CDNA reference to port from.`
            : `No ISA primitive registered for this arch yet. Manual kernel writing required.`
      });
    }
  }

  let md = `# Kernel Gaps for ${m.hf_id} on ${hw_arch}\n\n`;
  if (gaps.length === 0) {
    md += `**No native kernel gaps detected** — all required ops have library coverage on ${hw_arch}.\n\n`;
    md += `Proceed with launch script.\n`;
  } else {
    md += `**${gaps.length} ops** require codegen on ${hw_arch}:\n\n`;
    for (const g of gaps) {
      md += `## ${g.op}\n\n`;
      md += `- **Hardware**: ${g.missing_on}\n`;
      md += `- **Suggestion**: ${g.suggestion}\n\n`;
    }
    md += `\n## Codegen workflow\n\n`;
    md += `1. For each gap above, query \`/api/operators.json\` for \`engine_implementations\` on a covered arch (typically \`hopper\` or \`cdna3\`).\n`;
    md += `2. Look up the source code link in that implementation's \`url\` field.\n`;
    md += `3. Use \`/isa-primitives/<id>.cross_vendor_equivalents\` to find the target arch's primitive equivalent.\n`;
    md += `4. Use \`/dev-toolkit/dsl-examples/\` for the target arch's programming language.\n`;
    md += `5. Validate output equivalence using \`/operators/<op>.formal_semantics.edge_cases\`.\n`;
    md += `6. Profile with \`/dev-toolkit/profiling-tools/<vendor>-*\` to verify performance.\n`;
  }
  return { gaps, markdown: md };
}

// ============================================================
// Stage 6: Verification plan
// ============================================================

function generateVerificationPlan(plan: DeploymentPlan): string {
  const m = plan.parsed_model;
  const w = plan.input.workload;

  const evalSets: Record<string, string[]> = {
    chat: ['MT-Bench', 'AlpacaEval-2', 'Arena-Hard'],
    rag: ['MTEB-retrieval', 'NQ', 'HotpotQA'],
    code: ['HumanEval', 'MBPP', 'LiveCodeBench'],
    math: ['GSM8K', 'MATH', 'AIME-2024'],
    'long-context': ['LongBench', 'RULER', 'NIAH (Needle-in-Haystack)']
  };

  const evals = evalSets[w] ?? ['MT-Bench', 'MMLU', 'BBH'];

  return `# Verification Plan for ${m.hf_id} on ${plan.input.hardware}

Generated by agent-deploy.

## 5-stage canary (per /learn/migrations/ playbook)

1. **Shadow (0% real traffic, mirror only)** — 4-8h
   - Capture: TTFT p50/p95/p99, decode tok/s, error rate
   - Gate: no errors, p99 within 2× baseline

2. **Canary 1%** — 4h+
   - Real production traffic at 1%
   - Run eval suite: ${evals.join(', ')}
   - Gate: eval drift < 0.5%, no user complaints

3. **10%** — 8h+ (cross peak hour)
   - Full SLA monitoring active
   - Gate: TTFT p99 ≤ ${plan.input.target_ttft_ms ?? 'baseline + 20%'}ms; cost ≤ ${plan.input.target_cost ?? 'baseline'} $/M tok

4. **50%** — 12h+

5. **100%** — 100% rollout, keep old stack 14d standby

## Eval suite for workload "${w}"

Run all of: **${evals.join(', ')}**

Drift tolerance: \`accept_rate_drift < 0.5%\` per migration playbook.

Critical edge cases (per Layer D \`formal_semantics\`):
- Softmax with all-(-inf) input → output should be 0 (not NaN)
- Long-context (32K+) — check for FP16 internal accumulation drift
- All-masked attention rows — check output is 0 (not NaN)

## Profiling

Use ${plan.input.hardware.startsWith('h') || plan.input.hardware.startsWith('b') ? 'NCU + Nsight Systems' : plan.input.hardware.startsWith('mi') ? 'rocprof' : plan.input.hardware.startsWith('ascend') ? 'msprof' : 'vendor profiler'}.

Target metrics:
- Decode tok/s/card: ≥ ${plan.recommended.expected_decode_tok_s_per_card.toFixed(0)}
- HBM bandwidth %: > 75% on decode (memory-bound)
- Compute %: > 60% on prefill (compute-bound)

## Rollback plan

If any stage fails any gate: route back to old stack within 5 min.
Keep old stack standby for 14 days before tearing down.
`;
}

// ============================================================
// Agent learning stub generation (v2.24 — knowledge feedback loop)
// ============================================================

interface AgentLearningStubInput {
  model_id: string;
  hardware_id: string;
  engine_id: string;
  arch_family: string;
  kernel_gaps: Array<{ op: string; missing_on: string; suggestion: string }>;
  predicted_decode_tok_s: number;
  predicted_cost_per_m: number;
  /**
   * v3.28 (F8) — execution_state captures whether the run actually
   * deployed anything. Pre-v3.28 the stub hardcoded `outcome: shipped`
   * which falsely claimed success on planning-only runs. The runbook
   * now writes one of these values based on what actually happened:
   *
   *   'planning-only'     — Stages 1-5 ran, no kernels generated (no
   *                         --use-llm-orchestrator or no gaps detected),
   *                         no remote attempt
   *   'kernels-generated' — productized loop emitted kernels-generated/
   *                         but --execute did not run or halted pre-build
   *   'remote-completed'  — --execute completed all 7 SSH steps green
   *
   * Only `remote-completed` produces `outcome: shipped`. The first two
   * map to the new enum values added in schemas/agent-learning.ts.
   */
  execution_state?: 'planning-only' | 'kernels-generated' | 'remote-completed';
}

/**
 * Build a pre-filled agent-learning YAML stub from the planning state.
 *
 * Surfaces every detected kernel-gap as a structured `observation` of kind
 * `kernel-gap`. Predicted perf numbers are recorded; actual numbers and
 * post-deploy observations (perf-cliff, numerical-mismatch, success-pattern)
 * are left for the human reviewer to fill after running the deployment.
 *
 * Workflow:
 *   1. Agent emits this stub to agent-deploy-output/agent-learning.yaml
 *   2. Human runs the deployment, records actual perf
 *   3. Human edits the stub: adds actual perf, post-deploy observations,
 *      sets triage_status when corpus update lands
 *   4. Human commits the stub into data/agent-learnings/
 *
 * v2.24 ships this manual workflow. Future versions could automate steps 2-4
 * by wiring deployment-side telemetry collection.
 */
function generateAgentLearningStub(input: AgentLearningStubInput): string {
  const date = new Date().toISOString().split('T')[0];
  // Slugify the id: model + hardware + date
  const modelSlug = input.model_id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const hwSlug = input.hardware_id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = `${modelSlug}-on-${hwSlug}-${date}`;

  // v3.28 (F8) — only claim "success-pattern" when the run actually
  // succeeded end-to-end. Planning-only and kernels-generated runs get a
  // neutral observation that flags them as "deployment not attempted yet".
  const state = input.execution_state ?? 'planning-only';
  const observations = input.kernel_gaps.length === 0
    ? (state === 'remote-completed'
        ? `  - kind: success-pattern
    description: |
      All required ops have library coverage on ${input.arch_family}. Agent
      planning succeeded without kernel-codegen. Update with post-deploy
      perf numbers to either confirm prediction or add a perf-cliff observation.`
        : `  - kind: config-drift
    description: |
      Planning stage ran but no kernel-codegen was triggered and no remote
      --execute completed. This stub is informational only; do NOT move into
      data/agent-learnings/ until the deployment actually ran. If the user
      passed --technique <id> and this still shows zero gaps, that's likely
      a F4/F6 misroute (technique arch mismatch / port-target not honored).`)
    : input.kernel_gaps
        .map(
          (g) => `  - kind: kernel-gap
    op_or_kernel: ${g.op}
    description: |
      Missing native kernel for ${g.op} on ${g.missing_on}. Agent emitted
      kernel-codegen skeleton — see agent-deploy-output/kernels-generated/.
      Suggestion: ${g.suggestion}
    proposed_corpus_update: |
      TODO(reviewer): after porting + perf-validating the kernel, propose:
        - data/dsl-examples/<lang>-${g.op}-on-${input.arch_family}.yaml (if novel structural pattern)
        - update data/coverage-matrix-overrides.ts to mark (${g.op}, ${input.arch_family}) covered`
        )
        .join('\n');

  // v3.28 (F8) — derive `outcome` from execution_state. The pre-v3.28
  // hardcoded `outcome: shipped` was a corpus-corruption hazard: every
  // run looked successful regardless of whether anything ran on a real
  // device. The new mapping is honest about partial states.
  const outcomeFromState: Record<NonNullable<typeof input.execution_state>, string> = {
    'planning-only': 'planning-only',
    'kernels-generated': 'kernels-generated',
    'remote-completed': 'shipped',
  };
  const outcome = outcomeFromState[state];

  return `id: ${id}
agent_run_at: '${new Date().toISOString()}'
model_id: ${input.model_id}
hardware_id: ${input.hardware_id}
engine_id: ${input.engine_id}
# v3.28: outcome reflects actual execution_state ("${state}").
# Before moving to data/agent-learnings/, run the deployment + update to
# one of: shipped | partial | kernel-gap-blocked | compile-failed |
# precision-regression | oom-or-fits-failure | planning-only |
# kernels-generated
outcome: ${outcome}

observations:
${observations}

  # TODO(reviewer): add post-deploy observations as you discover them
  # Example post-deploy observations to consider:
  #   - kind: perf-cliff       (actual perf significantly below prediction)
  #   - kind: numerical-mismatch (output diverged from reference)
  #   - kind: version-skew     (engine/library version mismatch)
  #   - kind: config-drift     (engine took different code path than expected)
  #   - kind: success-pattern  (what worked — captured for reuse)
  #   - kind: missing-primitive (ISA primitive needed but not in corpus)
  #   - kind: fusion-opportunity (profitable fusion not in corpus)

perf_delta:
  decode_tok_per_s_predicted: ${input.predicted_decode_tok_s.toFixed(1)}
  # TODO(reviewer): fill after deployment
  # decode_tok_per_s_actual: <measured>
  cost_per_m_tokens_predicted: ${input.predicted_cost_per_m.toFixed(2)}
  # cost_per_m_tokens_actual: <measured>
  # worst_delta_pct: <max((actual - predicted) / predicted * 100)>

# triage_status: open    # initial state
# Set to 'merged' when corpus updates from this run land in main.
# Set to 'wont-fix' if reviewed but not actionable.
triage_status: open

notes: |
  Auto-generated by scripts/agent-deploy/ on ${date}.

  Workflow to land this in the corpus:
    1. Run the actual deployment (launch.sh in this output dir).
    2. Edit this file — fill in actual perf numbers; add observations.
    3. Move this file into data/agent-learnings/ at repo root.
    4. Commit + run pnpm exec tsx scripts/validate-data.ts to verify schema.
    5. Open PR; the /agents/learnings/ page surfaces it on next build.

  See /agents/learnings/ for examples and the full schema reference.
`;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = parseArgs(process.argv);

  // v3.27 — --description "<fuzzy intent>" routes through the host LLM
  // for clarification BEFORE the canonical-args check. If extraction
  // succeeds with high confidence, we exit with the suggested canonical
  // args (v3.28 will auto-route this in a single call). If ambiguous,
  // we exit with clarifying questions.
  if (args['description'] && (!args.model || !args.hardware)) {
    const { listAvailableTechniques } = await import('./load-technique');
    const { listBundles } = await import('./fetch-bundle');
    const { buildClarifyIntentRequest, parseClarifyResponse, formatClarificationOutput } =
      await import('./clarify-intent');
    const adapter = await import('./host-llm-adapter');

    // Force host-llm mode for clarification (no API key required).
    process.env.EVOKERNEL_HOST_LLM = 'true';

    console.error('🧭 Stage 0 — fuzzy-intent clarification via host-LLM exchange...');
    const techs = await listAvailableTechniques();
    const bundles = await listBundles();
    const hardware_set = new Set(bundles.map((b) => b.hardware));
    const clarifyReq = buildClarifyIntentRequest({
      description: args['description'],
      partial_args: { model: args.model, hardware: args.hardware, technique: args['technique'], workload: args.workload },
      context: {
        available_hardware: [...hardware_set].sort(),
        available_techniques: techs,
        bundle_count: bundles.length,
      },
    });
    // Use a synthetic ProductionKernelInput-shaped object so the host-llm
    // adapter's request_id derivation works.
    const synthetic_input = {
      bundle: {
        model: { id: 'fuzzy-intent', name: 'Fuzzy Intent' },
        hardware: { id: 'fuzzy-intent', name: 'Fuzzy Intent' },
        vendor: { id: 'fuzzy-intent', name: 'Fuzzy Intent' },
        applicable_ops: [],
        dsl_examples: [],
        isa_primitives: [],
        prior_learnings: [],
      } as any,
      op: 'clarify-intent',
      target_arch: 'fuzzy-intent',
    };
    const promptHash = `clarify-${Date.now().toString(36)}`;
    const request = adapter.buildHostLlmRequest(synthetic_input, clarifyReq.prompt, promptHash, 'json');
    await adapter.writeHostLlmRequest(request);
    try {
      const response = await adapter.awaitHostLlmResponse(request.request_id, { timeout_ms: 5 * 60 * 1000 });
      const intent = parseClarifyResponse(response.code);
      const out = formatClarificationOutput(intent);
      process.stderr.write(out.text);
      process.exit(out.exit_code);
    } catch (e) {
      console.error(`\n✗ Fuzzy-intent clarification failed: ${(e as Error).message}\n`);
      console.error(`Hint: when running outside Claude Code / Codex, the host-LLM exchange has no consumer. Pass --model and --hardware directly instead.\n`);
      process.exit(1);
    }
  }

  if (!args.model || !args.hardware) {
    console.error(`
Usage:
  pnpm tsx scripts/agent-deploy/index.ts \\
    --model <hf_id> \\
    --hardware <hw_id> \\
    --workload chat|rag|code|math|long-context \\
    [--target-cost <usd_per_m_tokens>] \\
    [--target-ttft <ms>] \\
    [--config /path/to/local/config.json] \\
    [--use-llm-orchestrator]   # v3.17: real-code productized loop (R/G/V/F)
    [--profile]                # v3.21: V3 execution-mode perf gate (target HW)
    [--use-host-llm]           # v3.25: route generation through host LLM (CC/Codex), no API key needed
    [--technique <id>]         # v3.26: orchestrate a research technique port (e.g. sageattention)
    [--remote <target-id>]     # v3.26: SSH to a remote machine (dry-run by default)
    [--execute]                # v3.27: actually run the remote-target plan (vs dry-run)
    [--description "intent"]   # v3.27: fuzzy natural-language intent (triggers host-LLM clarification)

Example (v2 skeleton mode — fast, no API):
  pnpm tsx scripts/agent-deploy/index.ts \\
    --model meta-llama/Llama-3.3-70B-Instruct \\
    --hardware h100-sxm5 \\
    --workload chat

Example (v3 productized real-code mode):
  ANTHROPIC_API_KEY=sk-ant-... pnpm tsx scripts/agent-deploy/index.ts \\
    --model meta-llama/Llama-3.3-70B-Instruct \\
    --hardware h100-sxm5 \\
    --use-llm-orchestrator
`);
    process.exit(1);
  }

  const workload = args.workload ?? 'chat';
  const target_cost = args['target-cost'] ? parseFloat(args['target-cost']) : undefined;
  const target_ttft_ms = args['target-ttft'] ? parseFloat(args['target-ttft']) : undefined;

  console.error(`\n🤖 agent-deploy: ${args.model} → ${args.hardware}\n`);

  // ===== Stage 1: Fetch + classify =====
  // v2.16 — supports 3 input modes:
  //   --source-type=hf     (default; pulls config.json from HuggingFace)
  //   --source-type=local  (--model is a local dir with config.json/safetensors)
  //   --source-type=pytorch (alias for local; future: parse modeling_*.py)
  const sourceType = args['source-type'] ?? 'hf';
  let modelHFId: string;
  let cfg: HFConfig;
  if (sourceType === 'local' || sourceType === 'pytorch') {
    console.error(`📥 Stage 1 — loading local model from ${args.model}...`);
    const loaded = await loadLocalModelConfig(args.model);
    modelHFId = loaded.id;
    cfg = loaded.cfg;
  } else {
    console.error('📥 Stage 1 — fetching HuggingFace config...');
    cfg = await fetchHFConfig(args.model, args.config);
    modelHFId = args.model;
  }
  const m = classifyModel(modelHFId, cfg);
  console.error(
    `  Classified: ${m.archetype}, ${m.total_params_b.toFixed(1)}B params ` +
    `(${m.active_params_b.toFixed(1)}B active), ${m.attention_variant.toUpperCase()} attention\n`
  );

  // ===== Stage 2: Query corpus =====
  console.error('🔍 Stage 2 — querying corpus...');
  const apiBase = args['api-base'] ?? DEFAULT_API_BASE;
  const [hwResp, coverageMatrix, solveResults, engines] = await Promise.all([
    queryAPI<any>('hardware.json', apiBase),
    queryAPI<any>('coverage-matrix.json', apiBase),
    queryAPI<any>('solve.json', apiBase),
    queryAPI<any>('engines.json', apiBase)
  ]);

  const hw = hwResp.items.find((h: any) => h.id === args.hardware);
  if (!hw) {
    console.error(`  ✗ Hardware "${args.hardware}" not found in corpus.`);
    console.error(`    Available: ${hwResp.items.map((h: any) => h.id).slice(0, 8).join(', ')}, ...`);
    process.exit(1);
  }
  console.error(`  ✓ Hardware: ${hw.name}, ${hw.memory.capacity_gb.value} GB HBM`);
  console.error(`  ✓ Coverage matrix: ${coverageMatrix.count} rows`);
  console.error(`  ✓ Similar configurations: ${solveResults.configurations.filter((c: any) => c.hardware.id === args.hardware).length} for this hardware\n`);

  // ===== Stage 3: Feasibility + card count search =====
  console.error('🧮 Stage 3 — feasibility check...');
  let card_count = 1;
  let feas = computeFeasibility(m, hw, card_count);
  while (!feas.fits && card_count < 64) {
    card_count *= 2;
    feas = computeFeasibility(m, hw, card_count);
  }
  if (!feas.fits) {
    console.error(`  ✗ Cannot fit ${m.hf_id} on ${args.hardware} even with TP=64.`);
    console.error('  Consider stronger quant (FP4) or distill smaller model.');
  } else {
    console.error(`  ✓ Fits at TP=${card_count}\n`);
    feas.notes.forEach((n) => console.error(`    ${n}`));
    console.error('');
  }

  // ===== Stage 4: Plan =====
  console.error('📋 Stage 4 — synthesizing plan...');
  const recommended = synthesizePlan(m, hw, feas, card_count, workload, solveResults, engines);
  console.error(`  Engine: ${recommended.engine}`);
  console.error(`  Quant: ${recommended.quantization}`);
  console.error(`  Parallelism: TP=${recommended.parallelism.tp}, PP=${recommended.parallelism.pp}, EP=${recommended.parallelism.ep}`);
  console.error(`  Cards: ${recommended.card_count}`);
  console.error(`  Expected: ${recommended.expected_decode_tok_s_per_card.toFixed(0)} tok/s/card decode, ~$${recommended.estimated_dollars_per_m_tokens.toFixed(3)}/M tok\n`);

  // v3.28 (F4) — derive a candidate list of arch_family labels rather
  // than committing to a single string. The resolver below tries each
  // in order so technique YAMLs that use microarchitecture-level labels
  // (`ascend-da-vinci-3`, `cdna3`) still match hardware that carries
  // generation-level labels (`ascend-910-gen2`, `cdna3-mi300`).
  const arch_candidates = deriveArchCandidates({
    microarchitecture: (hw as { microarchitecture?: string }).microarchitecture,
    generation: hw.generation,
    vendor: (hw as { vendor?: string }).vendor,
  });
  // For codepaths that still expect a single string (coverage matrix
  // lookups, kernel-codegen), use the first candidate. Microarch is
  // preferred when present; falls back to truncated generation.
  const arch_family = arch_candidates[0] ?? args.hardware.split('-')[0];
  const plan: DeploymentPlan = {
    input: {
      model: args.model,
      hardware: args.hardware,
      workload,
      target_cost,
      target_ttft_ms
    },
    parsed_model: m,
    hardware: hw,
    feasibility: feas,
    recommended,
    kernel_gaps: [],
    cross_links: {
      similar_cases: solveResults.configurations
        .filter((c: any) => c.tier === 'measured' && c.hardware.id === args.hardware)
        .slice(0, 5)
        .map((c: any) => c.source_url),
      relevant_playbooks: [`/playbooks/?archetype=${m.archetype}&hw_class=${args.hardware}`],
      coverage_matrix_url: `${apiBase}/coverage-matrix.json`,
      isa_primitive_for_target_arch: hw.architecture?.tensor_isa ?? []
    },
    generated_at: new Date().toISOString()
  };

  // ===== Stage 5: Codegen =====
  console.error('⚙️  Stage 5 — generating launch script + kernel gaps...');
  const launchScript = generateLaunchScript(plan);
  const gapsReport = generateKernelGapsReport(m, arch_family, coverageMatrix);
  plan.kernel_gaps = gapsReport.gaps;
  console.error(`  Launch script: ${launchScript.split('\n').length} lines`);
  console.error(`  Kernel gaps: ${gapsReport.gaps.length} ops need codegen on ${arch_family}\n`);

  // ===== Stage 5.5: Kernel codegen =====
  // Two paths controlled by --use-llm-orchestrator (default off for cost-safety):
  //   • OFF (v2.16 skeleton mode): emit TODO-laden kernel templates from the corpus
  //     ISA primitives + DSL examples. Useful as a starting point.
  //   • ON  (v3.17 productized mode): call generateAndVerify (Layer G/V/F) which
  //     fetches the (model, hardware) agent-context bundle, calls the LLM
  //     orchestrator to produce real production code, runs V1/V2/V3 verification,
  //     retries on failure, and emits a fully-populated agent-learning YAML.
  let generatedKernels: GeneratedKernel[] = [];
  let productizedResults: GenerateAndVerifyResult[] = [];
  const useLlmOrchestrator = args['use-llm-orchestrator'] === 'true' || args['use-llm-orchestrator'] === '';
  // v3.21 — --profile opts into V3 execution-mode perf gate. The gate
  // auto-detects the right profiler (NCU / rocprof / msprof / cnperf /
  // suprof / instruments) for the target arch. Without --profile, V3 runs
  // structural-only checks (no target HW required).
  const profileMode = args['profile'] === 'true' || args['profile'] === '';

  // v3.25 — --use-host-llm activates the host-LLM mode in llm-orchestrator.
  // No external API key needed; works inside Claude Code / Codex sessions.
  // We set EVOKERNEL_HOST_LLM=true so selectMode() in llm-orchestrator picks
  // it up — same surface as auto-detection from CC/Codex env vars, just
  // explicit.
  if (args['use-host-llm'] === 'true' || args['use-host-llm'] === '') {
    process.env.EVOKERNEL_HOST_LLM = 'true';
  }

  // v3.26 — --technique <id> loads data/techniques/<id>.yaml and influences
  // the productized branch: which arch we're targeting (port_targets[]
  // filtered to user's --hardware), which numerical_rules Layer V inherits,
  // and which port status the user sees (greenfield port vs running
  // existing reference impl).
  let techniqueContext: TechniquePortContext | undefined;
  if (args['technique']) {
    try {
      const technique = await loadTechnique(args['technique']);
      // v3.28 (F4) — pass the full candidate list so techniques that label
      // their port_targets at microarchitecture granularity match hardware
      // labeled at generation granularity, and vice versa.
      techniqueContext = describeTechniquePortStatus(technique, arch_candidates);
      console.error(`🧪 Stage 4.5 — technique loaded: ${technique.name} (${technique.technique_kind})`);
      console.error(`   ${techniqueContext.summary}`);
      console.error('');
    } catch (e) {
      if (e instanceof TechniqueNotFoundError) {
        console.error(`✗ Technique "${args['technique']}" not found in data/techniques/.`);
        console.error(`  Available: ${e.available.slice(0, 8).join(', ')}${e.available.length > 8 ? ', ...' : ''}\n`);
        process.exit(1);
      }
      throw e;
    }
  }

  // v3.28 (F6) — when `--technique <id>` is passed AND the matched
  // port_target has status `planned` or `experimental`, synthesize virtual
  // gaps from the technique's `applicable_to.ops` so the productized
  // loop runs even if generic coverage matrix says "all ops covered by
  // libraries". Pre-v3.28 the runbook's central scenario silently
  // no-op'd here when CogVideoX × Ascend reported zero gaps.
  //
  // Generality: works for ANY technique × ANY hardware whose port_target
  // status is `planned`/`experimental`. Doesn't trigger for techniques
  // that already have a `production-ready` port (no need to re-generate)
  // or `reference-impl` (existing impl is the reference).
  if (
    techniqueContext?.matched_port_target &&
    (techniqueContext.matched_port_target.status === 'planned' ||
      techniqueContext.matched_port_target.status === 'experimental') &&
    techniqueContext.technique.applicable_to?.ops?.length
  ) {
    const techniqueOps = techniqueContext.technique.applicable_to.ops;
    const existingGapOps = new Set(gapsReport.gaps.map((g) => g.op));
    let injected = 0;
    for (const op of techniqueOps) {
      if (existingGapOps.has(op)) continue;
      gapsReport.gaps.push({
        op,
        missing_on: techniqueContext.target_arch_family,
        suggestion:
          `Technique-driven port: ${techniqueContext.technique.name} on ${techniqueContext.target_arch_family} ` +
          `(port_target.status=${techniqueContext.matched_port_target.status}). ` +
          `Generate from technique reference impl + corpus DSL examples.`,
      });
      injected++;
    }
    if (injected > 0) {
      console.error(
        `   ➕ Injected ${injected} virtual gap${injected === 1 ? '' : 's'} from technique.applicable_to.ops ` +
          `(F6: --technique forcing port attempt for ${techniqueContext.matched_port_target.status} target)`,
      );
      plan.kernel_gaps = gapsReport.gaps;
    }
  }

  if (gapsReport.gaps.length > 0 && useLlmOrchestrator) {
    // v3.17 productized path — Layer R/G/V/F end-to-end.
    console.error('🤖 Stage 5.5 — productized agent loop (R/G/V/F)...');
    console.error(`   Mode: ${process.env.ANTHROPIC_API_KEY ? 'real' : (process.env.EVOKERNEL_TEST_MODE === 'true' ? 'test' : 'cache/skeleton-fallback')}`);
    try {
      // v3.18 — fuzzy resolution: accept HF ids ("meta-llama/Llama-3.3-70B-Instruct"),
      // partial slugs, or exact canonical slugs. Surface ambiguity to the user.
      // v3.29 — when bundle resolution fails AND `--allow-synthesize` is set
      // (or implicit via `--use-host-llm` / `--technique`), call
      // `synthesizeTemporaryBundle` instead of falling through to skeleton
      // mode. This unblocks productized kernel generation for any HF model
      // not yet in `data/models/`. Caveats are surfaced prominently.
      const allowSynthesize =
        args['allow-synthesize'] === 'true' ||
        args['allow-synthesize'] === '' ||
        args['use-host-llm'] === 'true' ||
        args['use-host-llm'] === '' ||
        Boolean(args['technique']);

      const resolution = await resolveBundleId({
        model: args.model,
        hardware: args.hardware,
      });

      let fetchResult: Awaited<ReturnType<typeof fetchBundle>>;
      let synthesizedFrom: SynthesizedBundle | undefined;

      if (!resolution.resolved && allowSynthesize) {
        // v3.29 synthesis path
        console.error(`   ⚙ "${args.model}" not in corpus — synthesizing bundle from HF config (v3.29)...`);
        // Map our richer model_kind → the synthesizer's archetype string.
        const archetype_hint =
          m.model_kind === 'diffusion-video' || m.model_kind === 'diffusion-image' || m.model_kind === 'diffusion-3d'
            ? 'diffusion'
            : m.model_kind === 'asr-whisper'
            ? 'encoder-decoder-asr'
            : m.model_kind === 'vlm'
            ? 'vision-transformer'
            : 'transformer-decoder';
        synthesizedFrom = await synthesizeTemporaryBundle({
          model: args.model,
          hardware: args.hardware,
          // Reuse the v3.28 fetched config so the synthesizer doesn't re-do
          // the network call (and benefits from the diffusers-component
          // layout probe).
          hf_config_override: m.raw as Record<string, unknown>,
          archetype_hint,
        });
        fetchResult = {
          bundle: synthesizedFrom.bundle,
          source: 'synthesized',
          resolved_from: `synthesized (${synthesizedFrom.source}; archetype=${synthesizedFrom.inferred_archetype})`,
        };
        console.error(`   ✓ Synthesized bundle (template archetype: ${synthesizedFrom.inferred_archetype})`);
        for (const caveat of synthesizedFrom.caveats) {
          console.error(`     • ${caveat}`);
        }
      } else if (!resolution.resolved) {
        console.error(`   ✗ Could not resolve "${args.model}" to a bundle for ${args.hardware}.`);
        console.error(`     Normalized form: "${resolution.normalized_model}"`);
        if (resolution.candidates.length > 0) {
          console.error(`     Candidates (${resolution.candidates.length}):`);
          resolution.candidates.slice(0, 6).forEach((c) =>
            console.error(`       - ${c.model} on ${c.hardware}`)
          );
        }
        console.error(`     Hint: pnpm agent:list-bundles --hardware ${args.hardware}`);
        console.error(`     Or: pass --allow-synthesize to bundle-from-HF-config (v3.29)\n`);
        throw new BundleNotFoundError(
          { model: args.model, hardware: args.hardware },
          'see candidates above'
        );
      } else {
        if (resolution.strategy !== 'exact') {
          console.error(`   ✓ Resolved "${args.model}" → "${resolution.resolved.model}" (strategy: ${resolution.strategy})`);
        }
        fetchResult = await fetchBundle({
          model: resolution.resolved.model,
          hardware: resolution.resolved.hardware,
        });
        console.error(`   ✓ Bundle from ${fetchResult.source}: ${fetchResult.resolved_from}`);
      }

      for (const gap of gapsReport.gaps) {
        console.error(`   → ${gap.op}: generating + verifying...`);
        const op_in_bundle = fetchResult.bundle.applicable_ops.find((o) => o.id === gap.op);
        const reference_impl_python = op_in_bundle?.formal_semantics?.reference_impl?.snippet;
        const numerical_rules = op_in_bundle?.formal_semantics?.numerical_rules;
        const result = await generateAndVerify({
          generation: {
            bundle: fetchResult.bundle,
            op: gap.op,
            target_arch: arch_family,
          },
          verification: {
            reference_impl_python,
            numerical_rules,
            // v3.21 — when --profile is passed, V3 perf gate runs in
            // execution mode (auto-detects profiler for target_arch).
            execution_mode: profileMode,
          },
        });
        productizedResults.push(result);
        const icon = result.outcome === 'shipped' ? '✓' : result.outcome === 'partial' ? '~' : '✗';
        console.error(`     ${icon} ${result.outcome} (${result.attempts.length} attempt${result.attempts.length !== 1 ? 's' : ''}, source: ${result.kernel.source})`);
      }
      console.error('');
    } catch (e) {
      if (e instanceof BundleNotFoundError) {
        console.error(`   ⚠ No agent-context bundle for ${args.model}-on-${args.hardware} — falling back to skeleton path.`);
        console.error(`     Hint: run \`pnpm --filter @evokernel/web build\` or check (model, hardware) ids.\n`);
      } else {
        console.error(`   ⚠ Productized path failed (falling back to skeleton): ${(e as Error).message}\n`);
      }
    }
  }

  // v2.16 skeleton path — runs by default OR as fallback when productized path failed.
  if (gapsReport.gaps.length > 0 && productizedResults.length === 0) {
    console.error('🔧 Stage 5.5 — generating kernel skeletons for gaps...');
    try {
      const [opsResp, primitivesResp, dslResp] = await Promise.all([
        queryAPI<any>('operators.json', apiBase),
        queryAPI<any>('isa-primitives.json', apiBase),
        queryAPI<any>('dsl-examples.json', apiBase)
      ]);
      generatedKernels = generateKernels({
        gaps: gapsReport.gaps,
        target_arch: arch_family,
        primitives: primitivesResp.items,
        dsl_examples: dslResp.items,
        operators: opsResp.items
      });
      console.error(`  Generated ${generatedKernels.length} kernel skeleton${generatedKernels.length !== 1 ? 's' : ''}\n`);
    } catch (e) {
      console.error(`  ⚠ Kernel codegen failed (continuing): ${(e as Error).message}\n`);
    }
  }

  // ===== Stage 6: Verification =====
  console.error('🔬 Stage 6 — generating verification plan...');
  const verificationPlan = generateVerificationPlan(plan);

  // ===== Stage 7: Production-grade artifacts (v2.9) =====
  console.error('🏭 Stage 7 — generating production-grade artifacts...');
  const dockerfile = generateDockerfile(plan as any);
  const k8sManifest = generateK8sDeployment(plan as any);
  const promRules = generatePrometheusRules(plan as any);
  const runbook = generateRunbook(plan as any);
  const rollback = generateRollbackPlan(plan as any);
  const provenance = generateProvenance(plan as any);
  const licenseAudit = generateLicenseAudit(plan as any);
  const checklist = generateProductionChecklist(plan as any);
  const sbom = generateSBOM(plan as any);
  console.error(`  Generated 9 production artifacts\n`);

  // ===== Stage 8: Knowledge feedback loop emission (v2.24) =====
  // Emit a pre-filled agent-learning YAML stub. The human reviewer is expected to
  // (a) run the deployment, (b) fill in actual perf numbers + post-deploy
  // observations, then (c) move the YAML into data/agent-learnings/ to land in
  // the corpus. This closes the spec → plan → dev → test → feedback → spec cycle.
  console.error('📚 Stage 8 — emitting agent-learning stub for knowledge feedback...');
  // v3.28 (F8) — derive execution_state from what actually happened in
  // the previous stages. `--execute` end-to-end success is recorded
  // separately in remote-target.ts and isn't yet plumbed back here, so
  // for now Stage 8 distinguishes "no kernels" vs "kernels generated".
  // (`remote-completed` is reserved for v3.29 when we plumb the
  // executeRemoteRun result back into this code path.)
  const execution_state: AgentLearningStubInput['execution_state'] =
    productizedResults.length > 0 || generatedKernels.length > 0
      ? 'kernels-generated'
      : 'planning-only';
  const learningStub = generateAgentLearningStub({
    model_id: args.model,
    hardware_id: args.hardware,
    engine_id: recommended.engine,
    arch_family,
    kernel_gaps: gapsReport.gaps,
    predicted_decode_tok_s: recommended.expected_decode_tok_s_per_card,
    predicted_cost_per_m: recommended.estimated_dollars_per_m_tokens,
    execution_state,
  });
  console.error('  agent-learning stub ready (1 entry)\n');

  // Write outputs
  const outputDir = path.resolve(args.output ?? './agent-deploy-output');
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(outputDir, 'kubernetes'), { recursive: true });
  await mkdir(path.join(outputDir, 'monitoring'), { recursive: true });
  if (generatedKernels.length > 0 || productizedResults.length > 0) {
    await mkdir(path.join(outputDir, 'kernels-generated'), { recursive: true });
  }

  // v3.17 productized writes — real generated kernels + verification summaries + agent-learnings
  const productizedWrites: Promise<void>[] = [];
  for (const result of productizedResults) {
    productizedWrites.push(
      writeFile(path.join(outputDir, 'kernels-generated', result.kernel.filename), result.kernel.code)
    );
    productizedWrites.push(
      writeFile(
        path.join(outputDir, 'kernels-generated', `${result.kernel.filename}.verify.md`),
        result.verification.summary_md ?? '(no verification summary)'
      )
    );
  }
  // Aggregate productized agent-learnings into a single per-deploy file (one entry per gap).
  const productizedLearnings = productizedResults.length > 0
    ? `# Agent-learnings for ${args.model} → ${args.hardware} (v3.17 productized loop)\n\n` +
      productizedResults.map((r, i) => `## Gap ${i + 1}: ${r.kernel.filename}\n\nOutcome: **${r.outcome}** (${r.attempts.length} attempts)\nSource: \`${r.kernel.source}\`\n\n${r.agent_learning_yaml}\n`).join('\n---\n\n')
    : '';

  const kernelWrites = generatedKernels.map((k) =>
    writeFile(path.join(outputDir, 'kernels-generated', k.filename), k.code)
  );
  // Aggregate review notes index
  const kernelIndex = generatedKernels.length > 0
    ? `# Generated Kernel Skeletons\n\n${generatedKernels.length} kernel skeleton(s) generated for ${arch_family}. **These are starting points — not production-ready code.** Review the TODO markers and validate against /operators/<op>/ formal_semantics edge cases before shipping.\n\n${generatedKernels.map((k) => `## ${k.op}\n\nFile: \`${k.filename}\` (${k.language})\n\n### Review notes\n\n${k.review_notes.map((n) => `- ${n}`).join('\n')}\n`).join('\n---\n\n')}\n`
    : '';

  // v3.18 — single canonical deploy manifest. Replaces "scrape several files
  // to reconstruct what happened" with one structured record. Versioned for
  // forward compatibility (consumers should check manifest.schema_version).
  const manifest = {
    schema_version: '0.1',
    generated_at: new Date().toISOString(),
    request: {
      model: args.model,
      hardware: args.hardware,
      workload,
      use_llm_orchestrator: useLlmOrchestrator,
      target_cost,
      target_ttft_ms,
    },
    classification: {
      archetype: m.archetype,
      total_params_b: m.total_params_b,
      active_params_b: m.active_params_b,
      attention_variant: m.attention_variant,
    },
    // v3.26 — surface the technique context (if --technique was passed) so
    // downstream consumers (CI dashboards, agent-learning emitters) know
    // whether this run was a greenfield port or an existing-impl run.
    technique: techniqueContext
      ? {
          id: techniqueContext.technique.id,
          name: techniqueContext.technique.name,
          kind: techniqueContext.technique.technique_kind,
          target_arch_family: techniqueContext.target_arch_family,
          port_status: techniqueContext.matched_port_target?.status ?? 'greenfield',
          summary: techniqueContext.summary,
        }
      : null,
    // v3.26 — Ralph-Loop-style step record. Each major stage emits an
    // entry here so the manifest captures "what happened in what order"
    // beyond just the final outcome. v3.27+ extends this with per-step
    // verification results + diagnostic chains.
    ralph_loop_iterations: [
      { stage: 'classify', status: 'ok', summary: `${m.archetype} ${m.total_params_b.toFixed(1)}B params, ${m.attention_variant} attention` },
      { stage: 'feasibility', status: feas.fits ? 'ok' : 'fail', summary: feas.fits ? `Fits at TP=${card_count}` : 'Does not fit on this hardware at any TP' },
      { stage: 'plan', status: 'ok', summary: `${recommended.engine}, ${recommended.quantization}, TP=${recommended.parallelism.tp}` },
      ...(techniqueContext
        ? [{ stage: 'technique-context', status: 'ok', summary: techniqueContext.summary }]
        : []),
      ...(productizedResults.length > 0
        ? [{ stage: 'productized-generation', status: 'ok',
            summary: `${productizedResults.filter((r) => r.outcome === 'shipped').length} shipped, ${productizedResults.filter((r) => r.outcome === 'partial').length} partial, ${productizedResults.filter((r) => r.outcome === 'kernel-gap-blocked').length} blocked` }]
        : []),
      ...(args['remote']
        ? [{ stage: 'remote-target-plan', status: 'dry-run',
            summary: `SSH execution plan emitted for ${args['remote']} (run --execute in v3.27 to actually run)` }]
        : []),
    ],
    recommended,
    feasibility: { fits: feas.fits, card_count, notes: feas.notes },
    kernel_gaps_count: gapsReport.gaps.length,
    productized: productizedResults.length > 0
      ? {
          mode: process.env.ANTHROPIC_API_KEY ? 'real' : (process.env.EVOKERNEL_TEST_MODE === 'true' ? 'test' : 'cache-or-skeleton'),
          shipped: productizedResults.filter((r) => r.outcome === 'shipped').length,
          partial: productizedResults.filter((r) => r.outcome === 'partial').length,
          blocked: productizedResults.filter((r) => r.outcome === 'kernel-gap-blocked').length,
          per_gap: productizedResults.map((r) => ({
            filename: r.kernel.filename,
            outcome: r.outcome,
            attempts: r.attempts.length,
            source: r.kernel.source,
          })),
        }
      : null,
    artifacts: {
      planning: ['deployment_plan.json', 'launch.sh', 'kernel_gaps.md', 'verification_plan.md'],
      production: ['Dockerfile', 'kubernetes/deployment.yaml', 'monitoring/prometheus-rules.yaml', 'runbook.md', 'rollback-plan.md', 'provenance.json', 'license-audit.md', 'production-checklist.md', 'sbom.json'],
      knowledge_feedback: ['agent-learning.yaml', ...(productizedResults.length > 0 ? ['agent-learnings-productized.md'] : [])],
    },
  };

  await Promise.all([
    // v3.18: canonical manifest first — most-machine-readable summary
    writeFile(path.join(outputDir, 'evokernel-deploy.json'), JSON.stringify(manifest, null, 2)),
    // Planning artifacts (Stage 1-6)
    writeFile(path.join(outputDir, 'deployment_plan.json'), JSON.stringify(plan, null, 2)),
    writeFile(path.join(outputDir, 'launch.sh'), launchScript, { mode: 0o755 }),
    writeFile(path.join(outputDir, 'kernel_gaps.md'), gapsReport.markdown),
    writeFile(path.join(outputDir, 'verification_plan.md'), verificationPlan),
    // Production artifacts (Stage 7 — v2.9)
    writeFile(path.join(outputDir, 'Dockerfile'), dockerfile),
    writeFile(path.join(outputDir, 'kubernetes', 'deployment.yaml'), k8sManifest),
    writeFile(path.join(outputDir, 'monitoring', 'prometheus-rules.yaml'), promRules),
    writeFile(path.join(outputDir, 'runbook.md'), runbook),
    writeFile(path.join(outputDir, 'rollback-plan.md'), rollback),
    writeFile(path.join(outputDir, 'provenance.json'), provenance),
    writeFile(path.join(outputDir, 'license-audit.md'), licenseAudit),
    writeFile(path.join(outputDir, 'production-checklist.md'), checklist),
    writeFile(path.join(outputDir, 'sbom.json'), sbom),
    // v2.16: kernel skeletons + index
    ...kernelWrites,
    kernelIndex ? writeFile(path.join(outputDir, 'kernels-generated', 'README.md'), kernelIndex) : Promise.resolve(),
    // v3.17: productized real-code kernels + per-gap verification summaries
    ...productizedWrites,
    productizedLearnings
      ? writeFile(path.join(outputDir, 'agent-learnings-productized.md'), productizedLearnings)
      : Promise.resolve(),
    // v2.24: knowledge-feedback agent-learning stub
    writeFile(path.join(outputDir, 'agent-learning.yaml'), learningStub),
  ]);

  // v3.26 — --remote <target-id> emits an SSH execution plan (dry-run by
  // default). Real --execute lands in v3.27 once users have validated the
  // plan format + per-vendor build scripts work for their toolchain.
  if (args['remote']) {
    try {
      const target = await resolveTarget(args['remote'], args.hardware);
      // Collect the kernel files we'd ship to remote — productized run
      // wrote real code, skeleton mode wrote templates. Either way these
      // are the .cu / .cce / .hip / .mlu artifacts the remote build needs.
      const kernel_files: Array<{ filename: string; content: string }> = [];
      for (const r of productizedResults) {
        kernel_files.push({ filename: r.kernel.filename, content: r.kernel.code });
      }
      for (const k of generatedKernels) {
        kernel_files.push({ filename: k.filename, content: k.code });
      }
      if (kernel_files.length === 0) {
        console.error(`\n⚠ --remote requested but no kernel files generated. Pass --use-llm-orchestrator (or accept skeleton-mode output) first.\n`);
      } else {
        const run_id = `${args.model}__${args.hardware}__${Date.now()}`.replace(/[^a-z0-9_-]/gi, '-');
        const plan = buildExecutionPlan({
          target,
          kernel_files,
          local_output_dir: outputDir,
          run_id,
        });
        // v3.27 — --execute opt-in: when set, actually run the plan via
        // SSH/scp + halt-on-error. Without --execute, dry-run as before
        // (v3.26 default for safety; real-hardware execution is destructive).
        const shouldExecute = args['execute'] === 'true' || args['execute'] === '';

        // Persist the plan + kernel-file manifest for inspection / replay.
        await writeFile(path.join(outputDir, 'remote-plan.json'), JSON.stringify({
          target_id: target.id,
          hardware: target.hardware,
          ssh: target.ssh,
          run_id,
          remote_work_dir: plan.remote_work_dir,
          kernel_files: plan.kernel_files.map((f) => ({ filename: f.filename, byte_count: f.content.length })),
          commands: plan.commands,
          execute_mode: shouldExecute ? 'execute' : 'dry-run',
        }, null, 2));

        if (!shouldExecute) {
          process.stderr.write(formatPlanForDryRun(plan));
        } else {
          // v3.27 — write kernel files locally first so the scp-up step has
          // them on disk to upload. Plan's scp-up command references
          // <local>/<filename> placeholders; we write the actual files into
          // outputDir/kernels-generated/ where the plan expects them.
          const kernels_dir = path.join(outputDir, 'kernels-to-upload');
          await mkdir(kernels_dir, { recursive: true });
          for (const f of plan.kernel_files) {
            await writeFile(path.join(kernels_dir, f.filename), f.content);
          }
          // Rewrite the scp-up command to use the on-disk paths.
          plan.commands = plan.commands.map((c) => {
            if (c.kind !== 'scp-up') return c;
            const sources = plan.kernel_files
              .map((f) => path.join(kernels_dir, f.filename))
              .concat(plan.build_script_local);
            return {
              ...c,
              cmd: `scp ${sources.map((s) => `'${s.replace(/'/g, `'\\''`)}'`).join(' ')} ${target.ssh}:${plan.remote_work_dir}/`,
            };
          });

          console.error(`\n🚀 Stage 9 — executing remote run plan (--execute)...`);
          console.error(`   Steps: ${plan.commands.length}; halt-on-error.`);
          const result = await executeRemoteRun(plan);

          if (result.exit_code === 0) {
            console.error(`\n   ✓ All ${plan.commands.length} steps succeeded.`);
            console.error(`   Profiler output: ${plan.local_profile_output}`);
            // v3.27 — auto-set EVOKERNEL_<PROFILER>_INPUT_CSV so a follow-up
            // V3 perf gate run picks up the just-pulled profile data.
            const env_var = profilerEnvVarFor(plan.vendor);
            if (env_var) {
              console.error(`\n   Hint: set ${env_var}=${plan.local_profile_output} to feed this into V3 perf gate, e.g.:`);
              console.error(`     ${env_var}=${plan.local_profile_output} pnpm agent:deploy --use-llm-orchestrator --profile --model ${args.model} --hardware ${args.hardware}`);
            }
          } else {
            console.error(`\n   ✗ Step "${result.step}" failed (exit ${result.exit_code}).`);
            console.error(`   ${result.output.split('\n').slice(0, 8).join('\n   ')}`);
            console.error(`\n   Persisted plan + first failure at ${path.join(outputDir, 'remote-plan.json')}`);
            console.error(`   To retry just the failed step manually, copy the command from the persisted plan.\n`);
          }
        }
      }
    } catch (e) {
      if (e instanceof TargetNotFoundError) {
        console.error(`\n✗ Remote target "${args['remote']}" not found.`);
        console.error(`  Available: ${e.available.join(', ') || '(none)'}`);
        console.error(`  Hint: copy targets.yaml.example to ~/.config/evokernel/targets.yaml and add a target.\n`);
      } else if (e instanceof TargetMismatchError) {
        console.error(`\n✗ ${(e as Error).message}\n`);
      } else {
        console.error(`\n✗ Remote target failed: ${(e as Error).message}\n`);
      }
    }
  }

  console.error(`✅ Done — outputs in ${outputDir}/\n`);
  console.error('Planning artifacts:');
  console.error('   - deployment_plan.json     (structured plan)');
  console.error('   - launch.sh                (engine startup, ready to source)');
  console.error('   - kernel_gaps.md           (codegen TODO if any)');
  console.error('   - verification_plan.md     (eval + canary stages)\n');
  console.error('Production-grade artifacts:');
  console.error('   - Dockerfile               (reproducible build, version-pinned)');
  console.error('   - kubernetes/deployment.yaml (K8s deployment + service + HPA)');
  console.error('   - monitoring/prometheus-rules.yaml (SLA / cost / quality alerts)');
  console.error('   - runbook.md               (on-call response procedures)');
  console.error('   - rollback-plan.md         (failure recovery)');
  console.error('   - provenance.json          (versioned everything for audit)');
  console.error('   - license-audit.md         (compliance gate)');
  console.error('   - production-checklist.md  (53-item gating checklist)');
  console.error('   - sbom.json                (SPDX 2.3 software bill of materials)\n');
  console.error('Knowledge feedback (v2.24):');
  console.error('   - agent-learning.yaml      (pre-filled stub; mv to data/agent-learnings/');
  console.error('                               post-deploy to land in corpus)\n');

  if (productizedResults.length > 0) {
    console.error('Productized agent loop (v3.17, R/G/V/F):');
    console.error(`   - kernels-generated/*       (${productizedResults.length} real-code kernel${productizedResults.length !== 1 ? 's' : ''})`);
    console.error(`   - kernels-generated/*.verify.md (per-kernel V1/V2/V3 verification summaries)`);
    console.error('   - agent-learnings-productized.md (one agent-learning entry per gap, ');
    console.error('                                     pre-filled from real verify results)\n');
    const shipped = productizedResults.filter((r) => r.outcome === 'shipped').length;
    const partial = productizedResults.filter((r) => r.outcome === 'partial').length;
    const blocked = productizedResults.filter((r) => r.outcome === 'kernel-gap-blocked').length;
    console.error(`   Outcomes: ${shipped} shipped · ${partial} partial · ${blocked} blocked\n`);
  }
}

// v3.28 — only run main() when this file is the entry point. Tests
// import classifyModel/detectModelKind/fetchHFConfig directly and would
// previously trigger main() (which calls process.exit on missing args).
//
// The check tolerates both `tsx scripts/agent-deploy/index.ts ...`
// (process.argv[1] is the .ts path) and the compiled .js path.
const _entryPath = process.argv[1] ?? '';
const _isEntry =
  _entryPath.endsWith('agent-deploy/index.ts') ||
  _entryPath.endsWith('agent-deploy/index.js') ||
  _entryPath.endsWith('agent-deploy\\index.ts') ||
  _entryPath.endsWith('agent-deploy\\index.js');
if (_isEntry) {
  main().catch((err) => {
    console.error('\n✗ agent-deploy failed:', err.message);
    process.exit(1);
  });
}
