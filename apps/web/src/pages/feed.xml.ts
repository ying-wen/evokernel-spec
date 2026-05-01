// /feed.xml — site-wide release RSS feed.
//
// Source: CHANGELOG.md (parsed via lib/changelog.ts).
// Each release becomes one <item>. Subscribers see new entries when a
// release is tagged + the site rebuilds.

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getReleases } from '~/lib/changelog';

export async function GET(ctx: APIContext) {
  const releases = getReleases();
  const site = ctx.site ?? new URL('https://yingwen.io/evokernel-spec/');
  return rss({
    title: 'EvoKernel Spec — Releases',
    description: 'AI 推理硬件 × 模型 × 部署的开源知识库 — 新版本 / 重要内容更新流',
    site,
    items: releases.map((r) => ({
      title: `v${r.version} — ${r.date}`,
      link: new URL(`/changelog/#v${r.version}`, site).toString(),
      pubDate: new Date(r.date),
      description: r.summary
    })),
    customData: '<language>zh-CN</language>'
  });
}
