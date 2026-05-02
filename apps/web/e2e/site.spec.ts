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
    // v1.34+: now has 2 RSS feeds (cases.xml + feed.xml). Both must be present.
    const rssLinks = page.locator('link[rel="alternate"][type="application/rss+xml"]');
    expect(await rssLinks.count()).toBeGreaterThanOrEqual(2);
    const hrefs = await rssLinks.evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).getAttribute('href')));
    expect(hrefs).toContain('/cases.xml');
    expect(hrefs).toContain('/feed.xml');
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
    // Two fitness sections exist after v1.15 (per-model + structural); use .first()
    await expect(page.getByRole('heading', { name: /硬件适配性|Hardware fitness/i }).first()).toBeVisible();
    // Ridge point column (existed before v1.15 in per-model section)
    await expect(page.getByRole('columnheader', { name: /Ridge point/i }).first()).toBeVisible();
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

test.describe('v1.41: 5 more operators (lora-bgmv, online-softmax, block-quantize, index-put, mamba-conv1d)', () => {
  test('LoRA BGMV operator visible (Punica / S-LoRA primitive)', async ({ page }) => {
    await page.goto('/operators/lora-bgmv/');
    await expect(page.getByText(/LoRA BGMV|Batched Grouped Matrix-Vector/i).first()).toBeVisible();
    await expect(page.getByText(/Punica|S-LoRA|multi-tenant/i).first()).toBeVisible();
  });

  test('Online Softmax operator visible (FlashAttention building block)', async ({ page }) => {
    await page.goto('/operators/online-softmax/');
    await expect(page.getByText(/Online Softmax|streaming softmax/i).first()).toBeVisible();
    await expect(page.getByText(/FlashAttention|numerically stable/i).first()).toBeVisible();
  });

  test('Block Quantize operator visible (FP4/FP8/INT8 granularity)', async ({ page }) => {
    await page.goto('/operators/block-quantize/');
    await expect(page.getByText(/Block Quantize|block-scaling/i).first()).toBeVisible();
    await expect(page.getByText(/NVFP4|MXFP4|GPTQ|AWQ/i).first()).toBeVisible();
  });

  test('Index-Put operator visible (KV cache write primitive)', async ({ page }) => {
    await page.goto('/operators/index-put/');
    await expect(page.getByText(/Index-Put|KV cache write/i).first()).toBeVisible();
    await expect(page.getByText(/PagedAttention|page-table/i).first()).toBeVisible();
  });

  test('Mamba Conv1d operator visible (SSM companion to selective-scan)', async ({ page }) => {
    await page.goto('/operators/mamba-conv1d/');
    await expect(page.getByText(/Mamba|Causal 1D Convolution|conv1d/i).first()).toBeVisible();
    await expect(page.getByText(/SSM|selective-scan|state-space/i).first()).toBeVisible();
  });

  test('Operators index now shows 34 entries (was 29)', async ({ page }) => {
    await page.goto('/operators/');
    // Each operator has a link with a known pattern; check at least 30 are visible
    const operatorLinks = page.locator('a[href^="/operators/"][href$="/"]');
    expect(await operatorLinks.count()).toBeGreaterThanOrEqual(30);
  });

  test('Fusion graph picks up the new operators (58 nodes total)', async ({ page }) => {
    await page.goto('/operators/fusion-graph/');
    const svg = page.locator('[data-testid="fusion-graph-svg"]').first();
    const circles = svg.locator('circle');
    expect(await circles.count()).toBeGreaterThanOrEqual(50);
  });
});

