import { useEffect, useState } from 'react';

/**
 * Live GitHub repository dashboard. Fetches repo + contributor count from
 * the public GitHub REST API; cached in localStorage for 1 hour to stay
 * inside the unauthenticated rate limit (60 req/hour/IP).
 */

interface RepoStats {
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  subscribers_count: number;
  network_count: number;
  pushed_at: string;
}

interface CacheEntry<T> {
  fetchedAt: number;
  value: T;
}

const REPO_OWNER = 'ying-wen';
const REPO_NAME = 'evokernel-spec';
const REPO_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const CACHE_KEY_REPO = `evokernel:impact-dashboard:repo`;
const CACHE_TTL_MS = 60 * 60 * 1000;

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ fetchedAt: Date.now(), value }));
  } catch {
    // Ignore quota errors silently.
  }
}

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export default function ImpactDashboard() {
  // Always start with null on first render so SSR HTML matches client first
  // paint (avoids React #418 hydration mismatch). Cache is consulted in the
  // first useEffect tick.
  const [repo, setRepo] = useState<RepoStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (repo !== null) return;
    let cancelled = false;
    const cached = readCache<RepoStats>(CACHE_KEY_REPO);
    if (cached) {
      setRepo(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(REPO_API, { headers: { Accept: 'application/vnd.github.v3+json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        return res.json();
      })
      .then((data: RepoStats) => {
        if (cancelled) return;
        const stats: RepoStats = {
          stargazers_count: data.stargazers_count ?? 0,
          forks_count: data.forks_count ?? 0,
          watchers_count: data.watchers_count ?? 0,
          open_issues_count: data.open_issues_count ?? 0,
          subscribers_count: data.subscribers_count ?? 0,
          network_count: data.network_count ?? 0,
          pushed_at: data.pushed_at ?? new Date().toISOString()
        };
        setRepo(stats);
        writeCache(CACHE_KEY_REPO, stats);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'fetch failed');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const cards: Array<{ key: string; label: string; value: string; sub?: string }> = [
    {
      key: 'stars',
      label: 'GitHub Stars',
      value: error ? '—' : loading || !repo ? '…' : formatNumber(repo.stargazers_count),
      sub: '收藏量 / popularity'
    },
    {
      key: 'forks',
      label: 'Forks',
      value: error ? '—' : loading || !repo ? '…' : formatNumber(repo.forks_count),
      sub: '复刻数 / contributor pool'
    },
    {
      key: 'watchers',
      label: 'Watchers',
      value: error ? '—' : loading || !repo ? '…' : formatNumber(repo.subscribers_count || repo.watchers_count),
      sub: '订阅者 / engaged readers'
    },
    {
      key: 'issues',
      label: 'Open Issues',
      value: error ? '—' : loading || !repo ? '…' : formatNumber(repo.open_issues_count),
      sub: '议题 / discussion volume'
    },
    {
      key: 'pushed',
      label: 'Last Pushed',
      value: error ? '—' : loading || !repo ? '…' : formatRelative(repo.pushed_at),
      sub: '上次推送 / freshness'
    }
  ];

  return (
    <div className="impact-dashboard-grid">
      {cards.map((c) => (
        <div className="impact-dashboard-card" key={c.key} data-testid={`impact-card-${c.key}`}>
          <div className="impact-dashboard-card-label">{c.label}</div>
          <div className="impact-dashboard-card-value tabular-nums">{c.value}</div>
          {c.sub && <div className="impact-dashboard-card-sub">{c.sub}</div>}
        </div>
      ))}
      {error && (
        <div className="impact-dashboard-error" role="status">
          GitHub API 暂时不可用 ({error}). 请稍后刷新.
        </div>
      )}
    </div>
  );
}
