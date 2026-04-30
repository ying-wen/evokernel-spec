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
    // Constrain to h1 since cabinet_layout_md now has an h2 also containing
    // the name (multi-cabinet layout heading).
    await expect(page.getByRole('heading', { level: 1, name: /CloudMatrix 384/i })).toBeVisible();
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
    // Selected count badge (no upper limit)
    await expect(page.getByText(/已选 2/).first()).toBeVisible();
  });
});

// Imported from the same source-of-truth list used by launch.sh,
// so adding a route there automatically extends both probes.
import { CRITICAL_ROUTES } from '../src/lib/critical-routes';

test.describe('Critical routes (deployment lockstep with launch.sh)', () => {
  for (const route of CRITICAL_ROUTES) {
    test(`${route.path} → 200 (${route.reason})`, async ({ request }) => {
      const r = await request.get(route.path);
      expect(r.status(), `${route.path} should return 200`).toBe(200);
      if (route.contentType) {
        const got = r.headers()['content-type'] ?? '';
        expect(got, `${route.path} content-type should start with ${route.contentType}`).toContain(route.contentType);
      }
    });
  }
});

test.describe('Health endpoint (uptime probe)', () => {
  test('/api/healthz returns plain "ok" — k8s liveness style', async ({ request }) => {
    const r = await request.get('/api/healthz');
    expect(r.status()).toBe(200);
    expect(await r.text()).toBe('ok\n');
    // Note: in static SSG export, Astro's Response headers (content-type,
    // cache-control, x-evokernel) are stripped by the preview file server —
    // those are only honored under SSR. The static server infers
    // content-type from the file extension. For load-balancer probes that
    // need correct content-type, deploy with Cloudflare Pages /
    // nginx Location override OR switch this route to SSR.
  });

  test('/api/health.json returns 200 + status:ok with build SHA + corpus counts', async ({ page }) => {
    const r = await page.goto('/api/health.json');
    expect(r?.status()).toBe(200);
    const body = await r!.json();
    expect(body.status).toBe('ok');
    expect(body.name).toBe('evokernel-spec');
    expect(body.build.sha).toMatch(/^[a-f0-9]{6,40}$|^unknown$/);
    expect(body.build.built_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.served_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Critical: all 10 corpus loaders must report counts
    expect(body.data_loaded.hardware).toBeGreaterThanOrEqual(28);
    expect(body.data_loaded.models).toBeGreaterThanOrEqual(14);
    expect(body.data_loaded.cases).toBeGreaterThanOrEqual(20);
    // No-cache header so probes always see fresh state
    expect(r!.headers()['cache-control']).toMatch(/no-cache|no-store/);
  });
});

test.describe('JSON API and timeline', () => {
  test('/api/index.json returns API descriptor', async ({ page }) => {
    const r = await page.goto('/api/index.json');
    expect(r?.status()).toBe(200);
    const body = await r!.json();
    expect(body.name).toContain('EvoKernel');
    expect(body.license).toBe('CC-BY-SA-4.0');
    expect(body.counts.hardware).toBeGreaterThanOrEqual(28);
    expect(body.counts.case).toBeGreaterThanOrEqual(20);
  });

  test('/api/hardware.json contains all hardware (28+)', async ({ page }) => {
    const r = await page.goto('/api/hardware.json');
    expect(r?.status()).toBe(200);
    const body = await r!.json();
    expect(body.count).toBeGreaterThanOrEqual(28);
    expect(body.items.length).toBeGreaterThanOrEqual(28);
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
    // CN-card count grows with the corpus (now 14+ after Ascend 950 added);
    // assert ≥13 and that the "X / N" pattern shows X < N (filter is doing something).
    await expect(page.getByText(/1[3-9] \/ \d+ 显示/i)).toBeVisible({ timeout: 10000 });
    // Overseas section should disappear
    await expect(page.getByRole('heading', { name: /^海外/ })).not.toBeVisible();
  });

  test('hardware filter: FP4 checkbox limits to FP4-capable cards', async ({ page }) => {
    await page.goto('/hardware/');
    await page.waitForSelector('input[type="search"]', { state: 'visible' });
    await page.getByRole('checkbox', { name: /FP4/i }).check();
    // Should show fewer than total
    await expect(page.getByText(/\/ \d+ 显示/)).toBeVisible();
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

test.describe('Operator hardware-fitness analysis', () => {
  test('matmul operator detail shows hardware-fitness table with ridge point + bottleneck', async ({ page }) => {
    await page.goto('/operators/matmul/');
    await expect(page.getByRole('heading', { name: /硬件适配性|Hardware fitness/i })).toBeVisible();
    // Ridge point column
    await expect(page.getByRole('columnheader', { name: /Ridge point/i })).toBeVisible();
    // 至少一行显示 compute or mem-bw bottleneck
    await expect(page.locator('text=/计算 compute|内存带宽 mem-bw/').first()).toBeVisible();
  });
});

test.describe('Hardware-detail in-page TOC', () => {
  test('sticky TOC nav has anchor pills + sections have matching IDs', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    const toc = page.locator('nav.hw-toc').first();
    await expect(toc).toBeVisible();
    // Pills exist
    await expect(toc.getByRole('link', { name: /规格|Specs/ }).first()).toBeVisible();
    await expect(toc.getByRole('link', { name: /拓扑|Topology/ }).first()).toBeVisible();
    // Anchor target exists
    expect(await page.locator('#topology').count()).toBe(1);
    expect(await page.locator('#operators').count()).toBe(1);
    expect(await page.locator('#cases').count()).toBe(1);
  });
});

test.describe('v1.6: hardware → recommended models (reverse rec) + data density', () => {
  test('zh /hardware/<slug>/ shows 3 reverse-rec leaderboards', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.getByRole('heading', { name: /推荐模型.*Recommended models/i }).first()).toBeVisible();
    await expect(page.getByText(/最高 decode 吞吐/).first()).toBeVisible();
    await expect(page.getByText(/最低 \$\/M tokens/).first()).toBeVisible();
    await expect(page.getByText(/实测案例验证/).first()).toBeVisible();
    // Calculator deep link with hw=h100-sxm5 preset
    await expect(page.locator('a[href*="/calculator/?model="][href*="hw=h100-sxm5"]').first()).toBeVisible();
  });

  test('en /en/hardware/<slug>/ shows English reverse-rec headings', async ({ page }) => {
    await page.goto('/en/hardware/h100-sxm5/');
    await expect(page.getByText(/Highest decode throughput/i).first()).toBeVisible();
    await expect(page.getByText(/Lowest \$\/M tokens/i).first()).toBeVisible();
    await expect(page.getByText(/Verified by measured cases/i).first()).toBeVisible();
  });

  test('B300 hardware page shows new memory hierarchy + tensor core specs', async ({ page }) => {
    await page.goto('/hardware/b300-sxm/');
    await expect(page.getByText(/Memory Hierarchy/i).first()).toBeVisible();
    // 36 GB HBM3e stacks (B300-specific upgrade vs B200 24 GB)
    await expect(page.getByText(/36 GB stacks|Register File/i).first()).toBeVisible();
    await expect(page.getByText(/NV-HBI/i).first()).toBeVisible();
  });

  test('Trainium 2 hardware page shows NeuronCore SBUF + NeuronLink fabric', async ({ page }) => {
    await page.goto('/hardware/trainium-2/');
    await expect(page.getByText(/NeuronCore SBUF/i).first()).toBeVisible();
    await expect(page.getByText(/NeuronLink/i).first()).toBeVisible();
  });

  test('GB300 NVL72 super-pod shows updated cluster internals', async ({ page }) => {
    await page.goto('/servers/nvidia-gb300-nvl72/');
    await expect(page.getByText(/集群内部/i).first()).toBeVisible();
    await expect(page.getByText(/NVSwitch Gen-4/i).first()).toBeVisible();
    // GB300-specific upgrade (HBM stacks 24 → 36 GB)
    await expect(page.getByText(/HBM3e stack 从 24 GB 升到 36 GB|36 GB|20\.7 TB/).first()).toBeVisible();
  });

  test('HGX H100 has SwitchFabric SVG topology', async ({ page }) => {
    await page.goto('/servers/nvidia-hgx-h100/');
    await expect(page.getByText(/Switch Fabric Topology/i).first()).toBeVisible();
    await expect(page.getByText(/NVSwitch Gen-3/i).first()).toBeVisible();
  });

  test('/fused-kernels/ catalog now shows 12 entries including new 4', async ({ page }) => {
    await page.goto('/fused-kernels/');
    await expect(page.getByText(/Fused Selective Scan/i).first()).toBeVisible();
    await expect(page.getByText(/Fused Speculative Decoding/i).first()).toBeVisible();
    await expect(page.getByText(/Fused FP4 Quantized Attention/i).first()).toBeVisible();
    await expect(page.getByText(/Fused KV Cache Quantization/i).first()).toBeVisible();
  });

  test('Mamba selective scan fused kernel page renders with constituents + cross-link', async ({ page }) => {
    await page.goto('/fused-kernels/fused-selective-scan/');
    await expect(page.getByText(/State-Space Model/i).first()).toBeVisible();
    await expect(page.getByText(/Mamba/i).first()).toBeVisible();
    await expect(page.locator('a[href*="/pipeline/compile"]').first()).toBeVisible();
  });
});

test.describe('v1.5: model → recommended hardware (3 leaderboards)', () => {
  test('zh /models/<slug> shows 3 recommendation leaderboards with deep links', async ({ page }) => {
    await page.goto('/models/llama-4-scout/');
    await expect(page.getByRole('heading', { name: /推荐硬件.*Recommended hardware/i }).first()).toBeVisible();
    await expect(page.getByText(/最高 decode 吞吐/).first()).toBeVisible();
    await expect(page.getByText(/最低 \$\/M tokens/).first()).toBeVisible();
    await expect(page.getByText(/实测案例验证/).first()).toBeVisible();
    await expect(page.locator('text=/tok\\/s\\/card/').first()).toBeVisible();
    // Calculator deep link present (with model preset)
    await expect(page.locator('a[href*="/calculator/?model=llama-4-scout"]').first()).toBeVisible();
  });

  test('en /en/models/<slug> shows English headings', async ({ page }) => {
    await page.goto('/en/models/llama-4-scout/');
    await expect(page.getByText(/Highest decode throughput/i).first()).toBeVisible();
    await expect(page.getByText(/Lowest \$\/M tokens/i).first()).toBeVisible();
    await expect(page.getByText(/Verified by measured cases/i).first()).toBeVisible();
  });

  test('recommendations methodology footnote present', async ({ page }) => {
    await page.goto('/models/llama-4-scout/');
    await expect(page.locator('text=/方法论.*Roofline.*calibrated/').first()).toBeVisible();
  });
});

test.describe('v1.4: more fused kernels + 3 cards memory hierarchy + switch fabric SVG', () => {
  test('/fused-kernels/ catalog now shows 8 entries', async ({ page }) => {
    await page.goto('/fused-kernels/');
    // 4 from prior + 4 from this iteration
    await expect(page.getByText(/FlashAttention-3/i).first()).toBeVisible();
    await expect(page.getByText(/Fused RMSNorm \+ Residual Add/i).first()).toBeVisible();
    await expect(page.getByText(/Mooncake KV Disaggregation/i).first()).toBeVisible();
    await expect(page.getByText(/DeepEP Fused MoE All-to-All/i).first()).toBeVisible();
    await expect(page.getByText(/Fused AllReduce \+ Residual/i).first()).toBeVisible();
  });

  test('/fused-kernels/mooncake-kv-disaggregation/ detail surfaces speedup + serve stage', async ({ page }) => {
    await page.goto('/fused-kernels/mooncake-kv-disaggregation/');
    await expect(page.getByText(/Mooncake/).first()).toBeVisible();
    await expect(page.getByText(/为什么要融合/).first()).toBeVisible();
    // Stage badge linking to /pipeline/serve/
    await expect(page.locator('a[href*="/pipeline/serve"]').first()).toBeVisible();
    // Constituent operators visible (attention is one)
    await expect(page.locator('a[href*="/operators/attention"]').first()).toBeVisible();
  });

  test('H200 memory hierarchy shows 6× HBM3e detail', async ({ page }) => {
    await page.goto('/hardware/h200-sxm/');
    await expect(page.getByText(/Memory Hierarchy/i).first()).toBeVisible();
    await expect(page.getByText(/HBM3e/i).first()).toBeVisible();
    // Notes mention 43% bandwidth jump vs H100
    await expect(page.getByText(/4\.8|43%/).first()).toBeVisible();
  });

  test('MI300X memory hierarchy includes Infinity Cache (L3)', async ({ page }) => {
    await page.goto('/hardware/mi300x/');
    await expect(page.getByText(/Infinity Cache/i).first()).toBeVisible();
    await expect(page.getByText(/17 TB\/s|17 TB.s/).first()).toBeVisible();
  });

  test('NVL72 page renders SwitchFabric SVG topology', async ({ page }) => {
    await page.goto('/servers/nvidia-gb200-nvl72/');
    await expect(page.getByText(/Switch Fabric Topology/i).first()).toBeVisible();
    // Aggregate bandwidth callout present
    await expect(page.getByText(/Aggregate fabric bandwidth/i).first()).toBeVisible();
    // SVG element rendered
    const svg = await page.locator('svg[viewBox*="760 320"]').first();
    await expect(svg).toBeVisible();
  });
});

test.describe('Hardware memory hierarchy + cluster-internals', () => {
  test('H100 detail surfaces memory hierarchy with all 4 levels', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.getByText(/Memory Hierarchy/i).first()).toBeVisible();
    // 4 layered storage levels
    await expect(page.getByText(/Register File/).first()).toBeVisible();
    await expect(page.getByText(/L1 \/ Shared Memory/i).first()).toBeVisible();
    await expect(page.getByText(/L2 Cache/i).first()).toBeVisible();
    await expect(page.getByText(/HBM3/i).first()).toBeVisible();
    // Tensor core specs panel
    await expect(page.getByText(/Tensor core 峰值/i).first()).toBeVisible();
    // On-chip interconnect (NVLink-C2C)
    await expect(page.getByText(/NVLink-C2C/i).first()).toBeVisible();
  });

  test('B200 detail shows NV-HBI die-to-die interconnect', async ({ page }) => {
    await page.goto('/hardware/b200-sxm/');
    await expect(page.getByText(/NV-HBI/i).first()).toBeVisible();
    // Boost clock visible
    await expect(page.getByText(/2400 MHz|Boost clock/i).first()).toBeVisible();
  });

  test('NVL72 super-pod page shows switch fabric + power + cabinet layout', async ({ page }) => {
    await page.goto('/servers/nvidia-gb200-nvl72/');
    await expect(page.getByText(/集群内部/i).first()).toBeVisible();
    await expect(page.getByText(/NVSwitch Gen-4/i).first()).toBeVisible();
    await expect(page.getByText(/Scale-out 过订比/i).first()).toBeVisible();
    await expect(page.getByText(/机柜布局/i).first()).toBeVisible();
    // bisection bandwidth
    await expect(page.locator('text=/64\\.8 TB\\/s/').first()).toBeVisible();
  });

  test('CloudMatrix 384 shows Lingqu optical switch + multi-cabinet layout', async ({ page }) => {
    await page.goto('/servers/huawei-cloudmatrix-384/');
    await expect(page.getByText(/灵衢/).first()).toBeVisible();
    await expect(page.getByText(/光纤/).first()).toBeVisible();
    // 16-cabinet design indicator
    await expect(page.getByText(/16.*机柜|16 cabinets/i).first()).toBeVisible();
  });
});

