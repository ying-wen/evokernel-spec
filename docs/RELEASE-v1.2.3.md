# Release v1.2.3 — Public GitHub Pages Deployment

**Date**: 2026-04-29
**Live site**: <https://yingwen.io/evokernel-spec/>
**Git tag**: not yet (this is the deploy-prep release; tag follows next iteration)

## Headline

**EvoKernel Spec is now live on the public internet** — 265 pages,
31 hardware × 19 models × 22 measured deployment cases, all served
free via GitHub Pages. No signups, no rate limits, no JS-blocked
fallback page.

## What shipped

### Public deploy on GitHub Pages

- `.github/workflows/pages.yml` — 3-job CI (build → deploy → smoke)
  - Builds with `PUBLIC_DEPLOY=github-pages` env (Astro picks
    site=`yingwen.io`, base=`/evokernel-spec`)
  - Uses official `actions/deploy-pages@v4`
  - Post-deploy smoke hits 13 critical routes on the LIVE
    site — fails workflow on any non-200, catching base-path
    drift after the merge has already landed
- Triggered on push to `main` + manual dispatch
- Concurrency group `pages` cancels in-flight deploys when a new
  push lands (deploy-the-tip-of-main semantics)

### Base-path-aware link resolution

Every internal link in the site went through one of two helpers:

```ts
// apps/web/src/lib/i18n/index.ts
pathname('/calculator')          // → '/evokernel-spec/calculator' on GH Pages
                                 // → '/calculator'                on custom domain
localePath('en', '/hardware')    // → '/evokernel-spec/en/hardware' on GH Pages
```

Refactored:
- 45 raw `href="/foo"` literals across 16 files
- 30+ `href={\`/foo/\${id}/\`}` template literals across 30 files
- 38 files received a fresh `pathname` import via Python AST helper
- All React islands (Calculator.tsx, CaseCompare.tsx) too — Vite
  inlines `import.meta.env.BASE_URL` as a string literal at build
  time

This is the *single* mechanism that decides where links go. Two
deploy targets, one source tree, zero build flag forks.

### Hreflang / canonical correctness on subpath deploys

`BaseLayout.astro` now strips deploy-base off `Astro.url.pathname`
before computing the locale-swap counterpart, then re-prepends the
base. Before this fix, alternate URLs were malformed:

```
WRONG:  /en/evokernel-spec/foo
RIGHT:  /evokernel-spec/en/foo
```

This matters because Google's hreflang implementation is unforgiving
about malformed alternates — it silently drops them.

### Parallel deploy modes via env

```
PUBLIC_DEPLOY=github-pages   →  https://yingwen.io/evokernel-spec/   (default for the workflow)
PUBLIC_DEPLOY=custom-domain  →  https://evokernel.dev/                (default; used by ./launch.sh)
SITE_URL / BASE_PATH         →  override either, useful for forks
```

A fork operator pointing at their own custom domain just sets:

```bash
SITE_URL=https://my-site.example.com BASE_PATH=/ pnpm build
```

— no code changes.

## Verification

| Check | Result |
|---|---|
| Live: `/`, `/hardware/`, `/models/`, `/cases/`, `/calculator/`, `/pricing/`, `/china/`, `/showcase/`, `/quality/`, `/contribute/`, `/en/`, `/en/hardware/`, `/en/contribute/` | 13/13 → 200 ✅ |
| Live: `/api/healthz`, `/api/index.json` | 2/2 → 200 ✅ |
| Live: page content rendered (sniff "任意模型 → 任意硬件") | ✅ |
| Local E2E (default build) | 110/110 ✅ |
| Local E2E (PUBLIC_DEPLOY=github-pages mirror via python http.server) | 10/10 critical routes ✅ |
| Astro stricter type-check (`astro check`) | 0 errors ✅ |
| TS strict (`tsc --noEmit`) | clean ✅ |

## Known issues introduced by this release

- **`/api/health.json` HTTP status** — same pre-existing issue as
  on custom-domain builds: degraded probes return body=503 but HTTP
  200, because the static SSG export can't honor `Response.status`.
  Documented in [docs/KNOWN_ISSUES.md](KNOWN_ISSUES.md).
- **First-deploy CI failure** — pnpm/action-setup v4 errored due to
  a conflict between the action's `version: 9` input and our
  `package.json.packageManager: pnpm@10.32.1`. Fixed in second push
  by dropping the action input entirely, letting `packageManager`
  be the single source of truth for pnpm version.

## Next iterations

- Add a `lighthouse` job to the pages workflow (post-deploy perf
  budget, not just route-200 smoke)
- Wire pages.yml smoke routes to share `critical-routes.ts` like
  launch.sh does (currently they're duplicated as a hardcoded bash
  array — same drift class we already fixed for launch.sh)
- Custom domain swap if/when `evokernel.dev` is ready: add a
  `public/CNAME` containing the apex domain, GitHub Pages auto-
  detects on next deploy

## Acknowledgments

- GitHub Pages free hosting + Actions free CI for public repos —
  the entire economic premise of this project's "no backend, no
  rate limit, free-for-all-time" pitch
- Astro's first-class `base` config + `import.meta.env.BASE_URL`
  injection — 75 hardcoded paths fixed with one helper, not 75
  individual edits

---

**Try it now**: <https://yingwen.io/evokernel-spec/>
