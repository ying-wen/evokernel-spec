import fg from 'fast-glob';
import path from 'node:path';
import { ZodError, type ZodSchema } from 'zod';
import {
  VendorSchema, HardwareSchema, ServerSchema, InterconnectSchema,
  OperatorSchema, EngineSchema, QuantizationSchema, ParallelStrategySchema,
  ModelSchema, CaseSchema, PatternSchema, PipelineStageSchema, FusedKernelSchema,
  PlaybookSchema, CitationSchema
} from '@evokernel/schemas';
import { loadYaml } from './lib/load-yaml.ts';

export type ValidationError = {
  kind: 'schema' | 'dangling-evidence-ref' | 'duplicate-id' | 'missing-evidence' | 'parse';
  path: string;
  message: string;
};

export type ValidationReport = {
  errors: ValidationError[];
  entityCounts: Record<string, number>;
};

const ENTITY_GLOBS: Array<{ name: string; glob: string; schema: ZodSchema }> = [
  { name: 'vendor', glob: 'vendors/*.yaml', schema: VendorSchema },
  { name: 'hardware', glob: 'hardware/**/*.yaml', schema: HardwareSchema },
  { name: 'server', glob: 'servers/*.yaml', schema: ServerSchema },
  { name: 'interconnect', glob: 'interconnects/*.yaml', schema: InterconnectSchema },
  { name: 'operator', glob: 'operators/*.yaml', schema: OperatorSchema },
  { name: 'engine', glob: 'engines/*.yaml', schema: EngineSchema },
  { name: 'quantization', glob: 'quantizations/*.yaml', schema: QuantizationSchema },
  { name: 'parallel-strategy', glob: 'parallel-strategies/*.yaml', schema: ParallelStrategySchema },
  { name: 'model', glob: 'models/**/*.yaml', schema: ModelSchema },
  { name: 'case', glob: 'cases/**/*.yaml', schema: CaseSchema },
  { name: 'pattern', glob: 'patterns/*.yaml', schema: PatternSchema },
  { name: 'pipeline-stage', glob: 'pipeline/*.yaml', schema: PipelineStageSchema },
  { name: 'fused-kernel', glob: 'fused-kernels/*.yaml', schema: FusedKernelSchema },
  { name: 'playbook', glob: 'playbooks/*.yaml', schema: PlaybookSchema },
  { name: 'citation', glob: 'citations/*.yaml', schema: CitationSchema }
];

export async function validateAll(opts: { dataDir: string }): Promise<ValidationReport> {
  const errors: ValidationError[] = [];
  const entityCounts: Record<string, number> = {};
  const allEvidenceIds = new Set<string>();
  const referencedEvidenceIds = new Set<string>();

  for (const cfg of ENTITY_GLOBS) {
    const files = await fg(cfg.glob, { cwd: opts.dataDir, absolute: true });
    entityCounts[cfg.name] = files.length;
    const seenIds = new Set<string>();

    for (const file of files) {
      const rel = path.relative(opts.dataDir, file);
      try {
        const raw = await loadYaml<Record<string, unknown>>(file);
        const parsed = cfg.schema.parse(raw) as { id: string; evidence?: Array<{ id: string }> };

        if (seenIds.has(parsed.id)) {
          errors.push({ kind: 'duplicate-id', path: rel, message: `duplicate id "${parsed.id}"` });
        }
        seenIds.add(parsed.id);

        if (parsed.evidence) {
          for (const ev of parsed.evidence) allEvidenceIds.add(ev.id);
        }

        walkForEvidenceRefs(parsed, referencedEvidenceIds);
      } catch (e) {
        if (e instanceof ZodError) {
          errors.push({
            kind: 'schema',
            path: rel,
            message: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          });
        } else {
          errors.push({ kind: 'parse', path: rel, message: (e as Error).message });
        }
      }
    }
  }

  for (const ref of referencedEvidenceIds) {
    if (!allEvidenceIds.has(ref)) {
      errors.push({
        kind: 'dangling-evidence-ref',
        path: '<cross-entity>',
        message: `evidence_ref "${ref}" not defined`
      });
    }
  }

  return { errors, entityCounts };
}

function walkForEvidenceRefs(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) walkForEvidenceRefs(item, out);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'evidence_ref' && typeof v === 'string') out.add(v);
    else walkForEvidenceRefs(v, out);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = path.resolve(process.argv[2] ?? 'data');
  const report = await validateAll({ dataDir });
  const total = Object.values(report.entityCounts).reduce((a, b) => a + b, 0);
  console.log(`Validated ${total} entities:`);
  for (const [name, count] of Object.entries(report.entityCounts)) {
    if (count > 0) console.log(`  ${name}: ${count}`);
  }
  if (report.errors.length > 0) {
    console.error(`\n${report.errors.length} errors:`);
    for (const e of report.errors) console.error(`  [${e.kind}] ${e.path}: ${e.message}`);
    process.exit(1);
  }
  console.log('\n✓ all valid');
}
