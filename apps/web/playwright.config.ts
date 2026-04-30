import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Skip e2e/manual/* — those tests require a separate static server with
  // a /evokernel-spec/ base path mirror and are run via `pnpm test:e2e:manual`.
  testIgnore: '**/manual/**',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    headless: true,
    screenshot: 'only-on-failure'
  },
  webServer: process.env.CI || process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'pnpm preview --host 127.0.0.1 --port 4321',
        url: 'http://127.0.0.1:4321',
        reuseExistingServer: true,
        timeout: 60_000
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
