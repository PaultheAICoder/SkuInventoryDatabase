import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

test.describe('Settings Page Loading State', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Settings page does not hang on loading state', async ({ page }) => {
    // Navigate to settings page
    await page.goto('/settings')

    // Wait for page to load - should NOT stay in loading state forever
    await page.waitForSelector('h1:has-text("Settings")', { timeout: 10000 })

    // Wait for loading to complete - page should NOT show "Loading settings..." for more than 5 seconds
    const loadingComplete = await Promise.race([
      // Option 1: Form appears (settings loaded)
      page.waitForSelector('form', { timeout: 10000 }),
      // Option 2: Loading text disappears
      page.waitForFunction(() => {
        const loadingText = document.body.textContent
        return loadingText && !loadingText.includes('Loading settings...')
      }, { timeout: 10000 })
    ]).then(() => true).catch(() => false)

    // The key assertion: if we see "Loading settings..." after 10 seconds, the bug is NOT fixed
    const pageContent = await page.textContent('body')
    expect(loadingComplete || !pageContent?.includes('Loading settings...')).toBeTruthy()
  })

  test('Settings page shows form after loading', async ({ page }) => {
    // Navigate to settings page
    await page.goto('/settings')

    // Wait for page to finish loading (max 10 seconds)
    await page.waitForSelector('h1:has-text("Settings")', { timeout: 10000 })

    // Wait for loading to complete
    await page.waitForFunction(() => {
      const body = document.body.textContent || ''
      return !body.includes('Loading settings...')
    }, { timeout: 10000 })

    // Page should now show either:
    // 1. Settings form with sections
    // 2. Error message (if API failed)
    // 3. Some other completed state (not loading)
    const pageText = await page.textContent('body')
    expect(pageText).not.toContain('Loading settings...')

    // Verify form is visible (admin should see settings form)
    await expect(page.locator('form').first()).toBeVisible({ timeout: 5000 })
  })
})
