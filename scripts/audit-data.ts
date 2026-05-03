// Data quality audit: surfaces suspicious or weak entries that pass the schema
// but might indicate typos, missing data, or low-coverage areas.
// Exits non-zero if `--strict` is passed and any warnings exist.

import fg from 'fast-glob';
import path from 'node:path';
import { HardwareSchema, ModelSchema, CaseSchema, type Hardware, type Model, type Case } from '@evokernel/schemas';
import { loadYaml } from './lib/load-yaml.ts';

interface Warning {
  level: 'warn' | 'info';
  entity: string;
  id: string;
  message: string;
}

const warnings: Warning[] = [];
const w = (level: Warning['level'], entity: string, id: string, message: string) =>
  warnings.push({ level, entity, id, message });

async function loadHardware(dir: string): Promise<Hardware[]> {
  const files = await fg('hardware/**/*.yaml', { cwd: dir, absolute: true });
  return Promise.all(files.map(async (f) => HardwareSchema.parse(await loadYaml(f))));
}
async function loadModels(dir: string): Promise<Model[]> {
  const files = await fg('models/**/*.yaml', { cwd: dir, absolute: true });
  return Promise.all(files.map(async (f) => ModelSchema.parse(await loadYaml(f))));
}
async function loadCases(dir: string): Promise<Case[]> {
  const files = await fg('cases/**/*.yaml', { cwd: dir, absolute: true });
  return Promise.all(files.map(async (f) => CaseSchema.parse(await loadYaml(f))));
}

const dataDir = path.resolve(process.argv[2] ?? 'data');
const strict = process.argv.includes('--strict');

const hardware = await loadHardware(dataDir);
const models = await loadModels(dataDir);
const cases = await loadCases(dataDir);

// === Hardware audits ===
for (const h of hardware) {
  // Outlier compute. Edge SoCs legitimately sit below 10 BF16 TFLOPS, while
  // wafer-scale systems publish aggregate chip-wide peaks far above GPU cards.
  const bf16 = h.compute.bf16_tflops?.value;
  const isWaferScale = h.form_factor === 'wafer-scale' || h.architecture.wafer_scale === true || h.memory.type === 'on-die-sram';
  const isEdgeTier = h.form_factor === 'edge-m2' || h.form_factor === 'embedded-soc' || h.memory.type.startsWith('LPDDR');
  if (bf16 !== undefined && bf16 > 10000 && !isWaferScale) w('warn', 'hardware', h.id, `BF16 ${bf16} TFLOPS exceeds 10k — likely typo`);
  if (bf16 !== undefined && bf16 < 10 && !isEdgeTier) w('warn', 'hardware', h.id, `BF16 ${bf16} TFLOPS suspiciously low`);

  // FP8 should usually be ~2× BF16; flag big mismatches
  const fp8 = h.compute.fp8_tflops?.value;
  if (bf16 && fp8 && (fp8 < bf16 || fp8 > bf16 * 3)) {
    w('info', 'hardware', h.id, `FP8 ${fp8} vs BF16 ${bf16} ratio ${(fp8 / bf16).toFixed(1)} (expected ~2)`);
  }

  // Memory bandwidth sanity (HBM3 typically 3-8 TB/s; HBM2e 1-2 TB/s)
  const mem = h.memory.bandwidth_gbps?.value;
  if (mem !== undefined) {
    if (h.memory.type === 'HBM3' && mem < 2000) w('info', 'hardware', h.id, `HBM3 BW ${mem} GB/s seems low (expect ≥ 3000)`);
    if (h.memory.type === 'HBM2e' && mem > 2500) w('info', 'hardware', h.id, `HBM2e BW ${mem} GB/s seems high (expect ≤ 2500)`);
  }

  // Status sanity
  if (h.release_year > new Date().getFullYear() + 1) w('warn', 'hardware', h.id, `release_year ${h.release_year} is in far future`);
  if (h.status === 'in-production' && h.release_year > new Date().getFullYear()) w('warn', 'hardware', h.id, `marked in-production but release_year ${h.release_year} hasn't arrived`);

  // Coverage: must have at least 1 evidence and at least one compute value
  if (!h.compute.bf16_tflops && !h.compute.fp16_tflops) w('warn', 'hardware', h.id, 'no BF16 or FP16 compute value');
  if (h.evidence.length < 1) w('warn', 'hardware', h.id, 'no evidence — schema check should have caught this');
  if (h.evidence.length === 1) w('info', 'hardware', h.id, 'only 1 evidence; consider adding corroboration');

  // Software-stack coverage: an in-production card should support at least 1 engine
  if (h.status === 'in-production' && h.software_support.engines.length === 0) {
    w('info', 'hardware', h.id, 'no engine support listed — coverage gap');
  }
}

