import type { APIRoute } from 'astro';
import { getOperators } from '~/lib/data';

/**
 * v2.4: machine-readable operator catalog.
 *
 * Includes per-operator FLOPs/byte formulas, arithmetic intensity, fusion targets,
 * engine_implementations (with hardware_arch tags), precision support.
 *
 * Consumers: agent kernel-codegen pipelines / cross-vendor portability tools
 * / external embedding indexers.
 */
export const GET: APIRoute = async () => {
  const items = await getOperators();
  return new Response(
    JSON.stringify(
      {
        count: items.length,
        license: 'CC-BY-SA-4.0',
        generated: new Date().toISOString(),
        notes:
          'Each operator carries flops_formula / bytes_formula / arithmetic_intensity_typical for roofline reasoning. engine_implementations[].hardware_arch tags indicate which hardware archs have native fast kernels. See /operators/hardware-fitness/ for a derived matrix view.',
        items
      },
      null,
      2
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*'
      }
    }
  );
};
