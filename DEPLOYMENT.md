# Deployment Guide

This is a fully static site — `pnpm build` produces a `apps/web/dist/` directory that can be served by any static host. The recommended target is **Cloudflare Pages** (free tier sufficient for the V1 traffic envelope).

## Releasing a versioned offline tarball

Maintainers cut a versioned release by tagging:

```bash
git tag -a v1.1.0 -m "v1.1.0 — pricing page + 31 hardware + offline tarball"
git push origin v1.1.0
```

This triggers `.github/workflows/release.yml`, which:

1. Validates the data corpus
2. Builds the static site
3. Runs `pack:dist` to produce the offline tarball + sha256 + MANIFEST.json
4. Stages a stable-named copy (`evokernel-spec-v1.1.0.tar.gz`) alongside the
   provenance-named copy (`evokernel-spec-{sha}-{ts}.tar.gz`)
5. Generates release notes from commits since the previous tag
6. Publishes a GitHub Release with both tarballs + sha256 sidecars attached

Tags matching `v*-*` (e.g. `v1.1.0-rc1`) are auto-marked as
**prereleases** so they don't take over the "Latest" badge.

End users can then:

```bash
wget https://github.com/{owner}/evokernel-spec/releases/download/v1.1.0/evokernel-spec-v1.1.0.tar.gz
wget https://github.com/{owner}/evokernel-spec/releases/download/v1.1.0/evokernel-spec-v1.1.0.tar.gz.sha256
sha256sum -c evokernel-spec-v1.1.0.tar.gz.sha256
tar -xzf evokernel-spec-v1.1.0.tar.gz
npx serve dist
```

The MANIFEST.json inside the tarball contains build SHA, page count,
entity counts, and is `ManifestSchema`-validated by `pack-dist` —
receivers can re-validate offline:

```bash
node -e "const m = require('./dist/MANIFEST.json'); console.log(m.product, m.version, m.build.sha)"
```

## Local production (one-command launch)

For local hosting, demos, or air-gapped environments, the repo ships a single
launch script with full readiness verification:

```bash
./launch.sh
```

What it does (idempotent — safe to re-run):

1. Frees port 4321 (kills any prior listener)
2. `pnpm install` if `node_modules/` missing
3. Validates the data corpus (`pnpm validate` → zod + cross-refs)
4. `pnpm build` → 237+ static pages in `apps/web/dist/`
5. Starts `pnpm preview` detached, logs to `.runtime/preview.log`
6. Polls `/api/health.json` until `status: ok` (timeout 30 s, returns 503 on degraded corpus)
7. Smoke-checks 8 critical routes (`/`, `/hardware/`, `/cases/`, `/calculator/`, `/pricing/`, `/china/`, `/en/`, `/models/`)
8. Prints live URL + build SHA + stop instructions

Flags:

| Flag | Effect |
|---|---|
| `--no-build` | Reuse existing `apps/web/dist/` (faster restart) |
| `--no-validate` | Skip data validation |
| `--stop` | Cleanly kill the running preview |
| `--help` | Show inline help |

Environment overrides:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4321` | Server port |
| `HOST` | `127.0.0.1` | Bind address (set to `0.0.0.0` to expose on LAN) |

Health endpoint contract:

```bash
curl -s http://127.0.0.1:4321/api/health.json
```

```json
{
  "status": "ok",                    // "degraded" → HTTP 503
  "name": "evokernel-spec",
  "version": "v1.1",
  "build": { "sha": "...", "built_at": "..." },
  "served_at": "...",
  "data_loaded": { "hardware": 31, "models": 17, "cases": 22, ... }
}
```

Readiness contract: the probe returns `503 + status:degraded` when the
corpus loader fails OR returns zero hardware/models — so external uptime
monitors (statuscake, uptime-robot, cloudflare healthchecks) get a real
signal instead of a false-positive 200.

### Use systemd / launchd to keep it running across reboots

```ini
# /etc/systemd/system/evokernel.service
[Unit]
Description=EvoKernel Spec
After=network.target