test.describe('Operators rich detail + fused-kernels catalog', () => {
  test('/operators/ groups by category with AI-bound badges', async ({ page }) => {
    await page.goto('/operators/');
    // Category headings present
    await expect(page.getByRole('heading', { name: /矩阵乘.*GEMM/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Attention/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /MoE 路由/ }).first()).toBeVisible();
    // Fused-kernel CTA card visible
    await expect(page.locator('a[href*="/fused-kernels"]').first()).toBeVisible();
  });

  test('/operators/attention/ surfaces fusion graph + engine impls + refs', async ({ page }) => {
    await page.goto('/operators/attention/');
    await expect(page.getByText(/融合图谱.*Fusion graph/i).first()).toBeVisible();
    await expect(page.getByText(/引擎实现.*Engine kernels/i).first()).toBeVisible();
    await expect(page.getByText(/参考文献.*References/i).first()).toBeVisible();
    // Cross-link to a fused kernel
    await expect(page.locator('a[href*="/fused-kernels/flash-attention-v3"]').first()).toBeVisible();
  });

  test('/fused-kernels/ shows catalog grouped by category', async ({ page }) => {
    await page.goto('/fused-kernels/');
    await expect(page.getByText(/FlashAttention-3/).first()).toBeVisible();
    await expect(page.getByText(/Fused MLP/).first()).toBeVisible();
    await expect(page.getByText(/PagedAttention Decode/i).first()).toBeVisible();
    // Engine coverage matrix shown
    await expect(page.getByText(/引擎覆盖度/).first()).toBeVisible();
  });

  test('/fused-kernels/flash-attention-v3/ shows constituents + speedup + impls', async ({ page }) => {
    await page.goto('/fused-kernels/flash-attention-v3/');
    // Constituent operators stripe
    await expect(page.getByText(/融合的算子.*Constituent operators/i).first()).toBeVisible();
    // "Why fuse" callout
    await expect(page.getByText(/为什么要融合/).first()).toBeVisible();
    // Speedup section
    await expect(page.getByText(/加速.*Speedup/i).first()).toBeVisible();
    // Cross-link back to attention operator
    await expect(page.locator('a[href*="/operators/attention"]').first()).toBeVisible();
    // Cross-link to compile pipeline stage
    await expect(page.locator('a[href*="/pipeline/compile"]').first()).toBeVisible();
  });
});

