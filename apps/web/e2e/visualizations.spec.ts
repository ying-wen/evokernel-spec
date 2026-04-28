import { test, expect } from '@playwright/test';

test.describe('New visualization features', () => {
  test('compare page with radar / bar / table view toggle', async ({ page }) => {
    await page.goto('/compare/');
    await expect(page.getByRole('heading', { name: /硬件对比/ })).toBeVisible();
    // Default is now table view (per user request: "默认先上来table"); BF16 column header visible
    await expect(page.getByRole('columnheader', { name: /BF16/ }).first()).toBeVisible({ timeout: 10000 });
    // Switch to radar (explicit waits to absorb hydration jitter under parallel workers)
    const radarBtn = page.getByRole('button', { name: '雷达图', exact: true });
    await radarBtn.waitFor({ state: 'visible', timeout: 10000 });
    await radarBtn.click();
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 10000 });
    // Switch to bar
    const barBtn = page.getByRole('button', { name: '柱状图', exact: true });
    await barBtn.waitFor({ state: 'visible', timeout: 10000 });
    await barBtn.click();
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 10000 });
    // Switch back to table
    const tableBtn = page.getByRole('button', { name: '表格', exact: true });
    await tableBtn.waitFor({ state: 'visible', timeout: 10000 });
    await tableBtn.click();
    await expect(page.getByRole('columnheader', { name: /BF16/ }).first()).toBeVisible({ timeout: 10000 });
  });

  test('topology svg renders on hardware detail (8-card)', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.getByRole('heading', { name: /拓扑示意/ })).toBeVisible();
    await expect(page.getByLabel(/H100.*topology|scale-up/i).first()).toBeVisible();
  });

  test('topology svg renders for super-pod (NVL72)', async ({ page }) => {
    await page.goto('/hardware/gb200-nvl72/');
    await expect(page.getByRole('heading', { name: /拓扑示意/ })).toBeVisible();
    // Super-pod world_size 72 → svg with super-pod label
    await expect(page.getByText(/Super-pod \(rack-scale\)/i).first()).toBeVisible();
  });

  test('roofline chart renders in calculator after selection', async ({ page }) => {
    await page.goto('/calculator/');
    await page.waitForSelector('button[type="button"]', { state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /Llama 4 Scout/i }).click();
    await page.getByRole('button', { name: /H100 SXM5/i }).click();
    await expect(page.getByText(/Roofline 图/i)).toBeVisible();
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
  });
});
