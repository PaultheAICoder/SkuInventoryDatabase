import { test, expect } from '@playwright/test';

test('test feedback API submission', async ({ browser }) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Login first
  await page.goto('http://172.16.20.50:4545/login');
  await page.waitForLoadState('networkidle');
  await page.fill('#email', 'admin@tonsil.tech');
  await page.fill('#password', 'changeme123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // Now call the feedback API directly
  const response = await page.request.post('http://172.16.20.50:4545/api/feedback', {
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
  expect(body.success).toBe(true);
  expect(body.data.issueUrl).toContain('github.com');
  expect(body.data.issueNumber).toBeGreaterThan(0);

  console.log('SUCCESS! Created issue:', body.data.issueUrl);

  await context.close();
});
