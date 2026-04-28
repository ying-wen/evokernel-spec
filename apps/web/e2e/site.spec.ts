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
  // Clear persistent state between serial tests so localStorage history doesn't leak.
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    // Clear localStorage so calculator history from a prior test doesn't bleed in.
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  });

  test('three-step flow yields a result', async ({ page }) => {
    await page.goto('/calculator/');
    await waitForHydration(page);
    const modelBtn = page.getByRole('button', { name: /Llama 4 Scout/i }).first();
    await modelBtn.scrollIntoViewIfNeeded();
    await modelBtn.click();
    const hwBtn = page.getByRole('button', { name: /H100 SXM5/i }).first();
    await hwBtn.waitFor({ state: 'visible', timeout: 15000 });
    await hwBtn.scrollIntoViewIfNeeded();
    await hwBtn.click();
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
    test.setTimeout(60000);
    // Use URL hydration directly — Calculator advances to step 3 and computes immediately
    await page.goto('/calculator/?model=llama-4-maverick&hw=inferentia-2');
    await waitForHydration(page);
    await expect(page.getByText(/配置不可行|显存不足/i).first()).toBeVisible({ timeout: 20000 });
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

test.describe('Entity index pages', () => {
  for (const path of ['/operators/', '/engines/', '/servers/', '/quantizations/', '/vendors/', '/patterns/']) {
    test(`${path} renders`, async ({ page }) => {
      const r = await page.goto(path);
      expect(r?.status()).toBe(200);
      await expect(page.locator('h2').first()).toBeVisible();
    });
  }

  test('operator detail with cross-link from model page', async ({ page }) => {
    await page.goto('/models/deepseek-v4-pro/');
    const link = page.getByRole('link', { name: 'matmul', exact: true }).first();
    await link.click();
    await expect(page).toHaveURL(/\/operators\/matmul\/?$/);
    await expect(page.getByRole('heading', { name: /Matrix Multiplication/i })).toBeVisible();
  });

  test('engine detail shows compatible hardware list', async ({ page }) => {
    await page.goto('/engines/vllm/');
    await expect(page.getByRole('heading', { name: /兼容硬件/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /使用本引擎的案例/ })).toBeVisible();
  });
});

test.describe('SEO and feeds', () => {
  test('home has OpenGraph and Twitter meta', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toContain('EvoKernel');
    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
    expect(await page.locator('link[rel="alternate"][type="application/rss+xml"]').getAttribute('href')).toBe('/cases.xml');
  });

  test('RSS feed is valid XML', async ({ page }) => {
    const r = await page.goto('/cases.xml');
    expect(r?.status()).toBe(200);
    const ct = r?.headers()['content-type'] ?? '';
    expect(ct).toContain('xml');
    const body = await r!.text();
    expect(body).toContain('<rss');
    expect(body).toContain('<item>');
    expect(body).toContain('CloudMatrix 384');
  });

  test('skip link is hidden by default but appears on focus', async ({ page }) => {
    await page.goto('/');
    const skip = page.locator('a.skip-link');
    await expect(skip).toBeAttached();
  });
});

test.describe('Entity detail pages', () => {
  test('server detail (CloudMatrix 384) shows scale-up domain', async ({ page }) => {
    await page.goto('/servers/huawei-cloudmatrix-384/');
    await expect(page.getByRole('heading', { name: /CloudMatrix 384/i })).toBeVisible();
    await expect(page.getByText(/Scale-up 域/i).first()).toBeVisible();
    await expect(page.getByText('384').first()).toBeVisible();
  });

  test('quantization detail (FP8) lists supporting hardware', async ({ page }) => {
    await page.goto('/quantizations/fp8-e4m3/');
    await expect(page.getByRole('heading', { name: /FP8 E4M3/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /支持硬件/ })).toBeVisible();
    await expect(page.getByText(/H100|H200|B200/i).first()).toBeVisible();
  });

  test('vendor detail (Huawei) shows hardware + servers', async ({ page }) => {
    await page.goto('/vendors/huawei/');
    await expect(page.getByRole('heading', { name: /Huawei/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /加速卡/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /服务器/ })).toBeVisible();
  });

  test('og default image exists', async ({ page }) => {
    const r = await page.goto('/og-default.svg');
    expect(r?.status()).toBe(200);
    expect(r?.headers()['content-type']).toContain('svg');
  });

  test('compare page hydrates from ?ids= URL param', async ({ page }) => {
    await page.goto('/compare/?ids=h100-sxm5,b200-sxm&view=table');
    // The table view should render with H100 and B200 columns
    await expect(page.getByText('H100 SXM5 80GB').first()).toBeVisible();
    await expect(page.getByText('B200 SXM 180GB').first()).toBeVisible();
    // Selected count badge (MAX_PICK = 8)
    await expect(page.getByText(/2\/8 选中/).first()).toBeVisible();
  });
});

test.describe('JSON API and timeline', () => {
  test('/api/index.json returns API descriptor', async ({ page }) => {
    const r = await page.goto('/api/index.json');
    expect(r?.status()).toBe(200);
    const body = await r!.json();
    expect(body.name).toContain('EvoKernel');
    expect(body.license).toBe('CC-BY-SA-4.0');
    expect(body.counts.hardware).toBe(28);
    expect(body.counts.case).toBeGreaterThanOrEqual(20);
  });

  test('/api/hardware.json contains all 28 hardware', async ({ page }) => {
    const r = await page.goto('/api/hardware.json');
    expect(r?.status()).toBe(200);
    const body = await r!.json();
    expect(body.count).toBe(28);
    expect(body.items.length).toBe(28);
    expect(body.items.find((x: { id: string }) => x.id === 'h100-sxm5')).toBeTruthy();
    expect(body.items.find((x: { id: string }) => x.id === 'ascend-910c')).toBeTruthy();
  });

  test('/api/cases.json includes resolved stack', async ({ page }) => {
    const r = await page.goto('/api/cases.json');
    expect(r?.status()).toBe(200);
    const body = await r!.json();
    expect(body.count).toBeGreaterThanOrEqual(15);
    const cm384 = body.items.find((x: { id: string }) => x.id === 'case-dsv4pro-cm384-mindie-001');
    expect(cm384).toBeTruthy();
    expect(cm384.resolved.hardware.id).toBe('ascend-910c');
  });

  test('models timeline renders', async ({ page }) => {
    await page.goto('/models/');
    await expect(page.getByText(/模型发布时间线/i)).toBeVisible();
    // Several model labels should be visible
    await expect(page.getByText('DeepSeek V4 Pro').first()).toBeVisible();
    await expect(page.getByText('Kimi K2.6').first()).toBeVisible();
  });

  test('theme toggle exists and switches html data-theme attribute', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#theme-toggle');
    await expect(btn).toBeVisible();
    const initial = await page.evaluate(() => document.documentElement.dataset.theme);
    await btn.click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(after).not.toBe(initial);
  });
});

