import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9.-]+$/);

export const ModelFamilySchema = z.enum(['dense', 'moe', 'hybrid']);

const MoEConfigSchema = z.object({
  num_experts: z.number().int().positive(),
  top_k: z.number().int().positive(),
  expert_hidden_size: z.number().int().positive(),
  shared_experts: z.number().int().nonnegative().default(0)
});

const ArchitectureSchema = z
  .object({
    family: ModelFamilySchema,
    total_params_b: z.number().positive(),
    active_params_b: z.number().positive(),
    layers: z.number().int().positive(),
    hidden_size: z.number().int().positive(),
    ffn_size: z.number().int().positive(),
    num_attention_heads: z.number().int().positive(),
    num_kv_heads: z.number().int().positive(),
    head_dim: z.number().int().positive(),
    vocab_size: z.number().int().positive(),
    max_context_length: z.number().int().positive(),
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
  });

const OperatorBreakdownSchema = z.object({
  operator: Slug,
  flops_per_token: z.number().nonnegative(),
  bytes_per_token: z.number().nonnegative(),
  notes: z.string().optional()
});

export const ModalitySchema = z.enum(['text', 'vision', 'audio', 'video']);

export const ModelSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  lab: Slug,
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  license: z.string().min(1),
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
