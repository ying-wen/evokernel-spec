import { useEffect, useState } from 'react';

/**
 * Live GitHub repository stats — fetched client-side from the public GitHub
 * REST API (no auth, 60 req/hour/IP). Result cached in localStorage for 1 hour
 * so navigating around the site doesn't burn the rate limit. Renders a
 * skeleton number until the fetch resolves; falls back to a static "—" if the
 * API is unreachable.
 *
 * Click takes the user to the repo's star button on GitHub. We can't
 * one-click-star without OAuth; opening the GH UI is the next-best.
 */

interface RepoStats {
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
}

interface CacheEntry {
  fetchedAt: number;
  stats: RepoStats;
}

const REPO_OWNER = 'ying-wen';
const REPO_NAME = 'evokernel-spec';
const REPO_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const STAR_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const CACHE_KEY = `evokernel:github-stats`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function readCache(): RepoStats | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.stats;
  } catch {
    return null;
  }
}

function writeCache(stats: RepoStats): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), stats };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded / private mode — fail silently, just refetch next time.
  }
}

function formatCount(count: number): string {
  if (count >= 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count >= 1000) return count.toLocaleString('en-US');
  return String(count);
}

interface GitHubStarButtonProps {
  /** Compact (icon + count) or full (with "Star" label) — default 'compact'. */
  variant?: 'compact' | 'full';
}

export default function GitHubStarButton({ variant = 'compact' }: GitHubStarButtonProps) {
  // Always start with null so SSR + client first-render match (React #418 trap).
  // We read the cache in useEffect (client-only) on first mount.
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (stats !== null) return; // Cache hit; nothing to do.
    let cancelled = false;
    // Try cache first to avoid an API call when we already have a fresh value.
    const cached = readCache();
    if (cached) {
      setStats(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(REPO_API, { headers: { Accept: 'application/vnd.github.v3+json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data: RepoStats) => {
        if (cancelled) return;
        const fresh: RepoStats = {
          stargazers_count: data.stargazers_count ?? 0,
          forks_count: data.forks_count ?? 0,
          watchers_count: data.watchers_count ?? 0,
          open_issues_count: data.open_issues_count ?? 0
        };
        setStats(fresh);
        writeCache(fresh);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stats]);

  const starCount = stats?.stargazers_count;
  const display = error ? '—' : loading || starCount === undefined ? '…' : formatCount(starCount);

  return (
    <a
      href={STAR_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="gh-star-button"
      aria-label={`Star ${REPO_OWNER}/${REPO_NAME} on GitHub (current count ${display})`}
      data-testid="gh-star-button"
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        fill="currentColor"
        className="gh-star-icon"
      >
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
      </svg>
      <span className="gh-star-count" data-testid="gh-star-count">
        {display}
      </span>
      {variant === 'full' && <span className="gh-star-label">Star</span>}
    </a>
  );
}
