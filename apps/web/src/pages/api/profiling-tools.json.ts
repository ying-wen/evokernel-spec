import type { APIRoute } from 'astro';
import { getProfilingTools } from '~/lib/data';

export const GET: APIRoute = async () => {
  const items = await getProfilingTools();
  return new Response(JSON.stringify({
    count: items.length,
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    notes: 'v2.7. Profiling tool registry per vendor — NCU / nsight-systems / rocprof / msprof / cnperf / suprof. Each entry includes invocation example, what-it-measures, output formats, and cross_vendor_equivalents (the "rocprof-equivalent of NCU?" map).',
    items
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' }
  });
};
