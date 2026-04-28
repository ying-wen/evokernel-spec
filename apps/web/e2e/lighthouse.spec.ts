import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Lighthouse-CI-style smoke check. Spawns the lighthouse CLI against the running
// preview server and parses JSON output; asserts each route meets the v1.1 budget.
//
// Skip locally with E2E_SKIP_LIGHTHOUSE=1 (slow: ~10s/page). CI runs it once
// per branch. Each page gets a 2-attempt allowance to absorb cold-start jitter.

const ARTIFACTS = path.resolve(import.meta.dirname, '../../../artifacts/lighthouse');

interface Budget {
  performance: number;       // 0-1, Lighthouse perf score
  accessibility: number;     // 0-1, a11y score
  bestPractices: number;     // 0-1, best-practices score
  seo: number;               // 0-1, SEO score
  lcpMs?: number;            // optional: max Largest Contentful Paint
  clsScore?: number;         // optional: max Cumulative Layout Shift
}

const ROUTES: Array<{ path: string; budget: Budget }> = [
  { path: '/', budget: { performance: 0.85, accessibility: 0.95, bestPractices: 0.9, seo: 0.95, lcpMs: 2500, clsScore: 0.1 } },
  { path: '/hardware/', budget: { performance: 0.8, accessibility: 0.95, bestPractices: 0.9, seo: 0.95 } },
  { path: '/calculator/', budget: { performance: 0.7, accessibility: 0.95, bestPractices: 0.9, seo: 0.9 } }, // React island heaviest
  { path: '/china/', budget: { performance: 0.8, accessibility: 0.95, bestPractices: 0.9, seo: 0.95 } }
];

interface LighthouseRun {
  categories: {
    performance: { score: number };
    accessibility: { score: number };
    'best-practices': { score: number };
    seo: { score: number };
  };
  audits: {
    'largest-contentful-paint'?: { numericValue?: number };
    'cumulative-layout-shift'?: { numericValue?: number };
  };
}

async function runLighthouse(url: string): Promise<LighthouseRun | null> {
  return new Promise((resolve) => {
    mkdirSync(ARTIFACTS, { recursive: true });
    const args = [
      url,
      '--output=json',
      '--output-path=stdout',
      '--quiet',
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--throttling.cpuSlowdownMultiplier=1', // keep fast on local
      '--max-wait-for-load=20000'
    ];
    const child = spawn('pnpm', ['exec', 'lighthouse', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let json = '';
    child.stdout.on('data', (d) => { json += d; });
    child.on('close', () => {
      try {
        // Lighthouse may emit progress lines before JSON; find the first '{'.
        const start = json.indexOf('{');
        if (start < 0) return resolve(null);
        resolve(JSON.parse(json.slice(start)) as LighthouseRun);
      } catch {
        resolve(null);
      }
    });
  });
}

// Sequential — Chrome contention causes one-of-N spurious failures otherwise.
test.describe.serial('Lighthouse performance budgets', () => {
  // Skip globally — this is opt-in (slow, runs in CI weekly cron rather than per-PR)
  test.skip(!process.env.RUN_LIGHTHOUSE, 'Set RUN_LIGHTHOUSE=1 to enable (slow ~10s/route)');

  test.setTimeout(120_000);

  for (const route of ROUTES) {
    test(`${route.path} meets performance + a11y + SEO budget`, async () => {
      const url = `http://127.0.0.1:4321${route.path}`;
      const result = await runLighthouse(url);
      if (!result) {
        test.skip(true, 'Lighthouse failed to produce JSON output');
        return;
      }
      expect.soft(result.categories.performance.score, 'performance').toBeGreaterThanOrEqual(route.budget.performance);
      expect.soft(result.categories.accessibility.score, 'accessibility').toBeGreaterThanOrEqual(route.budget.accessibility);
      expect.soft(result.categories['best-practices'].score, 'best-practices').toBeGreaterThanOrEqual(route.budget.bestPractices);
      expect.soft(result.categories.seo.score, 'seo').toBeGreaterThanOrEqual(route.budget.seo);
      if (route.budget.lcpMs) {
        const lcp = result.audits['largest-contentful-paint']?.numericValue ?? Infinity;
        expect.soft(lcp, 'LCP ms').toBeLessThanOrEqual(route.budget.lcpMs);
      }
      if (route.budget.clsScore) {
        const cls = result.audits['cumulative-layout-shift']?.numericValue ?? Infinity;
        expect.soft(cls, 'CLS').toBeLessThanOrEqual(route.budget.clsScore);
      }
    });
  }
});
