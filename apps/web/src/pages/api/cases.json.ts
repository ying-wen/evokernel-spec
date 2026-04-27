import type { APIRoute } from 'astro';
import { getResolvedCases } from '~/lib/data';

export const GET: APIRoute = async () => {
  const items = await getResolvedCases();
  return new Response(JSON.stringify({
    count: items.length,
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    items
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
};
