import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9.-]+$/);

export const ModelFamilySchema = z.enum(['dense', 'moe', 'hybrid', 'diffusion']);

const MoEConfigSchema = z.object({
  num_experts: z.number().int().positive(),
  top_k: z.number().int().positive(),
  expert_hidden_size: z.number().int().positive(),
  shared_experts: z.number().int().nonnegative().default(0)
});

// LLM-specific fields (vocab_size, num_attention_heads, etc.) are required
// for transformer-decoder family models but don't apply to diffusion (UNet/DiT).
// Make those optional and refine: require them iff family is dense/moe/hybrid.
const ArchitectureSchema = z
  .object({
    family: ModelFamilySchema,
    total_params_b: z.number().positive(),
    active_params_b: z.number().positive(),
    layers: z.number().int().positive(),
    hidden_size: z.number().int().positive(),
    ffn_size: z.number().int().positive().optional(),
    num_attention_heads: z.number().int().positive().optional(),
    num_kv_heads: z.number().int().positive().optional(),
    head_dim: z.number().int().positive().optional(),
    vocab_size: z.number().int().positive().optional(),
    max_context_length: z.number().int().positive().optional(),
    moe: MoEConfigSchema.optional(),
    attention_type: z.string().min(1),
    rope_theta: z.number().positive().optional()
  })
  .refine((a) => a.active_params_b <= a.total_params_b, {
    message: 'active_params_b cannot exceed total_params_b',
    path: ['active_params_b']
  })
  .refine((a) => a.family !== 'moe' || a.moe !== undefined, {
    message: 'family=moe requires moe config',
    path: ['moe']
  })
  // For LLM-class families (dense/moe/hybrid), vocab_size + num_attention_heads
  // + max_context_length are required. Diffusion models can omit them.
  .refine(
    (a) =>
      a.family === 'diffusion' ||
      (a.vocab_size !== undefined &&
        a.num_attention_heads !== undefined &&
        a.num_kv_heads !== undefined &&
        a.head_dim !== undefined &&
        a.ffn_size !== undefined &&
        a.max_context_length !== undefined),
    {
      message:
        'LLM-class family (dense/moe/hybrid) requires vocab_size, num_attention_heads, num_kv_heads, head_dim, ffn_size, max_context_length',
      path: ['family']
    }
  );

const OperatorBreakdownSchema = z.object({
  operator: Slug,
  flops_per_token: z.number().nonnegative(),
  bytes_per_token: z.number().nonnegative(),
  notes: z.string().optional()
});

export const ModalitySchema = z.enum(['text', 'vision', 'audio', 'video']);

/**
 * Model domain — what kind of workload this model represents.
 * Different domains have very different roofline characteristics
 * (e.g. scientific is FP32/FP64 with irregular memory access; recommender
 * is embedding-table-bound with TBs of memory bandwidth needed; speech is
 * latency-sensitive streaming).
 *
 * Default = `llm` so the existing 17 LLM models don't need backfill.
 */
export const ModelDomainSchema = z.enum([
  'llm',          // GPT/Llama/DeepSeek family — autoregressive decoder
  'multimodal',   // text+vision+audio LLMs (Llama-Vision, Qwen-VL, Gemma-V)
  'vision',       // SAM/DINO/YOLO/RT-DETR — pure vision
  'speech',       // Whisper/ParlerTTS — encoder-decoder streaming
  'scientific',   // AlphaFold/GraphCast/NeuralGCM — HPC + simulation
  'recommender',  // DLRM-family — sparse embedding tables dominate
  'code',         // DeepSeek-Coder/Qwen-Coder — FIM mode prefill
  'rl',           // RL value/policy networks
  'graph'         // GNN-heavy (drug discovery, materials)
]);

/**
 * Workload kind — how inference proceeds at runtime. Drives calculator
 * assumptions about prefill/decode ratio, KV cache, batching strategy.
 */
export const WorkloadKindSchema = z.enum([
  'autoregressive-decode',   // LLM standard
  'encoder-only',            // SAM, BERT family
  'encoder-decoder',         // Whisper, T5
  'streaming',               // real-time speech, SSE
  'graph-iteration',         // GraphCast forecast loop, MD time-stepping
  'forward-only-batch',      // single-shot scientific inference (AlphaFold)
  'embedding-table-lookup'   // recommender — sparse + dense pipeline
]);

export const ModelSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  lab: Slug,
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  license: z.string().min(1),
  domain: ModelDomainSchema.default('llm'),
  workload_kind: WorkloadKindSchema.default('autoregressive-decode'),
  architecture: ArchitectureSchema,
  operator_decomposition: z.array(OperatorBreakdownSchema).default([]),
  modalities: z.array(ModalitySchema).min(1),
  weight_format: z.enum(['bf16', 'fp16', 'fp32', 'mixed']),
  paper_url: z.string().url().optional(),
  hf_url: z.string().url().optional(),
  github_url: z.string().url().optional(),
  notes: z.string().optional()
});

export type Model = z.infer<typeof ModelSchema>;
