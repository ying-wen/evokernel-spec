import type { APIRoute } from 'astro';
import { getPlaybooks } from '~/lib/data';

/**
 * v2.4: machine-readable playbook catalog.
 *
 * Each playbook = (model archetype × hardware class) recipe with
 * recommended quantization, parallelism, engine, expected $/M-tokens range,
 * and links to validating cases. Primary input for agent constraint-solving.
 */
export const GET: APIRoute = async () => {
  const items = await getPlaybooks();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'Playbooks pre-encode "given (model archetype × hardware class), here is a known-working starting configuration". Agents can use this as a prior before constraint-solving. Use /api/solve.json for query-based ranked configs given specific SLA targets.',
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