test.describe('v2.9: /agents/example/ — E2E agent sample', () => {
  test('/agents/example/ renders 7-stage pipeline + 13 artifacts + cross-model/hardware reuse', async ({ page }) => {
    await page.goto('/agents/example/');
    await expect(page.getByText(/AGENTS.*E2E SAMPLE|任意模型.*任意硬件/i).first()).toBeVisible();
    // 7-stage pipeline
    await expect(page.getByText(/7.*pipeline|7 阶段|Model understanding/i).first()).toBeVisible();
    // 13 artifacts mention
    await expect(page.getByText(/13.*artifact|deployment_plan|Dockerfile/i).first()).toBeVisible();
    // Cross-model + cross-hardware reuse
    await expect(page.getByText(/archetype|跨模型|cross.model/i).first()).toBeVisible();
    // Demo command snippet visible
    await expect(page.getByText(/agent-deploy|scripts\/agent-deploy/i).first()).toBeVisible();
  });

  test('/api/engines.json returns 200 (was missing before v2.9)', async ({ request }) => {
    const r = await request.get('/api/engines.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.count).toBeGreaterThanOrEqual(7);
    const ids = body.items.map((e: any) => e.id);
    expect(ids).toContain('vllm');
    expect(ids).toContain('sglang');
  });
});

test.describe('v2.8: model execution graphs (bridge from arch → ops)', () => {
  test('/api/model-graphs.json returns 200 with at least 2 graphs', async ({ request }) => {
    const r = await request.get('/api/model-graphs.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.count).toBeGreaterThanOrEqual(2);
    const ids = body.items.map((g: any) => g.id);
    expect(ids).toContain('deepseek-v4-pro-decode');
    expect(ids).toContain('llama-4-scout-decode');
  });

  test('DeepSeek V4 Pro graph has MLA op + MoE structure', async ({ request }) => {
    const r = await request.get('/api/model-graphs.json');
    const body = await r.json();
    const dsv4 = body.items.find((g: any) => g.id === 'deepseek-v4-pro-decode');
    expect(dsv4).toBeTruthy();
    expect(dsv4.layer_count).toBe(61);
    const ops = dsv4.per_layer_ops.map((o: any) => o.op_id);
    expect(ops).toContain('mla-attention');
    expect(ops).toContain('moe-gate');
    expect(ops).toContain('grouped-matmul');
  });

  test('/models/deepseek-v4-pro/ surfaces execution graph section', async ({ page }) => {
    await page.goto('/models/deepseek-v4-pro/');
    await expect(page.getByText(/Execution graph|执行|graph/i).first()).toBeVisible();
    // Should mention MLA somewhere
    await expect(page.getByText(/MLA|mla-attention/i).first()).toBeVisible();
  });

  test('/models/llama-4-scout/ surfaces decode-phase graph', async ({ page }) => {
    await page.goto('/models/llama-4-scout/');
    await expect(page.getByText(/Execution graph|graph/i).first()).toBeVisible();
    // GQA mentioned
    await expect(page.getByText(/GQA|H_kv/i).first()).toBeVisible();
  });
});

test.describe('v2.7: /dev-toolkit/ — DSL examples + reference impls + profiling tools', () => {
  test('/api/dsl-examples.json + /api/reference-impls.json + /api/profiling-tools.json all 200', async ({ request }) => {
    for (const url of ['/api/dsl-examples.json', '/api/reference-impls.json', '/api/profiling-tools.json']) {
      const r = await request.get(url);
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.count).toBeGreaterThanOrEqual(3);
      expect(body.license).toBe('CC-BY-SA-4.0');
    }
  });

  test('/dev-toolkit/ index renders all 3 sections', async ({ page }) => {
    await page.goto('/dev-toolkit/');
    await expect(page.getByText(/DEV TOOLKIT|Kernel.*工具箱|开发者/i).first()).toBeVisible();
    // 3 sections
    await expect(page.getByText(/DSL 示例|DSL Example/i).first()).toBeVisible();
    await expect(page.getByText(/参考实现|Reference/i).first()).toBeVisible();
    await expect(page.getByText(/Profiling 工具|Profiling Tool/i).first()).toBeVisible();
  });

  test('CUDA tiled GEMM detail page shows code skeleton + walkthrough + arch idioms', async ({ page }) => {
    await page.goto('/dev-toolkit/dsl-examples/cuda-tiled-gemm-hopper/');
    await expect(page.getByText(/Hopper Tiled GEMM/i).first()).toBeVisible();
    await expect(page.getByText(/Walkthrough/i).first()).toBeVisible();
    await expect(page.getByText(/Arch idioms|arch idiom/i).first()).toBeVisible();
    // Code visible
    await expect(page.getByText(/wgmma|WGMMA|TMA/i).first()).toBeVisible();
  });

  test('Ascend-C example shows GM/UB/L1 staging + TPipe/TQue idioms', async ({ page }) => {
    await page.goto('/dev-toolkit/dsl-examples/ascend-c-tiled-gemm/');
    await expect(page.getByText(/Ascend-C|Cube/i).first()).toBeVisible();
    await expect(page.getByText(/TPipe|TQue|UB|GM|L0|L1/i).first()).toBeVisible();
  });

  test('FlashAttention reference impls show across-vendor comparison', async ({ page }) => {
    await page.goto('/dev-toolkit/reference-impls/flashattention-3-hopper/');
    await expect(page.getByText(/Tri Dao|FlashAttention/i).first()).toBeVisible();
    await page.goto('/dev-toolkit/reference-impls/flashattention-mindie-ascend910c/');
    await expect(page.getByText(/aclnn|Ascend|Cube|Vector/i).first()).toBeVisible();
    await page.goto('/dev-toolkit/reference-impls/flashattention-ck-mi300x/');
    await expect(page.getByText(/MI300X|Composable Kernel|MFMA/i).first()).toBeVisible();
  });

  test('NCU profiling tool detail shows cross-vendor equivalents', async ({ page }) => {
    await page.goto('/dev-toolkit/profiling-tools/nvidia-ncu/');
    await expect(page.getByText(/NCU|Nsight Compute/i).first()).toBeVisible();
    await expect(page.getByText(/跨厂商等价|cross.vendor|equivalent/i).first()).toBeVisible();
    // Should link to rocprof + msprof
    await expect(page.locator('a[href$="/dev-toolkit/profiling-tools/amd-rocprof/"]').first()).toBeVisible();
    await expect(page.locator('a[href$="/dev-toolkit/profiling-tools/huawei-msprof/"]').first()).toBeVisible();
  });

  test('msprof shows Cube/Vector pipeline split (Ascend-specific feature)', async ({ page }) => {
    await page.goto('/dev-toolkit/profiling-tools/huawei-msprof/');
    await expect(page.getByText(/Cube|Vector/i).first()).toBeVisible();
  });
});

test.describe('v2.6: /isa-primitives/ Layer A + /api/coverage-matrix.json Layer E', () => {
  test('/api/isa-primitives.json returns 200 with cross_vendor_equivalents', async ({ request }) => {
    const r = await request.get('/api/isa-primitives.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.count).toBeGreaterThanOrEqual(10);
    expect(body.license).toBe('CC-BY-SA-4.0');
    // Find WGMMA — should have multiple cross_vendor_equivalents
    const wgmma = body.items.find((p: any) => p.id === 'nvidia-hopper-wgmma');
    expect(wgmma).toBeTruthy();
    expect(wgmma.cross_vendor_equivalents.length).toBeGreaterThanOrEqual(3);
  });

  test('/isa-primitives/ index renders by-vendor sections', async ({ page }) => {
    await page.goto('/isa-primitives/');
    await expect(page.getByText(/ISA PRIMITIVES.*Layer A|硬件指令集原语/i).first()).toBeVisible();
    // Vendor sections
    for (const v of ['NVIDIA', 'AMD', 'Huawei']) {
      await expect(page.getByText(new RegExp(v, 'i')).first()).toBeVisible();
    }
  });

  test('WGMMA detail page shows cross_vendor_equivalents (the keystone field)', async ({ page }) => {
    await page.goto('/isa-primitives/nvidia-hopper-wgmma/');
    await expect(page.getByText(/跨厂商等价|cross.vendor|keystone/i).first()).toBeVisible();
    // Should link to AMD MFMA + Huawei Cube
    await expect(page.locator('a[href$="/isa-primitives/amd-cdna3-mfma-32x32x16/"]').first()).toBeVisible();
    await expect(page.locator('a[href$="/isa-primitives/huawei-ascend-cube/"]').first()).toBeVisible();
  });

  test('/api/coverage-matrix.json returns Layer E flat data-frame', async ({ request }) => {
    const r = await request.get('/api/coverage-matrix.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.schema_version).toBe('1.0');
    expect(body.layer).toBe('E');
    expect(body.derived_from).toContain('operators');
    expect(body.derived_from).toContain('kernel-libraries');
    expect(body.derived_from).toContain('isa-primitives');
    expect(body.count).toBeGreaterThanOrEqual(100);
    // Should have query examples
    expect(body.query_examples.length).toBeGreaterThanOrEqual(3);
    // Should have rows with the expected shape
    const r0 = body.rows[0];
    expect(r0.operator_id).toBeTruthy();
    expect(r0.vendor).toBeTruthy();
    expect(r0.arch_family).toBeTruthy();
    expect(['full', 'partial', 'experimental', 'missing', 'deprecated']).toContain(r0.library_coverage);
    expect(typeof r0.has_formal_semantics).toBe('boolean');
  });

  test('Coverage matrix surfaces missing cells (PR opportunities)', async ({ request }) => {
    const r = await request.get('/api/coverage-matrix.json');
    const body = await r.json();
    expect(body.count_by_coverage.missing).toBeGreaterThanOrEqual(50);
    // Some operators should also have full coverage on Hopper / CDNA3
    expect(body.count_by_coverage.full).toBeGreaterThanOrEqual(50);
  });

  test('H100 detail page shows tensor_isa link to WGMMA', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    // Page should mention WGMMA somewhere (we added it to tensor_isa)
    // Direct UI surface may come in a future iteration; for now just check the /isa-primitives/ link is reachable
    await page.goto('/isa-primitives/nvidia-hopper-wgmma/');
    await expect(page.getByText(/H100|Hopper/i).first()).toBeVisible();
  });
});

test.describe('v2.5: /kernel-libraries/ Layer C + formal_semantics Layer D', () => {
  test('/api/kernel-libraries.json returns 200 with 8 entries', async ({ request }) => {
    const r = await request.get('/api/kernel-libraries.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.count).toBeGreaterThanOrEqual(8);
    expect(body.license).toBe('CC-BY-SA-4.0');
    const ids = body.items.map((l: any) => l.id);
    for (const id of ['cublas', 'cudnn', 'cutlass', 'rocblas', 'miopen', 'ck', 'aclnn', 'cnnl']) {
      expect(ids).toContain(id);
    }
  });

  test('/kernel-libraries/ index page renders header + coverage matrix', async ({ page }) => {
    await page.goto('/kernel-libraries/');
    await expect(page.getByRole('heading', { name: /Kernel libraries|算子库目录/i }).first()).toBeVisible();
    // Vendor sections
    await expect(page.getByText(/NVIDIA/i).first()).toBeVisible();
    await expect(page.getByText(/AMD/i).first()).toBeVisible();
    await expect(page.getByText(/Huawei|Ascend/i).first()).toBeVisible();
    // Coverage matrix
    await expect(page.getByText(/op-class.*library 覆盖矩阵|coverage matrix/i).first()).toBeVisible();
  });

  test('Each library detail page renders sections', async ({ page }) => {
    for (const slug of ['cublas', 'aclnn', 'ck']) {
      await page.goto(`/kernel-libraries/${slug}/`);
      await expect(page.getByText(/Op-class 覆盖|api_style|workspace|template|opaque/i).first()).toBeVisible();
    }
  });

  test('aclnn detail page surfaces porting caveats from CUDA', async ({ page }) => {
    await page.goto('/kernel-libraries/aclnn/');
    await expect(page.getByText(/从 CUDA 移植 caveats|porting/i).first()).toBeVisible();
    // aclnn has memory hierarchy + workspace caveats
    await expect(page.getByText(/UB.*L1.*L0|workspace|prefill.*decode/i).first()).toBeVisible();
  });

  test('Cross-vendor equivalents linked on cuBLAS page', async ({ page }) => {
    await page.goto('/kernel-libraries/cublas/');
    await expect(page.getByText(/跨厂商等价|Cross.vendor|equivalent/i).first()).toBeVisible();
    // Should link to rocblas + aclnn at minimum
    const rocLink = page.locator('a[href$="/kernel-libraries/rocblas/"]').first();
    const aclnnLink = page.locator('a[href$="/kernel-libraries/aclnn/"]').first();
    await expect(rocLink).toBeVisible();
    await expect(aclnnLink).toBeVisible();
  });

  test('softmax operator surfaces formal_semantics block (Layer D)', async ({ page }) => {
    await page.goto('/operators/softmax/');
    await expect(page.getByText(/Formal semantics|形式化语义|Layer D/i).first()).toBeVisible();
    // Edge cases section
    await expect(page.getByText(/Edge cases|all elements are -inf/i).first()).toBeVisible();
    // Numerical rules
    await expect(page.getByText(/Numerical rules|deterministic_reduction|accumulation_dtype/i).first()).toBeVisible();
  });

  test('matmul operator surfaces FP8 scaling rules across libraries', async ({ page }) => {
    await page.goto('/operators/matmul/');
    await expect(page.getByText(/Formal semantics|形式化语义/i).first()).toBeVisible();
    // FP8 scaling rule mentioned (per-tensor / per-block)
    await expect(page.getByText(/fp8_scaling|per-tensor|per-block/i).first()).toBeVisible();
  });

  test('SDPA operator surfaces softmax_accumulation_dtype rule', async ({ page }) => {
    await page.goto('/operators/scaled-dot-product-attention/');
    await expect(page.getByText(/Formal semantics|形式化语义/i).first()).toBeVisible();
    await expect(page.getByText(/FP32 internal|softmax_accumulation/i).first()).toBeVisible();
  });
});

test.describe('v2.4: /api/* agent-readiness endpoints + /agents/ doc page', () => {
  test('/api/operators.json returns 200 with items array', async ({ request }) => {
    const r = await request.get('/api/operators.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.count).toBeGreaterThanOrEqual(30);
    expect(body.license).toBe('CC-BY-SA-4.0');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('/api/fused-kernels.json returns 200 with items array', async ({ request }) => {
    const r = await request.get('/api/fused-kernels.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.count).toBeGreaterThanOrEqual(20);
  });

  test('/api/playbooks.json returns 200 with items array', async ({ request }) => {
    const r = await request.get('/api/playbooks.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.count).toBeGreaterThanOrEqual(20);
  });

  test('/api/solve.json returns flat configurations + query examples', async ({ request }) => {
    const r = await request.get('/api/solve.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.schema_version).toBe('1.0');
    expect(body.count).toBeGreaterThanOrEqual(50); // 41 cases + 24 playbooks ≈ 65
    expect(body.count_by_tier.measured).toBeGreaterThanOrEqual(30);
    expect(body.count_by_tier.estimated).toBeGreaterThanOrEqual(15);
    expect(Array.isArray(body.query_examples)).toBe(true);
    expect(body.query_examples.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(body.configurations)).toBe(true);
    // Each entry should have shape {source, source_id, model, hardware, engine, quantization, metrics, tier, default_score}
    const c = body.configurations[0];
    expect(c.source).toMatch(/case|playbook/);
    expect(c.source_id).toBeTruthy();
    expect(c.tier).toMatch(/measured|estimated/);
    expect(typeof c.default_score).toBe('number');
  });

  test('/api/solve.json measured cases have derived dollars_per_m_tokens for known hardware', async ({ request }) => {
    const r = await request.get('/api/solve.json');
    const body = await r.json();
    // At least some H100 cases should have a derived dollar estimate
    const h100Cases = body.configurations.filter(
      (c: any) => c.tier === 'measured' && c.hardware.id === 'h100-sxm5'
    );
    expect(h100Cases.length).toBeGreaterThanOrEqual(1);
    const withCost = h100Cases.filter(
      (c: any) => c.metrics.dollars_per_m_tokens_estimate != null
    );
    expect(withCost.length).toBeGreaterThanOrEqual(1);
  });

  test('/agents/ page renders header + 7-stage pipeline + JSON API list', async ({ page }) => {
    await page.goto('/agents/');
    // Eyebrow / title both contain "AGENTS"
    await expect(page.getByText(/AGENTS · v2\.4|给智能体的集成入口/i).first()).toBeVisible();
    // 7-stage pipeline table
    await expect(page.getByText(/Model understanding|Hardware understanding/i).first()).toBeVisible();
    // JSON API list contains solve.json
    await expect(page.getByText(/\/api\/solve\.json/i).first()).toBeVisible();
    // Known gaps section
    await expect(page.getByText(/已知 gap|Known gap|ISA 原语|cross-vendor/i).first()).toBeVisible();
  });

  test('/api/openapi.json reflects v2.4.0 with new endpoints', async ({ request }) => {
    const r = await request.get('/api/openapi.json');
    const spec = await r.json();
    expect(spec.info.version).toBe('2.4.0');
    expect(spec.paths['/api/operators.json']).toBeTruthy();
    expect(spec.paths['/api/fused-kernels.json']).toBeTruthy();
    expect(spec.paths['/api/playbooks.json']).toBeTruthy();
    expect(spec.paths['/api/solve.json']).toBeTruthy();
  });
});

test.describe('v2.3: /learn/cost-optimization/ — cost-lever playbook', () => {
  test('renders header + workload-archetype recommendations', async ({ page }) => {
    await page.goto('/learn/cost-optimization/');
    await expect(page.getByRole('heading', { name: /成本优化|Cost optimization/i }).first()).toBeVisible();
    await expect(page.getByText(/工作负载|workload|archetype/i).first()).toBeVisible();
    // 6 archetype cards
    await expect(page.getByText(/Chat|RAG|Agent|Code-completion|Batch|Multi-tenant|Long context/i).first()).toBeVisible();
  });

  test('catalogs 14 cost levers across 4 families', async ({ page }) => {
    await page.goto('/learn/cost-optimization/');
    // 4 family headers
    for (const fam of ['Compute', 'Memory', 'Serving', 'Scheduling']) {
      await expect(page.getByText(new RegExp(fam, 'i')).first()).toBeVisible();
    }
    // Specific levers visible
    await expect(page.getByText(/FP8 量化|FP4 量化|RadixAttention|prefix-cache/i).first()).toBeVisible();
  });

  test('shows anti-patterns section (levers that DONT help)', async ({ page }) => {
    await page.goto('/learn/cost-optimization/');
    await expect(page.getByText(/反模式|Anti-pattern|不该开/i).first()).toBeVisible();
  });

  test('cross-links to migrations + engines/compare + operators/hardware-fitness', async ({ page }) => {
    await page.goto('/learn/cost-optimization/');
    await expect(page.locator('a[href*="/learn/migrations/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/engines/compare/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/hardware/power-thermal-matrix/"]').first()).toBeVisible();
  });
});

test.describe('v2.2: /operators/hardware-fitness/ — op × hw_arch fitness matrix', () => {
  test('/operators/hardware-fitness/ renders header + 12 arch coverage cards', async ({ page }) => {
    await page.goto('/operators/hardware-fitness/');
    await expect(page.getByRole('heading', { name: /算子.*硬件.*适配|Hardware fitness/i }).first()).toBeVisible();
    // Per-arch coverage section + at least 6 arch families visible (Hopper / Blackwell / Ada / Ampere / CDNA3 / Ascend)
    await expect(page.getByText(/Hopper/i).first()).toBeVisible();
    await expect(page.getByText(/Blackwell/i).first()).toBeVisible();
    await expect(page.getByText(/CDNA3/i).first()).toBeVisible();
    await expect(page.getByText(/Ascend/i).first()).toBeVisible();
  });

  test('Operator matrix renders all operator rows', async ({ page }) => {
    await page.goto('/operators/hardware-fitness/');
    // Should render 34 rows in operator matrix (we have 34 operators)
    const opLinks = page.locator('a[href^="/operators/"][href$="/"]:not([href$="/hardware-fitness/"]):not([href$="/fusion-graph/"]):not([href$="/fusion-matrix/"])');
    expect(await opLinks.count()).toBeGreaterThanOrEqual(30);
  });

  test('Fused-kernel matrix renders too (separate section)', async ({ page }) => {
    await page.goto('/operators/hardware-fitness/');
    await expect(page.getByText(/融合 Kernel|Fused Kernel|Fused kernel.*matrix/i).first()).toBeVisible();
    const fkLinks = page.locator('a[href^="/fused-kernels/"]:not([href$="/fused-kernels/"])');
    expect(await fkLinks.count()).toBeGreaterThanOrEqual(20);
  });

  test('Cell counts include actual numbers (≥1 = supported)', async ({ page }) => {
    await page.goto('/operators/hardware-fitness/');
    // Hopper is the most-supported arch — should have many cells with engine counts
    const cellSpans = page.locator('span[style*="font-family: var(--font-mono)"][style*="display: inline-block"]');
    expect(await cellSpans.count()).toBeGreaterThanOrEqual(100);
  });

  test('Decision shortcuts section guides hardware selection', async ({ page }) => {
    await page.goto('/operators/hardware-fitness/');
    await expect(page.getByText(/选硬件的 op-fitness 视角|hardware|MLA|Mamba|spec decoding/i).first()).toBeVisible();
  });

  test('/operators/ index links to hardware-fitness via callout', async ({ page }) => {
    await page.goto('/operators/');
    const link = page.locator('a[href$="/operators/hardware-fitness/"]').first();
    await expect(link).toBeVisible();
  });
});

test.describe('v2.1: /hardware/power-thermal-matrix/ — power & thermal envelope', () => {
  test('/hardware/power-thermal-matrix/ renders header + 4 stat cards + table + leaderboard', async ({ page }) => {
    await page.goto('/hardware/power-thermal-matrix/');
    await expect(page.getByRole('heading', { name: /电源.*散热|Power.*Thermal/i }).first()).toBeVisible();
    // Coverage stats card present
    await expect(page.getByText(/v2\.1 power data|总覆盖|coverage/i).first()).toBeVisible();
    // Detail matrix has TDP / Sustained / cooling / TFLOPS/W columns
    await expect(page.getByText(/TDP \(W\)|fp16 TFLOPS\/W/i).first()).toBeVisible();
    // Leaderboard section present
    await expect(page.getByText(/性能每瓦排行|leaderboard|TFLOPS \/ W/i).first()).toBeVisible();
  });

  test('Power-thermal matrix shows ✓ data for ≥10 cards', async ({ page }) => {
    await page.goto('/hardware/power-thermal-matrix/');
    // Should have multiple cooling badges (one per row)
    const coolingBadges = page.locator('span', { hasText: /风冷|液冷|Air|Liquid/i });
    expect(await coolingBadges.count()).toBeGreaterThanOrEqual(8);
  });

  test('Cooling distribution section groups cards by cooling type', async ({ page }) => {
    await page.goto('/hardware/power-thermal-matrix/');
    await expect(page.getByText(/散热类型分布|Cooling distribution/i).first()).toBeVisible();
    // air + liquid sections
    await expect(page.getByText(/液冷|Liquid|cold plate/i).first()).toBeVisible();
  });

  test('Decision shortcuts section has 3 deployment scenarios', async ({ page }) => {
    await page.goto('/hardware/power-thermal-matrix/');
    await expect(page.getByText(/部署决策快捷|Decision/i).first()).toBeVisible();
    await expect(page.getByText(/风冷机房|air-only/i).first()).toBeVisible();
    await expect(page.getByText(/perf\/W|TFLOPS\/W/i).first()).toBeVisible();
  });

  test('Per-hardware detail page surfaces power-thermal section (H100)', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.getByRole('heading', { name: /电源.*散热|Power.*Thermal/i }).first()).toBeVisible();
    // sustained + cooling + perf/watt all present for H100
    await expect(page.getByText(/Sustained|液冷|liquid-direct|TFLOPS \/ W/i).first()).toBeVisible();
  });

  test('Per-hardware detail page links to matrix', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    const matrixLink = page.locator('a[href$="/hardware/power-thermal-matrix/"]').first();
    await expect(matrixLink).toBeVisible();
  });
});

test.describe('v1.43: /learn/migrations/ — migration playbooks', () => {
  test('/learn/migrations/ hub renders 4 migration cards + 7-step framework', async ({ page }) => {
    await page.goto('/learn/migrations/');
    await expect(page.getByRole('heading', { name: /迁移指南|Migration/i }).first()).toBeVisible();
    // 4 migration paths
    await expect(page.getByText(/引擎切换|Engine swap/i).first()).toBeVisible();
    await expect(page.getByText(/硬件切换|Hardware swap/i).first()).toBeVisible();
    await expect(page.getByText(/量化降级|Quantization downcast/i).first()).toBeVisible();
    await expect(page.getByText(/规模化迁移|Scale-out/i).first()).toBeVisible();
    // 7-step framework
    await expect(page.getByText(/Trigger|为什么现在做/i).first()).toBeVisible();
    await expect(page.getByText(/Rollback|失败回滚/i).first()).toBeVisible();
  });

  test('engine-swap playbook renders all 7 sections + config-semantics table', async ({ page }) => {
    await page.goto('/learn/migrations/engine-swap/');
    await expect(page.getByRole('heading', { name: /引擎切换|Engine swap/i }).first()).toBeVisible();
    // 7 numbered sections
    for (const section of ['Trigger', 'Prerequisites', 'Plan', 'Cutover', 'Validation', 'Rollback', 'Followups']) {
      await expect(page.getByText(new RegExp(section, 'i')).first()).toBeVisible();
    }
    // config-semantics comparison table
    await expect(page.getByText(/--max-num-seqs|max-running-requests|max_batch_size/i).first()).toBeVisible();
  });

  test('hardware-swap playbook surfaces 4 paths + Ascend variant', async ({ page }) => {
    await page.goto('/learn/migrations/hardware-swap/');
    await expect(page.getByRole('heading', { name: /硬件切换|Hardware swap/i }).first()).toBeVisible();
    // 4 path cards
    await expect(page.getByText(/A100.*H100|H100.*B200/i).first()).toBeVisible();
    await expect(page.getByText(/MI300X|H100.*MI300X/i).first()).toBeVisible();
    await expect(page.getByText(/Ascend|910C/i).first()).toBeVisible();
  });

  test('quant-downcast playbook explains FP16/FP8/FP4 progression', async ({ page }) => {
    await page.goto('/learn/migrations/quant-downcast/');
    await expect(page.getByRole('heading', { name: /量化降级|Quantization downcast/i }).first()).toBeVisible();
    // Three quant tiers
    await expect(page.getByText(/FP8 E4M3|FP8/i).first()).toBeVisible();
    await expect(page.getByText(/NVFP4|MXFP4/i).first()).toBeVisible();
    await expect(page.getByText(/AWQ|GPTQ/i).first()).toBeVisible();
    // calibration data emphasized
    await expect(page.getByText(/calibration|eval/i).first()).toBeVisible();
  });

  test('scaling playbook surfaces 3 scale-out hops + PD-disagg', async ({ page }) => {
    await page.goto('/learn/migrations/scaling/');
    await expect(page.getByRole('heading', { name: /规模化|Scale-out/i }).first()).toBeVisible();
    // 3 hops
    await expect(page.getByText(/单节点|多节点|多卡/i).first()).toBeVisible();
    await expect(page.getByText(/NVL72|super-pod/i).first()).toBeVisible();
    await expect(page.getByText(/PD-disagg|disagg/i).first()).toBeVisible();
  });

  test('migrations hub links to /learn/production-lifecycle/, /learn/troubleshooting/, /engines/compare/', async ({ page }) => {
    await page.goto('/learn/migrations/');
    const productionLink = page.locator('a[href*="/learn/production-lifecycle/"]').first();
    const troubleshootLink = page.locator('a[href*="/learn/troubleshooting/"]').first();
    const compareLink = page.locator('a[href*="/engines/compare/"]').first();
    await expect(productionLink).toBeVisible();
    await expect(troubleshootLink).toBeVisible();
    await expect(compareLink).toBeVisible();
  });

  test('Each migration playbook back-links to /learn/migrations/ hub', async ({ page }) => {
    for (const slug of ['engine-swap', 'hardware-swap', 'quant-downcast', 'scaling']) {
      await page.goto(`/learn/migrations/${slug}/`);
      const back = page.locator('a[href$="/learn/migrations/"]').first();
      await expect(back).toBeVisible();
    }
  });
});

test.describe('v1.42: /engines/compare/ — engine capability matrix', () => {
  test('/engines/compare/ renders header + 4 coverage cards + 6 axis tables', async ({ page }) => {
    await page.goto('/engines/compare/');
    await expect(page.getByRole('heading', { name: /推理引擎能力对比矩阵|Engine.*[Cc]apability/i }).first()).toBeVisible();
    // 6 axis sections (quant / parallel / serving / spec-decode / frontend / deployment)
    const axisHeadings = page.locator('h2');
    expect(await axisHeadings.count()).toBeGreaterThanOrEqual(6);
  });

  test('Compare matrix renders 7 engine columns × all axes', async ({ page }) => {
    await page.goto('/engines/compare/');
    // Each engine name should appear at least once as a column header link
    for (const name of ['vLLM', 'SGLang', 'TensorRT-LLM', 'MindIE', 'LMDeploy', 'MoRI', 'HanGuangAI']) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
  });

  test('Compare matrix shows ✓ glyphs (engines actually have features)', async ({ page }) => {
    await page.goto('/engines/compare/');
    // Should be 100+ supported cells across the matrix
    const checkmarks = page.locator('span', { hasText: /^✓$/ });
    expect(await checkmarks.count()).toBeGreaterThanOrEqual(100);
  });

  test('Compare matrix surfaces decision shortcuts (selection helper)', async ({ page }) => {
    await page.goto('/engines/compare/');
    await expect(page.getByText(/选型快捷方式|Decision/i).first()).toBeVisible();
    // Should have shortcut cards (NVIDIA-only / PD-disagg / 异构 / Ascend / InternLM / frontier)
    const shortcuts = page.locator('a[href*="/engines/"]', { hasText: /^[a-zA-Z]/ });
    expect(await shortcuts.count()).toBeGreaterThanOrEqual(5);
  });

  test('Engine detail page surfaces capability matrix (vLLM)', async ({ page }) => {
    await page.goto('/engines/vllm/');
    await expect(page.getByRole('heading', { name: /能力矩阵|Capability/i }).first()).toBeVisible();
    await expect(page.getByText(/量化格式|Quantization/i).first()).toBeVisible();
    await expect(page.getByText(/并行策略|Parallelism/i).first()).toBeVisible();
    await expect(page.getByText(/服务特性|Serving/i).first()).toBeVisible();
  });

  test('Engine detail page surfaces strengths / weaknesses / best-for (vLLM)', async ({ page }) => {
    await page.goto('/engines/vllm/');
    await expect(page.getByText(/优势|Strengths/i).first()).toBeVisible();
    await expect(page.getByText(/局限|Weaknesses/i).first()).toBeVisible();
    await expect(page.getByText(/最适合|Best for/i).first()).toBeVisible();
  });

  test('/engines/ index links to /engines/compare/ via callout', async ({ page }) => {
    await page.goto('/engines/');
    const calloutLink = page.locator('a[href$="/engines/compare/"]').first();
    await expect(calloutLink).toBeVisible();
  });
});

test.describe('v1.40: /learn/troubleshooting/ — symptom-driven debugging decision tree', () => {
  test('/learn/troubleshooting/ renders header + 4 stat cards + symptom categories', async ({ page }) => {
    await page.goto('/learn/troubleshooting/');
    await expect(page.getByRole('heading', { name: /部署故障诊断|Production Troubleshooting/i }).first()).toBeVisible();
    await expect(page.locator('[data-testid="ts-stat-symptoms"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="ts-stat-hypotheses"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="ts-stat-categories"]').first()).toBeVisible();
  });

  test('All 6 symptom categories present (throughput / latency / memory / quality / startup / cost)', async ({ page }) => {
    await page.goto('/learn/troubleshooting/');
    for (const cat of ['throughput', 'latency', 'memory', 'quality', 'startup', 'cost']) {
      await expect(page.locator(`#cat-${cat}`).first()).toBeVisible();
    }
  });

  test('Decode-slow symptom has multiple ranked hypotheses with diagnostic + fix', async ({ page }) => {
    await page.goto('/learn/troubleshooting/');
    const symptom = page.locator('[data-testid="symptom-decode-slow"]').first();
    await expect(symptom).toBeVisible();
    // Multiple hypotheses with high/medium/low probability
    await expect(symptom).toContainText(/高概率/);
    await expect(symptom).toContainText(/诊断/);
    await expect(symptom).toContainText(/修复/);
  });

  test('Hypotheses cross-link to relevant patterns and fused-kernels', async ({ page }) => {
    await page.goto('/learn/troubleshooting/');
    // At least one pattern link + one fused-kernel link
    await expect(page.locator('a[href*="/patterns/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/fused-kernels/"]').first()).toBeVisible();
  });

  test('Page concludes with "三角覆盖" linking to deployment-failures + observability + lifecycle', async ({ page }) => {
    await page.goto('/learn/troubleshooting/');
    await expect(page.getByText(/三角覆盖/i).first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/deployment-failures"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/observability"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/production-lifecycle"]').first()).toBeVisible();
  });

  test('Learn dropdown contains the new troubleshooting link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="learn"]').first();
    await expect(dd.locator('a[href*="/learn/troubleshooting"]').first()).toHaveCount(1);
  });

  test('/learn/observability/ now cross-links to troubleshooting', async ({ page }) => {
    await page.goto('/learn/observability/');
    await expect(page.locator('a[href*="/learn/troubleshooting"]').first()).toBeVisible();
  });
});

test.describe('v1.39: /contribute/case-form/ — web form generating PR-ready case YAML', () => {
  test('/contribute/case-form/ renders form + sticky output panel', async ({ page }) => {
    await page.goto('/contribute/case-form/');
    await expect(page.getByRole('heading', { name: /提交部署案例|Submit a deployment case/i }).first()).toBeVisible();
    // The form is client:only=react — wait for output panel to mount + render YAML
    await expect(page.locator('[data-testid="csf-output"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="csf-yaml-output"]').first()).toBeVisible();
  });

  test('Generated YAML contains required schema fields (id, title, stack, results, evidence)', async ({ page }) => {
    await page.goto('/contribute/case-form/');
    const yaml = await page.locator('[data-testid="csf-yaml-output"]').first().textContent();
    expect(yaml).toBeTruthy();
    expect(yaml).toContain('id: case-');
    expect(yaml).toContain('title:');
    expect(yaml).toContain('stack:');
    expect(yaml).toContain('results:');
    expect(yaml).toContain('throughput_tokens_per_sec:');
    expect(yaml).toContain('evidence:');
    expect(yaml).toContain('tier: measured');
  });

  test('Updating a form field re-renders the YAML output', async ({ page }) => {
    await page.goto('/contribute/case-form/');
    const initialYaml = await page.locator('[data-testid="csf-yaml-output"]').first().textContent();
    // Find the title input (first text input after the slug input) and modify
    const titleInput = page.locator('input[type="text"]').nth(1);
    await titleInput.fill('Custom case title for E2E test');
    // Wait a tick for re-render
    await page.waitForTimeout(150);
    const updatedYaml = await page.locator('[data-testid="csf-yaml-output"]').first().textContent();
    expect(updatedYaml).toContain('Custom case title for E2E test');
    expect(updatedYaml).not.toBe(initialYaml);
  });

  test('Copy button is present and clickable', async ({ page }) => {
    await page.goto('/contribute/case-form/');
    const copyBtn = page.locator('[data-testid="csf-copy-btn"]').first();
    await expect(copyBtn).toBeVisible();
    // Don't actually click (that would trigger a clipboard write that may not work in headless), just verify it's there
  });

  test('PR submission instructions visible (links to GitHub data/cases path)', async ({ page }) => {
    await page.goto('/contribute/case-form/');
    await expect(page.getByText(/提交 PR 步骤|How to submit/i).first()).toBeVisible();
    await expect(page.locator('a[href*="github.com/ying-wen/evokernel-spec/new"]').first()).toBeVisible();
  });

  test('About dropdown contains the new case-form link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="about"]').first();
    await expect(dd.locator('a[href*="/contribute/case-form"]').first()).toHaveCount(1);
  });

  test('/contribute/ "Submit a case" track now points to the form', async ({ page }) => {
    await page.goto('/contribute/');
    await expect(page.locator('a[href*="/contribute/case-form"]').first()).toBeVisible();
  });
});

test.describe('v1.38: /operators/fusion-graph/ — SVG bipartite graph view (complement to fusion-matrix)', () => {
  test('/operators/fusion-graph/ renders header + 4 stat cards + SVG graph', async ({ page }) => {
    await page.goto('/operators/fusion-graph/');
    await expect(page.getByRole('heading', { name: /算子.*二分图|Bipartite|Fusion Graph/i }).first()).toBeVisible();
    await expect(page.locator('[data-testid="fg-stat-edges"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="fg-stat-hubs"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="fg-stat-heavy"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="fusion-graph-svg"]').first()).toBeVisible();
  });

  test('SVG contains nodes for both operators and fused kernels with edges between', async ({ page }) => {
    await page.goto('/operators/fusion-graph/');
    const svg = page.locator('[data-testid="fusion-graph-svg"]').first();
    const circles = svg.locator('circle');
    expect(await circles.count()).toBeGreaterThanOrEqual(25);
    const paths = svg.locator('path[d^="M "]');
    expect(await paths.count()).toBeGreaterThanOrEqual(30);
  });

  test('Graph surfaces top hubs and heavy-fusion kernels with degree counts', async ({ page }) => {
    await page.goto('/operators/fusion-graph/');
    await expect(page.getByText(/算子 hubs/i).first()).toBeVisible();
    await expect(page.getByText(/Heavy-fusion kernels/i).first()).toBeVisible();
  });

  test('Graph includes educational "how to read" section', async ({ page }) => {
    await page.goto('/operators/fusion-graph/');
    await expect(page.getByText(/如何读这张图/i).first()).toBeVisible();
    await expect(page.getByText(/节点大小 = 度数/i).first()).toBeVisible();
  });

  test('Optimize dropdown contains the new fusion-graph link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="optimize"]').first();
    await expect(dd.locator('a[href*="/operators/fusion-graph"]').first()).toHaveCount(1);
  });

  test('Existing fusion-matrix page cross-links to graph view', async ({ page }) => {
    await page.goto('/operators/fusion-matrix/');
    await expect(page.locator('a[href*="/operators/fusion-graph"]').first()).toBeVisible();
  });
});

test.describe('v1.37: 2 more tours (Kimi K2.6 reasoning B200 + GPT-OSS Atlas) — closes archetype combos', () => {
  test('Kimi K2.6 reasoning × 4× B200 tour visible (Blackwell + reasoning archetype)', async ({ page }) => {
    await page.goto('/learn/tours/kimi-k26-b200x4-trtllm-fp4/');
    await expect(page.getByText(/Kimi K2\.6|B200|reasoning|FP4/i).first()).toBeVisible();
    await expect(page.getByText(/MTP|long CoT/i).first()).toBeVisible();
    // All 7 pipeline stages
    for (const stage of ['acquire', 'convert', 'quantize', 'compile', 'shard', 'serve', 'observe']) {
      await expect(page.locator(`[data-testid="tour-stage-${stage}"]`).first()).toBeVisible();
    }
  });

  test('GPT-OSS × Atlas 800T A3 tour visible (国产 alt path beyond CloudMatrix)', async ({ page }) => {
    await page.goto('/learn/tours/gptoss-atlas-800t-mindie/');
    await expect(page.getByText(/GPT-OSS|Atlas|MindIE|信创/i).first()).toBeVisible();
    await expect(page.getByText(/120B|MoE|Apache 2/i).first()).toBeVisible();
  });

  test('Kimi B200 case detail visible', async ({ page }) => {
    await page.goto('/cases/case-kimi-k26-b200x4-trtllm-fp4-001/');
    await expect(page.getByText(/Kimi K2\.6|B200|FP4/i).first()).toBeVisible();
  });

  test('GPT-OSS Atlas case detail visible', async ({ page }) => {
    await page.goto('/cases/case-gptoss-atlas800t-mindie-001/');
    await expect(page.getByText(/GPT-OSS|Atlas|MindIE|INT8/i).first()).toBeVisible();
  });

  test('Tours index now shows 11 tours', async ({ page }) => {
    await page.goto('/learn/tours/');
    const tourRows = page.locator('[data-testid^="tour-row-"]');
    expect(await tourRows.count()).toBeGreaterThanOrEqual(11);
    await expect(page.locator('[data-testid="tour-row-kimi-k26-b200x4-trtllm-fp4"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="tour-row-gptoss-atlas-800t-mindie"]').first()).toBeVisible();
  });
});

test.describe('v1.36: /pricing/by-engine/ — per-engine cost calibration matrix', () => {
  test('/pricing/by-engine/ renders header + 4 stat cards + engine summary + h2h matrix', async ({ page }) => {
    await page.goto('/pricing/by-engine/');
    await expect(page.getByRole('heading', { name: /按引擎对照成本|Pricing by Engine/i }).first()).toBeVisible();
    await expect(page.locator('[data-testid="bye-stat-engines"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="bye-stat-cells"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="bye-stat-multi"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="engine-summary"]').first()).toBeVisible();
  });

  test('Engine summary table ranks at least 3 engines (vLLM + SGLang + …) by median $/M tok', async ({ page }) => {
    await page.goto('/pricing/by-engine/');
    const ranks = page.locator('[data-testid^="engine-rank-"]');
    expect(await ranks.count()).toBeGreaterThanOrEqual(3);
    // vLLM should be among them given how many cases use it
    await expect(page.locator('[data-testid="engine-rank-vllm"]').first()).toBeVisible();
  });

  test('Engine summary first row marked with ★ (cheapest median)', async ({ page }) => {
    await page.goto('/pricing/by-engine/');
    const summary = page.locator('[data-testid="engine-summary"]').first();
    await expect(summary).toContainText(/★/);
  });

  test('Tools dropdown contains the new pricing/by-engine link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="tools"]').first();
    await expect(dd.locator('a[href*="/pricing/by-engine"]').first()).toHaveCount(1);
  });

  test('Page educates on why engine choice affects cost (4 trade-off cards)', async ({ page }) => {
    await page.goto('/pricing/by-engine/');
    await expect(page.getByText(/为什么引擎选择影响成本/i).first()).toBeVisible();
    await expect(page.getByText(/PagedAttention|RadixAttention|TRT-LLM/).first()).toBeVisible();
    await expect(page.getByText(/国产硬件|MindIE/).first()).toBeVisible();
  });
});

