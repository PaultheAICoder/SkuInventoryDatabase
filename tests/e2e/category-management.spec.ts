import { test, expect } from '@playwright/test'

/**
 * Category Management E2E Tests
 *
 * These tests verify the Category management feature for
 * component categorization (Issue #168).
 */
test.describe('Category Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Category management page is accessible from settings', async ({
    page,
  }) => {
    await page.goto('/settings/categories')
    await page.waitForLoadState('networkidle')

    // Verify the page title
    await expect(page.locator('h1')).toContainText('Category Management')

    // Verify the page loaded successfully
    await expect(page.locator('main')).toBeVisible()
  })

  test('Category page displays Add Category button', async ({ page }) => {
    await page.goto('/settings/categories')
    await page.waitForLoadState('networkidle')

    // Look for add button
    const addButton = page.locator(
      'a[href="/settings/categories/new"], button:has-text("Add Category")'
    )
    await expect(addButton.first()).toBeVisible()
  })

  test('Category page displays filter controls', async ({ page }) => {
    await page.goto('/settings/categories')
    await page.waitForLoadState('networkidle')

    // Look for search input
    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible()
  })

  test('Category page displays status filter', async ({ page }) => {
    await page.goto('/settings/categories')
    await page.waitForLoadState('networkidle')

    // Look for status filter - it should be a select/combobox
    const statusFilter = page.locator('button[role="combobox"]').filter({ hasText: /All Status|Active|Inactive/ })
    await expect(statusFilter).toBeVisible()
  })

  test('Can navigate to new category form', async ({ page }) => {
    await page.goto('/settings/categories')
    await page.waitForLoadState('networkidle')

    // Click add button
    const addButton = page.locator(
      'a[href="/settings/categories/new"], button:has-text("Add Category")'
    )
    await addButton.first().click()

    await page.waitForURL(/\/settings\/categories\/new/, { timeout: 10000 })

    // Verify form is displayed
    await expect(page.locator('form').first()).toBeVisible()

    // Verify form title
    await expect(page.locator('h1:has-text("Create Category")')).toBeVisible()
  })

  test('New category form has required fields', async ({ page }) => {
    await page.goto('/settings/categories/new')
    await page.waitForLoadState('networkidle')

    // Verify name input exists
    const nameInput = page.locator('input[name="name"], #name')
    await expect(nameInput).toBeVisible()

    // Verify submit button exists
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible()

    // Verify cancel button exists
    const cancelButton = page.locator('button:has-text("Cancel")')
    await expect(cancelButton).toBeVisible()
  })

  test('Categories API endpoint exists', async ({ page }) => {
    await page.goto('/settings/categories')
    await page.waitForLoadState('networkidle')

    // Wait a moment for API call to complete
    await page.waitForTimeout(2000)

    // Check for either table or empty state message
    const table = page.locator('table')
    const emptyState = page.locator('text=No categories found')
    const isTableVisible = await table.isVisible().catch(() => false)
    const isEmptyVisible = await emptyState.isVisible().catch(() => false)
    expect(isTableVisible || isEmptyVisible).toBeTruthy()
  })
})

