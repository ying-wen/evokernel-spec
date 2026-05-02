/**
 * Changelog parser regression tests.
 *
 * Pre-v3.17 the parser regex required end-of-line right after the date,
 * which silently dropped 14 versions (v3.3-v3.16) from /changelog/ — those
 * releases used `## [x.y.z] — date — themed name` headers that didn't match.
 * This test guards against that and any future header-format drift.
 */
import { describe, it, expect } from 'vitest';
import { getReleases } from '~/lib/changelog';

describe('changelog parser', () => {
  const releases = getReleases();

  it('parses every documented release (no version silently dropped)', () => {
    // Pre-v3.17 this returned only 3-4 releases despite 30+ in CHANGELOG.md.
    // Sanity floor: at least every v3.x.0 we've shipped should be present.
    expect(releases.length).toBeGreaterThanOrEqual(20);
  });

  it('handles 2-segment headers (## [x.y.z] — YYYY-MM-DD)', () => {
    // v3.1.0 + v3.2.0 + v2.25.0 use the simpler 2-segment format.
    const v32 = releases.find((r) => r.version === '3.2.0');
    expect(v32).toBeDefined();
    expect(v32?.date).toBe('2026-05-03');
  });

  it('handles 3-segment headers (## [x.y.z] — YYYY-MM-DD — themed name)', () => {
    // Most v3.3+ releases use this form; this is what the bug masked.
    const v316 = releases.find((r) => r.version === '3.16.0');
    expect(v316).toBeDefined();
    expect(v316?.date).toBe('2026-05-03');
    expect(v316?.body_md).toMatch(/MLX/);
  });

  it('handles 3-segment headers with non-ASCII content (— + 国产)', () => {
    // CJK/em-dash mix in headers must not break the parser.
    const v315 = releases.find((r) => r.version === '3.15.0');
    expect(v315).toBeDefined();
    expect(v315?.body_md).toMatch(/Ascend-C|国产/);
  });

  it('skips the [Unreleased] placeholder entry', () => {
    expect(releases.find((r) => r.version.toLowerCase() === 'unreleased')).toBeUndefined();
  });

  it('returns releases sorted newest-first', () => {
    for (let i = 0; i < releases.length - 1; i++) {
      expect(releases[i].date >= releases[i + 1].date).toBe(true);
    }
  });

  it('every release has a non-empty body_md and summary', () => {
    for (const r of releases) {
      expect(r.body_md.length).toBeGreaterThan(0);
      expect(r.summary.length).toBeGreaterThan(0);
    }
  });
});