test.describe('Production-readiness extras', () => {
  test('OpenAPI spec is valid 3.1', async ({ page }) => {
    const r = await page.goto('/api/openapi.json');
    expect(r?.status()).toBe(200);
    const spec = await r!.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toContain('EvoKernel');
    expect(spec.paths['/api/hardware.json']).toBeTruthy();
    expect(spec.components.schemas.Hardware).toBeTruthy();
  });

  test('hardware index includes release timeline', async ({ page }) => {
    await page.goto('/hardware/');
    await expect(page.getByText(/硬件发布时间线/i)).toBeVisible();
  });

  test('robots.txt advertises sitemap', async ({ page }) => {
    const r = await page.goto('/robots.txt');
    expect(r?.status()).toBe(200);
    const body = await r!.text();
    expect(body).toContain('Sitemap:');
    expect(body).toContain('sitemap-index.xml');
  });

  test('sitemap-index.xml exists', async ({ page }) => {
    const r = await page.goto('/sitemap-index.xml');
    expect(r?.status()).toBe(200);
    expect(r?.headers()['content-type']).toMatch(/xml/);
  });
});

test.describe.serial('Iter-10 features', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  });
  test('hardware filter sidebar narrows results to China when toggled', async ({ page }) => {
    await page.goto('/hardware/');
    await page.waitForSelector('input[type="search"]', { state: 'visible', timeout: 10000 });
    // The "国产" toggle (Country filter row); .first() to disambiguate against the China Hub nav link.
    const cnToggle = page.getByRole('button', { name: '国产', exact: true }).first();
    await cnToggle.waitFor({ state: 'visible', timeout: 10000 });
    await cnToggle.click();
    // Counter shows 13 / 28
    await expect(page.getByText(/13 \/ 28 显示/i)).toBeVisible({ timeout: 10000 });
    // Overseas section should disappear
    await expect(page.getByRole('heading', { name: /^海外/ })).not.toBeVisible();
  });

  test('hardware filter: FP4 checkbox limits to FP4-capable cards', async ({ page }) => {
    await page.goto('/hardware/');
    await page.waitForSelector('input[type="search"]', { state: 'visible' });
    await page.getByRole('checkbox', { name: /FP4/i }).check();
    // Should show fewer than total
    await expect(page.getByText(/\/ 28 显示/)).toBeVisible();
    // FP4 cards exist (B200, B300, MI355X, etc.)
    await expect(page.getByText(/B200|B300|MI355X/).first()).toBeVisible();
  });

  test('calculator URL hydration works with full state', async ({ page }) => {
    await page.goto('/calculator/?model=llama-4-scout&hw=h100-sxm5&prec=fp8&tp=4&batch=8');
    await page.waitForSelector('button[type="button"]', { state: 'visible' });
    // Result should auto-render
    await expect(page.getByRole('heading', { name: /理论上界/i })).toBeVisible();
    // Share/Export bar should be there
    await expect(page.getByRole('button', { name: /复制链接/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /导出 YAML/ })).toBeVisible();
  });

  test('calculator share URL includes state in querystring', async ({ page }) => {
    await page.goto('/calculator/');
    await page.waitForSelector('button[type="button"]', { state: 'visible' });
    const modelBtn = page.getByRole('button', { name: /Llama 4 Scout/i }).first();
    await modelBtn.scrollIntoViewIfNeeded();
    await modelBtn.click();
    const hwBtn = page.getByRole('button', { name: /H100 SXM5/i }).first();
    await hwBtn.waitFor({ state: 'visible', timeout: 15000 });
    await hwBtn.scrollIntoViewIfNeeded();
    await hwBtn.click();
    await page.waitForFunction(() => {
      const u = new URL(window.location.href);
      return u.searchParams.get('model') === 'llama-4-scout' && u.searchParams.get('hw') === 'h100-sxm5';
    }, { timeout: 5000 });
  });
});

