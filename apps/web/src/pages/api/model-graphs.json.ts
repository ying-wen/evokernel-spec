import type { APIRoute } from 'astro';
import { getModelGraphs } from '~/lib/data';

/**
 * v2.8: model execution graphs as JSON.
 *
 * Per-(model × phase) ordered op call sequence with parameterized shape
 * templates. Bridges high-level architecture to low-level ops, enabling
 * agents to compute per-token resource estimates from formulas.
 */
export const GET: APIRoute = async () => {
  const items = await getModelGraphs();
  return new Response(
    JSON.stringify({
      count: items.length,
      license: 'CC-BY-SA-4.0',
      generated: new Date().toISOString(),
      notes:
        'v2.8 — bridges model architecture (high-level) to operator catalog (low-level). Each entry is one (model × phase) graph: ordered op_call sequence with shape_template parameterized by {batch, seq_len, layer_idx, ...}. Combined with operator FLOPs/bytes formulas and hardware specs, agents can predict per-token resource use without measured cases.',
      items
    }, null, 2),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*'
      }
    }
  );
};
