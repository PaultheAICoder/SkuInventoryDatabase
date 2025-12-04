import { test, expect } from '@playwright/test';

// Helper to close a GitHub issue via API
async function closeGitHubIssue(page: import('@playwright/test').Page, issueNumber: number) {
  try {
    const response = await page.request.patch(`/api/github/issues/${issueNumber}`, {
      data: { state: 'closed' }
    });
    if (response.ok()) {
      console.log(`Closed test issue #${issueNumber}`);
    } else {
      console.warn(`Failed to close issue #${issueNumber}: ${response.status()}`);
    }
  } catch (e) {
    console.warn(`Error closing issue #${issueNumber}:`, e);
  }
}

test('test feedback API submission', async ({ browser }) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Login first (uses baseURL from playwright.config.ts)
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.fill('#email', 'admin@tonsil.tech');
  await page.fill('#password', 'changeme123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // Now call the feedback API directly (uses baseURL from playwright.config.ts)
  const response = await page.request.post('/api/feedback', {
    data: {
      type: 'bug',
      description: 'TEST ISSUE - Please close. Testing feedback API via Playwright.',
      answers: [
        'Test reproduction steps',
        'Test expected behavior',
        'Test when noticed'
      ]
    }
  });

  console.log('Response status:', response.status());
  const body = await response.json();
  console.log('Response body:', JSON.stringify(body, null, 2));

  expect(response.status()).toBe(200);
  // API returns { data: { issueUrl, issueNumber } } format
  expect(body.data).toBeDefined();
  expect(body.data.issueUrl).toContain('github.com');
  expect(body.data.issueNumber).toBeGreaterThan(0);

  console.log('SUCCESS! Created issue:', body.data.issueUrl);

  // Clean up: close the test issue so we don't leave orphan issues
  await closeGitHubIssue(page, body.data.issueNumber);

  await context.close();
});
