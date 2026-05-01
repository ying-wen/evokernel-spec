// Parse CHANGELOG.md into structured releases.
//
// Source of truth: CHANGELOG.md at the repo root. Format follows Keep a
// Changelog conventions: each release is a `## [x.y.z] — YYYY-MM-DD` header
// followed by markdown body. We split on these headers to produce a list of
// releases that both `/changelog/` (HTML) and `/feed.xml` (RSS) consume.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Release {
  /** Semver string, e.g. "1.33.0". */
  version: string;
  /** ISO date "YYYY-MM-DD". */
  date: string;
  /** Markdown body (without the header line). */
  body_md: string;
  /** First non-empty paragraph of the body — used as RSS description. */
  summary: string;
}

let cache: Release[] | null = null;

/**
 * Locate the repo-root CHANGELOG.md regardless of the build cwd. Astro builds
 * from `apps/web/`, so we walk up to find the file.
 */
function findChangelogPath(): string {
  // 3 levels up from apps/web/src/lib/ = repo root
  const candidates = [
    resolve(process.cwd(), '../../CHANGELOG.md'),
    resolve(process.cwd(), '../CHANGELOG.md'),
    resolve(process.cwd(), 'CHANGELOG.md')
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, 'utf-8');
      return p;
    } catch {
      // try next
    }
  }
  throw new Error('CHANGELOG.md not found in any parent directory');
}

/**
 * Parse CHANGELOG.md once at build time. Returns sorted (newest-first) list
 * of releases. The "Unreleased" section is intentionally skipped — it's a
 * placeholder, not a real release.
 */
export function getReleases(): Release[] {
  if (cache) return cache;

  const path = findChangelogPath();
  const raw = readFileSync(path, 'utf-8');

  // Split on H2 headers. Match either format:
  //   ## [1.33.0] — 2026-05-02
  //   ## [Unreleased]
  const releases: Release[] = [];
  const headerRegex = /^##\s+\[([^\]]+)\]\s*(?:[—\-–]\s*(\d{4}-\d{2}-\d{2}))?\s*$/gm;
  const matches: Array<{ version: string; date: string | null; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(raw)) !== null) {
    matches.push({
      version: m[1],
      date: m[2] ?? null,
      start: m.index,
      end: m.index + m[0].length
    });
  }
  // For each header, body is from end-of-header to start-of-next-header (or EOF).
  for (let i = 0; i < matches.length; i++) {
    const h = matches[i];
    const next = matches[i + 1];
    const body = raw.slice(h.end, next ? next.start : undefined).trim();
    // Skip "Unreleased" — placeholder, no date
    if (h.version.toLowerCase() === 'unreleased' || !h.date) continue;
    // Stop at horizontal rule preceding next header (--- separator) — keep clean body
    const cleanBody = body.replace(/\n---\s*$/m, '').trim();
    // Summary = first non-empty paragraph (200 char cap)
    const firstPara = cleanBody.split(/\n\n/).find((p) => p.trim().length > 0) ?? '';
    const summary = firstPara.replace(/^\*\*([^*]+)\*\*\s*/, '$1: ').slice(0, 220).replace(/\n/g, ' ');
    releases.push({
      version: h.version,
      date: h.date,
      body_md: cleanBody,
      summary
    });
  }
  // Already in newest-first order in the source; sort defensively by date desc
  releases.sort((a, b) => b.date.localeCompare(a.date));
  cache = releases;
  return releases;
}
