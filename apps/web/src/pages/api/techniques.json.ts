import type { APIRoute } from 'astro';
import { getTechniques } from '~/lib/data';

/**
 * v3.29: research-technique catalog as JSON.
 *
 * Each technique carries `port_targets[]` per arch_family (hopper, ada,
 * ampere, ascend-da-vinci-3, cdna3, cambricon-mlu, ...). The agent CLI
 * reads this via `--technique <id>` and uses the matching port_target's
 * status (planned / experimental / production-ready / reference-impl /
 * blocked) to decide whether to greenfield-generate, iterate, or just
 * surface the existing reference.
 *
 * Consumers: external agents / cross-vendor portability dashboards.
 */
export const GET: APIRoute = async () => {
  const items = await getTechniques();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'Each technique declares port_targets[] per arch_family. The arch_family slug must match a hardware microarchitecture (preferred), generation, or vendor — see deriveArchCandidates in scripts/agent-deploy/load-technique.ts for the resolution order.',
        items,
      },
      null,
      2,
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    },
  );
};