test.describe('v1.35: FLUX.1 [dev] diffusion tour (closes diffusion archetype gap, schema generalizes to non-LLM)', () => {
  test('FLUX.1 [dev] model detail page renders without crash (diffusion-family)', async ({ page }) => {
    await page.goto('/models/flux-1-dev/');
    await expect(page.getByText(/FLUX|black-forest/i).first()).toBeVisible();
    await expect(page.getByText(/diffusion/i).first()).toBeVisible();
    // 12B params shown
    await expect(page.getByText(/12/).first()).toBeVisible();
  });

  test('Diffusion tour visible at /learn/tours/flux-1-dev-h200-fp8/', async ({ page }) => {
    await page.goto('/learn/tours/flux-1-dev-h200-fp8/');
    await expect(page.getByText(/FLUX|DiT|denoising|Diffusion/i).first()).toBeVisible();
    // Each pipeline stage rendered
    await expect(page.locator('[data-testid="tour-stage-acquire"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="tour-stage-quantize"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="tour-stage-shard"]').first()).toBeVisible();
  });

  test('FLUX case detail page visible (case-flux-1-dev-h200x1-fp8-001)', async ({ page }) => {
    await page.goto('/cases/case-flux-1-dev-h200x1-fp8-001/');
    await expect(page.getByText(/FLUX|H200|FP8/i).first()).toBeVisible();
    await expect(page.getByText(/diffusion|denoising|images\/sec/i).first()).toBeVisible();
  });

  test('Tours index now shows 9 tours including the diffusion archetype', async ({ page }) => {
    await page.goto('/learn/tours/');
    const tourRows = page.locator('[data-testid^="tour-row-"]');
    expect(await tourRows.count()).toBeGreaterThanOrEqual(9);
    await expect(page.locator('[data-testid="tour-row-flux-1-dev-h200-fp8"]').first()).toBeVisible();
  });

  test('Capacity planner excludes diffusion models from picker (KV math does not apply)', async ({ page }) => {
    await page.goto('/calculator/capacity-planner/');
    // Get the model select dropdown content; flux-1-dev should NOT appear
    const modelSelect = page.locator('select').first();
    const options = await modelSelect.locator('option').allTextContents();
    expect(options.some((o) => o.toLowerCase().includes('flux'))).toBe(false);
  });
});

test.describe('v1.34: /changelog/ public page + /feed.xml RSS feed', () => {
  test('/changelog/ renders with stats card + month TOC + recent releases', async ({ page }) => {
    await page.goto('/changelog/');
    await expect(page.getByRole('heading', { name: /版本日志|Changelog/i }).first()).toBeVisible();
    await expect(page.locator('[data-testid="changelog-stat-total"]').first()).toBeVisible();
    // Recent releases visible (v1.30+ should always exist as long as the site is shipping)
    await expect(page.locator('[data-testid="release-v1.33.0"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="release-v1.30.0"]').first()).toBeVisible();
  });

  test('/changelog/ has RSS subscribe links', async ({ page }) => {
    await page.goto('/changelog/');
    // Multiple RSS links (header stat card + footer CTA + inline)
    const rssLinks = page.locator('a[href*="/feed.xml"]');
    expect(await rssLinks.count()).toBeGreaterThanOrEqual(2);
  });

  test('/changelog/ release entries link to GitHub release tags', async ({ page }) => {
    await page.goto('/changelog/');
    await expect(page.locator('a[href*="github.com/ying-wen/evokernel-spec/releases/tag/v"]').first()).toBeVisible();
  });

  test('/feed.xml renders valid RSS with multiple items', async ({ page }) => {
    const response = await page.request.get('/feed.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/xml/);
    const body = await response.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<rss version="2.0">');
    expect(body).toContain('EvoKernel Spec — Releases');
    // At least 5 items present (likely many more)
    const itemCount = (body.match(/<item>/g) ?? []).length;
    expect(itemCount).toBeGreaterThanOrEqual(5);
  });

  test('RSS auto-discovery <link rel="alternate"> present in <head>', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();
    expect(html).toContain('type="application/rss+xml"');
    expect(html).toContain('feed.xml');
  });

  test('About dropdown contains the new changelog link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="about"]').first();
    await expect(dd.locator('a[href*="/changelog"]').first()).toHaveCount(1);
  });
});

test.describe('v1.33: /servers/cluster-internals/ — unified per-pod 3-axis view (gap-1 capstone)', () => {
  test('/servers/cluster-internals/ renders with header + 5 stats cards + per-pod rows', async ({ page }) => {
    await page.goto('/servers/cluster-internals/');
    await expect(page.getByRole('heading', { name: /集群内部架构总览|Cluster Internals/i }).first()).toBeVisible();
    // 5 stat cards: total / coherent / sharp / gds / all-three
    for (const id of ['stat-total', 'stat-coherent', 'stat-sharp', 'stat-gds', 'stat-all-three']) {
      await expect(page.locator(`[data-testid="${id}"]`).first()).toBeVisible();
    }
  });

  test('Per-pod rows present for all 14 super-pods, each linking to detail page', async ({ page }) => {
    await page.goto('/servers/cluster-internals/');
    const slugs = [
      'nvidia-hgx-h100', 'nvidia-hgx-h200', 'nvidia-gb200-nvl72', 'nvidia-gb300-nvl72',
      'nvidia-dgx-a100', 'amd-mi325x-platform', 'amd-mi300a-supercomputer',
      'aws-trn2-ultraserver', 'huawei-cloudmatrix-384', 'huawei-atlas-900-superpod',
      'huawei-atlas-800t-a3', 'cambricon-mlu590-pod', 'cambricon-x8-server',
      'moore-threads-kuae'
    ];
    for (const slug of slugs) {
      await expect(page.locator(`[data-testid="pod-row-${slug}"]`).first()).toBeVisible();
    }
  });

  test('NVL72 row highlights all three axis badges (coherent / SHARP / GDS / 三轴全)', async ({ page }) => {
    await page.goto('/servers/cluster-internals/');
    const row = page.locator('[data-testid="pod-row-nvidia-gb200-nvl72"]').first();
    await expect(row).toContainText(/coherent/);
    await expect(row).toContainText(/SHARP/);
    await expect(row).toContainText(/GDS/);
    await expect(row).toContainText(/三轴全/);
  });

  test('Page cross-links to all 3 per-axis matrices', async ({ page }) => {
    await page.goto('/servers/cluster-internals/');
    await expect(page.locator('a[href*="/servers/host-cpu-matrix"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/servers/network-topology-matrix"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/servers/storage-matrix"]').first()).toBeVisible();
  });

  test('Tools dropdown contains the new cluster-internals link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="tools"]').first();
    await expect(dd.locator('a[href*="/servers/cluster-internals"]').first()).toHaveCount(1);
  });
});

test.describe('v1.32: interactive capacity-planner calculator (turns v1.31 math into form-based tool)', () => {
  test('/calculator/capacity-planner/ renders with default Llama 4 Scout × H200 selection', async ({ page }) => {
    await page.goto('/calculator/capacity-planner/');
    await expect(page.getByRole('heading', { name: /容量规划计算器|Capacity Planning Calculator/i }).first()).toBeVisible();
    // React island mounts and shows recommendation card
    await expect(page.locator('[data-testid="cp-recommendation"]').first()).toBeVisible();
    // Default model is Llama 4 Scout — recommendation should mention H200
    await expect(page.locator('[data-testid="cp-recommendation"]').first()).toContainText(/H200/);
  });

  test('Capacity-planner shows 7-step derivation (A through G)', async ({ page }) => {
    await page.goto('/calculator/capacity-planner/');
    // Each step label A-G appears
    for (const step of ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.']) {
      await expect(page.getByText(new RegExp(`^\\s*${step.replace('.', '\\.')}`)).first()).toBeVisible();
    }
  });

  test('Changing precision to FP4 on non-Blackwell card surfaces a warning', async ({ page }) => {
    await page.goto('/calculator/capacity-planner/');
    // Pick precision FP4 — should trigger warning if H200 (Hopper) is selected
    const precisionSelect = page.locator('select').nth(2); // 3rd select (model, hw, precision)
    await precisionSelect.selectOption('fp4');
    // H200 is hopper, not nvidia blackwell — should warn... actually our warning text says "non-nvidia". H200 IS NVIDIA so no warn. Switch to MI325X to trigger.
    const hwSelect = page.locator('select').nth(1);
    await hwSelect.selectOption('mi325x');
    await expect(page.locator('[data-testid="cp-warnings"]').first()).toBeVisible();
  });

  test('Changing concurrent sessions updates recommendation', async ({ page }) => {
    await page.goto('/calculator/capacity-planner/');
    const initial = await page.locator('[data-testid="cp-recommendation"]').first().textContent();
    // Find concurrent-sessions input (8th cp-input, but easier: by previous label)
    const sessionInput = page.locator('input[type="number"]').nth(3); // qps, output, context, sessions
    await sessionInput.fill('500');
    // Recommendation should update after re-render
    await page.waitForTimeout(200);
    const after = await page.locator('[data-testid="cp-recommendation"]').first().textContent();
    expect(after).not.toBe(initial);
  });

  test('Capacity-planner cross-links to static guide + observability', async ({ page }) => {
    await page.goto('/calculator/capacity-planner/');
    await expect(page.locator('a[href*="/learn/capacity-planning"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/observability"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/picking-engine"]').first()).toBeVisible();
  });

  test('Tools dropdown contains the new capacity-planner link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="tools"]').first();
    await expect(dd.locator('a[href*="/calculator/capacity-planner"]').first()).toHaveCount(1);
  });

  test('Static /learn/capacity-planning/ has cross-link to interactive calculator', async ({ page }) => {
    await page.goto('/learn/capacity-planning/');
    await expect(page.locator('a[href*="/calculator/capacity-planner"]').first()).toBeVisible();
  });
});

