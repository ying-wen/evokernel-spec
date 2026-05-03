/**
 * v3.26 -- Schema for ~/.config/evokernel/targets.yaml.
 *
 * The user's local SSH-target config. Stored in ~/.config/evokernel/ NOT
 * in repo (per docs/SECURITY-NOTES.md: real SSH host IPs / hostnames must
 * never be committed). Repo ships an `.example` placeholder file showing
 * the shape; users copy it and fill in their actual targets.
 */

import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/**
 * One reachable hardware target. The `ssh` field uses standard ssh-config
 * shorthand (user@host[:port]) so users can leverage their existing
 * ~/.ssh/config aliases (e.g. ssh: my-h100-cluster) instead of pasting
 * raw IPs.
 */
const RemoteTargetSchema = z.object({
  /** Local id used as --remote argument (e.g. "ascend-910b-test"). */
  id: Slug,
  /** Hardware id from corpus (must exist in data/hardware/). */
  hardware: Slug,
  /**
   * SSH connection string. Recommended: define a host alias in
   * ~/.ssh/config so this is just a name. Raw user@ip works too but
   * couples your config to the IP.
   */
  ssh: z.string().min(1),
  /** Per-toolchain config. Auto-detected on first connect; cached after. */
  toolchain: z
    .object({
      cuda_version: z.string().optional(),       // e.g. "12.6"
      rocm_version: z.string().optional(),       // e.g. "6.2"
      cann_version: z.string().optional(),       // e.g. "8.0.RC1"
      neuware_version: z.string().optional(),    // e.g. "3.x"
      profiler: z.enum(['ncu', 'rocprof', 'msprof', 'cnperf', 'suprof', 'instruments']).optional(),
      /** Where to put per-deploy work dirs on the remote. Default: /tmp/evokernel-work */
      work_dir: z.string().default('/tmp/evokernel-work'),
    })
    .default({ work_dir: '/tmp/evokernel-work' }),
  /** Free-form notes (e.g. "shared GPU - check before submit"). */
  notes: z.string().optional(),
});

export const TargetsConfigSchema = z.object({
  schema_version: z.literal('0.1').default('0.1'),
  targets: z.array(RemoteTargetSchema).default([]),
});

export type RemoteTarget = z.infer<typeof RemoteTargetSchema>;
export type TargetsConfig = z.infer<typeof TargetsConfigSchema>;

/**
 * Map a hardware id to the vendor family used for build script dispatch.
 * Tightly coupled to scripts/agent-deploy/remote/<vendor>/build.sh; new
 * vendors require both an entry here and a matching build script dir.
 */
export type VendorFamily = 'nvidia' | 'amd' | 'ascend' | 'cambricon' | 'unknown';

export function vendorFamilyForHardware(hardware_id: string): VendorFamily {
  const id = hardware_id.toLowerCase();
  if (id.startsWith('h100') || id.startsWith('h200') || id.startsWith('b100') || id.startsWith('b200') ||
      id.startsWith('b300') || id.startsWith('gb300') || id.startsWith('a100') || id.startsWith('rtx-') ||
      id.startsWith('l40') || id.startsWith('dgx') || id.startsWith('jetson') || id.startsWith('blackwell')) {
    return 'nvidia';
  }
  if (id.startsWith('mi') || id.startsWith('rx-') || id.startsWith('ryzen-')) {
    return 'amd';
  }
  if (id.startsWith('ascend-') || id.startsWith('atlas-') || id.includes('910') || id.includes('950')) {
    return 'ascend';
  }
  if (id.startsWith('mlu')) {
    return 'cambricon';
  }
  return 'unknown';
}
