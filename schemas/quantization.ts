import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const QuantizationFamilySchema = z.enum([
  'fp', 'fp8', 'fp4', 'int', 'mixed', 'awq', 'gptq', 'other'
]);

export const QuantizationSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  bits_per_weight: z.number().positive().max(64),
  bits_per_activation: z.number().positive().max(64),
  family: QuantizationFamilySchema,
  lossless: z.boolean(),
  description: z.string().optional()
});
export type Quantization = z.infer<typeof QuantizationSchema>;