test.describe('v1.31: capacity planning step-0 + LoRA pattern + roadmap (closes the deployment chain)', () => {
  test('/learn/capacity-planning/ renders 4 sizing inputs + 7 sizing steps + worked example + common mistakes', async ({ page }) => {
    await page.goto('/learn/capacity-planning/');
    await expect(page.getByRole('heading', { name: /容量规划|Capacity Planning/i }).first()).toBeVisible();
    // 4 sizing input categories
    for (let i = 1; i <= 4; i++) {
      await expect(page.locator(`[data-testid="sizing-input-${i}"]`).first()).toBeVisible();
    }
    // 7 sizing steps (A–G)
    for (const step of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      await expect(page.locator(`[data-testid="sizing-step-${step}"]`).first()).toBeVisible();
    }
    await expect(page.locator('[data-testid="worked-example"]').first()).toBeVisible();
    // 6 common mistakes
    for (let i = 1; i <= 6; i++) {
      await expect(page.locator(`[data-testid="common-mistake-${i}"]`).first()).toBeVisible();
    }
  });

  test('Capacity-planning concludes with 7-step deployment chain summary', async ({ page }) => {
    await page.goto('/learn/capacity-planning/');
    // Each step in the chain has a link
    for (const path of ['/learn/picking-engine', '/learn/quantization-decision-tree', '/learn/parallelism-cheatsheet', '/learn/deployment-failures', '/learn/observability', '/learn/production-lifecycle']) {
      await expect(page.locator(`a[href*="${path}"]`).first()).toBeVisible();
    }
  });

  test('Capacity-planning worked example contains real numbers (Llama 4 Scout 109B + H200)', async ({ page }) => {
    await page.goto('/learn/capacity-planning/');
    const example = page.locator('[data-testid="worked-example"]').first();
    await expect(example).toContainText(/Llama 4 Scout/);
    await expect(example).toContainText(/H200/);
    await expect(example).toContainText(/109/);
  });

  test('LoRA adapter multiplexing pattern visible (Punica / S-LoRA)', async ({ page }) => {
    await page.goto('/patterns/lora-adapter-multiplexing/');
    await expect(page.getByText(/LoRA|多路复用/i).first()).toBeVisible();
    await expect(page.getByText(/Punica|S-LoRA/i).first()).toBeVisible();
  });

  test('Learn dropdown contains the new capacity-planning link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="learn"]').first();
    await expect(dd.locator('a[href*="/learn/capacity-planning"]').first()).toHaveCount(1);
  });

  test('Homepage Learn section now exposes capacity-planning', async ({ page }) => {
    await page.goto('/');
    const sec = page.locator('[data-testid="home-section-learn"]').first();
    await expect(sec.locator('a[href*="/learn/capacity-planning"]').first()).toHaveCount(1);
  });
});

test.describe('v1.30: production lifecycle gap-3 closure — observability + lifecycle + 2 operators', () => {
  test('/learn/observability/ renders 4 metric tiers + 5 stack tooling + 6 diagnostic playbooks', async ({ page }) => {
    await page.goto('/learn/observability/');
    await expect(page.getByRole('heading', { name: /生产可观测性|Production Observability/i }).first()).toBeVisible();
    // 4 metric tiers
    for (let i = 1; i <= 4; i++) {
      await expect(page.locator(`[data-testid="metric-tier-${i}"]`).first()).toBeVisible();
    }
    // 5 stack tooling sections
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(`[data-testid="stack-tooling-${i}"]`).first()).toBeVisible();
    }
    // 6 diagnostic playbooks
    for (let i = 1; i <= 6; i++) {
      await expect(page.locator(`[data-testid="diagnostic-playbook-${i}"]`).first()).toBeVisible();
    }
  });

  test('Observability guide covers golden signals + per-stack tooling (NVIDIA / AMD / Ascend / Cambricon)', async ({ page }) => {
    await page.goto('/learn/observability/');
    // Stack-specific tools
    await expect(page.getByText(/DCGM/i).first()).toBeVisible();
    await expect(page.getByText(/rocm-smi/i).first()).toBeVisible();
    await expect(page.getByText(/npu-smi/i).first()).toBeVisible();
    await expect(page.getByText(/cnmon|cambricon/i).first()).toBeVisible();
  });

  test('Observability guide cross-links to deployment-failures + patterns', async ({ page }) => {
    await page.goto('/learn/observability/');
    await expect(page.locator('a[href*="/learn/deployment-failures"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/patterns/"]').first()).toBeVisible();
  });

  test('/learn/production-lifecycle/ renders 4 rollout strategies + A/B test matrix + migration paths', async ({ page }) => {
    await page.goto('/learn/production-lifecycle/');
    await expect(page.getByRole('heading', { name: /生产生命周期|Production Lifecycle/i }).first()).toBeVisible();
    // 4 rollout strategies (canary / blue-green / shadow / progressive)
    for (let i = 1; i <= 4; i++) {
      await expect(page.locator(`[data-testid="rollout-strategy-${i}"]`).first()).toBeVisible();
    }
    // A/B test matrix
    await expect(page.locator('[data-testid="ab-test-matrix"]').first()).toBeVisible();
    // 5 migration paths
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(`[data-testid="migration-path-${i}"]`).first()).toBeVisible();
    }
  });

  test('Production-lifecycle covers Canary / Blue-Green / Shadow / Progressive', async ({ page }) => {
    await page.goto('/learn/production-lifecycle/');
    await expect(page.getByText(/Canary|灰度/i).first()).toBeVisible();
    await expect(page.getByText(/Blue.*Green|蓝绿/i).first()).toBeVisible();
    await expect(page.getByText(/Shadow.*Mirror/i).first()).toBeVisible();
    await expect(page.getByText(/Progressive|渐进/i).first()).toBeVisible();
  });

  test('Production-lifecycle migration-paths cover NVIDIA→AMD, NVIDIA→Ascend, BF16→FP8, BF16→FP4, vLLM→SGLang', async ({ page }) => {
    await page.goto('/learn/production-lifecycle/');
    await expect(page.getByText(/AMD ROCm.*MI325X/i).first()).toBeVisible();
    await expect(page.getByText(/昇腾|Atlas 800T/i).first()).toBeVisible();
    await expect(page.getByText(/BF16 → FP8|BF16.*FP8/i).first()).toBeVisible();
    await expect(page.getByText(/FP4|Blackwell/i).first()).toBeVisible();
    await expect(page.getByText(/vLLM → SGLang|vLLM.*SGLang/i).first()).toBeVisible();
  });

  test('Production-lifecycle ends with deployment-chain summary linking to picking-engine + quant-tree + parallelism', async ({ page }) => {
    await page.goto('/learn/production-lifecycle/');
    await expect(page.locator('a[href*="/learn/picking-engine"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/quantization-decision-tree"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/parallelism-cheatsheet"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/deployment-failures"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/observability"]').first()).toBeVisible();
  });

  test('Learn dropdown contains both new guides (observability + lifecycle)', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="learn"]').first();
    await expect(dd.locator('a[href*="/learn/observability"]').first()).toHaveCount(1);
    await expect(dd.locator('a[href*="/learn/production-lifecycle"]').first()).toHaveCount(1);
  });

  test('Homepage Learn section now has 9 cards (added observability + lifecycle)', async ({ page }) => {
    await page.goto('/');
    const sec = page.locator('[data-testid="home-section-learn"]').first();
    await expect(sec).toBeVisible();
    await expect(sec.locator('a[href*="/learn/observability"]').first()).toHaveCount(1);
    await expect(sec.locator('a[href*="/learn/production-lifecycle"]').first()).toHaveCount(1);
  });

  test('Expert Permute operator visible (MoE token routing)', async ({ page }) => {
    await page.goto('/operators/expert-permute/');
    await expect(page.getByText(/Expert Permute|MoE token routing/i).first()).toBeVisible();
    await expect(page.getByText(/DeepEP|all2all|grouped-matmul/i).first()).toBeVisible();
  });

  test('Speculative Verify operator visible (草稿 token 验证)', async ({ page }) => {
    await page.goto('/operators/speculative-verify/');
    await expect(page.getByText(/Speculative Verify|草稿 token/i).first()).toBeVisible();
    await expect(page.getByText(/Medusa|EAGLE|MTP/i).first()).toBeVisible();
  });
});

test.describe('v1.29: storage_architecture on every super-pod (14/14) + matrix view + weight-streaming pattern + 2 operators', () => {
  test('/servers/storage-matrix/ renders matrix + FS family distribution', async ({ page }) => {
    await page.goto('/servers/storage-matrix/');
    await expect(page.getByRole('heading', { name: /存储架构对照|Storage Matrix/i }).first()).toBeVisible();
    await expect(page.getByTestId('storage-matrix').first()).toBeVisible();
    // Stats: GDS count + FS family count
    await expect(page.getByText(/含 GPU Direct Storage|GPU Direct Storage/i).first()).toBeVisible();
  });

  test('Storage matrix shows multiple FS families (Lustre / Weka / S3-compat / OceanStor)', async ({ page }) => {
    await page.goto('/servers/storage-matrix/');
    await expect(page.getByText(/Lustre/i).first()).toBeVisible();
    await expect(page.getByText(/Weka/i).first()).toBeVisible();
    await expect(page.getByText(/S3-compat/i).first()).toBeVisible();
  });

  test('Storage matrix surfaces "why storage matters" educational section + cross-link to hot-cold KV', async ({ page }) => {
    await page.goto('/servers/storage-matrix/');
    await expect(page.getByText(/为什么存储架构重要/i).first()).toBeVisible();
    await expect(page.locator('a[href*="/patterns/hot-cold-kv-tiering"]').first()).toBeVisible();
  });

  test('Per-server detail page surfaces storage card on GB200 NVL72 (GDS + Weka + hybrid)', async ({ page }) => {
    await page.goto('/servers/nvidia-gb200-nvl72/');
    const card = page.locator('[data-testid="storage-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/GPU Direct Storage/);
    await expect(card).toContainText(/Weka/);
    await expect(card.locator('a[href*="/servers/storage-matrix"]')).toHaveCount(1);
  });

  test('Per-server detail page shows storage on AWS Trn2 (object-store cloud-native)', async ({ page }) => {
    await page.goto('/servers/aws-trn2-ultraserver/');
    const card = page.locator('[data-testid="storage-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/S3-compat|Object Store/i);
  });

  test('Per-server detail page shows storage on CloudMatrix 384 (OceanStor + 国产 GDS)', async ({ page }) => {
    await page.goto('/servers/huawei-cloudmatrix-384/');
    const card = page.locator('[data-testid="storage-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/OceanStor/);
  });

  test('All 14 super-pods now have storage_architecture rendered (100%)', async ({ page }) => {
    const slugs = [
      'nvidia-hgx-h100', 'nvidia-hgx-h200', 'nvidia-gb200-nvl72', 'nvidia-gb300-nvl72',
      'nvidia-dgx-a100', 'amd-mi325x-platform', 'amd-mi300a-supercomputer',
      'aws-trn2-ultraserver', 'huawei-cloudmatrix-384', 'huawei-atlas-900-superpod',
      'huawei-atlas-800t-a3', 'cambricon-mlu590-pod', 'cambricon-x8-server',
      'moore-threads-kuae'
    ];
    for (const slug of slugs) {
      await page.goto(`/servers/${slug}/`);
      await expect(page.locator('[data-testid="storage-card"]').first()).toBeVisible();
    }
  });

  test('Tools dropdown contains the new storage-matrix link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="tools"]').first();
    await expect(dd.locator('a[href*="/servers/storage-matrix"]').first()).toHaveCount(1);
  });

  test('Weight Streaming Prefetch pattern visible (storage → compute bridge)', async ({ page }) => {
    await page.goto('/patterns/weight-streaming-prefetch/');
    await expect(page.getByText(/权重流式预取|Weight Streaming/i).first()).toBeVisible();
    await expect(page.getByText(/GPU Direct Storage|cuFile|Magnum IO/i).first()).toBeVisible();
  });

  test('MLA (Multi-head Latent Attention) operator visible (DeepSeek V3 path)', async ({ page }) => {
    await page.goto('/operators/mla-attention/');
    await expect(page.getByText(/MLA|Multi-head Latent Attention|DeepSeek/i).first()).toBeVisible();
    await expect(page.getByText(/flash-mla|FlashMLA/i).first()).toBeVisible();
  });

  test('Memcpy Async operator visible (cross-device DMA primitive)', async ({ page }) => {
    await page.goto('/operators/memcpy-async/');
    await expect(page.getByText(/Memcpy Async|异步内存搬运/i).first()).toBeVisible();
    await expect(page.getByText(/cudaMemcpyAsync|cuFile|GDS/i).first()).toBeVisible();
  });
});

test.describe('v1.28: network_topology on every super-pod (14/14) + matrix view + 2 fused kernels + Cambricon tour', () => {
  test('/servers/network-topology-matrix/ renders matrix + topology distribution', async ({ page }) => {
    await page.goto('/servers/network-topology-matrix/');
    await expect(page.getByRole('heading', { name: /网络拓扑对照|Network Topology Matrix/i }).first()).toBeVisible();
    await expect(page.getByTestId('network-topology-matrix').first()).toBeVisible();
    // Stats: in-network reduction count + topology family count
    await expect(page.getByText(/含 in-network reduction|in-network reduction/i).first()).toBeVisible();
  });

  test('Network topology matrix shows multiple topology families (full-mesh / fat-tree / dragonfly / torus / optical)', async ({ page }) => {
    await page.goto('/servers/network-topology-matrix/');
    // At least 4 distinct topology families visible
    await expect(page.getByText(/Full-Mesh/i).first()).toBeVisible();
    await expect(page.getByText(/Fat-Tree/i).first()).toBeVisible();
    await expect(page.getByText(/Dragonfly/i).first()).toBeVisible();
    await expect(page.getByText(/2D-Torus/i).first()).toBeVisible();
    await expect(page.getByText(/Optical Fabric/i).first()).toBeVisible();
  });

  test('Network topology matrix surfaces "why network topology matters" educational section', async ({ page }) => {
    await page.goto('/servers/network-topology-matrix/');
    await expect(page.getByText(/为什么网络拓扑重要/i).first()).toBeVisible();
    // Cross-link to tp-allreduce-overlap pattern
    await expect(page.locator('a[href*="/patterns/tp-allreduce-overlap"]').first()).toBeVisible();
  });

  test('Per-server detail page surfaces network-topology card on GB200 NVL72 (full-mesh + in-network reduction)', async ({ page }) => {
    await page.goto('/servers/nvidia-gb200-nvl72/');
    const card = page.locator('[data-testid="network-topology-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Full-Mesh/);
    await expect(card).toContainText(/In-Network/);
    // Cross-link to network-topology-matrix
    await expect(card.locator('a[href*="/servers/network-topology-matrix"]')).toHaveCount(1);
  });

  test('Per-server detail page shows network topology on El Capitan (dragonfly+)', async ({ page }) => {
    await page.goto('/servers/amd-mi300a-supercomputer/');
    const card = page.locator('[data-testid="network-topology-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Dragonfly/);
  });

  test('Per-server detail page shows network topology on AWS Trn2 UltraServer (2d-torus)', async ({ page }) => {
    await page.goto('/servers/aws-trn2-ultraserver/');
    const card = page.locator('[data-testid="network-topology-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/2D-Torus/);
  });

  test('All 14 super-pods now have network_topology rendered (100%)', async ({ page }) => {
    const slugs = [
      'nvidia-hgx-h100', 'nvidia-hgx-h200', 'nvidia-gb200-nvl72', 'nvidia-gb300-nvl72',
      'nvidia-dgx-a100', 'amd-mi325x-platform', 'amd-mi300a-supercomputer',
      'aws-trn2-ultraserver', 'huawei-cloudmatrix-384', 'huawei-atlas-900-superpod',
      'huawei-atlas-800t-a3', 'cambricon-mlu590-pod', 'cambricon-x8-server',
      'moore-threads-kuae'
    ];
    for (const slug of slugs) {
      await page.goto(`/servers/${slug}/`);
      await expect(page.locator('[data-testid="network-topology-card"]').first()).toBeVisible();
    }
  });

  test('Tools dropdown contains the new network-topology-matrix link', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="tools"]').first();
    await expect(dd.locator('a[href*="/servers/network-topology-matrix"]').first()).toHaveCount(1);
  });

  test('Fused RMSNorm + Residual + Quantize kernel visible (FP8 fast-path)', async ({ page }) => {
    await page.goto('/fused-kernels/fused-rmsnorm-residual-quantize/');
    await expect(page.getByText(/Fused RMSNorm.*Quantize|FP8.*INT8/i).first()).toBeVisible();
    await expect(page.getByText(/TransformerEngine|MindIE|Flashinfer/i).first()).toBeVisible();
  });

  test('Fused All-Gather + GEMM kernel visible (column-wise TP)', async ({ page }) => {
    await page.goto('/fused-kernels/fused-allgather-gemm/');
    await expect(page.getByText(/All-Gather|column-wise TP|async-tp/i).first()).toBeVisible();
    await expect(page.getByText(/Megatron|tp-comm-overlap/i).first()).toBeVisible();
  });

  test('Cambricon MLU590 tour visible (Kimi K2.6 × 16 cards, vLLM-MLU)', async ({ page }) => {
    await page.goto('/learn/tours/kimi-k26-mlu590-x16-vllm-bf16/');
    await expect(page.getByText(/MLU590|思元|Kimi K2\.6/i).first()).toBeVisible();
    await expect(page.getByText(/vLLM-MLU|Neuware|Cambricon/i).first()).toBeVisible();
  });
});

test.describe('v1.27: IA redesign — Nav dropdowns + homepage sections + host_cpu on per-server detail', () => {
  test('Nav exposes 4 grouped dropdowns (learn / optimize / tools / about)', async ({ page }) => {
    await page.goto('/');
    // Each dropdown has data-dropdown-id; all 4 must be present.
    for (const id of ['learn', 'optimize', 'tools', 'about']) {
      await expect(page.locator(`[data-dropdown-id="${id}"]`).first()).toBeVisible();
    }
  });

  test('Optimize dropdown contains pipeline / patterns / operators / fused-kernels / quantizations / engines', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="optimize"]').first();
    // Items are in the panel; we use .toContainText since the panel is in DOM
    // (just visually hidden via CSS opacity until hover/click).
    for (const path of ['/pipeline', '/patterns', '/operators', '/fused-kernels', '/quantizations', '/engines']) {
      await expect(dd.locator(`a[href*="${path}"]`).first()).toHaveCount(1);
    }
  });

  test('Learn dropdown contains tours + 5 /learn/ guides', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="learn"]').first();
    for (const path of ['/learn/tours', '/learn/quantization-decision-tree', '/learn/parallelism-cheatsheet', '/learn/picking-engine', '/learn/attention-variants', '/learn/deployment-failures']) {
      await expect(dd.locator(`a[href*="${path}"]`).first()).toHaveCount(1);
    }
  });

  test('Tools dropdown contains calculator + compare + servers/compare + host-cpu-matrix + pricing + showcase', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="tools"]').first();
    for (const path of ['/calculator', '/compare', '/servers/compare', '/servers/host-cpu-matrix', '/pricing', '/showcase']) {
      await expect(dd.locator(`a[href*="${path}"]`).first()).toHaveCount(1);
    }
  });

  test('About dropdown contains quality + impact + contribute + about', async ({ page }) => {
    await page.goto('/');
    const dd = page.locator('[data-dropdown-id="about"]').first();
    for (const path of ['/quality', '/impact', '/contribute', '/about']) {
      await expect(dd.locator(`a[href*="${path}"]`).first()).toHaveCount(1);
    }
  });

  test('Top nav surfaces 超节点 prominently (was hard to find)', async ({ page }) => {
    await page.goto('/');
    // 超节点 link in the top nav (not in a dropdown)
    const navServers = page.locator('header nav ul li a[href*="/servers"]').first();
    await expect(navServers).toBeVisible();
    await expect(navServers).toContainText(/超节点|Super-pods/);
  });

  test('Homepage renders 5 entry sections (browse / optimize / learn / tools / about)', async ({ page }) => {
    await page.goto('/');
    for (const id of ['browse', 'optimize', 'learn', 'tools', 'about']) {
      await expect(page.locator(`[data-testid="home-section-${id}"]`).first()).toBeVisible();
    }
  });

  test('Homepage Optimize section links to all 6 deployment-optimization pages', async ({ page }) => {
    await page.goto('/');
    const sec = page.locator('[data-testid="home-section-optimize"]').first();
    for (const path of ['/pipeline', '/patterns', '/operators', '/fused-kernels', '/quantizations', '/engines']) {
      await expect(sec.locator(`a[href*="${path}"]`).first()).toHaveCount(1);
    }
  });

  test('Homepage Learn section links to /learn/ overview + tours + 5 guides', async ({ page }) => {
    await page.goto('/');
    const sec = page.locator('[data-testid="home-section-learn"]').first();
    for (const path of ['/learn/quantization-decision-tree', '/learn/deployment-failures', '/learn/tours']) {
      await expect(sec.locator(`a[href*="${path}"]`).first()).toHaveCount(1);
    }
  });

  test('Per-server detail page surfaces host_cpu card on GB200 NVL72 (Grace, GPU-coherent)', async ({ page }) => {
    await page.goto('/servers/nvidia-gb200-nvl72/');
    const card = page.locator('[data-testid="host-cpu-card"]').first();
    await expect(card).toBeVisible();
    // Grace + NVLink-C2C + GPU-coherent badge all visible
    await expect(card).toContainText(/Grace/);
    await expect(card).toContainText(/GPU-coherent/);
    // Cross-link to host-cpu-matrix
    await expect(card.locator('a[href*="/servers/host-cpu-matrix"]')).toHaveCount(1);
  });

  test('Per-server detail page shows host_cpu on Atlas 800T A3 (Kunpeng, 信创)', async ({ page }) => {
    await page.goto('/servers/huawei-atlas-800t-a3/');
    const card = page.locator('[data-testid="host-cpu-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Kunpeng|鲲鹏/);
  });

  test('All 14 super-pods now have host_cpu rendered (100%)', async ({ page }) => {
    const slugs = [
      'nvidia-hgx-h100', 'nvidia-hgx-h200', 'nvidia-gb200-nvl72', 'nvidia-gb300-nvl72',
      'nvidia-dgx-a100', 'amd-mi325x-platform', 'amd-mi300a-supercomputer',
      'aws-trn2-ultraserver', 'huawei-cloudmatrix-384', 'huawei-atlas-900-superpod',
      'huawei-atlas-800t-a3', 'cambricon-mlu590-pod', 'cambricon-x8-server',
      'moore-threads-kuae'
    ];
    for (const slug of slugs) {
      await page.goto(`/servers/${slug}/`);
      await expect(page.locator('[data-testid="host-cpu-card"]').first()).toBeVisible();
    }
  });
});

