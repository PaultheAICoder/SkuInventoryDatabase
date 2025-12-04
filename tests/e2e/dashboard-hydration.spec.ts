import { test, expect } from '@playwright/test';

test.describe('Dashboard Hydration', () => {
  test('should load dashboard without hydration errors', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Go to login page (uses baseURL from playwright.config.ts)
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Login
    await page.fill('#email', 'admin@tonsil.tech');
    await page.fill('#password', 'changeme123');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await page.waitForURL('**/', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Additional wait for React hydration to complete
    await page.waitForTimeout(3000);

    // Verify dashboard elements are visible
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

    // Take screenshot as proof
    await page.screenshot({
      path: '/tmp/dashboard-hydration-test.png',
      fullPage: true
    });

    // Check for hydration errors specifically
    const hydrationErrors = consoleErrors.filter(error =>
      error.includes('Hydration') ||
      error.includes('hydration') ||
      error.includes('Text content does not match') ||
      error.includes('#418') ||
      error.includes('#423') ||
      error.includes('#425')
    );

    // Log all console errors for debugging
    if (consoleErrors.length > 0) {
      console.log('Console errors found:', consoleErrors);
    }

    // Assert no hydration errors
    expect(hydrationErrors).toHaveLength(0);

    await context.close();
  });

  test('should render Critical Components without hydration issues', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', 'admin@tonsil.tech');
    await page.fill('#password', 'changeme123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Look for Critical Components section
    const criticalComponentsCard = page.locator('text=Critical Components').first();
    await expect(criticalComponentsCard).toBeVisible();

    // Look for Top Buildable SKUs section
    const topBuildableCard = page.locator('text=Top Buildable SKUs').first();
    await expect(topBuildableCard).toBeVisible();

    // Look for Recent Transactions section
    const recentTxCard = page.locator('text=Recent Transactions').first();
    await expect(recentTxCard).toBeVisible();

    // Verify no hydration errors in console
    const hydrationErrors = consoleErrors.filter(error =>
      error.includes('Hydration') ||
      error.includes('hydration') ||
      error.includes('Text content does not match')
    );

    expect(hydrationErrors).toHaveLength(0);

    await context.close();
  });
});
