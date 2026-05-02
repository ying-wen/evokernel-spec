import {
  VendorSchema, HardwareSchema, ServerSchema, InterconnectSchema,
  OperatorSchema, EngineSchema, QuantizationSchema, ParallelStrategySchema,
  ModelSchema, CaseSchema, PatternSchema, PipelineStageSchema, FusedKernelSchema,
  PlaybookSchema, CitationSchema, TourSchema, KernelLibrarySchema, IsaPrimitiveSchema,
  DslExampleSchema, ReferenceImplementationSchema, ProfilingToolSchema,
  ModelExecutionGraphSchema, EngineCompileWorkflowSchema,
  type Vendor, type Hardware, type Server, type Interconnect,
  type Operator, type Engine, type Quantization, type ParallelStrategy,
  type Model, type Case, type Pattern, type PipelineStage, type FusedKernel,
  type Playbook, type Citation, type Tour, type KernelLibrary, type IsaPrimitive,
  type DslExample, type ReferenceImplementation, type ProfilingTool,
  type ModelExecutionGraph, type EngineCompileWorkflow
} from '@evokernel/schemas';
import { loadAll } from './loader.ts';

export type ResolvedHardware = Omit<Hardware, 'vendor'> & { vendor: Vendor };
export type ResolvedCase = Case & {
  resolved: {
    hardware: Hardware;
    server?: Server;
    model: Model;
    engine: Engine;
    quantization: Quantization;
  };
};

function indexBy<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((x) => [x.id, x]));
}

export async function getVendors(): Promise<Vendor[]> {
  return loadAll('vendors/*.yaml', VendorSchema);
}
export async function getHardware(): Promise<Hardware[]> {
  return loadAll('hardware/**/*.yaml', HardwareSchema);
}
export async function getServers(): Promise<Server[]> {
  return loadAll('servers/*.yaml', ServerSchema);
}
export async function getInterconnects(): Promise<Interconnect[]> {
  return loadAll('interconnects/*.yaml', InterconnectSchema);
}
export async function getOperators(): Promise<Operator[]> {
  return loadAll('operators/*.yaml', OperatorSchema);
}
export async function getEngines(): Promise<Engine[]> {
  return loadAll('engines/*.yaml', EngineSchema);
}
export async function getQuantizations(): Promise<Quantization[]> {
  return loadAll('quantizations/*.yaml', QuantizationSchema);
}
export async function getParallelStrategies(): Promise<ParallelStrategy[]> {
  return loadAll('parallel-strategies/*.yaml', ParallelStrategySchema);
}
export async function getModels(): Promise<Model[]> {
  return loadAll('models/**/*.yaml', ModelSchema);
}
export async function getCases(): Promise<Case[]> {
  return loadAll('cases/**/*.yaml', CaseSchema);
}
export async function getPatterns(): Promise<Pattern[]> {
  return loadAll('patterns/*.yaml', PatternSchema);
}
export async function getPipelineStages(): Promise<PipelineStage[]> {
  const stages = await loadAll('pipeline/*.yaml', PipelineStageSchema);
  return stages.sort((a, b) => a.order - b.order);
}
export async function getFusedKernels(): Promise<FusedKernel[]> {
  return loadAll('fused-kernels/*.yaml', FusedKernelSchema);
}
export async function getPlaybooks(): Promise<Playbook[]> {
  return loadAll('playbooks/*.yaml', PlaybookSchema);
}
export async function getCitations(): Promise<Citation[]> {
  return loadAll('citations/*.yaml', CitationSchema);
}
export async function getTours(): Promise<Tour[]> {
  const tours = await loadAll('tours/*.yaml', TourSchema);
  return tours.sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
}
export async function getKernelLibraries(): Promise<KernelLibrary[]> {
  return loadAll('kernel-libraries/*.yaml', KernelLibrarySchema);
}
export async function getIsaPrimitives(): Promise<IsaPrimitive[]> {
  return loadAll('isa-primitives/*.yaml', IsaPrimitiveSchema);
}
export async function getDslExamples(): Promise<DslExample[]> {
  return loadAll('dsl-examples/*.yaml', DslExampleSchema);
}
export async function getReferenceImpls(): Promise<ReferenceImplementation[]> {
  return loadAll('reference-impls/*.yaml', ReferenceImplementationSchema);
}
export async function getProfilingTools(): Promise<ProfilingTool[]> {
  return loadAll('profiling-tools/*.yaml', ProfilingToolSchema);
}
export async function getModelGraphs(): Promise<ModelExecutionGraph[]> {
  return loadAll('model-graphs/*.yaml', ModelExecutionGraphSchema);
}
export async function getEngineCompileWorkflows(): Promise<EngineCompileWorkflow[]> {
  return loadAll('engine-compile-workflows/*.yaml', EngineCompileWorkflowSchema);
}

export async function getResolvedHardware(): Promise<ResolvedHardware[]> {
  const [hardware, vendors] = await Promise.all([getHardware(), getVendors()]);
  const vmap = indexBy(vendors);
  return hardware.map((h) => {
    const vendor = vmap.get(h.vendor);
    if (!vendor) throw new Error(`hardware ${h.id} references unknown vendor "${h.vendor}"`);
    return { ...h, vendor };
  });
}

export async function getResolvedCases(): Promise<ResolvedCase[]> {
  const [cases, hardware, servers, models, engines, quantizations] = await Promise.all([
    getCases(), getHardware(), getServers(), getModels(), getEngines(), getQuantizations()
  ]);
  const hmap = indexBy(hardware);
  const smap = indexBy(servers);
  const mmap = indexBy(models);
  const emap = indexBy(engines);
  const qmap = indexBy(quantizations);
  return cases.map((c) => {
    const hw = hmap.get(c.stack.hardware.id);
    const md = mmap.get(c.stack.model.id);
    const en = emap.get(c.stack.engine.id);
    const qt = qmap.get(c.stack.quantization);
    if (!hw) throw new Error(`case ${c.id}: unknown hardware "${c.stack.hardware.id}"`);
    if (!md) throw new Error(`case ${c.id}: unknown model "${c.stack.model.id}"`);
    if (!en) throw new Error(`case ${c.id}: unknown engine "${c.stack.engine.id}"`);
    if (!qt) throw new Error(`case ${c.id}: unknown quantization "${c.stack.quantization}"`);
    const sv = c.stack.server ? smap.get(c.stack.server.id) : undefined;
    return { ...c, resolved: { hardware: hw, server: sv, model: md, engine: en, quantization: qt } };
  });
}

export async function getHardwareBySlug(slug: string): Promise<ResolvedHardware | null> {
  const all = await getResolvedHardware();
  return all.find((h) => h.id === slug) ?? null;
}
export async function getModelBySlug(slug: string): Promise<Model | null> {
  const models = await getModels();
  return models.find((m) => m.id === slug) ?? null;
}
export async function getCaseBySlug(slug: string): Promise<ResolvedCase | null> {
  const all = await getResolvedCases();
  return all.find((c) => c.id === slug) ?? null;
}