test.describe.serial('Iter-11 features', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  });
  test('quality dashboard renders', async ({ page }) => {
    await page.goto('/quality/');
    await expect(page.getByRole('heading', { name: /数据质量与覆盖/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Evidence Tier 分布/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /国产硬件覆盖优先级/ })).toBeVisible();
  });

  test('per-operator breakdown chart renders in calculator', async ({ page }) => {
    await page.goto('/calculator/?model=deepseek-v4-pro&hw=h100-sxm5');
    await page.waitForSelector('button[type="button"]', { state: 'visible' });
    await expect(page.getByText(/算子级时间分布/i)).toBeVisible();
    // Operator names from deepseek-v4-pro decomposition
    await expect(page.getByText(/matmul|attention/i).first()).toBeVisible();
  });

  test('disaggregated mode UI toggle works', async ({ page }) => {
    await page.goto('/calculator/?model=deepseek-v4-pro&hw=h100-sxm5');
    await page.waitForSelector('button[type="button"]', { state: 'visible' });
    // Toggle disagg checkbox
    await page.getByRole('checkbox', { name: /解耦部署/i }).check();
    await expect(page.getByText(/Prefill 卡数/i)).toBeVisible();
    await expect(page.getByText(/Decode 卡数/i)).toBeVisible();
    // Result panel shows disagg estimate
    await expect(page.getByRole('heading', { name: /解耦部署估算/i })).toBeVisible();
    // KV transfer label
    await expect(page.locator('dt').filter({ hasText: /KV transfer/i })).toBeVisible();
  });
});

