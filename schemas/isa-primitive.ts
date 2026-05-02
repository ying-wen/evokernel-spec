import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * ISA Primitive (v2.6 / Layer A of hw-sw gap decomposition).
 *
 * What this captures: the actual matrix / vector / tensor / async-copy
 * instructions the silicon exposes. WGMMA on Hopper. TCGEN05 on Blackwell.
 * MFMA on AMD CDNA. Cube unit on Ascend. AMX on Apple Silicon.
 *
 * The keystone field is `cross_vendor_equivalents` — a primitive-to-primitive
 * mapping table. Without this an agent cannot autonomously translate a CUDA
 * kernel to CANN / HIP / MUSA when no library equivalent exists.
 *
 * See docs/superpowers/specs/2026-05-02-hw-sw-gap.md (Layer A).
 */

export const IsaClassSchema = z.enum([
  'tensor-mma',         // matrix-multiply-accumulate (WGMMA / MFMA / Cube / AMX)
  'matrix-vector',      // mat-vec (smaller than full MMA)
  'reduction',          // tree / butterfly reductions
  'scan',               // prefix sum / online softmax-friendly
  'conv',               // dedicated convolution units
  'special-fn',         // exp / sqrt / rsqrt SFU
  'async-copy',         // TMA / direct memory async copy
  'sync',               // barriers / fences
  'shuffle'             // warp-shuffle / dpp
]);

const ShapeSchema = z.object({
  /** M dimension (rows of A). */
  M: z.number().int().positive().optional(),
  /** N dimension (cols of B / cols of C). Can be a list when multiple sizes supported. */
  N: z.union([z.number().int().positive(), z.array(z.number().int().positive())]).optional(),
  /** K dimension (inner / contraction). Can be a list. */
  K: z.union([z.number().int().positive(), z.array(z.number().int().positive())]).optional(),
  dtype_a: z.string().optional(),
  dtype_b: z.string().optional(),
  dtype_c: z.string().optional(),
  notes: z.string().optional()
});

const MemoryModelSchema = z.object({
  /** Where operand A is read from. */
  operand_a_source: z.enum(['shared-memory', 'registers', 'global-memory', 'l1-cache', 'on-chip-sram', 'other']).optional(),
  operand_b_source: z.enum(['shared-memory', 'registers', 'global-memory', 'l1-cache', 'on-chip-sram', 'other']).optional(),
  result_destination: z.enum(['registers', 'shared-memory', 'global-memory', 'on-chip-sram', 'other']).optional(),
  async: z.boolean().default(false),
  /** Async copy descriptor required (e.g., TMA on Hopper, OE/OQ on Ascend). */
  requires_descriptor: z.string().optional(),
  notes: z.string().optional()
});

const CallingConventionSchema = z.object({
  /** PTX / SASS / ROCm / etc. instruction string. */
  asm_intrinsic: z.string().optional(),
  /** C++ header for intrinsic wrapper. */
  cpp_intrinsic_header: z.string().optional(),
  /** CUTLASS / CK / etc. template tag for high-level dispatch. */
  template_tag: z.string().optional(),
  /** Vendor compiler frontend recommended (nvcc / hipcc / bisheng / etc.). */
  recommended_compiler: z.string().optional()
});

const CrossVendorEquivalentSchema = z.object({
  /** Vendor of the equivalent. */
  vendor: Slug,
  /** Arch family of the equivalent. */
  arch_family: z.string().min(1),
  /** ID of the equivalent ISA primitive (slug into data/isa-primitives/). */
  primitive_id: Slug,
  /** Mapping ratio when applicable (e.g., "1 WGMMA m64n64k16 = 4× Cube 16x16x16"). */
  mapping_ratio: z.string().optional(),
  /** Caveats — different shapes / dtypes / async patterns. */
  notes: z.string().optional()
});

export const IsaPrimitiveSchema = z.object({
  id: Slug,
  vendor: Slug,
  /** Arch-family identifier matching engine_implementations.hardware_arch tags. */
  arch_family: z.string().min(1),
  class: IsaClassSchema,
  name: z.string().min(1),
  description: z.string().optional(),

  /** Supported shape × dtype combinations. */
  shapes_supported: z.array(ShapeSchema).default([]),

  /** Where operands come from / where results go / async vs blocking. */
  memory_model: MemoryModelSchema.optional(),

  /** How to invoke this primitive — assembly intrinsic + C++ wrapper + template tag. */
  calling_convention: CallingConventionSchema.optional(),

  /**
   * THE KEYSTONE FIELD for cross-vendor kernel codegen.
   * Maps this primitive to functionally-equivalent primitives in other ISAs.
   */
  cross_vendor_equivalents: z.array(CrossVendorEquivalentSchema).default([]),

  /** Fused-kernel ids that consume this primitive (back-reference). */
  used_by_kernels: z.array(Slug).default([]),

  /** Documentation entry point. */
  docs_url: z.string().url().optional(),

  /** Free-form notes — quirks / restrictions / known issues. */
  notes: z.string().optional(),

  evidence: z.array(EvidenceSchema).default([])
});

export type IsaPrimitive = z.infer<typeof IsaPrimitiveSchema>;
export type IsaClass = z.infer<typeof IsaClassSchema>;
