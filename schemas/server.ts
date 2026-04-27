import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const ServerTypeSchema = z.enum(['integrated-server', 'pod', 'super-pod']);
export const CoolingSchema = z.enum(['air', 'liquid', 'immersion', 'hybrid']);

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
  aliases: z.array(z.string()).default([]),
  chinese_names: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).min(1)
});

export type Server = z.infer<typeof ServerSchema>;
