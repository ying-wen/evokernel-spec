import { z } from 'zod';

/**
 * External citations of the EvoKernel Spec project — papers, blog posts,
 * conference talks, and docs that link to the site or use its data. This
 * is the strongest "this matters" signal we surface on /impact/.
 *
 * Curated by hand: PRs add entries to data/citations.yaml. We do not auto-
 * scrape — the manual gate keeps quality high and avoids surfacing low-effort
 * mentions.
 */

export const CitationSourceTypeSchema = z.enum([
  'paper',
  'blog',
  'talk',
  'docs',
  'tweet',
  'video',
  'podcast',
  'newsletter',
  'press',
  'other'
]);

export type CitationSourceType = z.infer<typeof CitationSourceTypeSchema>;

export const CitationSchema = z.object({
  id: z.string().regex(/^cite-[a-z0-9-]+$/, 'Citation id must start with "cite-"'),
  title: z.string().min(1),
  url: z.string().url(),
  source_type: CitationSourceTypeSchema,

  /** Author or org name. Optional for anonymous / community sources. */
  author: z.string().optional(),

  /** Publication date in ISO format (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be ISO YYYY-MM-DD'),

  /** Short excerpt or summary (1-3 sentences). What does this citation say? */
  snippet: z.string().min(1).max(500),

  /** Optional language tag for snippet ("zh", "en", etc.). */
  lang: z.string().optional(),

  /**
   * Optional structured tags — what part of the project does this citation
   * highlight? Lets /impact/ filter by topic.
   */
  topics: z
    .array(z.enum(['hardware', 'cluster', 'operator', 'fused-kernel', 'pattern', 'case', 'playbook', 'general']))
    .default([])
});

export type Citation = z.infer<typeof CitationSchema>;
