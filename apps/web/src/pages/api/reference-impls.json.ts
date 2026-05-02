import type { APIRoute } from 'astro';
import { getReferenceImpls } from '~/lib/data';

export const GET: APIRoute = async () => {
  const items = await getReferenceImpls();
  return new Response(JSON.stringify({
    count: items.length,
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    notes: 'v2.7. Concrete production-grade implementations of high-impact operators (GEMM / attention / MoE) per hardware arch. Cross-references ISA primitives + kernel libraries + DSL examples. Read these to compare how the same algorithm manifests across vendors.',
    items
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' }
  });
};
