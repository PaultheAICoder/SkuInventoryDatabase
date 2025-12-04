import { test, expect } from '@playwright/test'

/**
 * Location Management E2E Tests
 *
 * These tests verify the Location management feature for
 * multi-location inventory tracking (Phase 1).
 */
test.describe('Location Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Location management page is accessible from settings', async ({
    page,
  }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Verify the page title
    await expect(page.locator('h1')).toContainText('Location Management')

    // Verify the page loaded successfully
    await expect(page.locator('main')).toBeVisible()
  })

  test('Location page displays Add Location button', async ({ page }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Look for add button
    const addButton = page.locator(
      'a[href="/settings/locations/new"], button:has-text("Add Location")'
    )
    await expect(addButton.first()).toBeVisible()
  })

  test('Location page displays filter controls', async ({ page }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Look for search input
    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible()
  })

  test('Location page displays location table', async ({ page }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 })

    const table = page.locator('table')
    await expect(table).toBeVisible()

    // Verify table headers
    const headers = page.locator('thead th')
    await expect(headers).toHaveCount(5) // Name, Type, Status, Default, Actions
  })

  test('Location table displays default location', async ({ page }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 })

    // Should have at least one row (default location created by migration)
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)

    // Default badge should be visible (at least one location is default)
    const defaultBadge = page.locator('text=Default').first()
    await expect(defaultBadge).toBeVisible()
  })

  test('Can navigate to new location form', async ({ page }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Click add button
    const addButton = page.locator(
      'a[href="/settings/locations/new"], button:has-text("Add Location")'
    )
    await addButton.first().click()

    await page.waitForURL(/\/settings\/locations\/new/, { timeout: 10000 })

    // Verify form is displayed
    await expect(page.locator('form').first()).toBeVisible()

    // Verify form title (use h1 specifically to avoid strict mode)
    await expect(page.locator('h1:has-text("Create Location")')).toBeVisible()
  })

  test('New location form has all required fields', async ({ page }) => {
    await page.goto('/settings/locations/new')
    await page.waitForLoadState('networkidle')

    // Verify name input exists
    const nameInput = page.locator('input[name="name"], #name')
    await expect(nameInput).toBeVisible()

    // Verify type select exists
    const typeSelect = page.locator('button:has-text("Warehouse")')
    await expect(typeSelect).toBeVisible()

    // Verify notes textarea exists
    const notesTextarea = page.locator('textarea')
    await expect(notesTextarea).toBeVisible()

    // Verify submit button exists
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible()
  })

  test('Locations API endpoint exists', async ({ page }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Wait for table to load - this implicitly tests that the API is working
    await page.waitForSelector('table', { timeout: 10000 })

    // If we have a table with data, the API is working
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)
  })

  test('Location type select has all options', async ({ page }) => {
    await page.goto('/settings/locations/new')
    await page.waitForLoadState('networkidle')

    // Wait for form to load
    await page.waitForSelector('form', { timeout: 10000 })

    // The form has Name and Type fields - the type select shows "Warehouse" by default
    // Find the select that contains "Warehouse" text (the type selector)
    const typeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Warehouse' })
    await expect(typeSelect).toBeVisible({ timeout: 5000 })
    await typeSelect.click()

    // Wait for dropdown to animate open
    await page.waitForTimeout(500)

    // Check that multiple options are available
    const options = page.locator('[role="option"]')
    const optionCount = await options.count()
    expect(optionCount).toBeGreaterThanOrEqual(4) // warehouse, 3pl, fba, finished_goods
  })
})

