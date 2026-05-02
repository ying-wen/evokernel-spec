import type { APIRoute } from 'astro';
import { getIsaPrimitives } from '~/lib/data';

/**
 * v2.6 / Layer A: ISA primitive catalog as JSON.
 *
 * Each entry describes a tensor / matrix / async-copy instruction at the
 * silicon level (WGMMA / TCGEN05 / MFMA / Cube / WMMA / TMA / AMX). The
 * keystone field is `cross_vendor_equivalents` — primitive-to-primitive
 * mapping for cross-vendor kernel codegen.
 *
 * Without this field, an agent cannot autonomously port a CUDA kernel to
 * CANN / HIP / MUSA when no library equivalent exists.
 */
export const GET: APIRoute = async () => {
  const items = await getIsaPrimitives();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'Layer A of the hw-software gap decomposition. Use cross_vendor_equivalents to translate a primitive (e.g., WGMMA m64n128k16) to its closest peer on another vendor (e.g., 4× MFMA 32x32x16 on AMD CDNA3). See docs/superpowers/specs/2026-05-02-hw-sw-gap.md and /agents/.',
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
