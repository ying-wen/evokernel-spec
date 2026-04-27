import { z } from 'zod';

export const TierSchema = z.enum(['official', 'measured', 'estimated']);
export type Tier = z.infer<typeof TierSchema>;

export const SourceTypeSchema = z.enum([
  'vendor-whitepaper',
  'vendor-press-release',
  'vendor-product-page',
  'vendor-datasheet',
  'mlperf-submission',
  'community-benchmark',
  'paper',
  'conference-talk',
  'third-party-review',
  'other'
]);

const EvidenceBase = z.object({
  id: z.string().regex(/^ev-[a-z0-9-]+$/, 'Evidence id must start with "ev-"'),
  tier: TierSchema,
  source_type: SourceTypeSchema,
  url: z.string().url(),
  accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'accessed must be ISO date YYYY-MM-DD'),
  citation: z.string().min(1),
  raw_data_url: z.string().url().optional(),
  contributor_attestation: z.string().min(20).optional()
});

export const EvidenceSchema = EvidenceBase.refine(
  (e) => e.tier !== 'measured' || (e.contributor_attestation && e.contributor_attestation.length > 0),
  { message: 'tier=measured requires contributor_attestation' }
);
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ValueWithEvidenceSchema = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      value: value,
      evidence_ref: z.string().regex(/^ev-[a-z0-9-]+$/)
    })
    .nullable();

export type ValueWithEvidence<T> = { value: T; evidence_ref: string } | null;
