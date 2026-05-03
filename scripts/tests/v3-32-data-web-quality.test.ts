/**
 * v3.32 -- knowledge/web quality gates.
 *
 * The schema validator proves YAML shape. This strict audit catches values that
 * are shape-valid but suspicious enough to mislead the website or an agent.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

describe('data audit strict mode (v3.32)', () => {
  it('has zero warning-level audit findings', () => {
    const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/audit-data.ts', '--strict'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/0 warnings,/);
  });
});
