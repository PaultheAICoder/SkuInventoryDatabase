import { test, expect } from '@playwright/test'

/**
 * Settings Integration E2E Tests
 *
 * Tests that verify the settings page functionality
 * and admin-only access controls.
 */
test.describe('Settings Access Control', () => {
  test('Admin can access settings page', async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Navigate to settings
    await page.goto('/settings')
    await expect(page.locator('h1, h2').first()).toBeVisible()

    // Should see settings form
    await expect(page.locator('form').first()).toBeVisible()
  })

  test('Settings API returns data for admin', async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Call settings API
    const response = await page.request.get('/api/settings')
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data.data).toBeDefined()
    // Settings are nested inside data.settings
    expect(data.data.settings).toBeDefined()
    expect(data.data.settings.allowNegativeInventory).toBeDefined()
    expect(data.data.settings.reorderWarningMultiplier).toBeDefined()
  })
})

test.describe('Settings Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Settings page displays current values', async ({ page }) => {
    await page.goto('/settings')

    // Wait for form to load
    await page.waitForSelector('form', { timeout: 10000 })

    // Check that form inputs exist
    // These selectors depend on the actual form implementation
    const formInputs = page.locator('input, select')
    expect(await formInputs.count()).toBeGreaterThan(0)
  })

  test('Settings API PATCH updates values', async ({ page }) => {
    // Get current settings
    const getResponse = await page.request.get('/api/settings')
    expect(getResponse.status()).toBe(200)
    const currentSettings = await getResponse.json()

    // Settings are nested inside data.settings
    const currentMultiplier = currentSettings.data.settings.reorderWarningMultiplier

    // Try to update a setting
    const newMultiplier = currentMultiplier === 1.5 ? 2.0 : 1.5

    const patchResponse = await page.request.patch('/api/settings', {
      data: {
        reorderWarningMultiplier: newMultiplier,
      },
    })
    expect(patchResponse.status()).toBe(200)

    // Verify the change
    const verifyResponse = await page.request.get('/api/settings')
    const updatedSettings = await verifyResponse.json()
    expect(updatedSettings.data.settings.reorderWarningMultiplier).toBe(newMultiplier)

    // Restore original value
    await page.request.patch('/api/settings', {
      data: {
        reorderWarningMultiplier: currentMultiplier,
      },
    })
  })

  test('Settings validation rejects invalid values', async ({ page }) => {
    // Try to set negative defaultLeadTimeDays
    const patchResponse = await page.request.patch('/api/settings', {
      data: {
        defaultLeadTimeDays: -5,
      },
    })
    expect(patchResponse.status()).toBe(400)

    const errorData = await patchResponse.json()
    // API returns "Validation failed" error message
    expect(errorData.error).toBe('Validation failed')
  })

  test('Settings validation rejects zero multiplier', async ({ page }) => {
    // Try to set zero reorderWarningMultiplier
    const patchResponse = await page.request.patch('/api/settings', {
      data: {
        reorderWarningMultiplier: 0,
      },
    })
    expect(patchResponse.status()).toBe(400)
  })
})

test.describe('Settings Role Restrictions', () => {
  test('Ops user cannot access settings API', async ({ page }) => {
    // Login as ops
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'ops@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Try to access settings API
    const response = await page.request.get('/api/settings')
    expect(response.status()).toBe(403)
  })

  test('Viewer user cannot access settings API', async ({ page }) => {
    // Login as viewer
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'viewer@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })

    // Try to access settings API
    const response = await page.request.get('/api/settings')
    expect(response.status()).toBe(403)
  })
})

test.describe('User Management (Admin Only)', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Admin can access users list', async ({ page }) => {
    await page.goto('/settings/users')

    // Should see users list or table
    await expect(page.locator('table, [role="list"]').first()).toBeVisible()
  })

  test('Users API returns list for admin', async ({ page }) => {
    const response = await page.request.get('/api/users')
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data.data).toBeDefined()
    expect(Array.isArray(data.data)).toBe(true)
  })
})
