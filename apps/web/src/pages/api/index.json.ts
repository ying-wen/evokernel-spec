import type { APIRoute } from 'astro';
import {
  getVendors, getHardware, getServers, getInterconnects,
  getOperators, getEngines, getQuantizations, getParallelStrategies,
  getModels, getCases, getPatterns, getPipelineStages, getFusedKernels,
  getPlaybooks, getTours, getKernelLibraries, getIsaPrimitives,
  getDslExamples, getReferenceImpls, getProfilingTools, getModelGraphs,
  getEngineCompileWorkflows, getAgentLearnings, getTechniques
} from '~/lib/data';

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://evokernel.dev')).toString().replace(/\/$/, '');
  const counts = await Promise.all([
    ['vendor', (await getVendors()).length],
    ['hardware', (await getHardware()).length],
    ['server', (await getServers()).length],
    ['interconnect', (await getInterconnects()).length],
    ['operator', (await getOperators()).length],
    ['engine', (await getEngines()).length],
    ['quantization', (await getQuantizations()).length],
    ['parallel-strategy', (await getParallelStrategies()).length],
    ['model', (await getModels()).length],
    ['case', (await getCases()).length],
    ['pattern', (await getPatterns()).length],
    ['pipeline-stage', (await getPipelineStages()).length],
    ['fused-kernel', (await getFusedKernels()).length],
    ['playbook', (await getPlaybooks()).length],
    ['tour', (await getTours()).length],
    ['kernel-library', (await getKernelLibraries()).length],
    ['isa-primitive', (await getIsaPrimitives()).length],
    ['dsl-example', (await getDslExamples()).length],
    ['reference-impl', (await getReferenceImpls()).length],
    ['profiling-tool', (await getProfilingTools()).length],
    ['model-graph', (await getModelGraphs()).length],
    ['engine-compile-workflow', (await getEngineCompileWorkflows()).length],
    ['agent-learning', (await getAgentLearnings()).length],
    ['technique', (await getTechniques()).length]
  ] as Array<[string, number]>);
  return new Response(JSON.stringify({
    name: 'EvoKernel Spec Open Data API',
    license: 'CC-BY-SA-4.0',
    code_license: 'Apache-2.0',
    version: 'v3.32.0',
    description: 'AI inference deployment knowledge base — corpus entities, agent-context bundles, technique catalog, and static solver surfaces.',
    generated: new Date().toISOString(),
    counts: Object.fromEntries(counts),
    endpoints: {
      index: `${base}/api/index.json`,
      hardware: `${base}/api/hardware.json`,
      models: `${base}/api/models.json`,
      cases: `${base}/api/cases.json`,
      operators: `${base}/api/operators.json`,
      fused_kernels: `${base}/api/fused-kernels.json`,
      techniques: `${base}/api/techniques.json`,
      playbooks: `${base}/api/playbooks.json`,
      engines: `${base}/api/engines.json`,
      quantizations: `${base}/api/quantizations.json`,
      dsl_examples: `${base}/api/dsl-examples.json`,
      reference_impls: `${base}/api/reference-impls.json`,
      profiling_tools: `${base}/api/profiling-tools.json`,
      isa_primitives: `${base}/api/isa-primitives.json`,
      kernel_libraries: `${base}/api/kernel-libraries.json`,
      model_graphs: `${base}/api/model-graphs.json`,
      engine_compile_workflows: `${base}/api/engine-compile-workflows.json`,
      agent_learnings: `${base}/api/agent-learnings.json`,
      agent_context_index: `${base}/api/agent-context-index.json`,
      agent_context_bundle: `${base}/api/agent-context/{model}-on-{hardware}.json`,
      coverage_matrix: `${base}/api/coverage-matrix.json`,
      solve: `${base}/api/solve.json`,
      openapi: `${base}/api/openapi.json`,
      health: `${base}/api/health.json`,
      healthz: `${base}/api/healthz`,
      rss_cases: `${base}/cases.xml`,
      sitemap: `${base}/sitemap-index.xml`
    },
    contribution: 'https://github.com/ying-wen/evokernel-spec'
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
};
