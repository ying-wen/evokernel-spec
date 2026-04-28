import { z } from 'zod';
import { EvidenceSchema, ValueWithEvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const FormFactorSchema = z.enum([
  // Data-center accelerators (existing)
  'sxm', 'oam', 'pcie', 'nvl', 'proprietary',
  // v1.2: niche + edge categories
  'wafer-scale',     // Cerebras WSE — single-die, no HBM
  'edge-m2',         // M.2 form factor (Hailo, Coral)
  'embedded-soc',    // RK3588, Apple Silicon NPU portion
  'apu',             // CPU+GPU coherent (MI300A, GH200)
  'vector-card',     // NEC SX-Aurora
  'reconfigurable'   // SambaNova RDU
]);
export const HardwareStatusSchema = z.enum(['in-production', 'discontinued', 'taping-out', 'announced']);
export const MemoryTypeSchema = z.enum([
  'HBM2', 'HBM2e', 'HBM3', 'HBM3e', 'HBM4',
  'GDDR6', 'GDDR7',
  'LPDDR5', 'LPDDR5X', 'DDR5',
  'on-die-sram',          // Cerebras WSE-3, Groq LPU
  'on-package-sram',      // SambaNova SN40L
  'unknown'
]);

const ComputeSchema = z.object({
  fp4_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp8_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  bf16_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp16_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp32_tflops: ValueWithEvidenceSchema(z.number().nonnegative()).optional(),
  // v1.2: HPC + scientific computing critical
  fp64_tflops: ValueWithEvidenceSchema(z.number().nonnegative()).optional(),
  // v1.2: tf32 — common on NVIDIA/AMD AI ratings
  tf32_tflops: ValueWithEvidenceSchema(z.number().nonnegative()).optional(),
  int8_tops: ValueWithEvidenceSchema(z.number().nonnegative()),
  int4_tops: ValueWithEvidenceSchema(z.number().nonnegative()).optional(),
  // v1.2: edge inference rating
  tops_per_watt: ValueWithEvidenceSchema(z.number().nonnegative()).optional()
});

const MemorySchema = z.object({
  capacity_gb: ValueWithEvidenceSchema(z.number().positive()),
  bandwidth_gbps: ValueWithEvidenceSchema(z.number().positive()),
  type: MemoryTypeSchema
});

// Optional inner-architecture detail. When present, Topology renders a
// floorplan grounded in vendor data; when absent, Topology falls back to a
// bucketed inferred die diagram. Top-cited cards (H100, B200, MI355X,
// Ascend 910C, etc.) populate this; others can stay undefined.
const ArchitectureSchema = z.object({
  compute_unit_count: ValueWithEvidenceSchema(z.number().int().positive()).optional(),
  compute_unit_label: z.enum([
    'SM', 'CU', 'AI Core', 'IPU', 'XPU', 'Cluster',
    'Tile',          // Cerebras
    'PEs',           // Groq LPU (parallel processing elements)
    'RDU-Tile',      // SambaNova
    'Tensix',        // Tenstorrent
    'NeuralEngine',  // Apple, Qualcomm
    'NPU-Core'       // generic edge NPU
  ]).optional(),
  tensor_cores_per_cu: ValueWithEvidenceSchema(z.number().int().positive()).optional(),
  l1_cache_kb_per_cu: ValueWithEvidenceSchema(z.number().positive()).optional(),
  l2_cache_mb: ValueWithEvidenceSchema(z.number().positive()).optional(),
  hbm_stacks: ValueWithEvidenceSchema(z.number().int().positive()).optional(),
  // v1.2: niche on-die memory architectures (Cerebras 44 GB, Groq 230 MB)
  on_die_sram_mb: ValueWithEvidenceSchema(z.number().positive()).optional(),
  process_node_nm: ValueWithEvidenceSchema(z.number().positive()).optional(),
  die_area_mm2: ValueWithEvidenceSchema(z.number().positive()).optional(),
  transistor_count_b: ValueWithEvidenceSchema(z.number().positive()).optional(),
  pcie_gen: ValueWithEvidenceSchema(z.number().int().positive()).optional(),
  pcie_lanes: ValueWithEvidenceSchema(z.number().int().positive()).optional(),
  // v1.2: behavioral flags that change calculator semantics
  reconfigurable: z.boolean().optional(),         // SambaNova RDU
  deterministic_latency: z.boolean().optional(),  // Groq LPU
  wafer_scale: z.boolean().optional()             // Cerebras
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
  architecture: ArchitectureSchema.optional(),
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
