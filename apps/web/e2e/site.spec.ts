import { test, expect } from '@playwright/test';

test.describe('Pages render with no console errors', () => {
  const routes = [
    { url: '/', heading: '任意模型' },
    { url: '/hardware/', heading: '硬件目录' },
    { url: '/hardware/h100-sxm5/', heading: 'H100 SXM5' },
    { url: '/hardware/ascend-910c/', heading: '昇腾 910C' },
    { url: '/models/', heading: '模型目录' },
    { url: '/models/deepseek-v4-pro/', heading: 'DeepSeek V4 Pro' },
    { url: '/cases/', heading: '部署案例' },
    { url: '/cases/case-llama4-scout-h100x8-vllm-001/', heading: 'Llama 4 Scout' },
    { url: '/calculator/', heading: '部署计算器' },
    { url: '/china/', heading: '国产 AI 推理硬件全景' },
    { url: '/about/', heading: '关于 EvoKernel' }
  ];

  for (const r of routes) {
    test(r.url, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
      });
      const res = await page.goto(r.url);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator('h1, h2').first()).toContainText(r.heading);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
});

test.describe.serial('Calculator flow', () => {
  // Helper: wait for calculator hydration (step 1 button must be clickable)
  async function waitForHydration(page: import('@playwright/test').Page) {
    // Step 1 buttons exist after hydration; if hydration not done, role=button isn't applied
    await page.waitForSelector('button[type="button"]', { state: 'visible', timeout: 10000 });
  }

  test('three-step flow yields a result', async ({ page }) => {
    await page.goto('/calculator/');
    await waitForHydration(page);
    await page.getByRole('button', { name: /Llama 4 Scout/i }).click();
    await page.getByRole('button', { name: /H100 SXM5/i }).click();
    await expect(page.getByRole('heading', { name: /理论上界 \(Tier 1, Roofline\)/i })).toBeVisible();
    await expect(page.getByText(/Decode 吞吐上界/i)).toBeVisible();
    await expect(page.locator('dd.font-mono.text-xl').first()).toBeVisible();
  });

  test('pre-selected model via query param', async ({ page }) => {
    await page.goto('/calculator/?model=deepseek-v4-pro');
    await waitForHydration(page);
    // Wait for step to advance to 2 (hardware buttons appear)
    await page.getByRole('button', { name: /H100 SXM5/i }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /H100 SXM5/i }).first().click();
    await expect(page.getByRole('heading', { name: /理论上界/i })).toBeVisible();
  });

  test('memory check warns on undersized config', async ({ page }) => {
    await page.goto('/calculator/');
    await waitForHydration(page);
    await page.getByRole('button', { name: /Llama 4 Maverick/i }).click();
    await page.getByRole('button', { name: /Inferentia 2/i }).click();
    await expect(page.getByText(/配置不可行|显存不足/i).first()).toBeVisible();
  });
});

test.describe('China hub renders the three panels', () => {
  test('heatmap, genealogy, ecosystem all visible', async ({ page }) => {
    await page.goto('/china/');
    await expect(page.getByRole('heading', { name: /国产芯片 × 主流模型 矩阵/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /代际谱系/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /软件生态对照/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /国产超节点/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Huawei CloudMatrix 384/i })).toBeVisible();
  });
});

test.describe('Tier chip + evidence on hardware detail', () => {
  test('h100 detail shows tier chip near KPI numbers', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.locator('[data-tier="official"]').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /软件栈支持/i })).toBeVisible();
    await expect(page.getByText(/datasheet|product page|whitepaper/i).first()).toBeVisible();
  });
});

test.describe('Navigation works', () => {
  test('nav links go to correct pages', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByLabel('Main navigation');
    await nav.getByRole('link', { name: '硬件', exact: true }).click();
    await expect(page).toHaveURL(/\/hardware\/?$/);
    await page.goto('/');
    await nav.getByRole('link', { name: '国产专题', exact: true }).click();
    await expect(page).toHaveURL(/\/china\/?$/);
  });
});
