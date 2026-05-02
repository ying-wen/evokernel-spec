import type { APIRoute } from 'astro';
import { getDslExamples } from '~/lib/data';

export const GET: APIRoute = async () => {
  const items = await getDslExamples();
  return new Response(JSON.stringify({
    count: items.length,
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    notes: 'v2.7 / Layer B made concrete. Hello-world / canonical kernel examples per programming language (CUDA / Ascend-C / HIP / Triton / etc.). Cross-references ISA primitives + kernel libraries.',
    items
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' }
  });
};
