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

// Per-level memory entry: a slab of on-chip storage (register file, L1/SMEM,
// L2 cache, on-package SRAM). Each slab carries size and (often) bandwidth.
// All sub-fields are optional because vendor disclosure varies — Hopper
// publishes everything; Ascend/Hygon publish only headline numbers.
const MemoryLevelSchema = z.object({
  /** What this slab is called in vendor literature ("Shared Memory", "L1", "Register File"). */
  name: z.string().min(1),
  /** Per-CU when scope='per-cu'; total chip-wide when scope='global'. */
  scope: z.enum(['per-cu', 'global']).default('global'),
  size_kb: ValueWithEvidenceSchema(z.number().positive()).optional(),
  size_mb: ValueWithEvidenceSchema(z.number().positive()).optional(),
  /** Steady-state bandwidth (TB/s for L2/HBM, GB/s typical for SMEM/RF). */
  bandwidth_tbs: ValueWithEvidenceSchema(z.number().positive()).optional(),
  /** Latency in cycles when published (rare). */
  latency_cycles: ValueWithEvidenceSchema(z.number().positive()).optional(),
  /** Free-form notes (e.g. "configurable as L1 or SMEM" on Hopper). */
  notes: z.string().optional()
});

// Per-precision peak compute entry. The top-level ComputeSchema gives
// chip-wide TFLOPS; this gives "per-tensor-core per-cycle" for engineers
// reasoning about kernel scheduling. Optional because most vendors only
// publish chip-level peaks.
const TensorCoreSpecSchema = z.object({
  precision: z.enum(['fp4', 'fp8', 'bf16', 'fp16', 'fp32', 'tf32', 'int8', 'int4']),
  /** Per-tensor-core, per-cycle peak ops (matmul-equivalent). */
  ops_per_cycle: ValueWithEvidenceSchema(z.number().positive()).optional(),
  /** Sparsity multiplier applied (1× = dense, 2× = 2:4 structured sparse). */
  sparsity_multiplier: z.number().positive().default(1)
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
  wafer_scale: z.boolean().optional(),            // Cerebras

  // v1.3: rich memory hierarchy — register file → L1/SMEM → L2 → HBM/SRAM
  // Ordered list (closest to compute first). Lets the detail page render
  // the layered storage stack engineers actually care about for kernel
  // scheduling decisions.
  memory_hierarchy: z.array(MemoryLevelSchema).default([]),

  // v1.3: per-precision tensor-core peak per cycle (rare disclosure).
  tensor_core_specs: z.array(TensorCoreSpecSchema).default([]),

  // v1.3: clock domains
  base_clock_mhz: ValueWithEvidenceSchema(z.number().positive()).optional(),
  boost_clock_mhz: ValueWithEvidenceSchema(z.number().positive()).optional(),

  // v1.3: on-chip / on-package interconnect (NoC). Important for chiplet
  // designs (B200's NV-HBI, MI300X's Infinity Fabric, Ascend's HCCS-C2C).
  on_chip_interconnect: z.object({
    name: z.string().min(1),
    bandwidth_tbs: ValueWithEvidenceSchema(z.number().positive()).optional(),
    notes: z.string().optional()
  }).optional()
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
  power: z.object({
    tdp_w: ValueWithEvidenceSchema(z.number().positive()),
    // v2.1: power & thermal envelope axis (all optional)
    /** Sustained / continuous power under typical inference workload. Often less than TDP. */
    sustained_w: ValueWithEvidenceSchema(z.number().positive()).optional(),
    /** Peak / boost power. Often higher than TDP for short bursts (training spikes). */
    peak_w: ValueWithEvidenceSchema(z.number().positive()).optional(),
    /** Cooling type. Drives data-center / chassis design. */
    cooling: z.enum([
      'air',                    // standard air cooling
      'liquid-direct',          // direct-to-chip liquid (cold plate)
      'liquid-immersion',       // submerged in dielectric fluid
      'hybrid-air-liquid',      // air for memory + liquid for die
      'phase-change',           // 2-phase (boiling) immersion
      'passive-conduction',     // edge / embedded — no fan
      'unknown'
    ]).optional(),
    /** Operating temperature range (°C). Min/max ambient supported. */
    operating_temp_c: z.object({
      min: z.number().optional(),
      max: z.number().optional()
    }).optional(),
    /** Maximum die / junction temperature before throttle (°C). */
    throttle_temp_c: z.number().optional(),
    /** Inference perf / watt — fp16 TFLOPS / TDP. Auto-derivable but storing makes ranking fast. */
    fp16_tflops_per_watt: ValueWithEvidenceSchema(z.number().positive()).optional(),
    /** Inference perf / watt — int8 TOPS / TDP. */
    int8_tops_per_watt: ValueWithEvidenceSchema(z.number().positive()).optional(),
    /** Power connector type (PCIe form factor). 12V-2x6 / 12VHPWR / EPS / SXM-board / etc. */
    power_connector: z.string().optional(),
    notes: z.string().optional()
  }),
  software_support: SoftwareSupportSchema,
  aliases: z.array(z.string()).default([]),
  chinese_names: z.array(z.string()).default([]),
  photos: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).min(1, 'at least one evidence required'),
  disclaimers: z.array(z.string()).default([])
});

export type Hardware = z.infer<typeof HardwareSchema>;
