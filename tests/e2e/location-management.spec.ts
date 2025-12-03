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
    await expect(rows).toHaveCount(1)

    // Default badge should be visible
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

    // Click on the type select to open options
    const typeSelect = page.locator('button[role="combobox"]').first()
    await typeSelect.click()

    // Wait for dropdown to open
    await page.waitForTimeout(300)

    // Verify all location types are present (use role=option for dropdown items)
    await expect(
      page.locator('[role="option"]:has-text("Warehouse")')
    ).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("3PL")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("FBA")')).toBeVisible()
    await expect(
      page.locator('[role="option"]:has-text("Finished Goods")')
    ).toBeVisible()
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
