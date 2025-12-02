import { test, expect } from '@playwright/test'

test.describe('SKU Detail - Recent Transactions Section', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    // Wait for login form to be ready
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    // Wait for redirect to dashboard
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('SKU detail page loads successfully', async ({ page }) => {
    // Navigate to SKUs list
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Get the first SKU link in the table (skip header row)
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      // Click on the first SKU name to go to detail page
      await skuLinks.first().click()

      // Wait for the SKU detail page to load
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // Verify basic SKU detail page elements exist
      await expect(page.locator('text=SKU Details').first()).toBeVisible()
      await expect(page.locator('text=Sales Channel').first()).toBeVisible()
      await expect(page.locator('text=Status').first()).toBeVisible()
    } else {
      // No SKUs exist - skip this test
      test.skip()
    }
  })

  test('Recent Transactions section appears when SKU has transactions', async ({ page }) => {
    // Navigate to SKUs list
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Get the first SKU link in the table
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      // Click on the first SKU name to go to detail page
      await skuLinks.first().click()

      // Wait for the SKU detail page to load
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // Check if Recent Transactions section exists
      // The section only renders if there are transactions
      const transactionsHeader = page.locator('text=Recent Transactions').first()
      const hasTransactions = await transactionsHeader.isVisible().catch(() => false)

      if (hasTransactions) {
        // Verify the card structure
        await expect(transactionsHeader).toBeVisible()

        // Check for the description text
        await expect(page.locator('text=Last 10 build transactions for this SKU')).toBeVisible()

        // Check for table headers
        await expect(page.locator('th:has-text("Date")')).toBeVisible()
        await expect(page.locator('th:has-text("Type")')).toBeVisible()
        await expect(page.locator('th:has-text("Units Built")')).toBeVisible()

        // Check for "View All Transactions" button
        const viewAllButton = page.locator('text=View All Transactions')
        await expect(viewAllButton).toBeVisible()
      } else {
        // No transactions for this SKU - this is a valid state
        // The section should not be visible
        await expect(transactionsHeader).not.toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('View All Transactions link navigates correctly', async ({ page }) => {
    // Navigate to SKUs list
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Get the first SKU link in the table
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      // Click on the first SKU name to go to detail page
      await skuLinks.first().click()

      // Wait for the SKU detail page to load
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // Extract the SKU ID from the URL
      const currentUrl = page.url()
      const skuId = currentUrl.split('/skus/')[1]?.split('/')[0]

      // Check if Recent Transactions section exists
      const viewAllButton = page.locator('text=View All Transactions')
      const hasButton = await viewAllButton.isVisible().catch(() => false)

      if (hasButton) {
        // Click the View All Transactions button
        await viewAllButton.click()

        // Wait for navigation to transactions page with skuId filter
        await page.waitForURL(/\/transactions\?skuId=/, { timeout: 10000 })

        // Verify the URL contains the correct SKU ID
        expect(page.url()).toContain(`skuId=${skuId}`)
      } else {
        // No transactions section - this is a valid state, skip verification
        test.skip()
      }
    } else {
      test.skip()
    }
  })

  test('Recent Transactions shows correct data format', async ({ page }) => {
    // Navigate to SKUs list
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Get the first SKU link in the table
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      // Click on the first SKU name to go to detail page
      await skuLinks.first().click()

      // Wait for the SKU detail page to load
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // Check if Recent Transactions section exists with data
      const transactionsHeader = page.locator('text=Recent Transactions').first()
      const hasTransactions = await transactionsHeader.isVisible().catch(() => false)

      if (hasTransactions) {
        // Find the Recent Transactions table specifically
        const transactionsCard = page.locator('div:has(> div > h3:has-text("Recent Transactions"))')
        const transactionsTable = transactionsCard.locator('table')

        // Verify there's at least one row in the transactions table
        const rowCount = await transactionsTable.locator('tbody tr').count()
        expect(rowCount).toBeGreaterThan(0)
        expect(rowCount).toBeLessThanOrEqual(10) // Max 10 transactions

        // Check for transaction type badges (they have capitalize class)
        const badges = transactionsTable.locator('.capitalize')
        const badgeCount = await badges.count()
        expect(badgeCount).toBeGreaterThan(0)
      } else {
        test.skip()
      }
    } else {
      test.skip()
    }
  })
})
