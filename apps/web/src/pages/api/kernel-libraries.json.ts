import type { APIRoute } from 'astro';
import { getKernelLibraries } from '~/lib/data';

/**
 * v2.5 / Layer C: kernel-library catalog as JSON.
 *
 * Each entry describes an opaque-API library (cuBLAS / cuDNN / CUTLASS /
 * rocBLAS / MIOpen / CK / aclnn / CNNL) — its op coverage, API style,
 * precision support, cross-vendor equivalents, and porting caveats.
 *
 * Primary input for agent kernel-portability decisions: "I have a CUDA
 * kernel using cuBLAS — what's the equivalent on Ascend / AMD / Cambricon?"
 */
export const GET: APIRoute = async () => {
  const items = await getKernelLibraries();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'Layer C of the hw-software gap decomposition (see /agents/ + docs/superpowers/specs/2026-05-02-hw-sw-gap.md). Each library carries op-class coverage, API style, precision support, and cross_vendor_equivalents pointing to the equivalent op-class in other vendors\' libraries. Cross-reference with /api/operators.json for per-op kernel implementations.',
        items
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