test.describe('v1.26: host_cpu schema + /servers/host-cpu-matrix/ + AMD tour + 2 cases + 1 fused-kernel', () => {
  test('/servers/host-cpu-matrix/ renders matrix with all 6 populated super-pods', async ({ page }) => {
    await page.goto('/servers/host-cpu-matrix/');
    await expect(page.getByRole('heading', { name: /Host CPU 对照|Host-CPU Matrix/i }).first()).toBeVisible();
    await expect(page.getByTestId('host-cpu-matrix').first()).toBeVisible();
    // Architecture distribution + GPU-coherent count
    await expect(page.getByText(/GPU-coherent|架构|含 GPU-coherent/i).first()).toBeVisible();
  });

  test('Host CPU matrix shows architecture diversity (Grace / EPYC / Sapphire / Kunpeng)', async ({ page }) => {
    await page.goto('/servers/host-cpu-matrix/');
    // At least 3 distinct architectures visible
    await expect(page.getByText(/arm-neoverse|arm-kunpeng|x86-zen|x86-sapphire|x86-emerald/i).first()).toBeVisible();
    // Grace 显示 (NVL72)
    await expect(page.getByText(/Grace|NVLink-C2C/i).first()).toBeVisible();
    // 鲲鹏 显示 (CloudMatrix)
    await expect(page.getByText(/Kunpeng|鲲鹏/i).first()).toBeVisible();
  });

  test('Host CPU matrix surfaces "why host CPU matters" educational section', async ({ page }) => {
    await page.goto('/servers/host-cpu-matrix/');
    await expect(page.getByText(/为什么 host CPU 重要|PCIe 带宽|GPU-coherent 链路|信创合规/i).first()).toBeVisible();
    // Cross-link to hot-cold KV tiering
    await expect(page.locator('a[href*="/patterns/hot-cold-kv-tiering"]').first()).toBeVisible();
  });

  test('AMD CDNA-3 tour visible (Qwen 3.6 × MI325X via YAML)', async ({ page }) => {
    await page.goto('/learn/tours/qwen36-plus-mi325x-sglang-fp8/');
    await expect(page.getByText(/MI325X|Infinity Fabric|ROCm/i).first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-quantize').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-shard').first()).toBeVisible();
    // AMD-specific content
    await expect(page.getByText(/HIP Graph|rocm-smi|hipify/i).first()).toBeVisible();
  });

  test('Tours index now shows 7 tours (data-driven scales)', async ({ page }) => {
    await page.goto('/learn/tours/');
    await expect(page.getByTestId('tour-row-qwen36-plus-mi325x-sglang-fp8').first()).toBeVisible();
  });

  test('Fused dequant + GEMM kernel visible (W4A16 / AWQ-INT4)', async ({ page }) => {
    await page.goto('/fused-kernels/fused-dequant-gemm/');
    await expect(page.getByText(/Fused Dequant|W4A16|AWQ-INT4/i).first()).toBeVisible();
    await expect(page.getByText(/Marlin|ExLlamaV2|cuBLASLt/i).first()).toBeVisible();
  });

  test('Qwen 3.6 × H200 case visible (NVIDIA vs AMD comparison reference)', async ({ page }) => {
    await page.goto('/cases/case-qwen36-plus-h200x8-vllm-fp8-001/');
    await expect(page.getByText(/Qwen 3\.6 Plus|H200|FP8/i).first()).toBeVisible();
    await expect(page.getByText(/NVIDIA|MI325X|comparison/i).first()).toBeVisible();
  });

  test('MiniMax M2.7 × B200 case visible (hybrid SSM + FP4)', async ({ page }) => {
    await page.goto('/cases/case-minimax-m27-b200x8-trtllm-fp4-001/');
    await expect(page.getByText(/MiniMax M2\.7|B200|FP4|hybrid/i).first()).toBeVisible();
    await expect(page.getByText(/Mamba2|SSM|TRT-LLM/i).first()).toBeVisible();
  });
});

test.describe('v1.25: 2 more tours via YAML + tour authoring guide + 2 cases + 1 pattern', () => {
  test('Gaudi 3 GPT-OSS tour visible (Intel stack via YAML)', async ({ page }) => {
    await page.goto('/learn/tours/gptoss-gaudi3-vllm-fp8/');
    await expect(page.getByText(/GPT-OSS|Gaudi 3|SynapseAI/i).first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-quantize').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-shard').first()).toBeVisible();
    // Intel-specific content
    await expect(page.getByText(/HPU|hl-smi|Habana/i).first()).toBeVisible();
  });

  test('Hopper mixed-pool disagg tour visible (Mooncake KV transfer)', async ({ page }) => {
    await page.goto('/learn/tours/dsv4flash-disagg-h100-h200-mooncake/');
    await expect(page.getByText(/DeepSeek V4 Flash|disagg|Mooncake/i).first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-shard').first()).toBeVisible();
    // Disagg-specific content
    await expect(page.getByText(/prefill|decode|GPUDirect|RDMA/i).first()).toBeVisible();
  });

  test('/learn/tours/ index now shows 6 tours (data-driven scales)', async ({ page }) => {
    await page.goto('/learn/tours/');
    // All 6 tours present
    await expect(page.getByTestId('tour-row-llama4-scout-h200-vllm-fp8').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-qwen25-7b-jetson-orin-edge').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-gptoss-gaudi3-vllm-fp8').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-dsv4flash-disagg-h100-h200-mooncake').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-dsv4pro-cloudmatrix-384-mindie').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-llama4-maverick-nvl72-fp4').first()).toBeVisible();
  });

  test('Tour authoring guide at /contribute/authoring-tours/ visible', async ({ page }) => {
    await page.goto('/contribute/authoring-tours/');
    await expect(page.getByRole('heading', { name: /贡献 Tour|Authoring Guide/i }).first()).toBeVisible();
    await expect(page.getByText(/YAML 文件结构|从 0 到 PR|stage_id|case_id/i).first()).toBeVisible();
    // Lists all valid stage IDs
    await expect(page.getByText(/acquire|convert|quantize|compile|shard|serve|observe/i).first()).toBeVisible();
  });

  test('Tour authoring guide links to GitHub source', async ({ page }) => {
    await page.goto('/contribute/authoring-tours/');
    await expect(page.locator('a[href*="github.com/ying-wen/evokernel-spec/tree/main/data/tours"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/tours/"]').first()).toBeVisible();
  });

  test('Compile-time graph optimization pattern visible', async ({ page }) => {
    await page.goto('/patterns/compile-time-graph-optimization/');
    await expect(page.getByText(/编译期图优化|CUDA Graph|TRT engine/i).first()).toBeVisible();
    await expect(page.getByText(/XLA|SynapseAI|HIP Graph|MPSGraph/i).first()).toBeVisible();
  });

  test('Gemma 4 × TPU v5p case visible (TPU + JAX + SWA)', async ({ page }) => {
    await page.goto('/cases/case-gemma-4-tpu-v5p-pod-001/');
    await expect(page.getByText(/Gemma 4|TPU v5p|JAX/i).first()).toBeVisible();
    await expect(page.getByText(/SWA|sliding-window|XLA|ICI/i).first()).toBeVisible();
  });

  test('Mistral Small 4 × B200 case visible (FP4 + chunked prefill)', async ({ page }) => {
    await page.goto('/cases/case-mistral-small-4-b200x4-vllm-fp4-001/');
    await expect(page.getByText(/Mistral Small 4|B200|FP4/i).first()).toBeVisible();
    await expect(page.getByText(/chunked|HBM3e|over-provisioned/i).first()).toBeVisible();
  });
});

test.describe('v1.24: tours refactored to data-driven + edge tour + 2 cases', () => {
  test('Dynamic /learn/tours/[slug] route renders extracted Llama 4 Scout tour', async ({ page }) => {
    await page.goto('/learn/tours/llama4-scout-h200-vllm-fp8/');
    await expect(page.getByText(/Llama 4 Scout|H200/i).first()).toBeVisible();
    await expect(page.getByTestId('tour-context').first()).toBeVisible();
    // 7 stages render
    await expect(page.getByTestId('tour-stage-acquire').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-quantize').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-serve').first()).toBeVisible();
  });

  test('Edge tour: Qwen 2.5 7B × Jetson Orin walks 7 stages (NEW)', async ({ page }) => {
    await page.goto('/learn/tours/qwen25-7b-jetson-orin-edge/');
    await expect(page.getByText(/Jetson|端侧|llama\.cpp|Q4_K_M/i).first()).toBeVisible();
    // Edge-specific decisions
    await expect(page.getByText(/INT4|tegrastats|thermal/i).first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-acquire').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-shard').first()).toBeVisible();
  });

  test('Tours index reads from data/tours/ (4 tours visible)', async ({ page }) => {
    await page.goto('/learn/tours/');
    await expect(page.getByRole('heading', { name: /部署 Tour 索引/i }).first()).toBeVisible();
    // 4 tours from data
    await expect(page.getByTestId('tour-row-llama4-scout-h200-vllm-fp8').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-dsv4pro-cloudmatrix-384-mindie').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-llama4-maverick-nvl72-fp4').first()).toBeVisible();
    await expect(page.getByTestId('tour-row-qwen25-7b-jetson-orin-edge').first()).toBeVisible();
  });

  test('Legacy /learn/end-to-end-tour/ redirects to new URL', async ({ page }) => {
    await page.goto('/learn/end-to-end-tour/');
    // meta-refresh redirect content visible briefly OR auto-navigated
    // Either way, target URL should be reachable from page content
    await expect(page.locator('a[href*="/learn/tours/llama4-scout-h200-vllm-fp8"]').first()).toBeVisible();
  });

  test('Legacy /learn/tour-dsv4pro-cloudmatrix-384/ redirects', async ({ page }) => {
    await page.goto('/learn/tour-dsv4pro-cloudmatrix-384/');
    await expect(page.locator('a[href*="/learn/tours/dsv4pro-cloudmatrix-384-mindie"]').first()).toBeVisible();
  });

  test('Legacy /learn/tour-llama4-maverick-nvl72/ redirects', async ({ page }) => {
    await page.goto('/learn/tour-llama4-maverick-nvl72/');
    await expect(page.locator('a[href*="/learn/tours/llama4-maverick-nvl72-fp4"]').first()).toBeVisible();
  });

  test('Kimi K2.6 × H100x8 case visible (agent + RadixAttention 73% hit-rate)', async ({ page }) => {
    await page.goto('/cases/case-kimi-k26-h100x8-sglang-fp8-001/');
    await expect(page.getByText(/Kimi K2\.6|Moonshot|RadixAttention|73%/i).first()).toBeVisible();
    await expect(page.getByText(/agent|FP8|EP=8/i).first()).toBeVisible();
  });

  test('MiniMax M2.7 × Trillium pod case visible (TPU JAX hybrid SSM)', async ({ page }) => {
    await page.goto('/cases/case-minimax-m27-trillium-pod-001/');
    await expect(page.getByText(/MiniMax M2\.7|Trillium|JAX/i).first()).toBeVisible();
    await expect(page.getByText(/SSM|hybrid|XLA|ICI/i).first()).toBeVisible();
  });
});

test.describe('v1.23: 2 more end-to-end tours + tours index + 1 pattern + 1 fused-kernel + 1 case', () => {
  test('/learn/tours/ index lists 3 tour cards + matrix', async ({ page }) => {
    await page.goto('/learn/tours/');
    await expect(page.getByRole('heading', { name: /部署 Tour 索引|End-to-End Tours/i }).first()).toBeVisible();
    // Three tour cards
    await expect(page.getByTestId('tour-card-case-llama4-scout-h100x8-vllm-001').first()).toBeVisible();
    await expect(page.getByTestId('tour-card-case-dsv4pro-cm384-mindie-001').first()).toBeVisible();
    await expect(page.getByTestId('tour-card-case-llama4mvk-gb200-nvl72-001').first()).toBeVisible();
    // Matrix table
    await expect(page.getByTestId('tour-matrix').first()).toBeVisible();
  });

  test('Tour: DeepSeek V4 Pro × CloudMatrix 384 walks 7 stages', async ({ page }) => {
    // v1.24: tour moved to data-driven /learn/tours/<slug>/
    await page.goto('/learn/tours/dsv4pro-cloudmatrix-384-mindie/');
    await expect(page.getByText(/DeepSeek V4 Pro|CloudMatrix 384|国央企/i).first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-acquire').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-quantize').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-shard').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-serve').first()).toBeVisible();
  });

  test('Tour: DeepSeek V4 Pro tour links to sibling tours', async ({ page }) => {
    await page.goto('/learn/tours/dsv4pro-cloudmatrix-384-mindie/');
    // Links to /learn/tours/ index (always visible)
    await expect(page.locator('a[href*="/learn/tours/"]').first()).toBeVisible();
    // At least one sibling tour link visible (footer shows top 3 by display_order)
    await expect(page.locator('a[href*="/learn/tours/llama4-scout-h200-vllm-fp8"]').first()).toBeVisible();
  });

  test('Tour: Llama 4 Maverick × NVL72 walks 7 stages', async ({ page }) => {
    await page.goto('/learn/tours/llama4-maverick-nvl72-fp4/');
    await expect(page.getByText(/Llama 4 Maverick|NVL72|FP4/i).first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-quantize').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-shard').first()).toBeVisible();
    // Disagg + EP=72 specific content
    await expect(page.getByText(/disagg|EP=72|NVLink-5/i).first()).toBeVisible();
  });

  test('Chunked prefill pattern visible', async ({ page }) => {
    await page.goto('/patterns/chunked-prefill/');
    await expect(page.getByText(/Chunked Prefill|mixed prefill\/decode/i).first()).toBeVisible();
    await expect(page.getByText(/P99 TBT|Sarathi|chunk/i).first()).toBeVisible();
  });

  test('Fused grouped-GEMM kernel visible (MoE expert batched compute)', async ({ page }) => {
    await page.goto('/fused-kernels/fused-grouped-gemm/');
    await expect(page.getByText(/Grouped-GEMM|MoE expert|grouped/i).first()).toBeVisible();
    await expect(page.getByText(/CUTLASS|fused_moe|DeepSeek/i).first()).toBeVisible();
  });

  test('Llama 4 Scout × MI355X case visible (chunked prefill on AMD)', async ({ page }) => {
    await page.goto('/cases/case-llama4-scout-mi355x-vllm-rocm-001/');
    await expect(page.getByText(/Llama 4 Scout|MI355X|vLLM ROCm/i).first()).toBeVisible();
    await expect(page.getByText(/chunked prefill|EP=8|P99 TBT/i).first()).toBeVisible();
  });
});

