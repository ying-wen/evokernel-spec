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
import { fetchBundle, BundleNotFoundError, resolveBundleId } from './fetch-bundle';
import { generateAndVerify, type GenerateAndVerifyResult } from './feedback';
import { pickLanguageForArch } from './llm-orchestrator';

// ============================================================
// Types
// ============================================================

interface HFConfig {
  architectures: string[];
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
}

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

async function fetchHFConfig(hfId: string, localPath?: string): Promise<HFConfig> {
  if (localPath && existsSync(localPath)) {
    console.error(`  Reading config from ${localPath}`);
    return JSON.parse(await readFile(localPath, 'utf-8'));
  }
  const url = `https://huggingface.co/${hfId}/raw/main/config.json`;
  console.error(`  Fetching ${url}`);
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(
      `Failed to fetch HF config (HTTP ${r.status}). Provide --config /path/to/config.json for offline mode, ` +
      `or check that the model is public and the id is correct.`
    );
  }
  return await r.json();
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

function classifyModel(hfId: string, cfg: HFConfig): ParsedModel {
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
    raw: cfg
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

  const observations = input.kernel_gaps.length === 0
    ? `  - kind: success-pattern
    description: |
      All required ops have library coverage on ${input.arch_family}. Agent
      planning succeeded without kernel-codegen. Update with post-deploy
      perf numbers to either confirm prediction or add a perf-cliff observation.`
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

  return `id: ${id}
agent_run_at: '${new Date().toISOString()}'
model_id: ${input.model_id}
hardware_id: ${input.hardware_id}
engine_id: ${input.engine_id}
# TODO(reviewer): set outcome after running the deployment
# Options: shipped | partial | kernel-gap-blocked | compile-failed | precision-regression | oom-or-fits-failure
outcome: shipped

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

  // Compose plan
  const arch_family = hw.generation
    ? (hw.generation.split('-')[0])
    : args.hardware.split('-')[0];
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

  if (gapsReport.gaps.length > 0 && useLlmOrchestrator) {
    // v3.17 productized path — Layer R/G/V/F end-to-end.
    console.error('🤖 Stage 5.5 — productized agent loop (R/G/V/F)...');
    console.error(`   Mode: ${process.env.ANTHROPIC_API_KEY ? 'real' : (process.env.EVOKERNEL_TEST_MODE === 'true' ? 'test' : 'cache/skeleton-fallback')}`);
    try {
      // v3.18 — fuzzy resolution: accept HF ids ("meta-llama/Llama-3.3-70B-Instruct"),
      // partial slugs, or exact canonical slugs. Surface ambiguity to the user.
      const resolution = await resolveBundleId({
        model: args.model,
        hardware: args.hardware,
      });
      if (!resolution.resolved) {
        console.error(`   ✗ Could not resolve "${args.model}" to a bundle for ${args.hardware}.`);
        console.error(`     Normalized form: "${resolution.normalized_model}"`);
        if (resolution.candidates.length > 0) {
          console.error(`     Candidates (${resolution.candidates.length}):`);
          resolution.candidates.slice(0, 6).forEach((c) =>
            console.error(`       - ${c.model} on ${c.hardware}`)
          );
        }
        console.error(`     Hint: pnpm agent:list-bundles --hardware ${args.hardware}\n`);
        throw new BundleNotFoundError(
          { model: args.model, hardware: args.hardware },
          'see candidates above'
        );
      }
      if (resolution.strategy !== 'exact') {
        console.error(`   ✓ Resolved "${args.model}" → "${resolution.resolved.model}" (strategy: ${resolution.strategy})`);
      }
      const fetchResult = await fetchBundle({
        model: resolution.resolved.model,
        hardware: resolution.resolved.hardware,
      });
      console.error(`   ✓ Bundle from ${fetchResult.source}: ${fetchResult.resolved_from}`);

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
  const learningStub = generateAgentLearningStub({
    model_id: args.model,
    hardware_id: args.hardware,
    engine_id: recommended.engine,
    arch_family,
    kernel_gaps: gapsReport.gaps,
    predicted_decode_tok_s: recommended.expected_decode_tok_s_per_card,
    predicted_cost_per_m: recommended.estimated_dollars_per_m_tokens,
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

main().catch((err) => {
  console.error('\n✗ agent-deploy failed:', err.message);
  process.exit(1);
});