test.describe('Location CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Create new location with all fields', async ({ page }) => {
    await page.goto('/settings/locations/new')
    await page.waitForLoadState('networkidle')

    // Wait for form to load
    await page.waitForSelector('form', { timeout: 10000 })

    // Fill in the form
    const testName = `Test Location ${Date.now()}`
    await page.fill('#name', testName)

    // Select type - the type select shows "Warehouse" by default
    const typeSelect = page.locator('button[role="combobox"]').filter({ hasText: 'Warehouse' })
    await typeSelect.click()
    await page.waitForTimeout(500)

    // Click on an option (3PL)
    const option = page.locator('[role="option"]').filter({ hasText: '3PL' })
    await option.click()

    // Add notes
    await page.fill('textarea', 'This is a test location for E2E testing')

    // Submit form
    await page.click('button[type="submit"]')

    // Should redirect to locations list
    await page.waitForURL('/settings/locations', { timeout: 10000 })

    // Verify new location appears in the list
    await expect(page.locator(`text=${testName}`)).toBeVisible()
  })

  test('Edit existing location', async ({ page }) => {
    // First create a location
    await page.goto('/settings/locations/new')
    await page.waitForLoadState('networkidle')

    const originalName = `Edit Test ${Date.now()}`
    await page.fill('#name', originalName)
    await page.click('button[type="submit"]')
    await page.waitForURL('/settings/locations', { timeout: 10000 })

    // Click edit via dropdown menu on the new location
    const row = page.locator(`tr:has-text("${originalName}")`)
    // Open the dropdown menu (MoreHorizontal button)
    await row.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)
    // Click Edit option in dropdown
    await page.click('[role="menuitem"]:has-text("Edit")')

    // Should be on edit page
    await page.waitForURL(/\/settings\/locations\/[a-zA-Z0-9-]+\/edit/, { timeout: 10000 })

    // Change the name
    const updatedName = `Updated ${Date.now()}`
    await page.fill('#name', '')
    await page.fill('#name', updatedName)
    await page.click('button[type="submit"]')

    // Verify update in list
    await page.waitForURL('/settings/locations', { timeout: 10000 })
    await expect(page.locator(`text=${updatedName}`)).toBeVisible()
    await expect(page.locator(`text=${originalName}`)).not.toBeVisible()
  })

  test('Deactivate non-default location', async ({ page }) => {
    // First create a location
    await page.goto('/settings/locations/new')
    await page.waitForLoadState('networkidle')

    const locationName = `Deactivate Test ${Date.now()}`
    await page.fill('#name', locationName)
    await page.click('button[type="submit"]')
    await page.waitForURL('/settings/locations', { timeout: 10000 })

    // Find and click deactivate via dropdown menu
    const row = page.locator(`tr:has-text("${locationName}")`)
    // Open the dropdown menu
    await row.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)
    // Click Deactivate option in dropdown
    await page.click('[role="menuitem"]:has-text("Deactivate")')

    await page.waitForLoadState('networkidle')

    // Location should now show as inactive
    const updatedRow = page.locator(`tr:has-text("${locationName}")`)
    await expect(updatedRow).toContainText(/inactive/i)
  })

  test('Cannot deactivate default location', async ({ page }) => {
    await page.goto('/settings/locations')
    await page.waitForLoadState('networkidle')

    // Find the default location row (has "Default" badge)
    const defaultRow = page.locator('tr').filter({ has: page.locator('text=Default') })

    // Open the dropdown menu on the default location
    await defaultRow.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)

    // Deactivate option should NOT be present in the dropdown for default location
    // The dropdown menu only shows Edit for default locations
    const deactivateOption = page.locator('[role="menuitem"]:has-text("Deactivate")')
    await expect(deactivateOption).toHaveCount(0)
  })

  test('Set location as default', async ({ page }) => {
    // First create a non-default location
    await page.goto('/settings/locations/new')
    await page.waitForLoadState('networkidle')

    const locationName = `Default Test ${Date.now()}`
    await page.fill('#name', locationName)
    await page.click('button[type="submit"]')
    await page.waitForURL('/settings/locations', { timeout: 10000 })

    // Find and click "Set as Default" via dropdown menu
    const row = page.locator(`tr:has-text("${locationName}")`)
    // Open the dropdown menu
    await row.locator('button:has(svg)').last().click()
    await page.waitForTimeout(200)
    // Click Set as Default option in dropdown
    await page.click('[role="menuitem"]:has-text("Set as Default")')

    await page.waitForLoadState('networkidle')

    // New location should now have Default badge
    const updatedRow = page.locator(`tr:has-text("${locationName}")`)
    await expect(updatedRow).toContainText('Default')
  })
})

test.describe('Location Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Locations link is visible in sidebar for admin', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for Locations nav item
    const locationsLink = page.locator('a[href="/settings/locations"]')
    await expect(locationsLink).toBeVisible()
  })

  test('Locations nav item has MapPin icon', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The nav item should contain the MapPin icon (SVG)
    const locationsLink = page.locator('a[href="/settings/locations"]')
    const svg = locationsLink.locator('svg')
    await expect(svg).toBeVisible()
  })
})
