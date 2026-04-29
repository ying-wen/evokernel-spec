/**
 * Single source of truth for the routes a deployment of evokernel-spec
 * MUST serve correctly. Imported by:
 *
 *   - apps/web/e2e/site.spec.ts        — runtime assertion (HTTP 200)
 *   - launch.sh (via scripts/print-critical-routes.ts) — startup smoke
 *   - .github/workflows/ci.yml         — same E2E target
 *
 * Why a shared list:
 *   When the smoke check in launch.sh and the E2E coverage drift, you
 *   end up with one passing while the other fails — a class of bug that
 *   wastes hours per occurrence. By making both consume this list,
 *   "add a critical route" becomes a 1-line change with both probes
 *   updated atomically.
 *
 * What qualifies as "critical":
 *   1. A user-facing entry point that, if 404, makes the site appear broken.
 *   2. An API endpoint that downstream tooling depends on.
 *   3. Both locales of the home (zh + en) — i18n regressions show up here first.
 *
 * What does NOT belong here:
 *   - Detail pages (/hardware/h100-sxm5/) — covered by their own deeper tests
 *   - Operator pages, vendor pages — not on the user's front-of-mind path
 */

export interface CriticalRoute {
  path: string;
  /** Why this route is on the must-work list. Surfaces in failure reports. */
  reason: string;
  /** Expected content-type prefix; null = don't assert. */
  contentType?: 'text/html' | 'application/json' | 'text/plain' | null;
}

export const CRITICAL_ROUTES: CriticalRoute[] = [
  { path: '/',                  reason: 'home (zh)',                contentType: 'text/html' },
  { path: '/en/',               reason: 'home (en) — i18n smoke',   contentType: 'text/html' },
  { path: '/hardware/',         reason: 'hardware catalog',         contentType: 'text/html' },
  { path: '/models/',           reason: 'models catalog',           contentType: 'text/html' },
  { path: '/cases/',            reason: 'cases leaderboard',        contentType: 'text/html' },
  { path: '/calculator/',       reason: 'calculator (Tier 0/1)',    contentType: 'text/html' },
  { path: '/pricing/',          reason: 'TCO ranking',              contentType: 'text/html' },
  { path: '/china/',            reason: 'China hub differentiator', contentType: 'text/html' },
  { path: '/showcase/',         reason: 'auto-insights',            contentType: 'text/html' },
  { path: '/quality/',          reason: 'data confidence dashboard', contentType: 'text/html' },
  { path: '/contribute/',       reason: 'contributor onboarding',    contentType: 'text/html' },
  { path: '/api/healthz',       reason: 'k8s liveness probe',        contentType: null }, // SSG strips text/plain
  { path: '/api/index.json',    reason: 'API descriptor',           contentType: 'application/json' }
];

/** Routes only — for shell scripts that just need the path list. */
export const CRITICAL_ROUTE_PATHS: readonly string[] = CRITICAL_ROUTES.map((r) => r.path);
