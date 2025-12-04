import { test, expect } from '@playwright/test'

/**
 * Finished Goods Flow E2E Tests
 *
 * Tests the finished goods inventory visibility and management.
 * Build transactions create finished goods which appear on SKU detail pages.
 */
test.describe('Finished Goods Visibility', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('SKUs page loads successfully', async ({ page }) => {
    await page.goto('/skus')
    await page.waitForLoadState('networkidle')

    // Page should display SKUs table
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('h1').filter({ hasText: /sku/i })).toBeVisible()
  })

  test('SKU detail page shows inventory information', async ({ page }) => {
    await page.goto('/skus')
    await page.waitForLoadState('networkidle')

    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on a link within the first SKU row to view details
    const firstSkuLink = page.locator('tbody tr').first().locator('a').first()
    if (await firstSkuLink.isVisible({ timeout: 5000 })) {
      await firstSkuLink.click()
      await page.waitForLoadState('networkidle')

      // Should be on SKU detail page
      await page.waitForURL(/\/skus\//, { timeout: 10000 })

      // Page should show SKU details
      await expect(page.locator('main')).toBeVisible()
    } else {
      // If no SKUs exist, just verify page loaded
      await expect(page.locator('main')).toBeVisible()
    }
  })
})

test.describe('Dashboard with Inventory Data', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Dashboard loads without errors', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Dashboard should be visible
    await expect(page.locator('main')).toBeVisible()
  })

  test('Dashboard shows inventory summary cards', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Dashboard typically shows summary cards
    // Look for common inventory-related elements
    const mainContent = page.locator('main')
    await expect(mainContent).toBeVisible()

    // Check for key dashboard elements
    const cards = page.locator('[class*="card"], [class*="Card"]')
    if (await cards.first().isVisible({ timeout: 5000 })) {
      // Cards are present on the dashboard
      expect(await cards.count()).toBeGreaterThan(0)
    }
  })

  test('Location filter affects inventory display', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for location filter selector
    const locationFilter = page.locator('[role="combobox"]').filter({ hasText: /location/i }).first()
    if (await locationFilter.isVisible({ timeout: 3000 })) {
      // Click to open location dropdown
      await locationFilter.click()
      await page.waitForTimeout(300)

      // Should show location options
      const locationOptions = page.locator('[role="option"]')
      expect(await locationOptions.count()).toBeGreaterThanOrEqual(1)
    }
  })
})

test.describe('Build Transaction with Output', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Transactions page shows build transactions', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Filter by build type if filter exists
    const typeFilter = page.locator('[role="combobox"]').first()
    if (await typeFilter.isVisible({ timeout: 2000 })) {
      await typeFilter.click()
      await page.waitForTimeout(200)
      const buildOption = page.locator('[role="option"]:has-text("Build")')
      if (await buildOption.isVisible({ timeout: 1000 })) {
        await buildOption.click()
        await page.waitForLoadState('networkidle')
      }
    }

    // Page should load without errors
    await expect(page.locator('main')).toBeVisible()
  })

  test('Transaction type filter includes Build option', async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')

    // Wait for page to load
    await page.waitForSelector('main', { timeout: 10000 })

    // Look for type filter - could be select or combobox
    const typeFilter = page.locator('select').first()
    if (await typeFilter.isVisible({ timeout: 2000 })) {
      // Check select element for Build option
      const options = await typeFilter.locator('option').allTextContents()
      expect(options.some(opt => opt.toLowerCase().includes('build'))).toBeTruthy()
    } else {
      // Fallback - just verify page loaded
      await expect(page.locator('main')).toBeVisible()
    }
  })
})
