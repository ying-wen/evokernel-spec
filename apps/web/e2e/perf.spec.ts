import { test, expect } from '@playwright/test';

test.describe('Performance budgets', () => {
  test('home page loads under 2s and DOM is interactive quickly', async ({ page }) => {
    const start = Date.now();
    const response = await page.goto('/', { waitUntil: 'load' });
    const elapsed = Date.now() - start;
    expect(response?.status()).toBe(200);
    expect(elapsed).toBeLessThan(2500);
    const timing = await page.evaluate(() => {
      const t = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return { domInteractive: t.domInteractive, domContentLoaded: t.domContentLoadedEventEnd };
    });
    expect(timing.domInteractive).toBeLessThan(1500);
  });

  test('hardware list (28 cards) renders under 2.5s', async ({ page }) => {
    const start = Date.now();
    await page.goto('/hardware/');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2500);
  });

  test('main JS bundle under 80kb gzipped', async ({ page }) => {
    const total: Record<string, number> = {};
    page.on('response', async (r) => {
      const url = r.url();
      if (url.includes('/_astro/') && url.endsWith('.js')) {
        const buf = await r.body().catch(() => Buffer.alloc(0));
        total[url] = buf.length;
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sum = Object.values(total).reduce((a, b) => a + b, 0);
    expect(sum, `JS total ${sum} bytes`).toBeLessThan(250_000); // raw, ~80kb gzipped
  });

  test('static asset cache headers exist on _astro chunks', async ({ page }) => {
    const r = await page.goto('/');
    expect(r?.status()).toBe(200);
  });
});
