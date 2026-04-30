import { z } from 'zod';
import { EvidenceSchema, ValueWithEvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const ServerTypeSchema = z.enum(['integrated-server', 'pod', 'super-pod']);
export const CoolingSchema = z.enum(['air', 'liquid', 'immersion', 'hybrid']);

/**
 * Switch-fabric chip used in the scale-up domain (NVSwitch, Tomahawk,
 * Huawei UB-Switch). Captures the *what* of the fabric — radix and
 * per-port bandwidth — so engineers can reason about oversubscription
 * and bisection bandwidth without spelunking PDFs.
 */
const SwitchChipSchema = z.object({
  /** Chip name: "NVSwitch v4", "Quantum-2 IB switch", "UB-Switch v1". */
  name: z.string().min(1),
  /** Per-pod count of these chips. */
  count: z.number().int().positive(),
  /** Radix = port count per chip. */
  radix: z.number().int().positive(),
  /** Per-port bidirectional bandwidth in GB/s. */
  bandwidth_gbps_per_port: z.number().positive(),
  /** Vendor docs / paper / datasheet URL. */
  url: z.string().url().optional()
});

/**
 * Power-distribution detail at the rack/super-pod level. Sustained vs
 * peak matters because real datacenter PUE budgets live on sustained
 * draw, not the spec-sheet peak.
 */
const PowerDistributionSchema = z.object({
  psu_count: z.number().int().positive().optional(),
  redundancy: z.enum(['N', 'N+1', '2N', 'N+N']).optional(),
  sustained_kw: z.number().positive().optional(),
  peak_kw: z.number().positive().optional(),
  voltage: z.string().optional()
});

export const ServerSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  vendor: Slug,
  type: ServerTypeSchema,
  card: Slug,
  card_count: z.number().int().positive(),
  scale_up_domain_size: z.number().int().positive(),
  intra_node_interconnect: z.string().min(1),
  inter_node_interconnect: z.string().min(1),
  cooling: CoolingSchema,
  rack_power_kw: z.number().positive().optional(),
  total_memory_gb: z.number().positive().optional(),
  total_compute_pflops_bf16: z.number().positive().optional(),
  release_year: z.number().int().min(2010).max(2035),

  // v1.3: deep cluster-internal detail. Optional; populated for the most-
  // cited super-pods (NVL72, CloudMatrix-384, MI300X-OAM cluster).

  /** Scale-up fabric switch detail. Multiple entries for hierarchical
   *  fabrics (NVL72 has both NVSwitch backplane and ConnectX NICs). */
  switch_chips: z.array(SwitchChipSchema).default([]),

  /** Scale-out oversubscription ratio. 1.0 = full bisection, 2.0 = 2:1
   *  over-subscribed. A knob vendors typically hide. */
  oversubscription_ratio: z.number().positive().optional(),

  /** Scale-out NIC count per node — sizes the IB/RoCE fabric. */
  scale_out_nics_per_node: z.number().int().positive().optional(),

  /** Per-NIC scale-out bandwidth (GB/s; ConnectX-7 = 50 GB/s). */
  scale_out_bandwidth_gbps_per_nic: z.number().positive().optional(),

  /** Scale-up bisection bandwidth (TB/s). */
  bisection_bandwidth_tbs: ValueWithEvidenceSchema(z.number().positive()).optional(),

  /** Power distribution detail. */
  power_distribution: PowerDistributionSchema.optional(),

  /** Free-form markdown describing rack/cabinet layout. */
  cabinet_layout_md: z.string().optional(),

  aliases: z.array(z.string()).default([]),
  chinese_names: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).min(1)
});

export type Server = z.infer<typeof ServerSchema>;
export type SwitchChip = z.infer<typeof SwitchChipSchema>;
export type PowerDistribution = z.infer<typeof PowerDistributionSchema>;
