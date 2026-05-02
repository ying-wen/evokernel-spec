import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * Kernel library catalog (v2.5 / Layer C of hw-sw gap decomposition).
 *
 * What this captures: the high-level opaque APIs that ship most production ops
 * without requiring custom kernel writing. cuBLAS / cuDNN / CUTLASS on NVIDIA;
 * rocBLAS / MIOpen / CK on AMD; aclnn / ATB on Huawei Ascend; CNNL on Cambricon;
 * MPSGraph on Apple. Each library has different API style, op coverage,
 * precision support, and porting caveats.
 *
 * Composes with operator entries via `OperatorSchema.engine_implementations[].kernel_library`.
 *
 * See docs/superpowers/specs/2026-05-02-hw-sw-gap.md for the 5-layer model.
 */

export const ApiStyleSchema = z.enum([
  'opaque-handle',          // cuBLAS / cuDNN — opaque handle + parameters
  'template',               // CUTLASS / CK — C++ template instantiation
  'workspace-executor',     // aclnn — explicit workspace + executor pattern
  'graph-based',            // MPSGraph — build a graph, then execute
  'function-call',          // simple stateless function (e.g., XNNPACK)
  'mixed'                   // library spans multiple styles
]);
export type ApiStyle = z.infer<typeof ApiStyleSchema>;

export const CoverageDepthSchema = z.enum([
  'full',          // mature, well-tested
  'partial',       // some shapes / dtypes / variants missing
  'experimental',  // shipped but not recommended for production
  'missing',       // no implementation
  'deprecated'     // was supported, now removed
]);
export type CoverageDepth = z.infer<typeof CoverageDepthSchema>;

const OpCoverageEntrySchema = z.object({
  /** Operator class — coarse-grained category. Not 1:1 with operator IDs. */
  class: z.enum([
    'gemm', 'gemv', 'batched-gemm', 'grouped-gemm',
    'attention', 'flash-attention', 'paged-attention',
    'layer-norm', 'rms-norm', 'softmax', 'fused-mask-softmax',
    'rope', 'embedding', 'quantize-dequantize',
    'reduce', 'all-reduce', 'all-gather', 'reduce-scatter',
    'moe-gate', 'expert-permute', 'spec-decode-verify',
    'conv2d', 'conv3d', 'depthwise-conv', 'pool',
    'rng', 'sort', 'top-k', 'cumsum',
    'selective-scan', 'mamba-conv1d',
    'lora-bgmv', 'kv-cache-quant', 'kv-cache-page-write'
  ]),
  coverage: CoverageDepthSchema,
  notes: z.string().optional()
});

const CrossVendorEquivalentSchema = z.object({
  /** Library id (slug) of the equivalent. */
  library: Slug,
  /** What op-class the equivalence applies to. */
  op_class: z.string().min(1),
  /** Brief description of equivalence — "1:1" or "different params" or "needs translation". */
  equivalence: z.string().min(1),
  /** Caveats — different defaults, different numerical behavior, different layout. */
  notes: z.string().optional()
});

export const KernelLibrarySchema = z.object({
  id: Slug,
  name: z.string().min(1),
  vendor: Slug,
  /** Kernel programming language used internally. References vendor.software_stack.kernel_languages. */
  language: z.string().min(1),
  /** API style — drives codegen template choice. */
  api_style: ApiStyleSchema,

  /** Hardware archs this library targets. */
  target_archs: z.array(z.string()).min(1),

  /** Per-op-class coverage — the answer to "does this lib have op X?". */
  covers_op_classes: z.array(OpCoverageEntrySchema).min(1),

  /** Precisions natively supported. */
  precision_support: z.array(z.string()).default([]),

  /** Skeleton ABI signature pattern — what calls look like. */
  abi_signature_pattern: z.string().optional(),
  /** Header includes for codegen. */
  include_paths: z.array(z.string()).default([]),
  /** Linker flags for build. */
  linker_flags: z.array(z.string()).default([]),

  /** Latest version on the public release line. */
  latest_version: z.string().optional(),
  /** Maturity — affects agent's confidence when picking it. */
  maturity: z.enum(['experimental', 'beta', 'stable', 'production', 'deprecated']).default('stable'),

  /** Cross-vendor mapping — primary input for kernel-portability decisions. */
  cross_vendor_equivalents: z.array(CrossVendorEquivalentSchema).default([]),

  /** Documentation entry point. */
  docs_url: z.string().url().optional(),
  /** Source / release URL. */
  source_url: z.string().url().optional(),

  /** Free-form notes covering quirks / known limitations. */
  notes: z.string().optional(),

  /** Things that bite when porting kernels FROM CUDA TO this library. */
  porting_caveats_from_cuda: z.array(z.string()).default([]),

  evidence: z.array(EvidenceSchema).default([])
});

export type KernelLibrary = z.infer<typeof KernelLibrarySchema>;
