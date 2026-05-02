import type { APIRoute } from 'astro';
import { getModels, getResolvedHardware } from '~/lib/data';

/**
 * v3.3 — Index of all (model, hardware) pairs for which an agent-context
 * bundle has been generated. Companion to
 * /api/agent-context/<model>-on-<hardware>.json.
 *
 * Use case: an LLM orchestrator wants to know "which (model, hw) combinations
 * does this corpus support?" before fetching individual bundles. This index
 * is a single 1-shot fetch listing all pairs + their direct URLs.
 */
export const GET: APIRoute = async () => {
  const [models, hardware] = await Promise.all([getModels(), getResolvedHardware()]);

  const pairs = [];
  for (const m of models) {
    for (const h of hardware) {
      pairs.push({
        model: m.id,
        hardware: h.id,
        url: `/api/agent-context/${m.id}-on-${h.id}.json`,
        archFamily: h.generation ?? h.id.split('-')[0],
        vendor: h.vendor.id,
      });
    }
  }

  return new Response(
    JSON.stringify(
      {
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        schema_version: 'agent-context-index/v1',
        notes:
          'v3.3 — index of pre-generated agent-context bundles. Each entry points to a static JSON containing the full knowledge bundle for that (model, hardware) pair. See /api/agent-context/* and docs/superpowers/specs/2026-05-03-productized-agent.md.',
        count: pairs.length,
        models: models.map((m) => m.id),
        hardware: hardware.map((h) => h.id),
        pairs,
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
