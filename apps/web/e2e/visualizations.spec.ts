import { test, expect, type Page } from '@playwright/test';

type CompareView = 'radar' | 'bar' | 'table';

async function switchCompareView(page: Page, name: string, view: CompareView) {
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeVisible({ timeout: 10000 });

  await expect(async () => {
    await button.click();
    await page.waitForFunction(
      (expectedView) => {
        const actual = new URL(window.location.href).searchParams.get('view');
        return expectedView === 'table' ? !actual : actual === expectedView;
      },
      view,
      { timeout: 1500 }
    );

    if (view === 'table') {
      await expect(page.getByRole('columnheader', { name: /BF16/ }).first()).toBeVisible({ timeout: 1500 });
    } else {
      await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 1500 });
    }
  }).toPass({ timeout: 15000 });
}

test.describe('New visualization features', () => {
  test('compare page with radar / bar / table view toggle', async ({ page }) => {
    await page.goto('/compare/');
    await expect(page.getByRole('heading', { name: /硬件对比/ })).toBeVisible();
    // Default is now table view (per user request: "默认先上来table"); BF16 column header visible
    await expect(page.getByRole('columnheader', { name: /BF16/ }).first()).toBeVisible({ timeout: 10000 });
    await switchCompareView(page, '雷达图', 'radar');
    await switchCompareView(page, '柱状图', 'bar');
    await switchCompareView(page, '表格', 'table');
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
