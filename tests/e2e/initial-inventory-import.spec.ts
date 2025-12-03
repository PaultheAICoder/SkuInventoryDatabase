import { test, expect } from '@playwright/test'

/**
 * Initial Inventory Import E2E Tests
 *
 * Tests for Issue #8: Verify the Initial Inventory import feature
 * works correctly in the UI.
 */
test.describe('Initial Inventory Import Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Import page displays Initial Inventory form', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify Initial Inventory form is visible
    await expect(page.getByRole('heading', { name: 'Initial Inventory' })).toBeVisible()
  })

  test('Import page shows all four import forms', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify all four import form headings are visible
    await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'SKUs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Initial Inventory' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Inventory Snapshot/i })).toBeVisible()
  })

  test('Import forms have download template and upload buttons', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Count the number of "Template" buttons - should be 3 (Components, SKUs, Initial Inventory)
    // Note: Inventory Snapshot uses Excel format info instead of template download
    const downloadButtons = page.getByRole('button', { name: /template/i })
    await expect(downloadButtons).toHaveCount(3)

    // Count the number of file inputs - should be 4 (one for each form)
    const fileInputs = page.locator('input[type="file"]')
    await expect(fileInputs).toHaveCount(4)

    // Verify Import buttons - should be 4 (one for each form)
    const importButtons = page.getByRole('button', { name: /import/i })
    await expect(importButtons).toHaveCount(4)
  })

  test('Page header mentions initial inventory', async ({ page }) => {
    await page.goto('/import')

    // Check that the page mentions initial inventory in main content area
    await expect(page.locator('main')).toContainText('initial inventory')
  })

  test('Initial Inventory card displays correct description', async ({ page }) => {
    await page.goto('/import')

    // Find the description text for Initial Inventory
    await expect(
      page.getByText('Set opening balances for existing components with quantities and optional costs')
    ).toBeVisible()
  })

  test('Initial Inventory form displays "Allow Overwrite" checkbox', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify Initial Inventory checkbox is visible (using specific ID)
    await expect(page.locator('#overwrite-initial-inventory')).toBeVisible()
  })

  test('Allow Overwrite checkbox is unchecked by default', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify Initial Inventory checkbox is unchecked (using specific ID)
    const checkbox = page.locator('#overwrite-initial-inventory')
    await expect(checkbox).not.toBeChecked()
  })

  test('Allow Overwrite checkbox can be toggled', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    // Use specific ID for Initial Inventory checkbox
    const checkbox = page.locator('#overwrite-initial-inventory')

    // Initially unchecked
    await expect(checkbox).not.toBeChecked()

    // Click to check
    await checkbox.click()
    await expect(checkbox).toBeChecked()

    // Click to uncheck
    await checkbox.click()
    await expect(checkbox).not.toBeChecked()
  })

  test('Allow Overwrite checkbox appears for Initial Inventory and Inventory Snapshot forms', async ({ page }) => {
    await page.goto('/import')

    await expect(page.locator('h1')).toContainText('Import Data')

    // There should be exactly 2 "Allow Overwrite" checkboxes (Initial Inventory and Inventory Snapshot)
    const checkboxes = page.getByLabel('Allow Overwrite')
    await expect(checkboxes).toHaveCount(2)

    // Verify each specific checkbox exists
    await expect(page.locator('#overwrite-initial-inventory')).toBeVisible()
    await expect(page.locator('#overwrite-inventory-snapshot')).toBeVisible()
  })
})
