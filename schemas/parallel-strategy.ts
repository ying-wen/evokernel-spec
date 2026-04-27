import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const ParallelFamilySchema = z.enum([
  'intra-layer', 'inter-layer', 'expert', 'sequence', 'data', 'disaggregated'
]);

export const ParallelStrategySchema = z.object({
  id: Slug,
  name: z.string().min(1),
  family: ParallelFamilySchema,
  description: z.string().min(1),
  typical_use_cases: z.array(z.string()).default([])
});
export type ParallelStrategy = z.infer<typeof ParallelStrategySchema>;
