import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = [
  '/',
  '/hardware/',
  '/hardware/h100-sxm5/',
  '/hardware/ascend-910c/',
  '/models/',
  '/models/deepseek-v4-pro/',
  '/cases/',
  '/calculator/',
  '/china/',
  '/about/',
  '/compare/'
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
