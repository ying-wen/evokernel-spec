// Build-time metadata: timestamp and short git SHA captured once at build.
// All data shown to users about "last updated" comes from here so it's
// deterministic and matches the deployed bundle.

import { execSync } from 'node:child_process';

let cachedSha: string | null = null;
function getGitSha(): string {
  if (cachedSha !== null) return cachedSha;
  try {
    cachedSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    cachedSha = 'dev';
  }
  return cachedSha;
}

const BUILD_TIME = new Date().toISOString();

export function buildMeta() {
  return {
    builtAt: BUILD_TIME,
    sha: getGitSha()
  };
}

export interface ContributorStats {
  contributorCount: number;
  topContributors: Array<{ name: string; commits: number }>;
  commitCount: number;
  firstCommitDate: string | null;
  lastCommitDate: string | null;
}

let cachedContributorStats: ContributorStats | null = null;

/**
 * Snapshot contributor / commit stats at build time. All values come from
 * `git log` so they reflect the deployed build exactly. Server-only — shells
 * out to git, never bundle to the client.
 */
export function contributorStats(): ContributorStats {
  if (cachedContributorStats) return cachedContributorStats;
  try {
    const shortlog = execSync('git shortlog -sne --no-merges HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const lines = shortlog.split('\n').filter(Boolean);
    const top = lines.slice(0, 5).map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+?)(?:\s+<.*>)?$/);
      return match
        ? { commits: Number(match[1]), name: match[2] }
        : { commits: 0, name: line.trim() };
    });
    const total = lines.reduce((sum, line) => {
      const match = line.trim().match(/^(\d+)\s/);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);
    const firstCommit = execSync('git log --reverse --format=%cI HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).split('\n')[0]?.trim() ?? '';
    const lastCommit = execSync('git log -1 --format=%cI HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    cachedContributorStats = {
      contributorCount: lines.length,
      topContributors: top,
      commitCount: total,
      firstCommitDate: firstCommit || null,
      lastCommitDate: lastCommit || null
    };
  } catch {
    cachedContributorStats = {
      contributorCount: 0,
      topContributors: [],
      commitCount: 0,
      firstCommitDate: null,
      lastCommitDate: null
    };
  }
  return cachedContributorStats;
}

export function lastUpdatedFor(filePath: string): string {
  // Best-effort: use git log -1 for that file. Fall back to build time.
  try {
    const out = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return out || BUILD_TIME;
  } catch {
    return BUILD_TIME;
  }
}
