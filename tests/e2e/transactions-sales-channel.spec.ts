import { test, expect } from '@playwright/test'

/**
 * Transactions Sales Channel Filter E2E Tests
 *
 * Tests for Issue #23: Add Sales Channel filter to Transactions view
 * Verifies the sales channel dropdown filter and export functionality.
 */
test.describe('Transactions Sales Channel Filter', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    // Wait for either dashboard or redirect to complete
    await Promise.race([
      page.waitForURL('/', { timeout: 20000 }),
      page.waitForURL('/transactions', { timeout: 20000 }),
      page.waitForURL('/components', { timeout: 20000 }),
    ])
  })

  test('Sales Channel dropdown appears on Transactions page', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // The Sales Channel label should be visible
    const salesChannelLabel = page.locator('label:has-text("Sales Channel")')
    await expect(salesChannelLabel).toBeVisible()

    // The select trigger for Sales Channel should be visible
    // It's the one after Date To, identified by its placeholder or default value
    const selectTriggers = page.locator('[role="combobox"]')
    const count = await selectTriggers.count()
    // Should have at least 2 selects: Type and Sales Channel
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('Sales Channel dropdown has expected options', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Find the Sales Channel dropdown (second combobox after Type)
    const salesChannelSection = page.locator('div.space-y-1:has(label:has-text("Sales Channel"))')
    const selectTrigger = salesChannelSection.locator('[role="combobox"]')
    await expect(selectTrigger).toBeVisible()

    // Click to open the dropdown
    await selectTrigger.click()

    // Wait for dropdown to appear
    await page.waitForSelector('[role="option"]', { timeout: 5000 })

    // Verify all expected options are present
    await expect(page.locator('[role="option"]:has-text("All Channels")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("Amazon")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("Shopify")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("TikTok")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("Generic")')).toBeVisible()
  })

  test('Selecting a channel updates API call with salesChannel param', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Track API calls
    const apiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/transactions')) {
        apiCalls.push(request.url())
      }
    })

    // Clear previous calls
    apiCalls.length = 0

    // Find the Sales Channel dropdown
    const salesChannelSection = page.locator('div.space-y-1:has(label:has-text("Sales Channel"))')
    const selectTrigger = salesChannelSection.locator('[role="combobox"]')
    await selectTrigger.click()

    // Select Amazon
    await page.locator('[role="option"]:has-text("Amazon")').click()

    // Click Apply button
    await page.locator('button:has-text("Apply")').click()

    // Wait for API call
    await page.waitForTimeout(1000)

    // Verify API was called with salesChannel parameter
    const hasSalesChannelParam = apiCalls.some((url) => url.includes('salesChannel=Amazon'))
    expect(hasSalesChannelParam).toBe(true)
  })

  test('URL updates when Sales Channel filter is applied', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Find the Sales Channel dropdown
    const salesChannelSection = page.locator('div.space-y-1:has(label:has-text("Sales Channel"))')
    const selectTrigger = salesChannelSection.locator('[role="combobox"]')
    await selectTrigger.click()

    // Select Shopify
    await page.locator('[role="option"]:has-text("Shopify")').click()

    // Click Apply button
    await page.locator('button:has-text("Apply")').click()

    // Wait for URL to update
    await page.waitForURL(/salesChannel=Shopify/, { timeout: 5000 })

    // Verify URL contains the parameter
    expect(page.url()).toContain('salesChannel=Shopify')
  })

  test('Clear Filters resets Sales Channel to All Channels', async ({ page }) => {
    // Start with a filter applied
    await page.goto('/transactions?salesChannel=Amazon')
    await page.waitForLoadState('networkidle')

    // Verify the dropdown shows Amazon
    const salesChannelSection = page.locator('div.space-y-1:has(label:has-text("Sales Channel"))')
    const selectTrigger = salesChannelSection.locator('[role="combobox"]')

    // Click Clear button
    await page.locator('button:has-text("Clear")').click()

    // Wait for URL to update
    await page.waitForURL('/transactions', { timeout: 5000 })

    // Verify URL no longer contains salesChannel
    expect(page.url()).not.toContain('salesChannel')
  })

  test('Export button triggers download with salesChannel parameter when filter is active', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Find the Sales Channel dropdown
    const salesChannelSection = page.locator('div.space-y-1:has(label:has-text("Sales Channel"))')
    const selectTrigger = salesChannelSection.locator('[role="combobox"]')
    await selectTrigger.click()

    // Select TikTok
    await page.locator('[role="option"]:has-text("TikTok")').click()

    // Click Apply button
    await page.locator('button:has-text("Apply")').click()

    // Wait for the filter to be applied
    await page.waitForURL(/salesChannel=TikTok/, { timeout: 5000 })

    // Track export API calls
    const exportApiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/export/transactions')) {
        exportApiCalls.push(request.url())
      }
    })

    // Find the export button (it's a button, not a link)
    const exportButton = page.locator('button:has-text("Export")')
    await expect(exportButton).toBeVisible()

    // Click the export button
    await exportButton.click()

    // Wait for the export API call
    await page.waitForTimeout(2000)

    // Verify the export API was called with salesChannel parameter
    const hasCorrectParam = exportApiCalls.some((url) => url.includes('salesChannel=TikTok'))
    expect(hasCorrectParam).toBe(true)
  })

  test('Sales Channel filter combines with other filters', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Select Type filter (first combobox)
    const typeSection = page.locator('div.space-y-1:has(label:has-text("Type"))')
    const typeSelect = typeSection.locator('[role="combobox"]')
    await typeSelect.click()
    await page.locator('[role="option"]:has-text("Build")').click()

    // Select Sales Channel filter
    const salesChannelSection = page.locator('div.space-y-1:has(label:has-text("Sales Channel"))')
    const salesChannelSelect = salesChannelSection.locator('[role="combobox"]')
    await salesChannelSelect.click()
    await page.locator('[role="option"]:has-text("Amazon")').click()

    // Click Apply button
    await page.locator('button:has-text("Apply")').click()

    // Wait for URL to update with both parameters
    await page.waitForURL(/type=build/, { timeout: 5000 })

    // Verify URL contains both parameters
    const currentUrl = page.url()
    expect(currentUrl).toContain('type=build')
    expect(currentUrl).toContain('salesChannel=Amazon')
  })

  test('Sales Channel filter is visible on mobile viewport', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    // The Sales Channel label should still be visible
    const salesChannelLabel = page.locator('label:has-text("Sales Channel")')
    await expect(salesChannelLabel).toBeVisible()

    // The select should be visible
    const salesChannelSection = page.locator('div.space-y-1:has(label:has-text("Sales Channel"))')
    const selectTrigger = salesChannelSection.locator('[role="combobox"]')
    await expect(selectTrigger).toBeVisible()
  })

  test('Transactions API filters by salesChannel correctly', async ({ page }) => {
    // Test API directly with salesChannel parameter
    const response = await page.request.get('/api/transactions?salesChannel=Amazon')
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('data')
    expect(data).toHaveProperty('meta')

    // All returned transactions should either have Amazon as salesChannel or be non-build transactions
    // (only build transactions have salesChannel set)
    for (const tx of data.data) {
      if (tx.type === 'build' && tx.salesChannel) {
        expect(tx.salesChannel).toBe('Amazon')
      }
    }
  })

  test('Export API filters by salesChannel correctly', async ({ page }) => {
    // Test export API with salesChannel parameter
    const response = await page.request.get('/api/export/transactions?salesChannel=Shopify')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')

    // The CSV should be generated successfully
    const csvContent = await response.text()
    expect(csvContent.length).toBeGreaterThan(0)
    // Should have headers at minimum (CSV uses "Transaction ID" as the first column)
    expect(csvContent).toContain('Transaction ID')
  })
})
