/**
 * Schema for the MANIFEST.json that ships at the top of each
 * pack:dist tarball. Receivers of the offline tarball rely on this
 * file for provenance — so the shape must not drift silently.
 *
 * If you add a field, decide:
 *   - is it REQUIRED (every tarball must carry it) → no .optional()
 *   - or NICE-TO-HAVE (legacy tarballs might lack it) → .optional()
 *
 * Then update scripts/pack-dist.ts to write it AND update this schema
 * AND bump the schema_version constant. The unit test in this package
 * will catch you if you forget any of those.
 */
import { z } from 'zod';

export const MANIFEST_SCHEMA_VERSION = 1 as const;

export const ManifestSchema = z.object({
  product: z.literal('evokernel-spec'),
  version: z.string().regex(/^v\d+\.\d+(\.\d+)?$/, 'expected vX.Y or vX.Y.Z'),
  build: z.object({
    sha: z.string().min(4),
    dirty: z.boolean(),
    built_at: z.string().datetime()
  }),
  contents: z.object({
    pages: z.number().int().nonnegative(),
    bytes: z.number().int().positive(),
    entities: z.record(z.string(), z.number().int().nonnegative())
  }),
  served_via: z.string().min(1),
  health_endpoints: z.array(z.string().startsWith('/api/')).min(1),
  unpack: z.string().min(1),
  license: z.object({
    code: z.string(),
    data: z.string()
  })
});

export type Manifest = z.infer<typeof ManifestSchema>;
