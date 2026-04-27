import { test } from '@playwright/test';

// Captures full-page screenshots of key views into ../docs/screenshots/.
// Run via: pnpm --filter web exec playwright test screenshots
const OUT = '../../docs/screenshots';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Documentation screenshots', () => {
  test('home', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });
  });

  test('hardware-list', async ({ page }) => {
    await page.goto('/hardware/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/hardware-list.png`, fullPage: true });
  });

  test('hardware-detail-h100', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/hardware-detail.png`, fullPage: true });
  });

  test('hardware-detail-cloudmatrix-384', async ({ page }) => {
    await page.goto('/servers/huawei-cloudmatrix-384/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/cloudmatrix-384.png`, fullPage: true });
  });

  test('china-hub', async ({ page }) => {
    await page.goto('/china/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/china-hub.png`, fullPage: true });
  });

  test('calculator-with-result', async ({ page }) => {
    await page.goto('/calculator/?model=deepseek-v4-pro&hw=h100-sxm5');
    await page.waitForSelector('button[type="button"]', { state: 'visible' });
    await page.waitForLoadState('networkidle');
    // wait for charts to render
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/calculator.png`, fullPage: true });
  });

  test('compare-radar', async ({ page }) => {
    await page.goto('/compare/?ids=h100-sxm5,b200-sxm,mi355x,ascend-910c');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/compare-radar.png`, fullPage: true });
  });

  test('compare-roofline', async ({ page }) => {
    await page.goto('/compare/?ids=h100-sxm5,b200-sxm,mi355x,ascend-910c&view=roofline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/compare-roofline.png`, fullPage: true });
  });

  test('cases-leaderboard', async ({ page }) => {
    await page.goto('/cases/');
    await page.waitForSelector('select', { state: 'visible' });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/cases.png`, fullPage: true });
  });

  test('case-detail', async ({ page }) => {
    await page.goto('/cases/case-dsv4pro-cm384-mindie-001/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/case-detail.png`, fullPage: true });
  });

  test('quality', async ({ page }) => {
    await page.goto('/quality/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/quality.png`, fullPage: true });
  });

  test('showcase', async ({ page }) => {
    await page.goto('/showcase/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/showcase.png`, fullPage: true });
  });

  test('case-compare', async ({ page }) => {
    await page.goto('/cases/compare/?ids=case-dsv4pro-cm384-mindie-001,case-llama4-scout-h100x8-vllm-001,case-dsr1-asc910bx16-mindie-001');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/case-compare.png`, fullPage: true });
  });

  test('cases-scatter', async ({ page }) => {
    await page.goto('/cases/');
    await page.waitForSelector('select', { state: 'visible' });
    await page.getByRole('button', { name: '散点图', exact: true }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/cases-scatter.png`, fullPage: true });
  });
});
