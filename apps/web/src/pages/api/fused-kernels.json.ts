import type { APIRoute } from 'astro';
import { getFusedKernels } from '~/lib/data';

/**
 * v2.4: machine-readable fused-kernel catalog.
 *
 * Each fused kernel lists which operators it folds, which engines ship it, and
 * which hardware archs have native implementations. This is the primary
 * source for understanding "which production kernel covers my (op-set, hw)
 * combination" — answering questions agents ask before kernel codegen.
 */
export const GET: APIRoute = async () => {
  const items = await getFusedKernels();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'Each fused-kernel entry carries operators_folded (which atomic ops are merged) + engine_implementations (per-vendor fast-path coverage). Cross-reference with /api/operators.json to compute "which atomic ops still need a kernel for hardware X". See /operators/fusion-graph/ for visualization.',
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
