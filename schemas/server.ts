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
 * Host CPU detail per node — the CPU choice often constrains:
 *   - PCIe lanes available to GPUs (Gen4 vs Gen5)
 *   - Coherent links (NVLink-C2C on Grace, Infinity Fabric on EPYC, CXL)
 *   - NUMA topology (1S vs 2S layout)
 *   - Total host RAM ceiling (Grace 480GB unified vs EPYC 9654 12TB max)
 *
 * Captured at the cluster level since the same node design propagates
 * across the entire super-pod / pod.
 */
const HostCpuSchema = z.object({
  /** CPU model name, e.g. "NVIDIA Grace 72-core", "AMD EPYC 9654". */
  name: z.string().min(1),
  /** Vendor — "nvidia", "amd", "intel", "huawei", "ampere-computing". */
  vendor: z.string().min(1),
  /** Architecture: "arm-neoverse-v2", "x86-zen4", "x86-sapphire-rapids". */
  architecture: z.string().min(1),
  /** Total cores per node (sum across sockets). */
  cores_per_node: z.number().int().positive(),
  /** Socket count per node (1S, 2S, etc.). */
  sockets_per_node: z.number().int().positive(),
  /** PCIe generation exposed to GPUs. */
  pcie_gen: z.number().int().min(3).max(7).optional(),
  /** Total PCIe lanes per node (sum across sockets). */
  pcie_lanes_per_node: z.number().int().positive().optional(),
  /** Host DRAM capacity per node in GB. */
  host_ram_gb: z.number().positive().optional(),
  /** Whether the CPU has GPU-coherent link (NVLink-C2C, Infinity Fabric, CXL). */
  has_coherent_gpu_link: z.boolean().optional(),
  /** Free-text notes — typically the unique selling point of this CPU choice. */
  notes: z.string().optional()
});

/**
 * Network-topology detail at the cluster level. Different topologies have
 * dramatically different all-reduce / all-to-all scaling behavior — fat-tree
 * with rail-optimized RDMA suits dense LLM TP, dragonfly+ minimizes longest-
 * path hops at scale, 2D/3D-torus is what wafer-scale and Trainium UltraServer
 * use. The shape of the inter-node fabric is the architectural divider.
 *
 * v1.28+: previously the bare `inter_node_interconnect` enum (RoCEv2 / IB-XDR /
 * Slingshot / etc.) told you the link type but not how the cluster is wired.
 */
const NetworkTopologySchema = z.object({
  /** Topology family. */
  topology: z.enum([
    'fat-tree',
    'fat-tree-rail-optimized',
    'dragonfly-plus',
    'full-mesh',
    '2d-torus',
    '3d-torus',
    '4d-torus',
    'slim-fly',
    'optical-fabric',
    'hierarchical-mesh',
    'star-burst',
    'single-switch',
    'other'
  ]),
  /** Whether the fabric supports SHARP-style in-network reduction. */
  in_network_reduction: z.boolean().optional(),
  /** Diameter — max hop count between any pair of GPUs in the cluster. */
  diameter_hops: z.number().int().positive().optional(),
  /** Per-node bisection bandwidth out of the node, in GB/s. */
  bisection_bandwidth_gbps_per_node: z.number().positive().optional(),
  /** Inter-node p99 latency in microseconds (real-world, not best-case). */
  latency_us_p99_inter_node: z.number().positive().optional(),
  /** Intra-node p99 latency in microseconds (between two GPUs in same node). */
  latency_us_p99_intra_node: z.number().positive().optional(),
  /** Total inter-node fabric switch chip count. */
  switch_count: z.number().int().nonnegative().optional(),
  /** Whether RDMA is supported on the inter-node fabric. */
  rdma_capable: z.boolean().optional(),
  /** Free-text notes — what's distinctive about this topology choice. */
  notes: z.string().optional()
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

  /** Host CPU detail. v1.26+: lets readers compare Grace vs EPYC vs
   *  Kunpeng across super-pods via /servers/host-cpu-matrix/. */
  host_cpu: HostCpuSchema.optional(),

  /** Network topology detail. v1.28+: lets readers compare fat-tree vs
   *  dragonfly+ vs torus across super-pods via /servers/network-topology/. */
  network_topology: NetworkTopologySchema.optional(),

  /** Free-form markdown describing rack/cabinet layout. */
  cabinet_layout_md: z.string().optional(),

  aliases: z.array(z.string()).default([]),
  chinese_names: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).min(1)
});

export type Server = z.infer<typeof ServerSchema>;
export type SwitchChip = z.infer<typeof SwitchChipSchema>;
export type PowerDistribution = z.infer<typeof PowerDistributionSchema>;
export type HostCpu = z.infer<typeof HostCpuSchema>;
export type NetworkTopology = z.infer<typeof NetworkTopologySchema>;
