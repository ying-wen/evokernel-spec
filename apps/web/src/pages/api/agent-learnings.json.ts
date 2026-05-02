import type { APIRoute } from 'astro';
import { getAgentLearnings } from '~/lib/data';

/**
 * v2.20 — agent learnings (Layer F: feedback loop).
 *
 * Structured knowledge captured from past agent deployment runs:
 * kernel gaps, perf cliffs, numerical mismatches, version skews, success
 * patterns. Future agent runs query this to start smarter (avoid repeating
 * gap-discovery work) and human reviewers see a triage queue of corpus
 * updates to land.
 *
 * v2.20 ships the schema + 3 seed entries; v2.24 wires automatic writeback
 * from scripts/agent-deploy/.
 */
export const GET: APIRoute = async () => {
  const items = await getAgentLearnings();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'v2.20 — agent learnings: structured knowledge from past deployments. Each entry maps observations (kernel-gap, perf-cliff, numerical-mismatch, etc.) to proposed corpus updates. The "knowledge feedback loop" surface — agent runs feed back to enrich the corpus.',
        items,
      },
      null,
      2
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      },
    }
  );
};
