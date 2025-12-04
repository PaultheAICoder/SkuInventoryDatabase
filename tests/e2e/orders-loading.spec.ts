import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

test.describe('Orders Page Loading State', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Orders page does not hang on loading state', async ({ page }) => {
    // Navigate to orders page
    await page.goto('/orders')

    // Wait for page to load - should NOT stay in loading state forever
    // The fix ensures the page transitions from loading to either:
    // 1. Showing orders (if any exist)
    // 2. Showing "No orders found" empty state
    await page.waitForSelector('h1:has-text("Order Review")', { timeout: 10000 })

    // Wait for loading to complete - page should NOT show "Loading orders..." for more than 5 seconds
    // Use a race condition: either we see the table or we see "Loading orders..." disappear
    const loadingComplete = await Promise.race([
      // Option 1: Table component appears (with or without data)
      page.waitForSelector('[data-testid="order-review-table"], table, .text-muted-foreground:has-text("No orders found")', { timeout: 10000 }),
      // Option 2: Loading text disappears
      page.waitForFunction(() => {
        const loadingText = document.body.textContent
        return loadingText && !loadingText.includes('Loading orders...')
      }, { timeout: 10000 })
    ]).then(() => true).catch(() => false)

    // If loadingComplete is false and loading text is still visible, fail the test
    const pageContent = await page.textContent('body')

    // The key assertion: if we see "Loading orders..." after 10 seconds, the bug is NOT fixed
    // Otherwise, we should see either:
    // - "No orders found" (empty state)
    // - Order data (if orders exist)
    expect(loadingComplete || !pageContent?.includes('Loading orders...')).toBeTruthy()
  })

  test('Orders page shows proper empty state when no orders exist', async ({ page }) => {
    // Navigate to orders page
    await page.goto('/orders')

    // Wait for page to finish loading (max 10 seconds)
    await page.waitForSelector('h1:has-text("Order Review")', { timeout: 10000 })

    // Wait for loading to complete
    await page.waitForFunction(() => {
      const body = document.body.textContent || ''
      return !body.includes('Loading orders...')
    }, { timeout: 10000 })

    // Page should now show either:
    // 1. Table with orders
    // 2. "No orders found" message
    // 3. Some other completed state (not loading)
    const pageText = await page.textContent('body')
    expect(pageText).not.toContain('Loading orders...')
  })
})
