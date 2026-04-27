import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const OperatorCategorySchema = z.enum([
  'matmul', 'attention', 'norm', 'activation', 'embedding',
  'moe-routing', 'communication', 'misc'
]);

export const OperatorSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  category: OperatorCategorySchema,
  flops_formula: z.string().min(1),
  bytes_formula: z.string().min(1),
  description: z.string().min(1),
  variants: z.array(Slug).default([])
});
export type Operator = z.infer<typeof OperatorSchema>;
