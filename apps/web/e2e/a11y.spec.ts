import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = [
  '/',
  '/hardware/',
  '/hardware/h100-sxm5/',
  '/hardware/ascend-910c/',
  '/hardware/mi300a/',          // new APU; smoke
  '/hardware/l40s/',             // new GDDR-only card; smoke
  '/models/',
  '/models/deepseek-v4-pro/',
  '/models/llama-3.3-70b/',      // new dense model
  '/cases/',
  '/cases/case-llama4-scout-h100x8-vllm-001/',
  '/calculator/',
  '/china/',
  '/about/',
  '/compare/',
  '/operators/',
  '/operators/matmul/',          // new fitness panel
  '/operators/attention/',
  '/showcase/',
  '/quality/',
  '/learn/',
  '/servers/aws-trn2-ultraserver/', // new server
  '/vendors/aws/',
  // EN mirrors — guard regression on all major routes
  '/en/',
  '/en/hardware/',
  '/en/hardware/h100-sxm5/',
  '/en/calculator/',
  '/en/cases/',
  '/en/compare/'
];

for (const route of routes) {
  test(`a11y: ${route}`, async ({ page }) => {
    await page.goto(route);
    // Wait for hydration of any island
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, summary: v.help })), null, 2)).toEqual([]);
  });
}
