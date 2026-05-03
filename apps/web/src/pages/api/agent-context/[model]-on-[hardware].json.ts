import type { APIRoute, GetStaticPaths } from 'astro';
import {
  getModels,
  getModelGraphs,
  getResolvedHardware,
  getOperators,
  getFusedKernels,
  getDslExamples,
  getIsaPrimitives,
  getKernelLibraries,
  getEngineCompileWorkflows,
  getAgentLearnings,
} from '~/lib/data';

/**
 * v3.3 — Layer R (Retrieval) foundation: smart-context bundle for the
 * productized agent.
 *
 * Static-generated endpoint: one JSON per (model, hardware) pair, pre-built
 * at SSG time so it works on GitHub Pages (no server-side runtime).
 *
 * URL: /api/agent-context/<model_id>-on-<hardware_id>.json
 *
 * Returns ALL relevant context the LLM orchestrator needs:
 *   - model spec + execution graphs
 *   - hardware spec + vendor + ISA primitives + cross-vendor mappings
 *   - applicable ops (with formal_semantics) + fused-kernel options
 *   - DSL examples for this hw's arch_family
 *   - kernel libraries available
 *   - engine compile workflows
 *   - prior agent-learnings on similar (model, hw) pairs
 *
 * For discovery, see /api/agent-context-index.json which lists all
 * generated combinations.
 *
 * See docs/superpowers/specs/2026-05-03-productized-agent.md § Layer R
 * for the full architectural context and the v3.3 → v3.10 trajectory.
 */
export const getStaticPaths: GetStaticPaths = async () => {
  const [models, hardware] = await Promise.all([getModels(), getResolvedHardware()]);

  // Generate all (model, hardware) pairs.
  // ~20 models × ~53 hw = ~1060 entries; ~50MB total static JSON.
  // Acceptable for GitHub Pages; future v3.4 may filter to "supported" pairs.
  const paths: { params: { model: string; hardware: string } }[] = [];
  for (const m of models) {
    for (const h of hardware) {
      paths.push({ params: { model: m.id, hardware: h.id } });
    }
  }
  return paths;
};

export const GET: APIRoute = async ({ params }) => {
  const modelId = params.model as string;
  const hardwareId = params.hardware as string;

  const [
    models,
    modelGraphs,
    resolvedHardware,
    operators,
    fusedKernels,
    dslExamples,
    isaPrimitives,
    kernelLibraries,
    engineCompileWorkflows,
    agentLearnings,
  ] = await Promise.all([
    getModels(),
    getModelGraphs(),
    getResolvedHardware(),
    getOperators(),
    getFusedKernels(),
    getDslExamples(),
    getIsaPrimitives(),
    getKernelLibraries(),
    getEngineCompileWorkflows(),
    getAgentLearnings(),
  ]);

  const model = models.find((m) => m.id === modelId);
  const hardware = resolvedHardware.find((h) => h.id === hardwareId);
  if (!model || !hardware) {
    // getStaticPaths should have prevented this, but be defensive
    return new Response(
      JSON.stringify(
        { error: 'not_found', model: modelId, hardware: hardwareId },
        null,
        2
      ),
      { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }

  // Determine arch_family
  const archFamily = (hardware.generation as string | undefined) ?? hardwareId.split('-')[0] ?? hardwareId;

  // Filter applicable ops (engines support this arch, or universal)
  const applicableOps = operators.filter((op) => {
    const impls = op.engine_implementations ?? [];
    if (impls.length === 0) return true;
    return impls.some((impl) => {
      const archs = (impl.hardware_arch ?? []) as string[];
      return archs.length === 0 || archs.some((a) => a === archFamily || archFamily.startsWith(a));
    });
  });

  // Filter applicable fused-kernels
  const applicableFusedKernels = fusedKernels.filter((fk) => {
    const impls = fk.implementations ?? [];
    if (impls.length === 0) return true;
    return impls.some((impl) => {
      const archs = (impl.hardware_arch ?? []) as string[];
      return archs.length === 0 || archs.some((a) => a === archFamily || archFamily.startsWith(a));
    });
  });

  const matchingGraphs = modelGraphs.filter(
    (g) => g.model_id === model.id || g.id.startsWith(model.id)
  );

  const matchingDsl = dslExamples.filter(
    (d) => d.arch_family === archFamily || archFamily.startsWith(d.arch_family)
  );

  const matchingIsa = isaPrimitives.filter(
    (p) => p.arch_family === archFamily || archFamily.startsWith(p.arch_family)
  );

  const matchingLibs = kernelLibraries.filter((kl) => {
    const supported = kl.target_archs;
    return (
      supported.some((a) => a === archFamily || archFamily.startsWith(a)) ||
      kl.vendor === hardware.vendor.id
    );
  });

  const priorLearnings = agentLearnings
    .filter((al) => {
      const sameModel =
        al.model_id === model.id ||
        al.model_id.includes(model.id) ||
        model.id.includes(al.model_id.split('/').pop() ?? '');
      const sameHw = al.hardware_id === hardware.id;
      const sameArchFamily = al.hardware_id.startsWith(archFamily);
      return sameModel || sameHw || sameArchFamily;
    })
    .sort((a, b) => b.agent_run_at.localeCompare(a.agent_run_at))
    .slice(0, 10);

  const coverageHints = {
    archFamily,
    opsCovered: applicableOps.length,
    opsTotal: operators.length,
    fusedKernelsCovered: applicableFusedKernels.length,
    fusedKernelsTotal: fusedKernels.length,
    dslExamplesAvailable: matchingDsl.length,
    isaPrimitivesAvailable: matchingIsa.length,
    kernelLibrariesAvailable: matchingLibs.length,
    priorLearningsCount: priorLearnings.length,
  };

  const body = {
    license: 'CC-BY-SA-4.0',
    generated: new Date().toISOString(),
    schema_version: 'agent-context/v1',
    notes:
      'v3.3 — Layer R (Retrieval) foundation. Smart-context bundle for productized agent: given (model, hardware), returns ALL knowledge an LLM-orchestrator needs to plan + generate + verify a deployment. See docs/superpowers/specs/2026-05-03-productized-agent.md',
    request: { model: modelId, hardware: hardwareId },
    coverage_hints: coverageHints,
    bundle: {
      model,
      model_graphs: matchingGraphs,
      hardware,
      vendor: hardware.vendor,
      applicable_ops: applicableOps,
      applicable_fused_kernels: applicableFusedKernels,
      dsl_examples: matchingDsl,
      isa_primitives: matchingIsa,
      kernel_libraries: matchingLibs,
      engine_compile_workflows: engineCompileWorkflows,
      prior_learnings: priorLearnings,
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  });
};
