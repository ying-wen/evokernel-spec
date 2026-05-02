import type { APIRoute } from 'astro';
import { getEngines } from '~/lib/data';

/**
 * Engine catalog as JSON. Each entry carries the v1.42 capability matrix
 * (quantization formats, parallelism modes, serving features, spec decoding
 * methods, frontend protocols, deployment targets, production readiness)
 * plus strengths / weaknesses / best-for narrative fields.
 */
export const GET: APIRoute = async () => {
  const items = await getEngines();
  return new Response(JSON.stringify({
    count: items.length,
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    notes: '7 inference engines with full capability matrix. See /engines/compare/ for the visual matrix view.',
    items
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' }
  });
};
