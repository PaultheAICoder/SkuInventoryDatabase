import { test, expect } from '@playwright/test'

/**
 * Transaction Delete Feature E2E Tests
 *
 * Tests for Issue #249 - Add ability to delete transactions
 */

test.describe('Transaction Delete Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Transaction detail page shows Delete button for admin', async ({ page }) => {
    // Navigate to transactions list
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Get first transaction link in the table
    const transactionRow = page.locator('table tbody tr').first()
    const viewLink = transactionRow.locator('a').first()

    if (await viewLink.count() > 0) {
      await viewLink.click()
      await page.waitForLoadState('networkidle')

      // Verify Delete button is visible
      const deleteButton = page.locator('button:has-text("Delete")')
      await expect(deleteButton).toBeVisible()

      // Verify it has the destructive styling (red text)
      await expect(deleteButton).toHaveClass(/text-destructive/)
    }
  })

  test('Delete button opens confirmation dialog', async ({ page }) => {
    // Navigate to transactions list
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Get first transaction link
    const transactionRow = page.locator('table tbody tr').first()
    const viewLink = transactionRow.locator('a').first()

    if (await viewLink.count() > 0) {
      await viewLink.click()
      await page.waitForLoadState('networkidle')

      // Click Delete button
      const deleteButton = page.locator('button:has-text("Delete")')
      await deleteButton.click()

      // Verify confirmation dialog opens
      const dialog = page.locator('[role="alertdialog"]')
      await expect(dialog).toBeVisible()

      // Verify dialog has expected content
      await expect(dialog.locator('h2, [class*="Title"]')).toContainText('Delete Transaction')
      await expect(dialog.locator('text=This will reverse all inventory changes')).toBeVisible()
      await expect(dialog.locator('text=This action cannot be undone')).toBeVisible()

      // Verify dialog has Cancel and Delete buttons
      await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
      await expect(page.locator('button:has-text("Delete Transaction")')).toBeVisible()
    }
  })

  test('Cancel button closes delete dialog without action', async ({ page }) => {
    // Navigate to transactions list
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Get first transaction link
    const transactionRow = page.locator('table tbody tr').first()
    const viewLink = transactionRow.locator('a').first()

    if (await viewLink.count() > 0) {
      await viewLink.click()
      await page.waitForLoadState('networkidle')

      // Get transaction ID from URL
      const url = page.url()
      const transactionId = url.split('/').pop()

      // Click Delete button
      const deleteButton = page.locator('button:has-text("Delete")')
      await deleteButton.click()

      // Verify dialog is open
      const dialog = page.locator('[role="alertdialog"]')
      await expect(dialog).toBeVisible()

      // Click Cancel
      await page.locator('button:has-text("Cancel")').click()

      // Verify dialog is closed
      await expect(dialog).not.toBeVisible()

      // Verify we're still on the same page
      expect(page.url()).toContain(transactionId)
    }
  })

  test('Delete API endpoint rejects unauthenticated requests', async ({ request }) => {
    // Make unauthenticated DELETE request to actual API
    const response = await request.delete('http://172.16.20.50:4545/api/transactions/some-fake-id')

    // Should get 401 Unauthorized (or 405 if route doesn't exist)
    // The API should not allow unauthenticated deletes
    expect([401, 405]).toContain(response.status())
  })
})

test.describe('Transaction Delete - Role Restrictions', () => {
  test('Viewer role cannot see Delete button', async ({ page }) => {
    // Login as viewer
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'viewer@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Navigate to transactions list
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Get first transaction link
    const transactionRow = page.locator('table tbody tr').first()
    const viewLink = transactionRow.locator('a').first()

    if (await viewLink.count() > 0) {
      await viewLink.click()
      await page.waitForLoadState('networkidle')

      // Verify Delete button is NOT visible for viewer
      const deleteButton = page.locator('button:has-text("Delete")')
      await expect(deleteButton).not.toBeVisible()

      // Also verify Edit button is not visible (viewer restriction)
      const editButton = page.locator('button:has-text("Edit"), a:has-text("Edit")')
      await expect(editButton).not.toBeVisible()
    }
  })
})
