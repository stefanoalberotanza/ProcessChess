import { defineConfig, devices } from '@playwright/test';

// Runs against the static production output in build/ (run `pnpm build` first), service
// worker and OPFS included.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/serve-build.js 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
