import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const InterconnectFamilySchema = z.enum([
  'nvlink', 'nvswitch', 'infinity-fabric', 'hccs', 'ualink',
  'pcie', 'cxl', 'infiniband', 'roce', 'lingqu', 'other'
]);

export const InterconnectSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  family: InterconnectFamilySchema,
  typical_bandwidth_gbps: z.number().positive(),
  vendor: Slug.optional(),
  description: z.string().optional(),
  evidence: z.array(EvidenceSchema).min(1)
});
export type Interconnect = z.infer<typeof InterconnectSchema>;
