import { z } from 'zod';
import { EvidenceSchema, ValueWithEvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const FormFactorSchema = z.enum(['sxm', 'oam', 'pcie', 'nvl', 'proprietary']);
export const HardwareStatusSchema = z.enum(['in-production', 'discontinued', 'taping-out', 'announced']);
export const MemoryTypeSchema = z.enum([
  'HBM2', 'HBM2e', 'HBM3', 'HBM3e', 'HBM4', 'GDDR6', 'LPDDR5', 'unknown'
]);

const ComputeSchema = z.object({
  fp4_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp8_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  bf16_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp16_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp32_tflops: ValueWithEvidenceSchema(z.number().nonnegative()).optional(),
  int8_tops: ValueWithEvidenceSchema(z.number().nonnegative()),
  int4_tops: ValueWithEvidenceSchema(z.number().nonnegative()).optional()
});

const MemorySchema = z.object({
  capacity_gb: ValueWithEvidenceSchema(z.number().positive()),
  bandwidth_gbps: ValueWithEvidenceSchema(z.number().positive()),
  type: MemoryTypeSchema
});

const ScaleUpSchema = z.object({
  protocol: z.string().min(1),
  bandwidth_gbps: z.number().positive(),
  world_size: z.number().int().positive(),
  topology: z.string().min(1),
  switch: z.string().optional()
});

const ScaleOutSchema = z.object({
  bandwidth_gbps_per_card: z.number().nonnegative(),
  protocol: z.string().min(1),
  nic: z.string().optional()
});

const SoftwareSupportSchema = z.object({
  drivers: z.array(z.string()).default([]),
  engines: z
    .array(
      z.object({
        id: Slug,
        status: z.enum(['officially-supported', 'community-port', 'unsupported']),
        versions: z.array(z.string()).default([]),
        notes: z.string().optional()
      })
    )
    .default([]),
  quantizations: z.array(Slug).default([]),
  parallelism: z.array(Slug).default([])
});

export const HardwareSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  vendor: Slug,
  generation: z.string().min(1),
  status: HardwareStatusSchema,
  release_year: z.number().int().min(2010).max(2035),
  form_factor: FormFactorSchema,
  compute: ComputeSchema,
  memory: MemorySchema,
  scale_up: ScaleUpSchema,
  scale_out: ScaleOutSchema,
  power: z.object({ tdp_w: ValueWithEvidenceSchema(z.number().positive()) }),
  software_support: SoftwareSupportSchema,
  aliases: z.array(z.string()).default([]),
  chinese_names: z.array(z.string()).default([]),
  photos: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).min(1, 'at least one evidence required'),
  disclaimers: z.array(z.string()).default([])
});

export type Hardware = z.infer<typeof HardwareSchema>;
