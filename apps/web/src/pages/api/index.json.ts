import type { APIRoute } from 'astro';
import {
  getVendors, getHardware, getServers, getInterconnects,
  getOperators, getEngines, getQuantizations, getParallelStrategies,
  getModels, getCases, getPatterns
} from '~/lib/data';

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://evokernel.dev')).toString().replace(/\/$/, '');
  const counts = await Promise.all([
    ['vendor', (await getVendors()).length],
    ['hardware', (await getHardware()).length],
    ['server', (await getServers()).length],
    ['interconnect', (await getInterconnects()).length],
    ['operator', (await getOperators()).length],
    ['engine', (await getEngines()).length],
    ['quantization', (await getQuantizations()).length],
    ['parallel-strategy', (await getParallelStrategies()).length],
    ['model', (await getModels()).length],
    ['case', (await getCases()).length],
    ['pattern', (await getPatterns()).length]
  ] as Array<[string, number]>);
  return new Response(JSON.stringify({
    name: 'EvoKernel Spec Open Data API',
    license: 'CC-BY-SA-4.0',
    code_license: 'Apache-2.0',
    version: 'v1',
    description: 'AI inference deployment knowledge base — hardware, models, cases.',
    generated: new Date().toISOString(),
    counts: Object.fromEntries(counts),
    endpoints: {
      hardware: `${base}/api/hardware.json`,
      models: `${base}/api/models.json`,
      cases: `${base}/api/cases.json`,
      rss_cases: `${base}/cases.xml`,
      sitemap: `${base}/sitemap-index.xml`
    },
    contribution: 'https://github.com/evokernel/evokernel-spec'
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
};
