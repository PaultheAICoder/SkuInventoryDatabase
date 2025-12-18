import { test, expect } from '@playwright/test'

/**
 * Format date to YYYY-MM-DD using local timezone (not UTC).
 * Mirrors toLocalDateString from src/lib/utils.ts for E2E tests.
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * E2E Tests for Receipt Dialog Lot Capture (Issue #81)
 *
 * Verifies that the ReceiptDialog displays lot number and expiry date fields
 * and that receipts can be created with lot tracking information.
 */

// Run tests serially to avoid table loading race conditions
test.describe.serial('Receipt Dialog Lot Capture', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Receipt dialog displays lot number and expiry date fields', async ({ page }) => {
    // Navigate to components page
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // Click on the first component link to view its detail page
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    // Skip if no components available (test company may not have seed data)
    test.skip(linkCount === 0, 'No components available - test company needs seed data')

    await componentLinks.first().click()

    // Wait for component detail page URL
    await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })

    // Find and click the Record Receipt button
    const receiptButton = page.locator('button:has-text("Record Receipt")')
    await expect(receiptButton).toBeVisible({ timeout: 10000 })
    await receiptButton.click()

    // Wait for dialog to open
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

    // Verify lot number field exists
    const lotNumberInput = page.locator('#lotNumber')
    await expect(lotNumberInput).toBeVisible()
    await expect(lotNumberInput).toHaveAttribute('placeholder', 'e.g., LOT-2024-001')

    // Verify expiry date field exists
    const expiryDateInput = page.locator('#expiryDate')
    await expect(expiryDateInput).toBeVisible()
    await expect(expiryDateInput).toHaveAttribute('type', 'date')

    // Verify expiry date is initially disabled (no lot number entered)
    await expect(expiryDateInput).toBeDisabled()

    // Enter a lot number
    await lotNumberInput.fill('TEST-LOT-001')

    // Verify expiry date becomes enabled
    await expect(expiryDateInput).toBeEnabled()

    // Take screenshot for visual verification
    await page.screenshot({ path: '/tmp/receipt-dialog-lot-fields.png' })
  })

  test('Receipt dialog lot number label is visible', async ({ page }) => {
    // Navigate to components page
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // Click on the first component link
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    // Skip if no components available (test company may not have seed data)
    test.skip(linkCount === 0, 'No components available - test company needs seed data')

    await componentLinks.first().click()
    await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })

    // Find and click the Record Receipt button
    const receiptButton = page.locator('button:has-text("Record Receipt")')
    await expect(receiptButton).toBeVisible({ timeout: 10000 })
    await receiptButton.click()

    // Wait for dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

    // Verify Lot Number label exists
    const lotNumberLabel = page.locator('label:has-text("Lot Number")')
    await expect(lotNumberLabel).toBeVisible()

    // Verify Expiry Date label exists
    const expiryDateLabel = page.locator('label:has-text("Expiry Date")')
    await expect(expiryDateLabel).toBeVisible()
  })

  test('Receipt can be submitted without lot info (backward compatible)', async ({ page }) => {
    // Navigate to components page
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // Click on the first component link
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    // Skip if no components available (test company may not have seed data)
    test.skip(linkCount === 0, 'No components available - test company needs seed data')

    await componentLinks.first().click()
    await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })

    // Find and click the Record Receipt button
    const receiptButton = page.locator('button:has-text("Record Receipt")')
    await expect(receiptButton).toBeVisible({ timeout: 10000 })
    await receiptButton.click()

    // Wait for dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

    // Fill required fields only (without lot info)
    await page.locator('#quantity').fill('10')
    await page.locator('#supplier').fill('Test Supplier E2E')

    // Submit form
    const submitButton = page.locator('button[type="submit"]:has-text("Record Receipt")')
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()

    // Click submit and verify dialog closes (success)
    await submitButton.click()

    // Wait for dialog to close (indicates success)
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 })
  })

  test('Receipt form fields are in correct order', async ({ page }) => {
    // Navigate to components page
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // Click on the first component link
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    // Skip if no components available (test company may not have seed data)
    test.skip(linkCount === 0, 'No components available - test company needs seed data')

    await componentLinks.first().click()
    await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })

    // Find and click the Record Receipt button
    const receiptButton = page.locator('button:has-text("Record Receipt")')
    await expect(receiptButton).toBeVisible({ timeout: 10000 })
    await receiptButton.click()

    // Wait for dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

    // Get all labels in order
    const labels = page.locator('[role="dialog"] label')
    const labelTexts = await labels.allTextContents()

    // Find indices of relevant labels (trimmed)
    const trimmedLabels = labelTexts.map((l) => l.trim())
    const locationIndex = trimmedLabels.findIndex((l) => l === 'Location')
    const lotNumberIndex = trimmedLabels.findIndex((l) => l === 'Lot Number')
    const expiryDateIndex = trimmedLabels.findIndex((l) => l === 'Expiry Date')
    const costPerUnitIndex = trimmedLabels.findIndex((l) => l === 'Cost/Unit')

    // Verify lot fields appear after Location and before Cost/Unit
    expect(locationIndex).toBeGreaterThan(-1)
    expect(lotNumberIndex).toBeGreaterThan(-1)
    expect(expiryDateIndex).toBeGreaterThan(-1)
    expect(costPerUnitIndex).toBeGreaterThan(-1)

    expect(lotNumberIndex).toBeGreaterThan(locationIndex)
    expect(expiryDateIndex).toBeGreaterThan(lotNumberIndex)
    expect(costPerUnitIndex).toBeGreaterThan(expiryDateIndex)
  })
})

test.describe('Receipt API Lot Capture', () => {
  test('Receipt API accepts lot data', async ({ page }) => {
    // Login to get session cookie
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Get a component ID from the API
    const componentsResponse = await page.request.get('/api/components?pageSize=1')
    expect(componentsResponse.ok()).toBeTruthy()
    const componentsData = await componentsResponse.json()
    const components = componentsData.data || []

    // Skip if no components available (test company may not have seed data)
    test.skip(components.length === 0, 'No components available - test company needs seed data')

    const componentId = components[0].id

    // Create a receipt with lot data
    const response = await page.request.post('/api/transactions/receipt', {
      data: {
        componentId,
        quantity: 5,
        supplier: 'E2E Test Supplier',
        date: toLocalDateString(new Date()),
        lotNumber: `E2E-LOT-${Date.now()}`,
        expiryDate: '2025-12-31',
      },
    })

    expect(response.ok()).toBeTruthy()
    const result = await response.json()

    // Verify the transaction was created
    expect(result).toHaveProperty('data')
    expect(result.data).toHaveProperty('id')
    expect(result.data.type).toBe('RECEIPT')

    // Verify lot info is in the response
    expect(result.data.lines).toBeDefined()
    expect(result.data.lines.length).toBeGreaterThan(0)
    expect(result.data.lines[0]).toHaveProperty('lotId')
    expect(result.data.lines[0].lot).toBeDefined()
    expect(result.data.lines[0].lot.lotNumber).toContain('E2E-LOT-')
  })
})
