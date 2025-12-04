import { test } from '@playwright/test'

test('screenshot component detail page', async ({ page }) => {
  // Login (uses baseURL from playwright.config.ts)
  await page.goto('/login')
  await page.waitForSelector('#email')
  await page.fill('#email', 'admin@tonsil.tech')
  await page.fill('#password', 'changeme123')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/', { timeout: 15000 })

  // Go to components page (uses baseURL from playwright.config.ts)
  await page.goto('/components')
  await page.waitForSelector('table', { timeout: 10000 })

  // Click on first component if exists
  const componentLinks = page.locator('table tbody tr td a')
  const count = await componentLinks.count()

  if (count > 0) {
    await componentLinks.first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await page.screenshot({
      path: '/tmp/component-detail-screenshot.png',
      fullPage: true,
    })
    console.log('Screenshot saved to /tmp/component-detail-screenshot.png')
  } else {
    console.log('No components found to screenshot')
    await page.screenshot({
      path: '/tmp/components-list-screenshot.png',
      fullPage: true,
    })
    console.log('Screenshot saved to /tmp/components-list-screenshot.png')
  }
})
