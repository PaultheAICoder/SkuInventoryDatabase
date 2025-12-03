import { test, expect } from '@playwright/test'

/**
 * Inventory Snapshot Import E2E Tests
 *
 * Tests for Issue #17: Verify the Inventory Snapshot import feature
 * works correctly in the UI.
 */
test.describe('Inventory Snapshot Import Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Import page displays Inventory Snapshot form', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify Inventory Snapshot form is visible
    await expect(page.getByRole('heading', { name: /Inventory Snapshot/i })).toBeVisible()
  })

  test('Inventory Snapshot form description is visible', async ({ page }) => {
    await page.goto('/import')

    // Find the description text for Inventory Snapshot
    await expect(
      page.getByText('Import inventory snapshot from Excel file with auto-component creation and opening balances')
    ).toBeVisible()
  })

  test('Inventory Snapshot form has file input that accepts XLSX files', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Find the file input for inventory-snapshot
    const fileInput = page.locator('#file-inventory-snapshot')
    await expect(fileInput).toBeVisible()

    // Verify it accepts .xlsx files
    const accept = await fileInput.getAttribute('accept')
    expect(accept).toBe('.xlsx')
  })

  test('Inventory Snapshot form has Import button', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    // Find the Inventory Snapshot card and verify it has an import button
    const snapshotSection = page.locator('text=Inventory Snapshot (Excel)').locator('..')
    await expect(snapshotSection.getByRole('button', { name: /import/i })).toBeVisible()
  })

  test('Inventory Snapshot form shows Excel format info instead of template download', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify the format info is displayed
    await expect(page.getByText('Expected Format')).toBeVisible()
    await expect(page.getByText(/Excel file with columns/i)).toBeVisible()
    await expect(page.getByText(/Current Balance/i)).toBeVisible()
  })

  test('Inventory Snapshot form has Allow Overwrite checkbox', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify checkbox is visible using specific ID
    await expect(page.locator('#overwrite-inventory-snapshot')).toBeVisible()
  })

  test('Inventory Snapshot Allow Overwrite checkbox is unchecked by default', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify checkbox is unchecked
    const checkbox = page.locator('#overwrite-inventory-snapshot')
    await expect(checkbox).not.toBeChecked()
  })

  test('Inventory Snapshot Allow Overwrite checkbox can be toggled', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    const checkbox = page.locator('#overwrite-inventory-snapshot')

    // Initially unchecked
    await expect(checkbox).not.toBeChecked()

    // Click to check
    await checkbox.click()
    await expect(checkbox).toBeChecked()

    // Click to uncheck
    await checkbox.click()
    await expect(checkbox).not.toBeChecked()
  })

  test('Inventory Snapshot API endpoint exists', async ({ page, request }) => {
    // First login to get session
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Get cookies from the page
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')

    // Make a GET request to the API (should return 405 since only POST is allowed)
    const response = await request.get('/api/import/inventory-snapshot', {
      headers: {
        Cookie: cookieHeader
      }
    })

    // Should return 405 Method Not Allowed (GET not supported, only POST)
    expect(response.status()).toBe(405)
  })

  test('Page header mentions Excel files', async ({ page }) => {
    await page.goto('/import')

    // Check that the page mentions Excel files in main content area
    await expect(page.locator('main')).toContainText('Excel')
  })
})
