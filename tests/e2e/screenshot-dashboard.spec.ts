import { test } from '@playwright/test';

test('screenshot dashboard', async ({ browser }) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Go to login page (uses baseURL from playwright.config.ts)
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Login - use id selectors
  await page.fill('#email', 'admin@tonsil.tech');
  await page.fill('#password', 'changeme123');
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForURL('**/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: '/tmp/dashboard-screenshot.png', fullPage: false });
  console.log('Screenshot saved to /tmp/dashboard-screenshot.png');

  await context.close();
});