test.describe('Deployment pipeline (7-stage)', () => {
  test('/pipeline/ overview shows all 7 stages with correct order', async ({ page }) => {
    await page.goto('/pipeline/');
    // 7 stage labels visible in stage cards
    for (let i = 1; i <= 7; i++) {
      await expect(page.getByText(new RegExp(`STAGE ${i}/7`)).first()).toBeVisible();
    }
    // Stage names (zh)
    await expect(page.getByText(/获取权重/).first()).toBeVisible();
    await expect(page.getByText(/编译与图捕获/).first()).toBeVisible();
    await expect(page.getByText(/观测与迭代/).first()).toBeVisible();
  });

  test('/pipeline/quantize/ shows decisions + tools + failure modes + cross-links', async ({ page }) => {
    await page.goto('/pipeline/quantize/');
    await expect(page.getByText(/决策点/).first()).toBeVisible();
    await expect(page.getByText(/工具.*Tools/i).first()).toBeVisible();
    await expect(page.getByText(/常见失败.*Failure/i).first()).toBeVisible();
    // At least one tool surfaced
    await expect(page.locator('text=/AutoAWQ|AutoGPTQ/').first()).toBeVisible();
    // Cross-link to a pattern
    await expect(page.locator('a[href*="/patterns/memory-bound-decode-prefer-int8"]').first()).toBeVisible();
  });

  test('pattern detail surfaces "applies at stage" badge', async ({ page }) => {
    await page.goto('/patterns/flashattention-v3/');
    await expect(page.getByText(/应用于阶段/).first()).toBeVisible();
    // Should link back to compile stage
    await expect(page.locator('a[href*="/pipeline/compile"]').first()).toBeVisible();
  });

  test('/pipeline/acquire/ has prev=null + next=convert navigation', async ({ page }) => {
    await page.goto('/pipeline/acquire/');
    // Has next link to next stage
    await expect(page.locator('a[href*="/pipeline/convert"]').first()).toBeVisible();
    // The "invalidates downstream" section should list 5 downstream stages
    await expect(page.getByText(/改动会作废以下下游阶段/).first()).toBeVisible();
  });
});

