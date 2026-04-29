import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Deploy targets:
//
//   default      → site https://evokernel.dev, base "/"
//   PUBLIC_DEPLOY=github-pages → site https://ying-wen.github.io, base "/evokernel-spec"
//
// We read PUBLIC_DEPLOY (and `base` / `site` overrides) from env so the same
// repo can publish to GitHub Pages, Cloudflare Pages, and a custom domain
// without code changes. The `base` value gets surfaced to all internal-link
// helpers (`localePath`, `pathname` in src/lib/i18n) at build time via
// import.meta.env.BASE_URL.
const target = process.env.PUBLIC_DEPLOY ?? 'custom-domain';

const TARGETS = {
  // ying-wen has a verified custom domain `yingwen.io` on their GitHub Pages
  // account, so project-page deploys are served at https://yingwen.io/<repo>/
  // (not ying-wen.github.io). The default site URL reflects that; override via
  // SITE_URL env when forking.
  'github-pages': {
    site: process.env.SITE_URL ?? 'https://yingwen.io',
    base: process.env.BASE_PATH ?? '/evokernel-spec'
  },
  'custom-domain': {
    site: process.env.SITE_URL ?? 'https://evokernel.dev',
    base: process.env.BASE_PATH ?? '/'
  }
};

const cfg = TARGETS[target] ?? TARGETS['custom-domain'];

export default defineConfig({
  site: cfg.site,
  base: cfg.base,
  // trailing slash matches Astro defaults; explicit so receivers don't 404
  // when GitHub Pages serves /foo/ but a hardcoded /foo lives in dev
  trailingSlash: 'ignore',
  output: 'static',
  integrations: [react(), mdx(), sitemap()],
  vite: { plugins: [tailwindcss()] },
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: { prefixDefaultLocale: false }
  }
});
