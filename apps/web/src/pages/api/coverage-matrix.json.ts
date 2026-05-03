import type { APIRoute } from 'astro';
import { getOperators, getKernelLibraries, getIsaPrimitives } from '~/lib/data';

/**
 * v2.6 / Layer E: Coverage matrix as flat JSON.
 *
 * Auto-derived from Layers A (ISA primitives), C (kernel libraries),
 * D (formal_semantics in operators). Materializes the question:
 *
 *   "For (operator, hardware_arch, library, precision), is there a
 *    fast kernel? Which library has it? At what coverage depth?"
 *
 * This is the single endpoint an agent queries before deciding "can I
 * deploy this op on this hardware?" Empty cells = either fallback path
 * (slow but correct) or genuine gap (custom kernel needed).
 *
 * See docs/superpowers/specs/2026-05-02-hw-sw-gap.md (Layer E).
 */

interface CoverageRow {
  operator_id: string;
  operator_class: string;       // matches kernel-library `covers_op_classes[].class`
  vendor: string;
  arch_family: string;
  library: string | null;       // null = no library coverage; agent fallback
  library_coverage: 'full' | 'partial' | 'experimental' | 'missing' | 'deprecated';
  isa_primitives: string[];     // tensor_isa from hardware → cross_vendor_equivalents enabled here
  precision_support: string[];  // intersection of operator + library + ISA dtype support
  has_formal_semantics: boolean; // Layer D — does the operator have edge cases / numerical rules documented?
  notes?: string;
}

// Operator-class normalization. Operator slug → coarse class (matches kernel-library schema).
function operatorClassOf(opId: string, opCategory: string): string {
  // Direct slug → class mappings
  const directMap: Record<string, string> = {
    'matmul': 'gemm',
    'grouped-matmul': 'grouped-gemm',
    'mla-attention': 'attention',
    'attention': 'attention',
    'scaled-dot-product-attention': 'flash-attention',
    'softmax': 'softmax',
    'online-softmax': 'softmax',
    'layer-norm': 'layer-norm',
    'rmsnorm': 'rms-norm',
    'rope': 'rope',
    'silu': 'rope', // closest pseudo-class for activation; refine later
    'swiglu': 'rope',
    'gelu': 'rope',
    'embedding-lookup': 'embedding',
    'quantize-dequantize': 'quantize-dequantize',
    'block-quantize': 'quantize-dequantize',
    'all-gather': 'all-gather',
    'allreduce': 'all-reduce',
    'all2all': 'all-reduce',
    'reduce-scatter': 'reduce-scatter',
    'moe-gate': 'moe-gate',
    'expert-permute': 'expert-permute',
    'speculative-verify': 'spec-decode-verify',
    'conv2d': 'conv2d',
    'top-k-sampling': 'top-k',
    'selective-scan': 'selective-scan',
    'mamba-conv1d': 'mamba-conv1d',
    'lora-bgmv': 'lora-bgmv',
    'index-put': 'kv-cache-page-write',
    'memcpy-async': 'kv-cache-page-write',
    'cross-entropy': 'reduce',
    'dropout': 'reduce',
    'repeat-interleave': 'reduce',
    'group-norm': 'layer-norm'
  };
  return directMap[opId] ?? opCategory;
}

