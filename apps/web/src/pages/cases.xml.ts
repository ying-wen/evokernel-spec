import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCases } from '~/lib/data';

export async function GET(ctx: APIContext) {
  const cases = (await getCases()).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const site = ctx.site ?? new URL('https://evokernel.dev');
  return rss({
    title: 'EvoKernel Spec — 部署案例',
    description: 'AI 推理部署案例 (硬件 × 模型 × 引擎) 实测数据流',
    site,
    items: cases.map((c) => ({
      title: c.title,
      link: new URL(`/cases/${c.id}/`, site).toString(),
      pubDate: new Date(c.submitted_at),
      description: `${c.stack.hardware.id} ×${c.stack.hardware.count} · ${c.stack.model.id} · ${c.stack.engine.id} · ${c.stack.quantization} · decode ${c.results.throughput_tokens_per_sec.decode} tok/s · TTFT p50 ${c.results.latency_ms.ttft_p50}ms · 瓶颈 ${c.bottleneck}`
    })),
    customData: '<language>zh-CN</language>'
  });
}
