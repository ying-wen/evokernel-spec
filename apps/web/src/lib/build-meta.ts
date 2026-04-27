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
