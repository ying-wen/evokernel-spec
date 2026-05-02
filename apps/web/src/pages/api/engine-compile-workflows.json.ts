import type { APIRoute } from 'astro';
import { getEngineCompileWorkflows } from '~/lib/data';

/**
 * v2.12 — engine compile workflows. Captures the build-step BEFORE serving
 * for engines that require model compilation (TRT-LLM trtllm-build / MindIE
 * ATB conversion / lmdeploy turbomind convert / vLLM no-compile JIT path).
 *
 * Closes the deployment-chain gap "what happens between HF checkpoint and
 * launch.sh?" Different engines have radically different build requirements:
 * minutes (lmdeploy) vs hours (TRT-LLM autotune).
 */
export const GET: APIRoute = async () => {
  const items = await getEngineCompileWorkflows();
  return new Response(JSON.stringify({
    count: items.length,
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    notes: 'v2.12 — engine compile workflows. Captures the build step between HF checkpoint and serving. TRT-LLM 60-120 min build, MindIE 20-60 min conversion, lmdeploy 5-30 min, vLLM no AOT (JIT only).',
    items
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' }
  });
};