test.describe('Optimization patterns hub + detail', () => {
  test('/patterns/ shows categorized hub with all 9 patterns', async ({ page }) => {
    await page.goto('/patterns/');
    // Categories visible
    await expect(page.getByText(/KV Cache 管理/).first()).toBeVisible();
    await expect(page.getByText(/算子融合/).first()).toBeVisible();
    await expect(page.getByText(/量化 \/ Quantization/).first()).toBeVisible();
    // 9 pattern cards (header h1 + categorized sub-cards)
    const cards = page.locator('a[href*="/patterns/"][href$="/"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(9);
    // CTA at the bottom
    await expect(page.getByText(/缺一个 pattern/i).first()).toBeVisible();
  });

  test('/patterns/flashattention-v3/ shows speedup KPI + engines + supporting cases', async ({ page }) => {
    await page.goto('/patterns/flashattention-v3/');
    // Speedup KPI rendered
    await expect(page.getByText(/预期收益/).first()).toBeVisible();
    await expect(page.locator('text=/1\\.5–2\\.0×/').first()).toBeVisible();
    // Engines section
    await expect(page.getByText(/支持引擎/).first()).toBeVisible();
    // References section (we always require ≥1 paper/impl)
    await expect(page.getByText(/参考资料/).first()).toBeVisible();
  });

  test('/patterns/paged-attention/ links to ≥10 supporting cases (data flywheel proof)', async ({ page }) => {
    await page.goto('/patterns/paged-attention/');
    // Most-used pattern in our corpus — should have many supporting cases
    const caseLinks = page.locator('a[href*="/cases/case-"]');
    expect(await caseLinks.count()).toBeGreaterThanOrEqual(10);
  });
});

test.describe('Contribute landing page (3 tracks)', () => {
  test('zh /contribute shows 3 contributor tracks + lifecycle', async ({ page }) => {
    await page.goto('/contribute/');
    await expect(page.getByText(/厂商官方数据/).first()).toBeVisible();
    await expect(page.getByText(/社区数据补充/).first()).toBeVisible();
    await expect(page.getByText(/实测部署案例/).first()).toBeVisible();
    await expect(page.getByText(/贡献闭环/).first()).toBeVisible();
    // Each track has its CTA linking to a GitHub issue template
    const ctas = page.locator('a[href*="01-vendor-data-claim.yaml"]');
    await expect(ctas).toHaveCount(1);
  });

  test('en /en/contribute shows 3 tracks in English', async ({ page }) => {
    await page.goto('/en/contribute/');
    await expect(page.getByText(/Vendor official data/i).first()).toBeVisible();
    await expect(page.getByText(/Community data correction/i).first()).toBeVisible();
    await expect(page.getByText(/Reproducible deployment case/i).first()).toBeVisible();
    await expect(page.getByText(/Contribution lifecycle/i).first()).toBeVisible();
  });

  test('contribute page links to DATA-TIERING + DEVELOPMENT docs', async ({ page }) => {
    await page.goto('/contribute/');
    await expect(page.locator('a[href*="DATA-TIERING.md"]').first()).toBeVisible();
    await expect(page.locator('a[href*="DEVELOPMENT.md"]').first()).toBeVisible();
  });
});

test.describe('v1.2 niche hardware + scientific models + OperatorFitnessMatrix', () => {
  test('Cerebras WSE-3 detail shows wafer-scale + on-die-SRAM badges', async ({ page }) => {
    await page.goto('/hardware/wse-3/');
    await expect(page.getByText(/wafer-scale/i).first()).toBeVisible();
    await expect(page.getByText(/on-die SRAM/i).first()).toBeVisible();
    await expect(page.getByText(/900,000/).first()).toBeVisible();
  });

  test('Groq LPU detail shows deterministic-latency + 230 MB on-die badges', async ({ page }) => {
    await page.goto('/hardware/groq-lpu/');
    await expect(page.getByText(/deterministic/i).first()).toBeVisible();
    await expect(page.getByText(/230 MB/).first()).toBeVisible();
  });

  test('SambaNova SN40L detail shows reconfigurable RDU badge', async ({ page }) => {
    await page.goto('/hardware/sn40l/');
    await expect(page.getByText(/reconfigurable|RDU/i).first()).toBeVisible();
    await expect(page.getByText(/1664 GB|1.5 TB/i).first()).toBeVisible();
  });

  test('AlphaFold 3 model page renders scientific-domain decomposition', async ({ page }) => {
    await page.goto('/models/alphafold-3/');
    await expect(page.getByText(/AlphaFold/i).first()).toBeVisible();
    await expect(page.getByText(/pair-bias-attention/i).first()).toBeVisible();
  });

  test('GraphCast model page renders graph-iteration workload', async ({ page }) => {
    await page.goto('/models/graphcast/');
    await expect(page.getByText(/GraphCast/i).first()).toBeVisible();
    await expect(page.getByText(/graph-message-passing/i).first()).toBeVisible();
  });

  test('OperatorFitnessMatrix on H100 shows model rows + bottleneck classification', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    // Section heading + at least one bottleneck label rendered (use .first()
    // because both the h3 page section and the h4 component title match)
    await expect(page.getByRole('heading', { name: /算子级 fit/ }).first()).toBeVisible();
    await expect(page.getByText(/内存带宽|计算/).first()).toBeVisible();
    // ridge-point computation visible in subtitle
    await expect(page.getByText(/ridge point|FLOPs\/byte/i).first()).toBeVisible();
  });
});

