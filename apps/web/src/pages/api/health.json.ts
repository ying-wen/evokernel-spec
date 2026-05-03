import type { APIRoute } from 'astro';
import { buildMeta } from '~/lib/build-meta';
import {
  getVendors, getHardware, getServers, getOperators, getEngines,
  getQuantizations, getParallelStrategies, getModels, getCases, getPatterns,
  getInterconnects, getPipelineStages, getFusedKernels, getPlaybooks,
  getTours, getKernelLibraries, getIsaPrimitives, getDslExamples,
  getReferenceImpls, getProfilingTools, getModelGraphs,
  getEngineCompileWorkflows, getAgentLearnings, getTechniques
} from '~/lib/data';

/**
 * /api/health.json — uptime probe + corpus snapshot.
 *
 * Designed for:
 *  - launch.sh polling after `pnpm preview` startup (HTTP 200 + status:ok)
 *  - external uptime monitors (statuscake/uptime-robot/cloudflare healthchecks)
 *  - debugging "what's deployed?" — embeds the same SHA + builtAt as the footer
 *
 * The `data_loaded` block degrades gracefully: any loader failure flips
 * the response to status=degraded so the probe surface a real signal
 * instead of swallowing the error.
 */
export const GET: APIRoute = async () => {
  const meta = buildMeta();
  let counts: Record<string, number> | undefined;
  let status: 'ok' | 'degraded' = 'ok';
  let degradedReason: string | undefined;

  try {
    const [
      vendors, hardware, servers, interconnects, operators, engines, quants,
      parallel, models, cases, patterns, pipelineStages, fusedKernels,
      playbooks, tours, kernelLibraries, isaPrimitives, dslExamples,
      referenceImpls, profilingTools, modelGraphs, engineCompileWorkflows,
      agentLearnings, techniques
    ] =
      await Promise.all([
        getVendors(), getHardware(), getServers(), getInterconnects(), getOperators(), getEngines(),
        getQuantizations(), getParallelStrategies(), getModels(), getCases(), getPatterns(),
        getPipelineStages(), getFusedKernels(), getPlaybooks(), getTours(),
        getKernelLibraries(), getIsaPrimitives(), getDslExamples(), getReferenceImpls(),
        getProfilingTools(), getModelGraphs(), getEngineCompileWorkflows(),
        getAgentLearnings(), getTechniques()
      ]);
    counts = {
      vendors: vendors.length,
      hardware: hardware.length,
      servers: servers.length,
      interconnects: interconnects.length,
      operators: operators.length,
      engines: engines.length,
      quantizations: quants.length,
      parallel_strategies: parallel.length,
      models: models.length,
      cases: cases.length,
      patterns: patterns.length,
      pipeline_stages: pipelineStages.length,
      fused_kernels: fusedKernels.length,
      playbooks: playbooks.length,
      tours: tours.length,
      kernel_libraries: kernelLibraries.length,
      isa_primitives: isaPrimitives.length,
      dsl_examples: dslExamples.length,
      reference_impls: referenceImpls.length,
      profiling_tools: profilingTools.length,
      model_graphs: modelGraphs.length,
      engine_compile_workflows: engineCompileWorkflows.length,
      agent_learnings: agentLearnings.length,
      techniques: techniques.length
    };
    if (hardware.length === 0 || models.length === 0 || operators.length === 0 || techniques.length === 0) {
      status = 'degraded';
      degradedReason = 'core corpus (hardware, models, operators, or techniques) is empty';
    }
  } catch (err: unknown) {
    status = 'degraded';
    degradedReason = err instanceof Error ? err.message : 'unknown loader error';
  }

  const body = {
    status,
    name: 'evokernel-spec',
    version: 'v3.32.0',
    build: { sha: meta.sha, built_at: meta.builtAt },
    served_at: new Date().toISOString(),
    data_loaded: counts,
    ...(degradedReason ? { degraded_reason: degradedReason } : {})
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: status === 'ok' ? 200 : 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate'
    }
  });
};