[Service]
Type=simple
User=evokernel
WorkingDirectory=/opt/evokernel-spec
ExecStart=/opt/evokernel-spec/launch.sh --no-build
ExecStop=/opt/evokernel-spec/launch.sh --stop
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now evokernel
curl http://127.0.0.1:4321/api/health.json   # verify
```

For macOS launchd, use the equivalent `.plist` with `KeepAlive=true`.

---

## Prerequisites

- GitHub repository with this code pushed
- Cloudflare account
- (Optional) Custom domain

## Cloudflare Pages — One-Click Setup

1. Go to <https://dash.cloudflare.com/?to=/:account/pages>
2. **Create a project** → **Connect to Git** → select your repository
3. Configure build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `Astro` |
   | Build command | `pnpm install && pnpm build` |
   | Build output directory | `apps/web/dist` |
   | Root directory | `/` |
   | Node version | `22` |
   | Environment variable | `NODE_VERSION=22`, `NPM_FLAGS=--version` |

4. Click **Save and Deploy**. First build takes ~3 min.

### Post-deploy

- Pages assigns `<project>.pages.dev` URL by default
- Add a custom domain via **Custom domains** tab
- Set up redirects from `evokernel.io` → `evokernel.dev` (or whatever) via Cloudflare DNS + Page Rules

## Alternatives

### Vercel

```bash
npx vercel link
# Set root: apps/web
# Build command: pnpm install && pnpm build
# Output directory: dist
```

### Netlify

```toml
# netlify.toml at repo root
[build]
  command = "pnpm install && pnpm build"
  publish = "apps/web/dist"

[[redirects]]
  from = "/api/*"
  to = "/api/:splat.json"
  status = 200
  force = true
```

### GitHub Pages

Enable Pages → Source: GitHub Actions → use the artifact uploaded by our `ci.yml`:

```yaml
# .github/workflows/deploy-pages.yml
name: deploy-pages
on:
  workflow_run:
    workflows: ['ci']
    types: [completed]
    branches: [main]
jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    permissions: { pages: write, id-token: write }
    environment: { name: github-pages, url: ${{ steps.deploy.outputs.page_url }} }
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          path: dist
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deploy
        uses: actions/deploy-pages@v4
```

### Self-hosted (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name evokernel.dev;
  root /var/www/evokernel-spec/dist;
  index index.html;

  # Static files cached aggressively
  location /_astro/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # JSON API + RSS
  location ~ \.(json|xml)$ {
    expires 1h;
    add_header Cache-Control "public, max-age=3600";
  }

  # SPA-style fallback for trailing slashes
  location / {
    try_files $uri $uri/ $uri.html =404;
  }

  # Security headers
  add_header X-Content-Type-Options nosniff;
  add_header X-Frame-Options DENY;
  add_header Referrer-Policy strict-origin-when-cross-origin;
}
```

## DNS / TLS

- Cloudflare Pages includes free TLS via Universal SSL
- Set up Cloudflare DNS records:
  - `A`: `@` → Pages (auto)
  - `CNAME`: `www` → `<project>.pages.dev`
- Enable **Always Use HTTPS** + **HSTS** + **Min TLS 1.2** in SSL/TLS settings

## Environment configuration

The site is fully static and **requires no environment variables**. All data is built into the bundle from `data/**/*.yaml`.

If you fork and want a different brand:
- Edit `apps/web/astro.config.mjs` → `site:` URL
- Edit `apps/web/public/og-default.svg` → branding
- Edit `apps/web/src/components/ui/Nav.astro` → logo

## Performance budget

| Metric | Budget | Current (V1) |
|---|---|---|
| LCP | < 2.5s | ~1.2s (static + preload) |
| INP | < 200ms | ~80ms |
| CLS | < 0.1 | 0 |
| Bundle (JS island, gzip) | < 100kb | ~80kb |
| Total dist | — | ~3.6 MB (incl. Pagefind index) |

Verify after deploy:

```bash
npx lighthouse https://evokernel.dev/ --view
```

## Monitoring

- **Cloudflare Analytics** is free + privacy-respecting (no cookies)
- For deeper introspection: pipe to **PostHog** / **Plausible** by adding 1 script tag to `BaseLayout.astro`
- Build status: GitHub Actions tab
- Weekly evidence link health: see `.github/workflows/check-links.yml` — auto-creates issue on broken links

## Rolling back

Cloudflare Pages keeps every successful deploy. **Deployments** tab → click any prior deploy → **Rollback**. Takes < 30 seconds.

## Cost

Cloudflare Pages free tier limits:
- 500 builds/month
- 100k requests/day on `pages.dev` domain
- Unlimited on custom domain

V1 traffic envelope (5k MAU per success metric) fits comfortably.