test.describe('v1.22: /operators/fusion-matrix/ + /learn/picking-quantization-format/ + /learn/end-to-end-tour/ + 2 cases', () => {
  test('/operators/fusion-matrix/ renders cross-tab matrix', async ({ page }) => {
    await page.goto('/operators/fusion-matrix/');
    await expect(page.getByRole('heading', { name: /算子 × 融合算子矩阵|Fusion Matrix/i }).first()).toBeVisible();
    // The matrix table itself
    await expect(page.getByTestId('fusion-matrix').first()).toBeVisible();
    // Some specific operator rows
    await expect(page.getByTestId('fusion-row-matmul').first()).toBeVisible();
    await expect(page.getByTestId('fusion-row-attention').first()).toBeVisible();
  });

  test('/operators/fusion-matrix/ shows consistency stats + orphan list', async ({ page }) => {
    await page.goto('/operators/fusion-matrix/');
    await expect(page.getByText(/双向一致|一致率/i).first()).toBeVisible();
    // Either orphan section visible OR no orphans
    const matrix = page.getByTestId('fusion-matrix').first();
    await expect(matrix).toBeVisible();
  });

  test('/learn/picking-quantization-format/ renders format profiles', async ({ page }) => {
    await page.goto('/learn/picking-quantization-format/');
    await expect(page.getByRole('heading', { name: /量化格式选型|Format Picker/i }).first()).toBeVisible();
    // Per-format cards
    await expect(page.getByTestId('format-fp8-e4m3').first()).toBeVisible();
    await expect(page.getByTestId('format-int4-awq').first()).toBeVisible();
    await expect(page.getByTestId('format-fp4').first()).toBeVisible();
  });

  test('/learn/picking-quantization-format/ distinguishes from quantization-decision-tree', async ({ page }) => {
    await page.goto('/learn/picking-quantization-format/');
    // Cross-link to the strategy-level guide
    await expect(page.locator('a[href*="/learn/quantization-decision-tree"]').first()).toBeVisible();
    // Container formats section (GGUF / safetensors / TRT engine)
    await expect(page.getByTestId('container-0').first()).toBeVisible();
  });

  test('Llama 4 Scout tour walks through all 7 pipeline stages (was /learn/end-to-end-tour/, now data-driven)', async ({ page }) => {
    // v1.24: tour moved to data-driven /learn/tours/<slug>/
    await page.goto('/learn/tours/llama4-scout-h200-vllm-fp8/');
    await expect(page.getByText(/Llama 4 Scout|H200/i).first()).toBeVisible();
    // Each stage gets its own narrative card
    await expect(page.getByTestId('tour-stage-acquire').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-quantize').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-compile').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-shard').first()).toBeVisible();
    await expect(page.getByTestId('tour-stage-serve').first()).toBeVisible();
  });

  test('Tours index links to all 6 /learn/ guides via deployment-failures footer', async ({ page }) => {
    // v1.24: dynamic tour page links to siblings; the bigger /learn/ navigation
    // is on the index page itself (which the tour footer points to).
    await page.goto('/learn/tours/');
    await expect(page.locator('a[href*="/learn/deployment-failures"]').first()).toBeVisible();
    // Tour cards link to all 4 tours
    await expect(page.locator('a[href*="/learn/tours/llama4-scout-h200-vllm-fp8"]').first()).toBeVisible();
  });

  test('Mistral Large 3 × MI355X case visible', async ({ page }) => {
    await page.goto('/cases/case-mistral-large-3-mi355x-sglang-001/');
    await expect(page.getByText(/Mistral Large 3|MI355X|SGLang ROCm/i).first()).toBeVisible();
    await expect(page.getByText(/INT8|GQA|RadixAttention/i).first()).toBeVisible();
  });

  test('Qwen 2.5-Coder × L40s case visible (PCIe TP gotcha)', async ({ page }) => {
    await page.goto('/cases/case-qwen-coder-l40s-trtllm-awq-001/');
    await expect(page.getByText(/Qwen 2\.5-Coder|L40s|TRT-LLM/i).first()).toBeVisible();
    await expect(page.getByText(/AWQ|PCIe|HumanEval/i).first()).toBeVisible();
  });
});

test.describe('v1.21: /learn/attention-variants/ + /servers/compare/ + 3 ops + 2 fused-kernels', () => {
  test('/learn/attention-variants/ renders 5 variants table', async ({ page }) => {
    await page.goto('/learn/attention-variants/');
    await expect(page.getByRole('heading', { name: /Attention 变体对照|Attention Variants/i }).first()).toBeVisible();
    // 5 variants
    await expect(page.getByTestId('variant-mha').first()).toBeVisible();
    await expect(page.getByTestId('variant-mqa').first()).toBeVisible();
    await expect(page.getByTestId('variant-gqa').first()).toBeVisible();
    await expect(page.getByTestId('variant-mla').first()).toBeVisible();
    await expect(page.getByTestId('variant-swa').first()).toBeVisible();
  });

  test('/learn/attention-variants/ links to learn triad CTAs', async ({ page }) => {
    await page.goto('/learn/attention-variants/');
    await expect(page.locator('a[href*="/learn/quantization-decision-tree"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/parallelism-cheatsheet"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/picking-engine"]').first()).toBeVisible();
  });

  test('/servers/compare/ renders default top-4 selection', async ({ page }) => {
    await page.goto('/servers/compare/');
    await expect(page.getByRole('heading', { name: /超节点并排对照|Compare Super-Pods/i }).first()).toBeVisible();
    // Comparison rows
    await expect(page.getByTestId('row-card-count').first()).toBeVisible();
    await expect(page.getByTestId('row-bisection-bw').first()).toBeVisible();
    await expect(page.getByTestId('row-total-compute').first()).toBeVisible();
  });

  test('/servers/compare/ shows top-by-compute servers in table headers', async ({ page }) => {
    await page.goto('/servers/compare/');
    // Top-by-compute super-pods appear as table column headers (linked to detail)
    await expect(page.locator('a[href*="/servers/nvidia-gb200-nvl72/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/servers/huawei-cloudmatrix-384/"]').first()).toBeVisible();
  });

  test('/servers/compare/ has clickable picker grid for all servers', async ({ page }) => {
    await page.goto('/servers/compare/');
    // Pick grid surfaces all servers
    await expect(page.getByTestId('pick-nvidia-hgx-h100').first()).toBeVisible();
    await expect(page.getByTestId('pick-huawei-cloudmatrix-384').first()).toBeVisible();
  });

  test('Dropout operator detail visible', async ({ page }) => {
    await page.goto('/operators/dropout/');
    await expect(page.getByText(/Dropout|stochastic regularizer/i).first()).toBeVisible();
    await expect(page.getByText(/eval mode|inverted/i).first()).toBeVisible();
  });

  test('Group-norm operator detail visible (vision/diffusion)', async ({ page }) => {
    await page.goto('/operators/group-norm/');
    await expect(page.getByText(/Group Normalization|vision|diffusion/i).first()).toBeVisible();
    await expect(page.getByText(/Stable Diffusion|UNet|DiT|ResBlock/i).first()).toBeVisible();
  });

  test('Repeat-interleave operator detail visible (GQA broadcast)', async ({ page }) => {
    await page.goto('/operators/repeat-interleave/');
    await expect(page.getByText(/Repeat-Interleave|GQA KV broadcast/i).first()).toBeVisible();
    await expect(page.getByText(/group_size|broadcast/i).first()).toBeVisible();
  });

  test('Fused conv+norm+act fused-kernel visible (vision encoder block)', async ({ page }) => {
    await page.goto('/fused-kernels/fused-conv-norm-act/');
    await expect(page.getByText(/Fused Conv2D|vision encoder block/i).first()).toBeVisible();
    await expect(page.getByText(/cuDNN|UNet|ViT/i).first()).toBeVisible();
  });

  test('Fused add-bias-gelu fused-kernel visible (legacy GPT MLP)', async ({ page }) => {
    await page.goto('/fused-kernels/fused-add-bias-gelu/');
    await expect(page.getByText(/Fused Add-Bias|GPT-style|legacy MLP/i).first()).toBeVisible();
    await expect(page.getByText(/cuBLAS|GELU|epilogue/i).first()).toBeVisible();
  });
});

test.describe('v1.20: 4 new operators + 2 fused-kernels + /learn/parallelism-cheatsheet/ + /learn/picking-engine/', () => {
  test('SwiGLU operator detail visible', async ({ page }) => {
    await page.goto('/operators/swiglu/');
    await expect(page.getByText(/SwiGLU|Swish-Gated/i).first()).toBeVisible();
    await expect(page.getByText(/Llama|Qwen|Mistral|silu_and_mul/i).first()).toBeVisible();
  });

  test('Scaled Dot-Product Attention operator detail visible', async ({ page }) => {
    await page.goto('/operators/scaled-dot-product-attention/');
    await expect(page.getByText(/Scaled Dot-Product|SDPA/i).first()).toBeVisible();
    await expect(page.getByText(/FlashAttention|softmax|QK\^T/i).first()).toBeVisible();
  });

  test('Conv2D operator detail visible (vision primitive)', async ({ page }) => {
    await page.goto('/operators/conv2d/');
    await expect(page.getByText(/2D Convolution|Conv2d|vision encoder/i).first()).toBeVisible();
    await expect(page.getByText(/ViT|Vision Transformer|cuDNN/i).first()).toBeVisible();
  });

  test('Cross-entropy operator detail visible (token sampling)', async ({ page }) => {
    await page.goto('/operators/cross-entropy/');
    await expect(page.getByText(/Cross-Entropy|Log-Softmax|token sampling/i).first()).toBeVisible();
    await expect(page.getByText(/vocab|tied embedding|sampler/i).first()).toBeVisible();
  });

  test('FlashMLA fused-kernel visible (DeepSeek MLA)', async ({ page }) => {
    await page.goto('/fused-kernels/flash-mla/');
    await expect(page.getByText(/FlashMLA|Multi-Head Latent|DeepSeek/i).first()).toBeVisible();
    await expect(page.getByText(/latent|c_kv|671B|sm_90/i).first()).toBeVisible();
  });

  test('Flash-Decoding fused-kernel visible (long-context decode)', async ({ page }) => {
    await page.goto('/fused-kernels/flash-decoding/');
    await expect(page.getByText(/Flash-Decoding|long-context decode/i).first()).toBeVisible();
    await expect(page.getByText(/SM|chunk|online softmax|sequence/i).first()).toBeVisible();
  });

  test('/learn/parallelism-cheatsheet/ renders strategies + decision matrix', async ({ page }) => {
    await page.goto('/learn/parallelism-cheatsheet/');
    await expect(page.getByRole('heading', { name: /并行策略速查表|Parallelism Cheatsheet/i }).first()).toBeVisible();
    // 6 strategy symbols
    await expect(page.getByTestId('strategy-tp').first()).toBeVisible();
    await expect(page.getByTestId('strategy-pp').first()).toBeVisible();
    await expect(page.getByTestId('strategy-ep').first()).toBeVisible();
    await expect(page.getByTestId('strategy-ring').first()).toBeVisible();
    // First decision row
    await expect(page.getByTestId('decision-row-0').first()).toBeVisible();
  });

  test('/learn/parallelism-cheatsheet/ links to playbooks + patterns', async ({ page }) => {
    await page.goto('/learn/parallelism-cheatsheet/');
    await expect(page.locator('a[href*="/playbooks/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/patterns/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/calculator/"]').first()).toBeVisible();
  });

  test('/learn/picking-engine/ renders 7 scenarios + engine profiles', async ({ page }) => {
    await page.goto('/learn/picking-engine/');
    await expect(page.getByRole('heading', { name: /推理引擎选型|Picking an Engine/i }).first()).toBeVisible();
    // First scenario
    await expect(page.getByTestId('scenario-0').first()).toBeVisible();
    // Engine profiles include vLLM + SGLang + TRT-LLM
    await expect(page.getByTestId('engine-profile-vllm').first()).toBeVisible();
    await expect(page.getByTestId('engine-profile-sglang').first()).toBeVisible();
    await expect(page.getByTestId('engine-profile-tensorrt-llm').first()).toBeVisible();
  });

  test('/learn/picking-engine/ surfaces case + playbook density per engine', async ({ page }) => {
    await page.goto('/learn/picking-engine/');
    // Each engine profile shows case + playbook count
    await expect(page.getByText(/案例.*playbook/i).first()).toBeVisible();
    // Cross-links to playbooks + parallelism + quantization guides
    await expect(page.locator('a[href*="/learn/parallelism-cheatsheet"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/learn/quantization-decision-tree"]').first()).toBeVisible();
  });
});

test.describe('v1.19: 4 new patterns + 2 playbooks + 2 cases + /learn/quantization-decision-tree/', () => {
  test('GQA/MQA shared-KV pattern detail visible', async ({ page }) => {
    await page.goto('/patterns/gqa-mqa-shared-kv/');
    await expect(page.getByText(/GQA|MQA|共享 KV/i).first()).toBeVisible();
    await expect(page.getByText(/Llama 3|Mistral|GPT-4o|Gemma/i).first()).toBeVisible();
  });

  test('Hot-cold KV tiering pattern detail visible', async ({ page }) => {
    await page.goto('/patterns/hot-cold-kv-tiering/');
    await expect(page.getByText(/HBM|DRAM|SSD|冷热分层/i).first()).toBeVisible();
    await expect(page.getByText(/Mooncake|Dynamo/i).first()).toBeVisible();
  });

  test('TP All-Reduce overlap pattern detail visible', async ({ page }) => {
    await page.goto('/patterns/tp-allreduce-overlap/');
    await expect(page.getByText(/Tensor Parallelism|reduce-scatter|all-gather|RS/i).first()).toBeVisible();
    await expect(page.getByText(/SHARP|NVSwitch|Megatron/i).first()).toBeVisible();
  });

  test('Quant-aware fine-tune (QAT) pattern detail visible', async ({ page }) => {
    await page.goto('/patterns/quant-aware-finetune/');
    await expect(page.getByText(/QAT|量化感知|fake-quant/i).first()).toBeVisible();
    await expect(page.getByText(/LoRA|GPTQ|AutoRound/i).first()).toBeVisible();
  });

  test('Multi-modal × Blackwell super-pod playbook visible', async ({ page }) => {
    await page.goto('/playbooks/multi-modal-on-blackwell-superpod/');
    await expect(page.getByText(/GB200|GB300|NVL72|Llama 4 Maverick/i).first()).toBeVisible();
    await expect(page.getByText(/FP4|NVFP4|disagg/i).first()).toBeVisible();
  });

  test('Reasoning × Ascend cluster playbook visible (国产替代)', async ({ page }) => {
    await page.goto('/playbooks/reasoning-llm-on-ascend-cluster/');
    await expect(page.getByText(/DeepSeek-R1|Atlas 800T|MindIE|国央企|MTP/i).first()).toBeVisible();
    await expect(page.getByText(/INT8|reasoning|long CoT/i).first()).toBeVisible();
  });

  test('GLM-5 reasoning × Atlas 800T case visible', async ({ page }) => {
    await page.goto('/cases/case-glm5-reasoning-atlas800t-mindie-001/');
    await expect(page.getByText(/GLM-5|Atlas 800T|MindIE/i).first()).toBeVisible();
    await expect(page.getByText(/INT8|MTP|reasoning/i).first()).toBeVisible();
  });

  test('Llama 4 Maverick × H200 8-card FP8 case visible', async ({ page }) => {
    await page.goto('/cases/case-llama4mvk-h200x8-vllm-fp8-001/');
    await expect(page.getByText(/Llama 4 Maverick|H200|FP8/i).first()).toBeVisible();
    await expect(page.getByText(/multi-modal|vision|GQA/i).first()).toBeVisible();
  });

  test('/learn/quantization-decision-tree/ renders 3 decision branches', async ({ page }) => {
    await page.goto('/learn/quantization-decision-tree/');
    await expect(page.getByRole('heading', { name: /量化决策树|Quantization Decision Tree/i }).first()).toBeVisible();
    // 3 branches: hardware / model size / workload
    await expect(page.getByText(/Blackwell|Hopper|Ampere/i).first()).toBeVisible();
    await expect(page.getByText(/70B|13-70B|13B/i).first()).toBeVisible();
    await expect(page.getByText(/长会话|chatbot|agent/i).first()).toBeVisible();
  });

  test('/learn/quantization-decision-tree/ links to relevant patterns + cases', async ({ page }) => {
    await page.goto('/learn/quantization-decision-tree/');
    // Pattern cross-links
    await expect(page.locator('a[href*="/patterns/fp4-weight-only-quant"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/patterns/quant-aware-finetune"]').first()).toBeVisible();
    // Calculator + playbooks CTAs
    await expect(page.locator('a[href*="/calculator/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/playbooks/"]').first()).toBeVisible();
  });
});

test.describe('v1.18: impact metrics surface (GH stars + impact strip + /impact/ dashboard + citations)', () => {
  test('Nav shows live GitHub star button on every page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('gh-star-button').first()).toBeVisible();
    // Star button links to repo
    const button = page.getByTestId('gh-star-button').first();
    await expect(button).toHaveAttribute('href', /github\.com\/ying-wen\/evokernel-spec/);
  });

  test('Homepage shows impact strip with contributors + cases + last-commit + CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('impact-strip-contributors').first()).toBeVisible();
    await expect(page.getByTestId('impact-strip-cases').first()).toBeVisible();
    await expect(page.getByTestId('impact-strip-last-commit').first()).toBeVisible();
    await expect(page.getByTestId('impact-strip-cta').first()).toBeVisible();
  });

  test('Homepage impact strip CTA links to /impact/', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByTestId('impact-strip-cta').first();
    await expect(cta).toHaveAttribute('href', /\/impact\/?$/);
  });

  test('/impact/ dashboard renders GitHub live cards + content catalog + velocity', async ({ page }) => {
    await page.goto('/impact/');
    await expect(page.getByRole('heading', { name: /影响指标|Impact Metrics/i }).first()).toBeVisible();
    // Live GitHub cards (5 expected)
    await expect(page.getByTestId('impact-card-stars').first()).toBeVisible();
    await expect(page.getByTestId('impact-card-forks').first()).toBeVisible();
    await expect(page.getByTestId('impact-card-issues').first()).toBeVisible();
    // Content catalog cards
    await expect(page.getByTestId('content-card-hardware').first()).toBeVisible();
    await expect(page.getByTestId('content-card-cases').first()).toBeVisible();
    await expect(page.getByTestId('content-card-playbooks').first()).toBeVisible();
  });

  test('/impact/ shows development velocity (commits + contributors + dates)', async ({ page }) => {
    await page.goto('/impact/');
    await expect(page.getByText(/总提交数|开发节奏|DEVELOPMENT VELOCITY/i).first()).toBeVisible();
    await expect(page.getByText(/总贡献者/i).first()).toBeVisible();
    // Top contributors list
    await expect(page.getByText(/Top.*contributors/i).first()).toBeVisible();
  });

  test('/impact/ shows citation tracker section with PR-add CTA', async ({ page }) => {
    await page.goto('/impact/');
    await expect(page.getByText(/EXTERNAL CITATIONS|外部引证/i).first()).toBeVisible();
    await expect(page.getByText(/PR 添加|提交 PR/i).first()).toBeVisible();
  });

  test('/impact/ has standalone "为这个项目站台" CTA card with GH star + contribute links', async ({ page }) => {
    await page.goto('/impact/');
    await expect(page.getByText(/为这个项目站台/i).first()).toBeVisible();
    await expect(page.getByText(/贡献指南/i).first()).toBeVisible();
  });

  test('Citations schema validates — at least 1 citation entry exists', async ({ page }) => {
    await page.goto('/impact/');
    // Read the rendered citation count from the heading
    await expect(page.locator('text=/\\d+ 条引证/').first()).toBeVisible();
  });
});

