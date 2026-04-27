import type { APIRoute } from 'astro';
import { getResolvedHardware } from '~/lib/data';

export const GET: APIRoute = async () => {
  const hardware = await getResolvedHardware();
  return new Response(JSON.stringify({
    count: hardware.length,
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    items: hardware
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
};
