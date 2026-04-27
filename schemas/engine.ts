import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const EngineMaintainerSchema = z.enum(['community', 'vendor', 'commercial', 'mixed']);

export const EngineSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  maintainer: EngineMaintainerSchema,
  source_url: z.string().url(),
  documentation_url: z.string().url().optional(),
  supported_hardware_vendors: z.array(Slug).min(1),
  latest_version: z.string().min(1),
  notes: z.string().optional()
});
export type Engine = z.infer<typeof EngineSchema>;
