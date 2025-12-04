import { defineConfig, devices } from '@playwright/test';

// E2E tests target the TEST environment (port 2345), not production (port 4545)
// See docs/test-environment-implementation-plan.md for details
const baseURL = process.env.PLAYWRIGHT_BASE_URL ||
  process.env.TEST_BASE_URL ||
  (process.env.CI ? 'http://localhost:2345' : 'http://172.16.20.50:2345');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000, // 30 second timeout per test
  expect: {
    timeout: 10000, // 10 second timeout for assertions
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    actionTimeout: 10000, // 10 second timeout for actions
    navigationTimeout: 15000, // 15 second timeout for navigation
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
