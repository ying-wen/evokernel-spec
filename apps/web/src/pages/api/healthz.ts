import type { APIRoute } from 'astro';

/**
 * /api/healthz — minimal liveness probe.
 *
 * Companion to /api/health.json:
 *   - /api/healthz       → 6 bytes plain text "ok" + 200 (this file)
 *   - /api/health.json   → full corpus snapshot + 503 on degradation
 *
 * Use this for load-balancer / K8s livenessProbe / Cloudflare Healthcheck
 * monitors that just need a fast 200 with minimal payload. The expensive
 * corpus loading lives in /api/health.json for monitors that want
 * structured introspection.
 *
 * Why a separate endpoint:
 *   - Load balancer probes typically poll every 1-5s. Dispatching the
 *     full corpus loader (~10 entity types) per probe wastes CPU and
 *     can mask transient slowness behind the k=2 retry semantics.
 *   - K8s liveness probes prefer text/plain so any container shell can
 *     `curl localhost:8080/healthz` from a busybox sidecar.
 *
 * SSG note: In Astro's static export, the Response headers below
 * (content-type, cache-control, x-evokernel) are stripped by the
 * static file server and the receiver infers content-type from the
 * file extension. For probes that require correct content-type or
 * cache hints, either:
 *   (a) deploy behind Cloudflare Pages / nginx with explicit Location
 *       overrides in the host config, or
 *   (b) flip this single route to SSR (`export const prerender = false`)
 *       — but that requires a Node/edge runtime instead of pure static.
 */
export const GET: APIRoute = () => {
  return new Response('ok\n', {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'x-evokernel': 'live'
    }
  });
};
