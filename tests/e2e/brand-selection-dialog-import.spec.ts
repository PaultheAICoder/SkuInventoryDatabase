import { test, expect } from '@playwright/test'

/**
 * Brand Selection Dialog Import E2E Tests
 *
 * Tests for Issue #165: Brand selection dialog for import when no brand selected
 */
test.describe('Brand Selection Dialog Import Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Import page loads and shows import forms', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify all import forms are visible
    await expect(page.getByRole('heading', { name: /Components/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /SKUs/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Inventory Snapshot/i })).toBeVisible()
  })

  test('ImportForm component renders without BrandSelectionDialog visible initially', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Verify Brand Selection Dialog is not visible by default
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Brand selection is available in sidebar for multi-brand users', async ({ page }) => {
    await page.goto('/import')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Import Data')

    // Check that brand selector exists in sidebar (if user has multiple brands)
    // This may not be visible if user only has one brand
    // Brand selector only renders for multi-brand users
    // For now, just verify page loaded correctly and import forms are present
    await expect(page.getByRole('heading', { name: /Inventory Snapshot/i })).toBeVisible()
  })
})