test.describe('Architecture schema + factual Topology', () => {
  test('H100 detail shows vendor-floorplan badge with real CU count', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.locator('text=/vendor floorplan/i').first()).toBeVisible();
    // Architecture spec block must surface the real numbers (132 SMs, 50 MB L2)
    await expect(page.getByText(/132/).first()).toBeVisible();
    await expect(page.getByText(/50 MB/i).first()).toBeVisible();
  });

  test('all 28 hardware cards now have factual architecture (100% coverage)', async ({ page }) => {
    // Spot-check a Chinese card and an AWS card to prove coverage went beyond just NVIDIA.
    await page.goto('/hardware/ascend-910c/');
    await expect(page.locator('text=/vendor floorplan/i').first()).toBeVisible();
    await page.goto('/hardware/inferentia-2/');
    await expect(page.locator('text=/vendor floorplan/i').first()).toBeVisible();
  });
});

test.describe('Calculator CN no-Tier-0 notice', () => {
  test('selecting a Chinese accelerator with no measured cases surfaces calibration notice', async ({ page }) => {
    // enflame-t21 is a CN card with bf16 and zero cases in corpus
    await page.goto('/calculator/?model=llama-4-scout&hw=enflame-t21');
    await page.waitForSelector('button[type="button"]', { state: 'visible' });
    // Wait for Tier 0 heading to appear (proves result rendered)
    await expect(page.getByRole('heading', { name: /Tier 0|实测案例/i }).first()).toBeVisible({ timeout: 15000 });
    // CN notice should appear (zh locale by default on /calculator/)
    await expect(page.locator('text=/国产加速器暂无实测案例/').first()).toBeVisible();
  });
});