test.describe('i18n English mirror', () => {
  test('/en/ home renders English copy', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.getByRole('heading', { name: /Any model.*any hardware/i })).toBeVisible();
    await expect(page.getByText(/computable knowledge base/i)).toBeVisible();
    // Nav uses English labels
    const nav = page.getByLabel('Main navigation');
    await expect(nav.getByRole('link', { name: 'Hardware', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'China Hub', exact: true })).toBeVisible();
  });

  test('/en/about renders English about page', async ({ page }) => {
    await page.goto('/en/about/');
    await expect(page.getByRole('heading', { name: /About EvoKernel/i })).toBeVisible();
    await expect(page.getByText(/Core thesis/)).toBeVisible();
  });

  test('/en/learn renders English methodology', async ({ page }) => {
    await page.goto('/en/learn/');
    await expect(page.getByRole('heading', { name: /How to read this site/i })).toBeVisible();
    await expect(page.getByText(/Roofline model/i)).toBeVisible();
    await expect(page.getByText(/Three-tier evidence/i)).toBeVisible();
  });

  test('locale switch button toggles between zh and en', async ({ page }) => {
    await page.goto('/');
    // The locale-switch link has aria-label="Switch language" and text content
    // 'EN' (when on zh page) or '中' (when on en page).
    const switchBtn = page.getByRole('link', { name: 'Switch language' });
    await expect(switchBtn).toBeVisible();
    await expect(switchBtn).toHaveText(/EN/);
    await switchBtn.click();
    await expect(page).toHaveURL(/\/en\/?$/);
    // After switch, the button text should be 中
    await expect(page.getByRole('link', { name: 'Switch language' })).toHaveText(/中/);
  });

  test('hreflang alternate links present on home', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('link[hreflang="zh"]').getAttribute('href')).toContain('evokernel.dev/');
    expect(await page.locator('link[hreflang="en"]').getAttribute('href')).toContain('/en');
    expect(await page.locator('link[hreflang="x-default"]').count()).toBe(1);
  });

  // Regression guard: every route reachable from EN nav must return 200, not 404.
  for (const r of ['/en/hardware/', '/en/models/', '/en/cases/', '/en/calculator/', '/en/china/', '/en/compare/', '/en/showcase/']) {
    test(`${r} returns 200 with English chrome`, async ({ page }) => {
      const res = await page.goto(r);
      expect(res?.status()).toBe(200);
      // Nav uses English labels (proves locale propagated)
      const nav = page.getByLabel('Main navigation');
      await expect(nav.getByRole('link', { name: 'Hardware', exact: true })).toBeVisible();
    });
  }

  test('/en/calculator React island uses English step labels', async ({ page }) => {
    await page.goto('/en/calculator/');
    await page.waitForSelector('button[type="button"]', { state: 'visible' });
    // Step heading and step chips both English
    await expect(page.getByRole('heading', { name: /1\. Pick model/i })).toBeVisible();
    await expect(page.getByText(/Pick hardware/).first()).toBeVisible();
    await expect(page.getByText(/Configure scenario/).first()).toBeVisible();
  });

  test('/en/cases Leaderboard view-mode buttons are in English', async ({ page }) => {
    await page.goto('/en/cases/');
    await page.waitForSelector('select', { state: 'visible' });
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scatter', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bar', exact: true })).toBeVisible();
  });

  test('/en/hardware filter sidebar uses English labels', async ({ page }) => {
    await page.goto('/en/hardware/');
    await page.waitForSelector('input[type="search"]', { state: 'visible' });
    await expect(page.getByRole('searchbox', { name: '' }).first()).toHaveAttribute('placeholder', /Search/);
    // The Country filter trio: All / China / Overseas (exact match — China alone collides with the "China Hub" nav link)
    await expect(page.getByRole('button', { name: 'Overseas', exact: true })).toBeVisible();
  });

  test('/en/compare CompareTool view-mode buttons are in English', async ({ page }) => {
    await page.goto('/en/compare/');
    await page.waitForSelector('button', { state: 'visible' });
    await expect(page.getByRole('button', { name: 'Radar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bar', exact: true })).toBeVisible();
    // 'Roofline' label is intentionally untranslated
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible();
  });

  // Detail-page EN mirrors (regression guard for review CRITICAL #1)
  test('/en/hardware/h100-sxm5/ renders English detail', async ({ page }) => {
    const res = await page.goto('/en/hardware/h100-sxm5/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /Full specs/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Topology/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Software-stack support/i })).toBeVisible();
  });

  test('/en/models/deepseek-v4-pro/ renders English detail', async ({ page }) => {
    const res = await page.goto('/en/models/deepseek-v4-pro/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /Architecture/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Compatible hardware/i })).toBeVisible();
  });

  test('/en/cases/<slug>/ renders English detail', async ({ page }) => {
    const res = await page.goto('/en/cases/case-llama4-scout-h100x8-vllm-001/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /^Stack$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Results$/ })).toBeVisible();
  });
});

test.describe('Operator coverage panel', () => {
  test('hardware detail shows operator coverage with headroom badge', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.getByRole('heading', { name: /Operator support|算子支持/i }).first()).toBeVisible();
    // Headroom KPI badge
    await expect(page.locator('text=/Optimization headroom/i').first()).toBeVisible();
    // At least one operator card with status badge (mature/partial/gap)
    await expect(page.locator('text=/🟢 mature|🟡 partial|🔴 gap/').first()).toBeVisible();
  });

  test('Chinese accelerator (Ascend 910C) operator coverage shows different status mix', async ({ page }) => {
    await page.goto('/hardware/ascend-910c/');
    await expect(page.locator('text=/🟢 mature/').first()).toBeVisible();
  });
});

