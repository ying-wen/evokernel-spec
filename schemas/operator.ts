import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const OperatorCategorySchema = z.enum([
  'matmul', 'attention', 'norm', 'activation', 'embedding',
  'moe-routing', 'communication', 'memory', 'misc'
]);

const PrecisionSupportSchema = z.enum([
  'fp4', 'fp8-e4m3', 'fp8-e5m2', 'bf16', 'fp16', 'fp32',
  'int4-awq', 'int4-gptq', 'int8'
]);

/**
 * One concrete kernel implementation of an operator. Captures who shipped it,
 * on what hardware it runs natively, and the public reference for digging in.
 */
const KernelImplementationSchema = z.object({
  /** Human name: "vLLM CUDA kernel", "TensorRT-LLM trtllm.attention". */
  name: z.string().min(1),
  /** Engine slug (vllm/sglang/tensorrt-llm/lmdeploy/mindie/...) or null for primitive. */
  engine_id: Slug.optional(),
  /** Hardware-architecture tags this kernel hits the fast path on. */
  hardware_arch: z.array(z.string()).default([]),
  /** Source-code or docs URL. */
  url: z.string().url().optional(),
  /** Notes (perf, limitations). */
  notes: z.string().optional()
});

const ReferenceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  source_type: z.enum(['paper', 'blog', 'implementation', 'docs', 'talk', 'other']).default('other')
});

export const OperatorSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  category: OperatorCategorySchema,

  // Roofline math — formulas are reference-only here; the calculator
  // substitutes model architecture variables at runtime.
  flops_formula: z.string().min(1),
  bytes_formula: z.string().min(1),
  /** FLOP/byte symbolic form. Critical for compute-vs-memory bound decisions. */
  arithmetic_intensity_formula: z.string().optional(),
  /** Typical AI numeric range — used to position the op against HW ridge points. */
  arithmetic_intensity_typical: z.object({
    min: z.number().positive(),
    max: z.number().positive(),
    notes: z.string().optional()
  }).optional(),

  description: z.string().min(1),
  /** Variants of the same operation (multi-head, multi-query, MLA, ...). */
  variants: z.array(Slug).default([]),

  // Operator fusion landscape — what this iteration unlocks.
  // ---------------------------------------------------------
  /** Operators this one commonly fuses with. */
  fusion_targets: z.array(Slug).default([]),
  /** Named fused kernels that include this op (slugs into data/fused-kernels/). */
  participates_in_fused_kernels: z.array(Slug).default([]),

  /** Concrete kernel implementations across engines. */
  engine_implementations: z.array(KernelImplementationSchema).default([]),
  /** Precisions this op supports natively. */
  precision_support: z.array(PrecisionSupportSchema).default([]),

  /** Patterns that affect this op's execution. */
  related_patterns: z.array(Slug).default([]),
  /** External references (paper / blog / impl). */
  references: z.array(ReferenceSchema).default([])
});

export type Operator = z.infer<typeof OperatorSchema>;
export type KernelImplementation = z.infer<typeof KernelImplementationSchema>;
export type PrecisionSupport = z.infer<typeof PrecisionSupportSchema>;
