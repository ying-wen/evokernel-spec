import { z } from 'zod';

const SlugSchema = z.string().regex(/^[a-z0-9-]+$/, 'must be kebab-case');
const CountrySchema = z.string().regex(/^[A-Z]{2}$/, 'ISO-3166 alpha-2');

export const VendorTypeSchema = z.enum(['hardware', 'model-lab', 'both']);

export const VendorSchema = z.object({
  id: SlugSchema,
  name: z.string().min(1),
  chinese_names: z.array(z.string()).default([]),
  country: CountrySchema,
  type: VendorTypeSchema,
  website: z.string().url(),
  aliases: z.array(z.string()).default([]),
  description: z.string().optional(),
  logo: z.string().optional()
});

export type Vendor = z.infer<typeof VendorSchema>;