test.describe('Pricing / TCO leaderboard', () => {
  test('zh /pricing renders ranking + formula + chinese flag for CN cards', async ({ page }) => {
    await page.goto('/pricing/');
    // Title + formula box
    await expect(page.getByRole('heading', { name: /\$ \/ M tokens 排名/ })).toBeVisible();
    await expect(page.getByText(/公式 \/ Formula/)).toBeVisible();
    // Disclaimer about BoM scope
    await expect(page.getByText(/纯推理 BoM/)).toBeVisible();
    // At least one $/M cell renders
    await expect(page.locator('text=/\\$\\d+\\.\\d{2}/').first()).toBeVisible();
    // Calculator CTA at the bottom
    await expect(page.getByText(/打开计算器/)).toBeVisible();
  });

  test('en /en/pricing/ renders English titles, headers, disclaimer', async ({ page }) => {
    await page.goto('/en/pricing/');
    await expect(page.getByRole('heading', { name: /\$ \/ M tokens leaderboard/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Best cost per card/i })).toBeVisible();
    await expect(page.getByText(/Compute-only BoM estimate/i)).toBeVisible();
    await expect(page.getByText(/Open the calculator/i)).toBeVisible();
  });

  test('pricing nav link present on home page', async ({ page }) => {
    await page.goto('/');
    // Nav has "价格" link in zh (desktop md:flex)
    await expect(page.locator('nav a[href*="/pricing"]').first()).toBeVisible();
  });
});