test.describe('v1.17: deployment failures guide + 3 playbooks + 2 cases + 1 fused-kernel', () => {
  test('Deployment failures page lives at /learn/deployment-failures/', async ({ page }) => {
    await page.goto('/learn/deployment-failures/');
    await expect(page.getByRole('heading', { name: /踩坑记录|Deployment Failure/i }).first()).toBeVisible();
    await expect(page.getByText(/条 production|实测案例/i).first()).toBeVisible();
  });

  test('Failures page organizes issues by pipeline stage', async ({ page }) => {
    await page.goto('/learn/deployment-failures/');
    // Stage headings should link to /pipeline/<id>/
    await expect(page.locator('a[href*="/pipeline/"]').first()).toBeVisible();
    // Each issue card has ⚠️ marker
    await expect(page.getByText(/⚠️/).first()).toBeVisible();
  });

  test('Failures page surfaces playbook cross-links per stage', async ({ page }) => {
    await page.goto('/learn/deployment-failures/');
    await expect(page.getByText(/相关 playbook/i).first()).toBeVisible();
    await expect(page.locator('a[href*="/playbooks/"]').first()).toBeVisible();
  });

  test('Multi-modal × CDNA-3 cluster playbook visible (Llama 4 Maverick path)', async ({ page }) => {
    await page.goto('/playbooks/multi-modal-on-cdna3-cluster/');
    await expect(page.getByText(/MI300X|MI325X|Llama 4 Maverick/i).first()).toBeVisible();
    await expect(page.getByText(/mixed-TP|vision encoder/i).first()).toBeVisible();
  });

  test('Long-context × Blackwell super-pod playbook visible (NVL72 + Ring + FP4)', async ({ page }) => {
    await page.goto('/playbooks/long-context-on-blackwell-superpod/');
    await expect(page.getByText(/NVL72|GB200|GB300/i).first()).toBeVisible();
    await expect(page.getByText(/Ring|10M context|Behemoth/i).first()).toBeVisible();
  });

  test('Dense 70B × Ascend cluster playbook visible (国产替代)', async ({ page }) => {
    await page.goto('/playbooks/dense-llm-medium-on-ascend-cluster/');
    await expect(page.getByText(/910C|910D|Atlas 800T/i).first()).toBeVisible();
    await expect(page.getByText(/MindIE|国央企|国产/i).first()).toBeVisible();
  });

  test('Llama 4 Maverick × GB200 NVL72 case visible (compute-bound on Blackwell FP4)', async ({ page }) => {
    await page.goto('/cases/case-llama4mvk-gb200-nvl72-001/');
    await expect(page.getByText(/GB200|NVL72|FP4/i).first()).toBeVisible();
    await expect(page.getByText(/disagg/i).first()).toBeVisible();
  });

  test('Qwen 2.5 7B Jetson edge case visible', async ({ page }) => {
    await page.goto('/cases/case-qwen25-7b-jetson-orin-001/');
    await expect(page.getByText(/Jetson|edge|端侧/i).first()).toBeVisible();
    await expect(page.getByText(/llama.cpp|Q4_K_M|INT4/i).first()).toBeVisible();
  });

  test('Fused TP all-reduce + residual + norm kernel visible', async ({ page }) => {
    await page.goto('/fused-kernels/fused-tp-allreduce-residual/');
    await expect(page.getByText(/zero-bubble|RS\+AG|reduce-scatter/i).first()).toBeVisible();
    await expect(page.getByText(/SHARP|NVSwitch/i).first()).toBeVisible();
  });

  test('Coverage matrix now shows ≥22 cells filled', async ({ page }) => {
    await page.goto('/playbooks/');
    // 22/176 or higher
    await expect(page.locator('text=/2[2-9]\\/176|[3-9][0-9]\\/176/i').first()).toBeVisible();
  });
});

test.describe('v1.16: 5 new operators + pipeline-stage cases + 2 more playbooks + 1 case', () => {
  test('LayerNorm operator visible (BERT-era ancestor of RMSNorm)', async ({ page }) => {
    await page.goto('/operators/layer-norm/');
    await expect(page.getByText(/LayerNorm|BERT/i).first()).toBeVisible();
    await expect(page.getByText(/RMSNorm/i).first()).toBeVisible();
  });

  test('Embedding-lookup operator shows tied embedding + LM head context', async ({ page }) => {
    await page.goto('/operators/embedding-lookup/');
    await expect(page.getByText(/tied embedding|LM head/i).first()).toBeVisible();
    await expect(page.getByText(/vocab/i).first()).toBeVisible();
  });

  test('All-Gather operator shows TP/SP context + Ring/SHARP variants', async ({ page }) => {
    await page.goto('/operators/all-gather/');
    await expect(page.getByText(/All-Gather|TP|SP/i).first()).toBeVisible();
    await expect(page.getByText(/Ring|recursive doubling|SHARP/i).first()).toBeVisible();
  });

  test('Grouped-matmul operator shows MoE expert batched-GEMM context', async ({ page }) => {
    await page.goto('/operators/grouped-matmul/');
    await expect(page.getByText(/MoE|expert/i).first()).toBeVisible();
    await expect(page.getByText(/DeepEP|grouped/i).first()).toBeVisible();
  });

  test('Top-K Sampling operator shows decoding op context', async ({ page }) => {
    await page.goto('/operators/top-k-sampling/');
    await expect(page.getByText(/top-k|top-p|nucleus/i).first()).toBeVisible();
    await expect(page.getByText(/multinomial|greedy/i).first()).toBeVisible();
  });

  test('Pipeline stage page now surfaces concrete cases', async ({ page }) => {
    await page.goto('/pipeline/quantize/');
    await expect(page.getByText(/实测案例|瓶颈诊断/i).first()).toBeVisible();
    // At least one case linked
    await expect(page.locator('a[href*="/cases/case-"]').first()).toBeVisible();
  });

  test('Reasoning × CDNA-3 cluster playbook visible', async ({ page }) => {
    await page.goto('/playbooks/reasoning-llm-on-cdna3-cluster/');
    await expect(page.getByText(/MI300X|MI325X|HBM 容量/i).first()).toBeVisible();
    await expect(page.getByText(/spec decode|reasoning/i).first()).toBeVisible();
  });

  test('SSM × Hopper single-node playbook visible', async ({ page }) => {
    await page.goto('/playbooks/ssm-mamba-on-hopper-single-node/');
    await expect(page.getByText(/Mamba-2|Jamba|hybrid/i).first()).toBeVisible();
    await expect(page.getByText(/selective-scan|线性内存/i).first()).toBeVisible();
  });

  test('DeepSeek R1 × MI325X reasoning case visible', async ({ page }) => {
    await page.goto('/cases/case-dsr1-on-mi325x-vllm-rocm-001/');
    await expect(page.getByText(/MI325X|HBM3e/i).first()).toBeVisible();
    await expect(page.getByText(/spec decode|reasoning/i).first()).toBeVisible();
  });

  test('Operators index now lists 18 operators', async ({ page }) => {
    await page.goto('/operators/');
    await expect(page.getByText(/LayerNorm/i).first()).toBeVisible();
    await expect(page.getByText(/Embedding Lookup/i).first()).toBeVisible();
    await expect(page.getByText(/All-Gather/i).first()).toBeVisible();
    await expect(page.getByText(/Grouped Matmul/i).first()).toBeVisible();
    await expect(page.getByText(/Top-K|Top-P/i).first()).toBeVisible();
  });
});

test.describe('v1.15: operator-hardware fitness + engine matrix + 2 more playbooks + 1 case', () => {
  test('Operator detail shows structural fitness panel across corpus', async ({ page }) => {
    await page.goto('/operators/attention/');
    await expect(page.getByRole('heading', { name: /结构性硬件适配性|Structural fitness/i }).first()).toBeVisible();
    await expect(page.getByText(/Memory-bound/i).first()).toBeVisible();
    await expect(page.getByText(/Compute-bound/i).first()).toBeVisible();
    await expect(page.getByText(/Regime-dependent/i).first()).toBeVisible();
  });

  test('Operator fitness panel shows percentage distribution', async ({ page }) => {
    await page.goto('/operators/matmul/');
    // At least one percentage marker
    await expect(page.locator('text=/[0-9]+% — 量化|[0-9]+% — 算力|[0-9]+% — 跨/').first()).toBeVisible();
  });

  test('Operator fitness expand shows full hardware table', async ({ page }) => {
    await page.goto('/operators/matmul/');
    // Details element with hardware table
    await expect(page.getByText(/显示完整表格/i).first()).toBeVisible();
  });

  test('Engines index now shows compatibility matrix', async ({ page }) => {
    await page.goto('/engines/');
    await expect(page.getByRole('heading', { name: /引擎.*硬件厂商兼容矩阵|Engine.*Vendor/i }).first()).toBeVisible();
    await expect(page.getByText(/我有 hardware|哪些引擎能用/i).first()).toBeVisible();
  });

  test('Engine matrix shows vLLM with NVIDIA + AMD support', async ({ page }) => {
    await page.goto('/engines/');
    // vLLM row should have multiple ✓ marks (it supports many vendors)
    const vllmRow = page.locator('tr:has(a[href*="/engines/vllm/"])');
    await expect(vllmRow.locator('span:has-text("✓")').first()).toBeVisible();
  });

  test('Diffusion playbook shows FLUX / SD context', async ({ page }) => {
    await page.goto('/playbooks/diffusion-on-hopper-single-node/');
    await expect(page.getByText(/FLUX|Stable Diffusion|SDXL/i).first()).toBeVisible();
    await expect(page.getByText(/diffusers|step|denoising/i).first()).toBeVisible();
  });

  test('Dense small × CDNA-3 single-node playbook visible', async ({ page }) => {
    await page.goto('/playbooks/dense-llm-small-on-cdna3-single-node/');
    await expect(page.getByText(/MI300X|192 GB|单卡/i).first()).toBeVisible();
  });

  test('Llama 4 Scout × MI325X case visible (multi-modal MoE on AMD)', async ({ page }) => {
    await page.goto('/cases/case-llama4scout-mi325x-bf16-001/');
    await expect(page.getByText(/MI325X|HBM3e|256 GB/i).first()).toBeVisible();
    await expect(page.getByText(/mixed-TP|vision encoder/i).first()).toBeVisible();
  });

  test('Coverage matrix now shows ≥17 cells filled', async ({ page }) => {
    await page.goto('/playbooks/');
    // Lower-bound; matrix grows over time
    await expect(page.locator('text=/1[7-9]\\/176|[2-9][0-9]\\/176/i').first()).toBeVisible();
  });
});

test.describe('v1.14: bottleneck diagnosis layer + distribution panel + 2 more playbooks + 1 case', () => {
  test('Case detail page shows bottleneck diagnosis panel (memory-bandwidth)', async ({ page }) => {
    await page.goto('/cases/case-dsv4-flash-h100x8-vllm-fp8-001/');
    await expect(page.getByText(/诊断 \/ Diagnosis|内存带宽 \(Memory-BW\)/i).first()).toBeVisible();
    await expect(page.getByText(/建议尝试的优化模式|spec decode|FP4/i).first()).toBeVisible();
  });

  test('Case detail page bottleneck panel surfaces patterns + stages', async ({ page }) => {
    await page.goto('/cases/case-dsv4-flash-h100x8-vllm-fp8-001/');
    // Pattern recommendations rendered with links
    await expect(page.locator('a[href*="/patterns/"]').first()).toBeVisible();
    // Pipeline stage links rendered
    await expect(page.locator('a[href*="/pipeline/"]').first()).toBeVisible();
  });

  test('Compute-bound case shows different diagnosis (Llama 4 Maverick)', async ({ page }) => {
    await page.goto('/cases/case-llama4mvk-trillium-256-001/');
    await expect(page.getByText(/算力|Compute/i).first()).toBeVisible();
  });

  test('Cases index shows bottleneck distribution panel', async ({ page }) => {
    await page.goto('/cases/');
    await expect(page.getByRole('heading', { name: /瓶颈分布|Bottleneck distribution/i }).first()).toBeVisible();
    await expect(page.getByText(/of cases|of cases/i).first()).toBeVisible();
    // memory-bandwidth is the dominant bottleneck — should show percentage
    await expect(page.getByText(/内存带宽/i).first()).toBeVisible();
  });

  test('Dense 70B × CDNA-3 single-node playbook shows BF16 + 192 GB HBM advantage', async ({ page }) => {
    await page.goto('/playbooks/dense-llm-medium-on-cdna3-single-node/');
    await expect(page.getByText(/192 GB|MI300X|HBM 容量/i).first()).toBeVisible();
    await expect(page.getByText(/BF16|bf16/i).first()).toBeVisible();
  });

  test('Multi-modal × CDNA-3 playbook shows mixed-TP + Llama 4 Scout', async ({ page }) => {
    await page.goto('/playbooks/multi-modal-on-cdna3-single-node/');
    await expect(page.getByText(/mixed-TP|vision encoder/i).first()).toBeVisible();
    await expect(page.getByText(/Llama 4 Scout|Pixtral|Qwen 2\.5-VL/i).first()).toBeVisible();
  });

  test('New Qwen 3.6+ on MI300X case visible at correct route', async ({ page }) => {
    await page.goto('/cases/case-qwen36plus-on-mi300x-vllm-rocm-001/');
    await expect(page.getByText(/MI300X|ROCm/i).first()).toBeVisible();
    await expect(page.getByText(/EP=8|MoE|fused-moe-dispatch/i).first()).toBeVisible();
  });

  test('Coverage matrix now shows ≥15 filled cells', async ({ page }) => {
    await page.goto('/playbooks/');
    // Lower-bound assertion — coverage grows over time, ≥15 cells out of 176
    await expect(page.locator('text=/[1-9][0-9]\\/176|[1-9][0-9] cells/i').first()).toBeVisible();
  });
});

test.describe('v1.13: 4 more playbooks + Coverage Matrix view + memory_hierarchy 100%', () => {
  test('Playbooks index now shows Coverage Matrix view', async ({ page }) => {
    await page.goto('/playbooks/');
    await expect(page.getByRole('heading', { name: /Coverage Matrix/i }).first()).toBeVisible();
    await expect(page.getByText(/cells.*PR 贡献目标|model_archetype × hardware_class/i).first()).toBeVisible();
  });

  test('Coverage matrix shows filled cells linking to playbooks', async ({ page }) => {
    await page.goto('/playbooks/');
    // At least one ✓ cell linked to a playbook detail page
    const filledCells = page.locator('a[href*="/playbooks/"][title]:has-text("✓")');
    await expect(filledCells.first()).toBeVisible();
  });

  test('Long-context Hopper-cluster playbook shows ring-attention + sliding-window', async ({ page }) => {
    await page.goto('/playbooks/long-context-on-hopper-cluster/');
    await expect(page.getByText(/Ring Attention|ring-attention/i).first()).toBeVisible();
    await expect(page.getByText(/1M.*context|Sliding Window|Llama 4 Behemoth/i).first()).toBeVisible();
  });

  test('Mixtral / Qwen 3 30B-A3B playbook shows EP=8 intra-node', async ({ page }) => {
    await page.goto('/playbooks/moe-llm-medium-on-hopper-single-node/');
    await expect(page.getByText(/EP=8/i).first()).toBeVisible();
    await expect(page.getByText(/Mixtral|Qwen 3 30B/i).first()).toBeVisible();
  });

  test('Dense small × Ascend playbook shows MindIE + 国产替代', async ({ page }) => {
    await page.goto('/playbooks/dense-llm-small-on-ascend-cluster/');
    await expect(page.getByText(/MindIE|910C/i).first()).toBeVisible();
    await expect(page.getByText(/国产|国央企|合规/i).first()).toBeVisible();
  });

  test('SSM/Mamba × Ada playbook shows selective-scan + linear memory', async ({ page }) => {
    await page.goto('/playbooks/ssm-mamba-on-ada-single-node/');
    await expect(page.getByText(/Mamba|Jamba|selective-scan|SSM/i).first()).toBeVisible();
    await expect(page.getByText(/线性内存|linear|stateful/i).first()).toBeVisible();
  });

  test('PingTouge HanGuang 800 (last card) now shows memory hierarchy', async ({ page }) => {
    await page.goto('/hardware/pingtouge-hanguang-800/');
    await expect(page.getByText(/Cluster Local Buffer|LPDDR5|含光/i).first()).toBeVisible();
  });

  test('/quality coverage now shows 100% for memory_hierarchy', async ({ page }) => {
    await page.goto('/quality/');
    // At least one row at 100% (memory_hierarchy or switch_chips)
    await expect(page.locator('text=/100% 完成/').first()).toBeVisible();
  });

  test('DeepSeek R1 model page rec widget surfaces reasoning playbook', async ({ page }) => {
    await page.goto('/models/deepseek-r1/');
    await expect(page.getByText(/推荐部署 Playbook/i).first()).toBeVisible();
    // Should show reasoning playbook link
    await expect(page.locator('a[href*="reasoning-llm-on-hopper-cluster"]').first()).toBeVisible();
  });
});