test.describe('Hardware filter bar (sticky horizontal)', () => {
  test('filter bar is horizontal, not vertical sidebar', async ({ page }) => {
    await page.goto('/hardware/');
    await page.waitForSelector('input[type="search"]', { state: 'visible' });
    // Filter bar must be a single sticky banner above grid
    const bar = page.locator('.hw-filter-bar').first();
    await expect(bar).toBeVisible();
    // Search + country + form-factor + status + FP8 + FP4 + Export should all be on one row
    const box = await bar.boundingBox();
    if (box) {
      // Filter bar height should be moderate (under 200px), not full-page sidebar (>500px)
      expect(box.height).toBeLessThan(220);
    }
  });
});

test.describe('SEO structured data', () => {
  test('hardware detail has Product JSON-LD + breadcrumbs', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    const ldCount = await page.locator('script[type="application/ld+json"]').count();
    expect(ldCount).toBe(2);
    const productLD = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(productLD).toContain('"@type":"Product"');
    expect(productLD).toContain('NVIDIA');
    // Breadcrumb nav present
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
  });

  test('model detail has SoftwareApplication JSON-LD', async ({ page }) => {
    await page.goto('/models/deepseek-v4-pro/');
    const productLD = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(productLD).toContain('"@type":"SoftwareApplication"');
  });

  test('case detail has TechArticle JSON-LD + print button', async ({ page }) => {
    await page.goto('/cases/case-dsv4pro-cm384-mindie-001/');
    const article = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(article).toContain('"@type":"TechArticle"');
    expect(article).toContain('CloudMatrix');
    // Print button visible (hidden in print mode via class print:hidden)
    await expect(page.getByRole('button', { name: /打印 \/ 导出 PDF/i })).toBeVisible();
  });

  test('footer shows build SHA + timestamp', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-build-sha]')).toBeVisible();
    const sha = await page.locator('[data-build-sha]').textContent();
    expect(sha?.trim()).toMatch(/^[a-f0-9]+|dev$/);
  });
});