test.describe('Compare with no card cap', () => {
  test('user can select more than 8 cards in compare', async ({ page }) => {
    await page.goto('/compare/');
    await page.waitForSelector('input[type="text"]', { state: 'visible' });
    // Click "全选" to select all hardware
    await page.getByRole('button', { name: /全选|^all$/, exact: true }).first().click();
    // Selection count badge should show at least 20 (we have 28 cards)
    await expect(page.getByText(/已选 \d{2,}/).first()).toBeVisible();
  });

  test('selecting >8 cards in radar view auto-switches to table', async ({ page }) => {
    await page.goto('/compare/?view=radar&ids=h100-sxm5,h200-sxm,b200-sxm');
    await page.waitForSelector('input[type="text"]', { state: 'visible' });
    await page.waitForTimeout(300); // let URL hydration settle (chartType -> radar)
    // Click "全选" — pushes selection past 8
    await page.getByRole('button', { name: '全选', exact: true }).first().click();
    await page.waitForTimeout(500);
    // After auto-switch the URL no longer has view=radar (table is default, so param dropped)
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.get('view'), { timeout: 3000 });
    // And the flipped table renders with ★ markers
    await expect(page.locator('text=/★/').first()).toBeVisible();
  });

  test('flipped compare table: hardware-as-rows with sort + filter + ★ best marker', async ({ page }) => {
    await page.goto('/compare/?view=table&ids=h100-sxm5,b200-sxm,mi355x,ascend-910c');
    await page.waitForSelector('input[type="text"]', { state: 'visible' });
    // Each row should be a hardware (not a metric) — column headers include 'BF16'
    await expect(page.getByRole('columnheader', { name: /硬件/ }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /BF16/ }).first()).toBeVisible();
    // ★ best marker visible somewhere
    await expect(page.locator('text=/★/').first()).toBeVisible();
    // Filter input narrows rows
    const filterInput = page.getByPlaceholder(/过滤行|Filter rows/).first();
    await filterInput.click();
    await filterInput.pressSequentially('h100', { delay: 30 });
    // Wait for React state + re-render
    await expect(page.getByText(/^[12] \/ 4 行/).first()).toBeVisible({ timeout: 5000 });
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
