import { test, expect } from '@playwright/test';

test.describe('island links + locale switcher under base path', () => {
  test.use({ baseURL: 'http://127.0.0.1:8090' });

  test('hardware grid hrefs are base-prefixed', async ({ page }) => {
    await page.goto('/evokernel-spec/hardware/', { waitUntil: 'networkidle' });
    await page.waitForSelector('a[href*="h100-sxm5"]', { timeout: 10000 });
    const hrefs = await page.locator('a[href*="/hardware/h"]').evaluateAll(els =>
      els.slice(0, 6).map(e => e.getAttribute('href') ?? '')
    );
    for (const h of hrefs) {
      expect(h, `href: ${h}`).toMatch(/^\/evokernel-spec\//);
    }
  });

  test('locale switcher href has correct base-then-locale order', async ({ page }) => {
    await page.goto('/evokernel-spec/hardware/', { waitUntil: 'networkidle' });
    const href = await page.locator('a[aria-label="Switch language"]').first().getAttribute('href');
    expect(href, `switcher href: ${href}`).toBe('/evokernel-spec/en/hardware/');
  });

  test('case leaderboard rendered hrefs are base-prefixed', async ({ page }) => {
    await page.goto('/evokernel-spec/cases/', { waitUntil: 'networkidle' });
    await page.waitForSelector('a[href*="/cases/case-"]', { timeout: 10000 });
    const hrefs = await page.locator('a[href*="/cases/case-"]').evaluateAll(els =>
      els.slice(0, 5).map(e => e.getAttribute('href') ?? '')
    );
    for (const h of hrefs) {
      expect(h, `href: ${h}`).toMatch(/^\/evokernel-spec\//);
    }
  });

  test('compare tool table-view hardware hrefs are base-prefixed', async ({ page }) => {
    await page.goto('/evokernel-spec/compare/?ids=h100-sxm5,b200-sxm', { waitUntil: 'networkidle' });
    // Wait for hydration of the table view
    await page.waitForSelector('table a[href*="/hardware/"]', { timeout: 10000 });
    const hrefs = await page.locator('table a[href*="/hardware/"]').evaluateAll(els =>
      els.slice(0, 4).map(e => e.getAttribute('href') ?? '')
    );
    for (const h of hrefs) {
      expect(h, `href: ${h}`).toMatch(/^\/evokernel-spec\//);
    }
  });

  test('search bootstrap path is base-prefixed', async ({ page }) => {
    // Pagefind script is fetched dynamically — track network requests
    const fetched: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/pagefind/')) fetched.push(u);
    });
    await page.goto('/evokernel-spec/', { waitUntil: 'networkidle' });
    // Open search box (⌘K) to trigger pagefind load
    await page.keyboard.press('Control+k').catch(() => page.keyboard.press('Meta+k'));
    await page.waitForTimeout(1500);
    // The asset request (if it happened) should include /evokernel-spec/pagefind/
    for (const u of fetched) {
      expect(u, `pagefind url: ${u}`).toMatch(/\/evokernel-spec\/pagefind\//);
    }
  });
});
