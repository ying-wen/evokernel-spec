import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const PatternCategorySchema = z.enum([
  'quantization', 'parallel', 'kv-cache', 'communication',
  'kernel-fusion', 'scheduling', 'disaggregation', 'misc'
]);

export const PatternSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  category: PatternCategorySchema,
  description_md: z.string().min(1),
  applies_when: z.array(z.string()).default([]),
  related_operators: z.array(Slug).default([]),
  supporting_cases_min: z.number().int().nonnegative().default(0)
});

export type Pattern = z.infer<typeof PatternSchema>;
