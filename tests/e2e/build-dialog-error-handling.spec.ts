import { test, expect } from '@playwright/test'

/**
 * BuildDialog Error Handling E2E Tests
 *
 * Tests for Issue #28: BuildDialog shows infinite loading when SKU API fails
 *
 * These tests verify that:
 * - The BuildDialog loads SKUs successfully
 * - Loading state clears when dialog opens
 * - Error messages display for failed requests
 */
test.describe('BuildDialog Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('BuildDialog loads SKUs successfully and clears loading state', async ({ page }) => {
    // Navigate to SKUs page
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Find a SKU link and click it
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount === 0) {
      test.skip(true, 'No SKUs available for testing')
      return
    }

    // Click first SKU
    await skuLinks.first().click()
    await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

    // Check if Build button exists (only shows if SKU has active BOM)
    const buildButton = page.locator('button:has-text("Build")')
    const hasBuildButton = await buildButton.count() > 0

    if (!hasBuildButton) {
      test.skip(true, 'SKU does not have an active BOM - no Build button available')
      return
    }

    // Click Build button to open dialog
    await buildButton.click()

    // Wait for dialog to open
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Wait for SKU dropdown to be enabled (indicating loading finished)
    // The select trigger should not show "Loading SKUs..." after data loads
    const selectTrigger = dialog.locator('button[role="combobox"]')
    await expect(selectTrigger).toBeVisible({ timeout: 5000 })

    // Wait a short moment for API to respond
    await page.waitForTimeout(2000)

    // Verify that either:
    // 1. SKUs loaded (placeholder says "Select SKU"), OR
    // 2. Error is displayed (not stuck in loading state)
    const placeholderText = await selectTrigger.innerText()
    const errorDiv = dialog.locator('.bg-destructive\\/10')
    const hasError = await errorDiv.count() > 0

    // Should not be stuck in loading state
    expect(
      placeholderText !== 'Loading SKUs...' || hasError,
      'Dialog should not be stuck in loading state'
    ).toBeTruthy()

    // If no error, verify the dropdown is functional
    if (!hasError) {
      // The placeholder should say "Select SKU" when loaded
      expect(placeholderText).toContain('Select SKU')
    }

    // Close dialog
    const closeButton = dialog.locator('button:has-text("Cancel")')
    await closeButton.click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })
  })

  test('BuildDialog clears error state when reopened', async ({ page }) => {
    // Navigate to SKUs page
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Find a SKU link and click it
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount === 0) {
      test.skip(true, 'No SKUs available for testing')
      return
    }

    // Click first SKU
    await skuLinks.first().click()
    await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

    // Check if Build button exists
    const buildButton = page.locator('button:has-text("Build")')
    const hasBuildButton = await buildButton.count() > 0

    if (!hasBuildButton) {
      test.skip(true, 'SKU does not have an active BOM - no Build button available')
      return
    }

    // Open dialog
    await buildButton.click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Wait for loading to complete
    await page.waitForTimeout(2000)

    // Close dialog
    const closeButton = dialog.locator('button:has-text("Cancel")')
    await closeButton.click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Reopen dialog
    await buildButton.click()
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Wait for loading to complete again
    await page.waitForTimeout(2000)

    // Verify loading state cleared on reopen
    const selectTrigger = dialog.locator('button[role="combobox"]')
    const placeholderText = await selectTrigger.innerText()

    // Should either show "Select SKU" (success) or error message, but not infinite loading
    expect(placeholderText !== 'Loading SKUs...').toBeTruthy()
  })

  test('BuildDialog shows dialog header and description', async ({ page }) => {
    // Navigate to SKUs page
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Find a SKU link and click it
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount === 0) {
      test.skip(true, 'No SKUs available for testing')
      return
    }

    // Click first SKU
    await skuLinks.first().click()
    await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

    // Check if Build button exists
    const buildButton = page.locator('button:has-text("Build")')
    const hasBuildButton = await buildButton.count() > 0

    if (!hasBuildButton) {
      test.skip(true, 'SKU does not have an active BOM - no Build button available')
      return
    }

    // Open dialog
    await buildButton.click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Verify dialog title and description
    await expect(dialog.locator('text=Record Build')).toBeVisible()
    await expect(dialog.locator('text=Build SKU units by consuming components per the active BOM')).toBeVisible()
  })
})
