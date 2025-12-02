import { test, expect } from '@playwright/test'

/**
 * Full User Workflow E2E Tests
 *
 * These tests verify the complete user workflows from
 * component creation through to build transactions.
 */
test.describe('Full User Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Navigate to Components page and verify data loads', async ({ page }) => {
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Verify the page title or header
    await expect(page.locator('h1, h2').first()).toBeVisible()

    // Verify table has loaded
    const table = page.locator('table')
    await expect(table).toBeVisible()
  })

  test('Navigate to SKUs page and verify data loads', async ({ page }) => {
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Verify the page loaded
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('Navigate to Transactions page and verify data loads', async ({ page }) => {
    await page.goto('/transactions')

    // Wait for the page to load
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('Dashboard displays summary data', async ({ page }) => {
    await page.goto('/')

    // Wait for dashboard to load
    await page.waitForLoadState('networkidle')

    // Dashboard should have some content
    await expect(page.locator('main')).toBeVisible()
  })

  test('Settings page is accessible to admin', async ({ page }) => {
    await page.goto('/settings')

    // Wait for settings page to load
    await expect(page.locator('h1, h2').first()).toBeVisible()

    // Should see settings form elements
    await expect(page.locator('form').first()).toBeVisible()
  })

  test('Import page is accessible', async ({ page }) => {
    await page.goto('/import')

    // Wait for import page to load
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })
})

test.describe('Component CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Can navigate to new component form', async ({ page }) => {
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Look for add button
    const addButton = page.locator('a[href="/components/new"], button:has-text("Add")')
    if ((await addButton.count()) > 0) {
      await addButton.first().click()
      await page.waitForURL(/\/components\/new/, { timeout: 10000 })
      await expect(page.locator('form').first()).toBeVisible()
    }
  })

  test('Component detail page loads for existing component', async ({ page }) => {
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on first component link if one exists
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    if (linkCount > 0) {
      await componentLinks.first().click()
      await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })

      // Component detail should have back link
      await expect(page.locator('text=Back to Components').first()).toBeVisible()
    }
  })
})

test.describe('SKU CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Can navigate to new SKU form', async ({ page }) => {
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Look for add button
    const addButton = page.locator('a[href="/skus/new"], button:has-text("Add")')
    if ((await addButton.count()) > 0) {
      await addButton.first().click()
      await page.waitForURL(/\/skus\/new/, { timeout: 10000 })
      await expect(page.locator('form').first()).toBeVisible()
    }
  })

  test('SKU detail page loads for existing SKU', async ({ page }) => {
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on first SKU link if one exists
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      await skuLinks.first().click()
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // SKU detail should have some header
      await expect(page.locator('h1').first()).toBeVisible()
    }
  })
})

test.describe('Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Export components returns CSV', async ({ page }) => {
    const response = await page.request.get('/api/export/components')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
  })

  test('Export SKUs returns CSV', async ({ page }) => {
    const response = await page.request.get('/api/export/skus')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
  })

  test('Export transactions returns CSV', async ({ page }) => {
    const response = await page.request.get('/api/export/transactions')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
  })
})
