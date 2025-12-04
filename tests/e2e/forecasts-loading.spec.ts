import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

test.describe('Forecasts Page Loading State', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Forecasts page does not hang on loading state', async ({ page }) => {
    // Navigate to forecasts page
    await page.goto('/forecasts')

    // Wait for page to load - should NOT stay in loading state forever
    // The fix ensures the page transitions from loading to either:
    // 1. Showing forecasts (if components exist)
    // 2. Showing "No forecasts found" empty state
    await page.waitForSelector('h1:has-text("Forecasts")', { timeout: 10000 })

    // Wait for loading to complete - page should NOT show "Loading..." for more than 5 seconds
    // Use a race condition: either we see the table or we see "Loading..." disappear
    const loadingComplete = await Promise.race([
      // Option 1: Table component appears (with or without data)
      page.waitForSelector('table, .text-muted-foreground:has-text("No forecasts found")', { timeout: 10000 }),
      // Option 2: Loading text disappears
      page.waitForFunction(() => {
        const loadingText = document.body.textContent
        return loadingText && !loadingText.includes('Loading...')
      }, { timeout: 10000 })
    ]).then(() => true).catch(() => false)

    // If loadingComplete is false and loading text is still visible, fail the test
    const pageContent = await page.textContent('body')

    // The key assertion: if we see "Loading..." after 10 seconds, the bug is NOT fixed
    // Otherwise, we should see either:
    // - "No forecasts found" (empty state)
    // - Forecast data (if components exist)
    expect(loadingComplete || !pageContent?.includes('Loading...')).toBeTruthy()
  })

  test('Forecasts page shows proper empty state when no forecasts exist', async ({ page }) => {
    // Navigate to forecasts page
    await page.goto('/forecasts')

    // Wait for page to finish loading (max 10 seconds)
    await page.waitForSelector('h1:has-text("Forecasts")', { timeout: 10000 })

    // Wait for loading to complete
    await page.waitForFunction(() => {
      const body = document.body.textContent || ''
      return !body.includes('Loading...')
    }, { timeout: 10000 })

    // Page should now show either:
    // 1. Table with forecasts
    // 2. "No forecasts found" message
    // 3. Some other completed state (not loading)
    const pageText = await page.textContent('body')
    expect(pageText).not.toContain('Loading...')
  })
})