export const GET: APIRoute = async () => {
  const [operators, libraries, primitives] = await Promise.all([
    getOperators(),
    getKernelLibraries(),
    getIsaPrimitives()
  ]);

  // Build arch_family → libraries map
  const archToLibs = new Map<string, typeof libraries>();
  for (const lib of libraries) {
    for (const arch of lib.target_archs) {
      if (!archToLibs.has(arch)) archToLibs.set(arch, []);
      archToLibs.get(arch)!.push(lib);
    }
  }

  // Discover all unique (vendor, arch_family) pairs from hardware + ISA primitives
  const archPairs = new Set<string>(); // "vendor::arch_family"
  for (const p of primitives) archPairs.add(`${p.vendor}::${p.arch_family}`);

  // Also include arch_families from libraries.target_archs
  for (const lib of libraries) {
    for (const a of lib.target_archs) {
      // Try to infer vendor from existing primitives; default to library's vendor
      let vendor = lib.vendor;
      const primMatch = primitives.find((p) => p.arch_family === a);
      if (primMatch) vendor = primMatch.vendor;
      archPairs.add(`${vendor}::${a}`);
    }
  }

  // Pre-compute hw arch → tensor_isa list (which primitive ids can be used on this arch)
  const archToIsa = new Map<string, Set<string>>();
  for (const p of primitives) {
    if (!archToIsa.has(p.arch_family)) archToIsa.set(p.arch_family, new Set());
    archToIsa.get(p.arch_family)!.add(p.id);
  }

  // Operators with formal_semantics
  const opsWithSemantics = new Set(
    operators.filter((o) => o.formal_semantics != null).map((o) => o.id)
  );

  const rows: CoverageRow[] = [];

  for (const op of operators) {
    const opClass = operatorClassOf(op.id, op.category);
    const hasFormal = opsWithSemantics.has(op.id);

    for (const archPair of archPairs) {
      const [vendor, archFamily] = archPair.split('::');
      if (!vendor || !archFamily) continue;

      // Find libraries serving this arch
      const libs = archToLibs.get(archFamily) ?? [];

      if (libs.length === 0) {
        // No library on this arch — emit a "missing" row
        rows.push({
          operator_id: op.id,
          operator_class: opClass,
          vendor,
          arch_family: archFamily,
          library: null,
          library_coverage: 'missing',
          isa_primitives: [...(archToIsa.get(archFamily) ?? new Set<string>())],
          precision_support: op.precision_support,
          has_formal_semantics: hasFormal,
          notes: 'No kernel library documented for this arch. Falls back to PyTorch eager / Triton template path (slow). Custom kernel may be required.'
        });
        continue;
      }

      // Pick the best-coverage library for this op-class (or first if all equal)
      const libCoverages = libs.map((lib) => {
        const entry = lib.covers_op_classes.find((c) => c.class === opClass);
        return { lib, coverage: entry?.coverage ?? 'missing', notes: entry?.notes };
      });
      // Sort: full > partial > experimental > missing > deprecated
      const order = { full: 0, partial: 1, experimental: 2, missing: 3, deprecated: 4 };
      libCoverages.sort((a, b) => order[a.coverage] - order[b.coverage]);
      const best = libCoverages[0];
      if (!best) continue;

      rows.push({
        operator_id: op.id,
        operator_class: opClass,
        vendor,
        arch_family: archFamily,
        library: best.lib.id,
        library_coverage: best.coverage,
        isa_primitives: [...(archToIsa.get(archFamily) ?? new Set<string>())],
        precision_support: best.lib.precision_support.filter((p) =>
          op.precision_support.length === 0 || op.precision_support.includes(p as any)
        ),
        has_formal_semantics: hasFormal,
        notes: best.notes
      });
    }
  }

  // Group stats
  const byCoverage = {
    full: rows.filter((r) => r.library_coverage === 'full').length,
    partial: rows.filter((r) => r.library_coverage === 'partial').length,
    experimental: rows.filter((r) => r.library_coverage === 'experimental').length,
    missing: rows.filter((r) => r.library_coverage === 'missing').length
  };

  return new Response(
    JSON.stringify(
      {
        schema_version: '1.0',
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        layer: 'E',
        derived_from: ['operators', 'kernel-libraries', 'isa-primitives'],
        count: rows.length,
        count_by_coverage: byCoverage,
        notes:
          'Auto-derived 4D coverage matrix. Each row answers "for (operator × hardware_arch), which library covers it, with what depth, and which ISA primitives are available?" Filter by `library_coverage === "missing"` to find PR opportunities (uncovered cells the agent must codegen).',
        query_examples: [
          {
            intent: 'Find missing-coverage cells (PR opportunities)',
            filter: 'rows.filter(r => r.library_coverage === "missing")'
          },
          {
            intent: 'Operators without library coverage on Ascend 910C',
            filter: 'rows.filter(r => r.arch_family === "ascend-910c" && r.library_coverage !== "full")'
          },
          {
            intent: 'For my agent, find ops with documented formal_semantics (safer to port)',
            filter: 'rows.filter(r => r.has_formal_semantics)'
          },
          {
            intent: 'For Hopper, list all available ISA primitives by op',
            filter: 'rows.filter(r => r.arch_family === "hopper").map(r => ({op: r.operator_id, isa: r.isa_primitives}))'
          }
        ],
        rows
      },
      null,
      2
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*'
      }
    }
  );
};