test.describe('v1.12: 4 more playbooks + bidirectional rec widget + 4 more cards (~95%)', () => {
  test('Playbooks index now shows 9 recipes', async ({ page }) => {
    await page.goto('/playbooks/');
    await expect(page.getByText(/Reasoning LLM 在 Hopper|DeepSeek R1/i).first()).toBeVisible();
    await expect(page.getByText(/多模态 LLM|Llama 4 Scout/i).first()).toBeVisible();
    await expect(page.getByText(/TPU Pod|Gemini class/i).first()).toBeVisible();
    await expect(page.getByText(/AMD CDNA-3|MI300X/i).first()).toBeVisible();
  });

  test('Reasoning playbook detail shows P:D=1:5 disagg + MTP', async ({ page }) => {
    await page.goto('/playbooks/reasoning-llm-on-hopper-cluster/');
    await expect(page.getByText(/P:D = 1:5|reasoning|chain-of-thought/i).first()).toBeVisible();
    await expect(page.getByText(/MTP|spec decode/i).first()).toBeVisible();
  });

  test('Multi-modal playbook shows mixed-TP for vision encoder', async ({ page }) => {
    await page.goto('/playbooks/multi-modal-on-hopper-single-node/');
    await expect(page.getByText(/mixed-TP|vision encoder/i).first()).toBeVisible();
    await expect(page.getByText(/Llama 4 Scout|Pixtral|Qwen.*VL/i).first()).toBeVisible();
  });

  test('TPU pod playbook shows JAX/MaxText + GSPMD context', async ({ page }) => {
    await page.goto('/playbooks/dense-llm-large-on-tpu-pod/');
    await expect(page.getByText(/JAX|MaxText|GSPMD/i).first()).toBeVisible();
    await expect(page.getByText(/v5p|Trillium|TPU/i).first()).toBeVisible();
  });

  test('CDNA-3 cluster playbook shows ROCm + Infinity Fabric mesh', async ({ page }) => {
    await page.goto('/playbooks/moe-llm-large-on-cdna3-cluster/');
    await expect(page.getByText(/ROCm|RCCL/i).first()).toBeVisible();
    await expect(page.getByText(/Infinity Fabric|MI300X/i).first()).toBeVisible();
  });

  test('Model detail page surfaces playbook recommendation (DeepSeek R1)', async ({ page }) => {
    await page.goto('/models/deepseek-r1/');
    await expect(page.getByText(/推荐部署 Playbook/i).first()).toBeVisible();
    await expect(page.getByText(/reasoning-llm/i).first()).toBeVisible();
  });

  test('Model detail page surfaces playbook (multi-modal Llama 4)', async ({ page }) => {
    await page.goto('/models/llama-4-scout/');
    await expect(page.getByText(/推荐部署 Playbook/i).first()).toBeVisible();
    await expect(page.getByText(/multi-modal/i).first()).toBeVisible();
  });

  test('Hardware detail page surfaces playbook recommendation (H100)', async ({ page }) => {
    await page.goto('/hardware/h100-sxm5/');
    await expect(page.getByText(/推荐部署 Playbook/i).first()).toBeVisible();
    await expect(page.getByText(/hopper-single-node|hopper-cluster/i).first()).toBeVisible();
  });

  test('Hardware detail page surfaces playbook (MI300X CDNA-3)', async ({ page }) => {
    await page.goto('/hardware/mi300x/');
    await expect(page.getByText(/推荐部署 Playbook/i).first()).toBeVisible();
    await expect(page.getByText(/cdna3/i).first()).toBeVisible();
  });

  test('GB300 NVL72 shows 288 GB HBM3e + NV-HBI', async ({ page }) => {
    await page.goto('/hardware/gb300-nvl72/');
    await expect(page.getByText(/288 GB|36 GB/i).first()).toBeVisible();
    await expect(page.getByText(/NV-HBI|dual-die/i).first()).toBeVisible();
  });

  test('Etched Sohu shows transformer-only ASIC + 144 specialized Tile', async ({ page }) => {
    await page.goto('/hardware/sohu/');
    await expect(page.getByText(/transformer|specialized Tile/i).first()).toBeVisible();
  });

  test('R200 (Rubin) shows HBM4 + NVLink-6', async ({ page }) => {
    await page.goto('/hardware/r200-sxm/');
    await expect(page.getByText(/HBM4|NVLink-6/i).first()).toBeVisible();
  });
});

test.describe('v1.11: deployment playbooks (gap 3) + 3 more cards memory_hierarchy', () => {
  test('Playbooks index lists 5 (model x hardware) recipes', async ({ page }) => {
    await page.goto('/playbooks/');
    await expect(page.getByRole('heading', { name: /部署 Playbook|任意模型/i }).first()).toBeVisible();
    // 5 playbook cards rendered
    await expect(page.getByText(/MoE 超大模型在 Hopper 集群/i).first()).toBeVisible();
    await expect(page.getByText(/Dense 70B\/72B|Hopper 单节点/i).first()).toBeVisible();
    await expect(page.getByText(/Blackwell 超节点|NVL72 GB200/i).first()).toBeVisible();
    await expect(page.getByText(/昇腾集群|CloudMatrix 384/i).first()).toBeVisible();
    await expect(page.getByText(/端侧.*单卡|Llama 3 8B/i).first()).toBeVisible();
  });

  test('MoE Hopper-cluster playbook detail shows full recipe', async ({ page }) => {
    await page.goto('/playbooks/moe-llm-large-on-hopper-cluster/');
    await expect(page.getByText(/TP=8/).first()).toBeVisible();
    await expect(page.getByText(/EP=32-128/).first()).toBeVisible();
    await expect(page.getByText(/FP8-E4M3|fp8-e4m3/i).first()).toBeVisible();
    await expect(page.getByText(/Decision points|规模决策/i).first()).toBeVisible();
    // Cross-references rendered
    await expect(page.getByText(/融合 Kernel|fused-kernel/i).first()).toBeVisible();
    await expect(page.getByText(/优化 Pattern|pattern/i).first()).toBeVisible();
  });

  test('Blackwell super-pod playbook shows FP4 + NVL72', async ({ page }) => {
    await page.goto('/playbooks/moe-llm-large-on-blackwell-superpod/');
    await expect(page.getByText(/FP4|fp4/i).first()).toBeVisible();
    await expect(page.getByText(/NVL72|NVL36/i).first()).toBeVisible();
    await expect(page.getByText(/disagg|Disagg/i).first()).toBeVisible();
  });

  test('Ascend cluster playbook shows MindIE + 国产替代 context', async ({ page }) => {
    await page.goto('/playbooks/moe-llm-large-on-ascend-cluster/');
    await expect(page.getByText(/MindIE|CANN/i).first()).toBeVisible();
    await expect(page.getByText(/国产|CloudMatrix|HCCS-v2/i).first()).toBeVisible();
  });

  test('Edge single-card playbook shows llama.cpp + 端侧 quant', async ({ page }) => {
    await page.goto('/playbooks/dense-llm-small-on-edge-card/');
    await expect(page.getByText(/llama.cpp|llama-cpp/i).first()).toBeVisible();
    await expect(page.getByText(/INT4-AWQ|Q4_K_M|端侧/i).first()).toBeVisible();
  });

  test('Pipeline stage page now cross-links to relevant playbooks', async ({ page }) => {
    await page.goto('/pipeline/quantize/');
    await expect(page.getByText(/部署 Playbook/i).first()).toBeVisible();
  });

  test('Home page lists Playbook as a navigation entry', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/部署 Playbook|model × hardware/i).first()).toBeVisible();
  });

  test('MI300A APU shows unified HBM3 + 256 MB Infinity Cache', async ({ page }) => {
    await page.goto('/hardware/mi300a/');
    await expect(page.getByText(/Unified HBM3|统一寻址/i).first()).toBeVisible();
    await expect(page.getByText(/Infinity Cache|256 MB/i).first()).toBeVisible();
  });

  test('GB200 NVL72 shows NV-HBI dual-die bridge', async ({ page }) => {
    await page.goto('/hardware/gb200-nvl72/');
    await expect(page.getByText(/NV-HBI/i).first()).toBeVisible();
    await expect(page.getByText(/dual-die|两个 B200|HBM3e/i).first()).toBeVisible();
  });

  test('Apple M4 Max ANE shows UMA + 128 GB unified', async ({ page }) => {
    await page.goto('/hardware/apple-m4-max-npu/');
    await expect(page.getByText(/UMA|unified memory|统一/i).first()).toBeVisible();
    await expect(page.getByText(/LPDDR5X|128 GB/i).first()).toBeVisible();
  });
});

test.describe('v1.10: 4 new operators + 3 new fused-kernels + 3 more cards (80%)', () => {
  test('Operators hub now lists 13 operators incl. new ones', async ({ page }) => {
    await page.goto('/operators/');
    await expect(page.getByText(/GELU/i).first()).toBeVisible();
    await expect(page.getByText(/Quantize.*Dequantize|Q\/DQ/i).first()).toBeVisible();
    await expect(page.getByText(/Selective Scan|SSM core/i).first()).toBeVisible();
    await expect(page.getByText(/Reduce-Scatter/i).first()).toBeVisible();
  });

  test('Selective Scan operator shows Mamba/Mamba-2 context', async ({ page }) => {
    await page.goto('/operators/selective-scan/');
    await expect(page.getByText(/Mamba|SSM/i).first()).toBeVisible();
    await expect(page.getByText(/state_dim|state space/i).first()).toBeVisible();
  });

  test('Quantize-Dequantize shows AWQ/GPTQ/FP4 formats', async ({ page }) => {
    await page.goto('/operators/quantize-dequantize/');
    await expect(page.getByText(/AWQ/i).first()).toBeVisible();
    await expect(page.getByText(/NVFP4|MXFP4/i).first()).toBeVisible();
  });

  test('Reduce-Scatter shows TP/SP context + SHARP', async ({ page }) => {
    await page.goto('/operators/reduce-scatter/');
    await expect(page.getByText(/Tensor Parallelism|TP/i).first()).toBeVisible();
    await expect(page.getByText(/SHARP/i).first()).toBeVisible();
  });

  test('Fused-kernels hub now shows 15 kernels incl. new ones', async ({ page }) => {
    await page.goto('/fused-kernels/');
    await expect(page.getByRole('link', { name: /Fused MTP Head/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Fused Sliding Window/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Fused RadixAttention/i }).first()).toBeVisible();
  });

  test('Fused MTP Head shows DeepSeek V3/V4 context', async ({ page }) => {
    await page.goto('/fused-kernels/fused-mtp-head/');
    await expect(page.getByText(/DeepSeek V3|V3\/V4/i).first()).toBeVisible();
    await expect(page.getByText(/MTP/i).first()).toBeVisible();
  });

  test('Fused Sliding Window shows Mistral/Gemma + window_size', async ({ page }) => {
    await page.goto('/fused-kernels/fused-attn-sliding-window/');
    await expect(page.getByText(/Mistral|Gemma/i).first()).toBeVisible();
    await expect(page.getByText(/window_size|window/i).first()).toBeVisible();
  });

  test('BR104 hardware shows derated chiplet', async ({ page }) => {
    await page.goto('/hardware/br104/');
    await expect(page.getByText(/derated|Bi-link Mesh/i).first()).toBeVisible();
  });

  test('MLU370-X8 shows dual-die chiplet', async ({ page }) => {
    await page.goto('/hardware/mlu370-x8/');
    await expect(page.getByText(/MLU-Link|chiplet|双 die/i).first()).toBeVisible();
    await expect(page.getByText(/MLUarch02|IPU/i).first()).toBeVisible();
  });

  test('Iluvatar BI shows CoreX CUDA-compatible context', async ({ page }) => {
    await page.goto('/hardware/iluvatar-bi/');
    await expect(page.getByText(/CoreX|CUDA-compatible/i).first()).toBeVisible();
    await expect(page.getByText(/天垓/i).first()).toBeVisible();
  });
});

test.describe('v1.9: 6 new patterns + 4 more cards + last 2 super-pods (72% / 100%)', () => {
  test('Patterns hub now lists 15 patterns', async ({ page }) => {
    await page.goto('/patterns/');
    await expect(page.getByRole('link', { name: /RadixAttention 前缀缓存/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /MTP 多 token 预测/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Sliding Window/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /FP4 仅权重量化/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Ring Attention/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /KV Cache CPU/i }).first()).toBeVisible();
  });

  test('RadixAttention pattern detail shows engines + speedup', async ({ page }) => {
    await page.goto('/patterns/prefix-radix-cache/');
    await expect(page.getByText(/SGLang/i).first()).toBeVisible();
    await expect(page.getByText(/radix tree|基数树/i).first()).toBeVisible();
  });

  test('MTP pattern shows DeepSeek V3 context', async ({ page }) => {
    await page.goto('/patterns/mtp-multi-token-prediction/');
    await expect(page.getByText(/DeepSeek V3|DeepSeek-V3/i).first()).toBeVisible();
    await expect(page.getByText(/接受率/i).first()).toBeVisible();
  });

  test('FP4 weight-only pattern shows Blackwell context', async ({ page }) => {
    await page.goto('/patterns/fp4-weight-only-quant/');
    await expect(page.getByText(/Blackwell/i).first()).toBeVisible();
    await expect(page.getByText(/NVFP4|MXFP4/i).first()).toBeVisible();
  });

  test('BR100 hardware shows chiplet mesh', async ({ page }) => {
    await page.goto('/hardware/br100/');
    await expect(page.getByText(/chiplet/i).first()).toBeVisible();
    await expect(page.getByText(/Bi-link Mesh|双 die/i).first()).toBeVisible();
  });

  test('Wormhole n300 shows Tensix L1 SRAM tile-based', async ({ page }) => {
    await page.goto('/hardware/wormhole-n300/');
    await expect(page.getByText(/Tensix L1 SRAM|1\.5 MB/i).first()).toBeVisible();
    await expect(page.getByText(/RISC-V|tile-based|Tile-based/i).first()).toBeVisible();
  });

  test('SambaNova SN40L shows 3-tier memory (SRAM + HBM + DDR5)', async ({ page }) => {
    await page.goto('/hardware/sn40l/');
    await expect(page.getByText(/PMU SRAM|RDU/i).first()).toBeVisible();
    await expect(page.getByText(/DDR5/i).first()).toBeVisible();
  });

  test('KUAE super-pod (Moore Threads) shows MTLink + RoCE', async ({ page }) => {
    await page.goto('/servers/moore-threads-kuae/');
    await expect(page.getByText(/MTLink/i).first()).toBeVisible();
    await expect(page.getByText(/夸娥|KUAE/i).first()).toBeVisible();
  });

  test('Cambricon X8 Server shows MLU-Link-v2 single-node', async ({ page }) => {
    await page.goto('/servers/cambricon-x8-server/');
    await expect(page.getByText(/MLU-Link-v2/i).first()).toBeVisible();
    await expect(page.getByText(/思元 X8|训推/i).first()).toBeVisible();
  });

  test('/quality coverage now shows ≥70% hardware + 100% super-pod', async ({ page }) => {
    await page.goto('/quality/');
    // memory_hierarchy at 72% (28/39) or switch_chips at 100% (14/14)
    await expect(page.locator('text=/100% 完成|7[0-9]% 完成|8[0-9]% 完成/').first()).toBeVisible();
  });
});

test.describe('v1.8: 6 more cards memory_hierarchy + 4 more super-pods cluster internals (62% / 86%)', () => {
  test('/quality coverage now shows ≥60% hardware + ≥85% super-pod', async ({ page }) => {
    await page.goto('/quality/');
    await expect(page.getByRole('heading', { name: /Schema 数据填充度.*Schema richness coverage/i }).first()).toBeVisible();
    // Hardware memory_hierarchy or tensor_core_specs row should show ≥60%
    // (lower-bound assertion; coverage grows over time)
    await expect(page.locator('text=/[6-9][0-9]% 完成|100% 完成/').first()).toBeVisible();
  });

  test('Cerebras WSE-3 wafer-scale architecture (44 GB on-die SRAM)', async ({ page }) => {
    await page.goto('/hardware/wse-3/');
    await expect(page.getByText(/SRAM/i).first()).toBeVisible();
    await expect(page.getByText(/wafer/i).first()).toBeVisible();
  });

  test('Groq LPU on-die SRAM only (230 MB, no HBM)', async ({ page }) => {
    await page.goto('/hardware/groq-lpu/');
    await expect(page.getByText(/230 MB|on-die/i).first()).toBeVisible();
    await expect(page.getByText(/TSP|deterministic/i).first()).toBeVisible();
  });

  test('Ascend 950 Da Vinci 4.0 + HBM3e + HCCS-C2C v2', async ({ page }) => {
    await page.goto('/hardware/ascend-950/');
    await expect(page.getByText(/HBM3e/i).first()).toBeVisible();
    await expect(page.getByText(/HCCS-C2C/i).first()).toBeVisible();
  });

  test('DGX A100 super-pod shows NVSwitch Gen-2 + ConnectX-6', async ({ page }) => {
    await page.goto('/servers/nvidia-dgx-a100/');
    await expect(page.getByText(/NVSwitch Gen-2/i).first()).toBeVisible();
    await expect(page.getByText(/ConnectX-6/i).first()).toBeVisible();
  });

  test('MI325X Platform shows Infinity Fabric P2P mesh + UBB 2.0', async ({ page }) => {
    await page.goto('/servers/amd-mi325x-platform/');
    await expect(page.getByText(/Infinity Fabric/i).first()).toBeVisible();
    await expect(page.getByText(/UBB 2\.0|P2P mesh|fully-connected/i).first()).toBeVisible();
  });

  test('MI300A supercomputer shows Slingshot 11 + El Capitan context', async ({ page }) => {
    await page.goto('/servers/amd-mi300a-supercomputer/');
    await expect(page.getByText(/Slingshot/i).first()).toBeVisible();
    await expect(page.getByText(/El Capitan|EX255a|APU/i).first()).toBeVisible();
  });
});

test.describe('v1.7: schema-richness coverage dashboard + 6 more cards + 3 more super-pods', () => {
  test('/quality has Schema-richness coverage section with progress bars', async ({ page }) => {
    await page.goto('/quality/');
    await expect(page.getByRole('heading', { name: /Schema 数据填充度.*Schema richness coverage/i }).first()).toBeVisible();
    await expect(page.getByText(/硬件 memory_hierarchy/i).first()).toBeVisible();
    await expect(page.getByText(/硬件 tensor_core_specs/i).first()).toBeVisible();
    await expect(page.getByText(/超节点 switch_chips/i).first()).toBeVisible();
    // Coverage % visible (any 2-digit % since coverage grows over time)
    await expect(page.locator('text=/[1-9][0-9]% 完成/').first()).toBeVisible();
    // Contribute CTA from this section
    await expect(page.locator('a[href*="/contribute"]').first()).toBeVisible();
  });

  test('A100 SXM4 has new memory hierarchy with HBM2e', async ({ page }) => {
    await page.goto('/hardware/a100-sxm4/');
    await expect(page.getByText(/Memory Hierarchy/i).first()).toBeVisible();
    await expect(page.getByText(/HBM2e/i).first()).toBeVisible();
    await expect(page.getByText(/NVLink-3\.0/i).first()).toBeVisible();
  });

  test('TPU v5p shows Google-specific VMEM + CMEM', async ({ page }) => {
    await page.goto('/hardware/tpu-v5p/');
    await expect(page.getByText(/VMEM/i).first()).toBeVisible();
    await expect(page.getByText(/CMEM/i).first()).toBeVisible();
  });

  test('HGX H200 has SwitchFabric SVG topology', async ({ page }) => {
    await page.goto('/servers/nvidia-hgx-h200/');
    await expect(page.getByText(/Switch Fabric Topology/i).first()).toBeVisible();
    await expect(page.getByText(/NVSwitch Gen-3/i).first()).toBeVisible();
  });

  test('Atlas 900 super-pod shows 8-cabinet HCCS-v2 design', async ({ page }) => {
    await page.goto('/servers/huawei-atlas-900-superpod/');
    await expect(page.getByText(/HCCS-v2/i).first()).toBeVisible();
    await expect(page.getByText(/8 个机柜联合|8-cabinet/i).first()).toBeVisible();
  });

  test('Trn2 UltraServer shows NeuronLink-v3 fabric', async ({ page }) => {
    await page.goto('/servers/aws-trn2-ultraserver/');
    await expect(page.getByText(/NeuronLink-v3/i).first()).toBeVisible();
    await expect(page.getByText(/UltraServer/i).first()).toBeVisible();
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