test.describe('Category CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Create new category', async ({ page }) => {
    await page.goto('/settings/categories/new')
    await page.waitForLoadState('networkidle')

    // Wait for form to load
    await page.waitForSelector('form', { timeout: 10000 })

    // Fill in the form
    const testName = `Test Category ${Date.now()}`
    await page.fill('#name', testName)

    // Submit form
    await page.click('button[type="submit"]')

    // Should redirect to categories list
    await page.waitForURL('/settings/categories', { timeout: 10000 })

    // Verify new category appears in the list
    await expect(page.locator(`text=${testName}`)).toBeVisible()
  })

  test('Edit existing category', async ({ page }) => {
    // First create a category
    await page.goto('/settings/categories/new')
    await page.waitForLoadState('networkidle')

    const originalName = `Edit Test ${Date.now()}`
    await page.fill('#name', originalName)
    await page.click('button[type="submit"]')
    await page.waitForURL('/settings/categories', { timeout: 10000 })

    // Click edit via dropdown menu on the new category
    const row = page.locator(`tr:has-text("${originalName}")`)
    // Open the dropdown menu (MoreHorizontal button)
    await row.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)
    // Click Edit option in dropdown
    await page.click('[role="menuitem"]:has-text("Edit")')

    // Should be on edit page
    await page.waitForURL(/\/settings\/categories\/[a-zA-Z0-9-]+\/edit/, { timeout: 10000 })

    // Change the name
    const updatedName = `Updated ${Date.now()}`
    await page.fill('#name', '')
    await page.fill('#name', updatedName)
    await page.click('button[type="submit"]')

    // Verify update in list
    await page.waitForURL('/settings/categories', { timeout: 10000 })
    await expect(page.locator(`text=${updatedName}`)).toBeVisible()
    await expect(page.locator(`text=${originalName}`)).not.toBeVisible()
  })

  test('Deactivate category', async ({ page }) => {
    // First create a category
    await page.goto('/settings/categories/new')
    await page.waitForLoadState('networkidle')

    const categoryName = `Deactivate Test ${Date.now()}`
    await page.fill('#name', categoryName)
    await page.click('button[type="submit"]')
    await page.waitForURL('/settings/categories', { timeout: 10000 })

    // Find and click deactivate via dropdown menu
    const row = page.locator(`tr:has-text("${categoryName}")`)
    // Open the dropdown menu
    await row.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)
    // Click Deactivate option in dropdown
    await page.click('[role="menuitem"]:has-text("Deactivate")')

    await page.waitForLoadState('networkidle')

    // Category should now show as inactive
    const updatedRow = page.locator(`tr:has-text("${categoryName}")`)
    await expect(updatedRow).toContainText(/inactive/i)
  })

  test('Reactivate inactive category', async ({ page }) => {
    // First create and deactivate a category
    await page.goto('/settings/categories/new')
    await page.waitForLoadState('networkidle')

    const categoryName = `Reactivate Test ${Date.now()}`
    await page.fill('#name', categoryName)
    await page.click('button[type="submit"]')
    await page.waitForURL('/settings/categories', { timeout: 10000 })

    // Deactivate first
    const row = page.locator(`tr:has-text("${categoryName}")`)
    await row.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)
    await page.click('[role="menuitem"]:has-text("Deactivate")')
    await page.waitForLoadState('networkidle')

    // Now reactivate
    const inactiveRow = page.locator(`tr:has-text("${categoryName}")`)
    await inactiveRow.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)
    await page.click('[role="menuitem"]:has-text("Activate")')
    await page.waitForLoadState('networkidle')

    // Category should now show as active
    const activeRow = page.locator(`tr:has-text("${categoryName}")`)
    await expect(activeRow).toContainText(/active/i)
    await expect(activeRow).not.toContainText(/inactive/i)
  })
})

test.describe('Category Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Categories link is visible in sidebar for admin', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for Categories nav item
    const categoriesLink = page.locator('a[href="/settings/categories"]')
    await expect(categoriesLink).toBeVisible()
  })

  test('Categories nav item has FolderTree icon', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The nav item should contain an SVG icon
    const categoriesLink = page.locator('a[href="/settings/categories"]')
    const svg = categoriesLink.locator('svg')
    await expect(svg).toBeVisible()
  })
})

test.describe('Category Admin-Only Access', () => {
  test('Non-admin users cannot see Categories link', async ({ page }) => {
    // Login as ops user (non-admin)
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'ops@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    await page.waitForLoadState('networkidle')

    // Categories link should NOT be visible for non-admin
    const categoriesLink = page.locator('a[href="/settings/categories"]')
    await expect(categoriesLink).not.toBeVisible()
  })

  test('Non-admin users get 403 from categories API', async ({ page }) => {
    // Login as ops user (non-admin)
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'ops@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Try to access categories API directly
    const response = await page.request.get('/api/categories')
    expect(response.status()).toBe(403)
  })
})
