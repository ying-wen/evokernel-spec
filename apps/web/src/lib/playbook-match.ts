/**
 * Playbook recommendation matcher.
 *
 * Given a model or hardware, infer the relevant ModelArchetype / HardwareClass
 * from existing schema fields (no new annotations required), then return all
 * playbooks that match. The match is **deterministic** — no scoring; just
 * archetype/class equality plus a soft size-class check.
 */

import type { Model, Hardware, Playbook, ModelArchetype, HardwareClass } from '@evokernel/schemas';

type HardwareLike = Omit<Hardware, 'vendor'> & {
  vendor: Hardware['vendor'] | { id?: string };
};

/**
 * Infer ModelArchetype from existing model fields. Order matters — more
 * specific matches (reasoning, multi-modal) win over generic family/size.
 */
export function inferModelArchetype(model: Model): ModelArchetype {
  const name = model.name.toLowerCase();
  const id = model.id.toLowerCase();
  const arch = model.architecture;

  // Reasoning models — name patterns
  if (/\br1\b|\bo1\b|qwq|reasoner/i.test(name) || /\br1\b|\bo1\b|qwq|reasoner/.test(id)) {
    return 'reasoning-llm';
  }

  // Multi-modal — name patterns
  if (/\bvl\b|vision|scout|maverick|llama-?4|pixtral|gemma-?3|qwen2-vl|qwen2\.5-vl/i.test(name) ||
      /scout|maverick|pixtral|qwen.*vl/.test(id)) {
    return 'multi-modal';
  }

  // SSM / Mamba — explicit attention type signal
  if (/mamba|ssm|hyena|rwkv/i.test(arch.attention_type)) {
    return 'ssm-mamba';
  }

  // Long-context overlay — separate dimension; we map very-long-context to long-context archetype
  if ((arch.max_context_length ?? 0) >= 1_000_000) {
    return 'long-context';
  }

  // MoE size classes
  if (arch.family === 'moe') {
    return arch.total_params_b >= 100 ? 'moe-llm-large' : 'moe-llm-medium';
  }

  // Dense size classes
  if (arch.total_params_b >= 100) return 'dense-llm-large';
  if (arch.total_params_b >= 30) return 'dense-llm-medium';
  return 'dense-llm-small';
}

/**
 * Infer HardwareClass from existing hardware fields.
 */
export function inferHardwareClass(hw: HardwareLike): HardwareClass {
  const gen = (hw.generation ?? '').toLowerCase();
  const id = hw.id.toLowerCase();
  const ff = hw.form_factor ?? '';
  // hw.vendor may be a string (raw Hardware) or a Vendor object (ResolvedHardware) — accept both
  const rawVendor = hw.vendor as unknown;
  const vendor = (typeof rawVendor === 'string' ? rawVendor : (rawVendor as { id?: string })?.id ?? '').toLowerCase();

  // Wafer-scale + on-die outliers
  if (vendor === 'cerebras' || /wse/.test(id)) return 'wafer-scale';
  if (vendor === 'groq' || /lpu/.test(id)) return 'on-die-sram-only';

  // TPU / Trainium / Inferentia
  if (vendor === 'google' || /tpu|trillium/.test(id)) return 'tpu-pod';
  if (/trainium|inferentia/.test(id)) return 'trainium-instance';

  // Edge / embedded
  if (ff === 'embedded-soc' || /jetson|m4|m3|orin/.test(id)) return 'edge-single-card';

  // NVIDIA generations — cluster if NVL72/NVL36 form factor, otherwise single-node
  if (/blackwell/.test(gen) || /b100|b200|gb200|gb300|r100|r200/.test(id)) {
    if (ff === 'nvl' || /nvl/.test(id)) return 'blackwell-superpod';
    return 'blackwell-cluster';
  }
  if (/hopper/.test(gen) || /h100|h200|h800/.test(id)) {
    if (ff === 'nvl' || /nvl/.test(id)) return 'hopper-cluster';
    return 'hopper-single-node';
  }
  if (/ampere/.test(gen) || /a100|a800|a30/.test(id)) return 'ampere-single-node';
  if (/ada|lovelace/.test(gen) || /l40|l4|rtx-?4/.test(id)) return 'ada-single-node';

  // AMD CDNA-3 / CDNA-4
  if (/cdna/.test(gen) || /mi300|mi325|mi355|mi430/.test(id)) {
    if (/mi355|mi430|cluster/.test(id)) return 'cdna3-cluster';
    return 'cdna3-single-node';
  }

  // Huawei Ascend
  if (vendor === 'huawei' || /ascend|910|davinci/.test(id)) return 'ascend-cluster';

  // Cambricon / Gaudi
  if (vendor === 'cambricon' || /mlu/.test(id)) return 'cambricon-cluster';
  if (vendor === 'intel' || /gaudi/.test(id)) return 'gaudi-cluster';

  // Default fallback for "everything else" — treat as edge-single-card
  return 'edge-single-card';
}

/**
 * Find playbooks that match a given model.
 * Returns playbooks where playbook.model_archetype === inferred model archetype.
 */
export function findPlaybooksForModel(model: Model, allPlaybooks: Playbook[]): Playbook[] {
  const archetype = inferModelArchetype(model);
  return allPlaybooks.filter((pb) => pb.model_archetype === archetype);
}

/**
 * Find playbooks that match a given hardware.
 * Returns playbooks where playbook.hardware_class === inferred hardware class.
 *
 * For aggregate types (cluster/superpod): also surface single-node playbooks
 * since many same-vendor recipes apply to either scale.
 */
export function findPlaybooksForHardware(hw: HardwareLike, allPlaybooks: Playbook[]): Playbook[] {
  const cls = inferHardwareClass(hw);
  const direct = allPlaybooks.filter((pb) => pb.hardware_class === cls);

  // Soft expansion: hopper-cluster matches hopper-single-node and vice versa
  const expansions: Record<HardwareClass, HardwareClass[]> = {
    'hopper-cluster': ['hopper-single-node'],
    'hopper-single-node': ['hopper-cluster'],
    'blackwell-cluster': ['blackwell-superpod'],
    'blackwell-superpod': ['blackwell-cluster'],
    'cdna3-cluster': ['cdna3-single-node'],
    'cdna3-single-node': ['cdna3-cluster'],
    'ampere-single-node': [],
    'ada-single-node': [],
    'ascend-cluster': [],
    'cambricon-cluster': [],
    'gaudi-cluster': [],
    'tpu-pod': [],
    'trainium-instance': [],
    'edge-single-card': [],
    'wafer-scale': [],
    'on-die-sram-only': []
  };

  const fallbackClasses = expansions[cls] ?? [];
  const fallback = allPlaybooks.filter((pb) => fallbackClasses.includes(pb.hardware_class));

  // Direct first, fallback after
  return [...direct, ...fallback];
}