// === Model audits ===
for (const m of models) {
  if (m.architecture.family === 'moe' && !m.architecture.moe) w('warn', 'model', m.id, 'family=moe but no moe config');
  if (m.architecture.active_params_b > m.architecture.total_params_b) w('warn', 'model', m.id, 'active > total params');
  if (m.architecture.num_kv_heads > m.architecture.num_attention_heads) w('warn', 'model', m.id, 'kv_heads > attention_heads');
  if (m.operator_decomposition.length === 0) w('info', 'model', m.id, 'no operator_decomposition — calculator will return 0');
  if (m.architecture.max_context_length < 4096) w('info', 'model', m.id, `context ${m.architecture.max_context_length} suspiciously short`);
}

// === Case audits ===
for (const c of cases) {
  // Cross-ref check (schema doesn't enforce existence)
  if (!hardware.some((h) => h.id === c.stack.hardware.id)) w('warn', 'case', c.id, `references unknown hardware ${c.stack.hardware.id}`);
  if (!models.some((m) => m.id === c.stack.model.id)) w('warn', 'case', c.id, `references unknown model ${c.stack.model.id}`);

  // Throughput sanity vs hardware peak
  const hw = hardware.find((h) => h.id === c.stack.hardware.id);
  const peak = hw?.compute.bf16_tflops?.value;
  if (peak && c.results.throughput_tokens_per_sec.decode > peak * 1000) {
    w('warn', 'case', c.id, `decode tok/s ${c.results.throughput_tokens_per_sec.decode} exceeds plausible upper bound`);
  }

  // Utilization sanity
  if (c.results.utilization.compute_pct + c.results.utilization.memory_bw_pct > 200) {
    w('warn', 'case', c.id, 'compute% + memory% > 200, very unusual');
  }
}

// === Coverage gaps ===
const missingCases = hardware.filter((h) => !cases.some((c) => c.stack.hardware.id === h.id));
for (const h of missingCases.slice(0, 20)) {
  w('info', 'coverage', h.id, `no cases for hardware ${h.id} — recruit a contributor`);
}
const missingModels = models.filter((m) => !cases.some((c) => c.stack.model.id === m.id));
for (const m of missingModels.slice(0, 20)) {
  w('info', 'coverage', m.id, `no cases for model ${m.id}`);
}

// === Print report ===
const warnCount = warnings.filter((x) => x.level === 'warn').length;
const infoCount = warnings.filter((x) => x.level === 'info').length;
console.log(`\n📋 EvoKernel Spec data audit\n${'═'.repeat(60)}`);
console.log(`   Hardware: ${hardware.length}, Models: ${models.length}, Cases: ${cases.length}`);
console.log(`   ${warnCount} warnings, ${infoCount} info\n`);
for (const lv of ['warn', 'info'] as const) {
  const items = warnings.filter((x) => x.level === lv);
  if (items.length === 0) continue;
  console.log(`${lv === 'warn' ? '⚠️  WARN' : 'ℹ️  INFO'} (${items.length})`);
  for (const i of items) console.log(`   [${i.entity}] ${i.id}: ${i.message}`);
  console.log();
}
if (warnCount === 0 && infoCount === 0) console.log('✓ no audit findings\n');

if (strict && warnCount > 0) {
  console.error(`exit non-zero: ${warnCount} warnings in --strict mode`);
  process.exit(1);
}
