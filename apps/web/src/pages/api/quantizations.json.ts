import type { APIRoute } from 'astro';
import { getQuantizations } from '~/lib/data';

/**
 * Quantization scheme catalog as JSON.
 *
 * Each entry describes the storage format, calibration / conversion stage,
 * expected quality trade-off, and engine / hardware support. Agents use this
 * to avoid inventing quantization slugs outside data/quantizations/.
 */
export const GET: APIRoute = async () => {
  const items = await getQuantizations();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'Quantization schemes are fixed corpus entities. Use these slugs when planning convert/quantize stages instead of inventing new format names.',
        items,
      },
      null,
      2,
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      },
    },
  );
};
