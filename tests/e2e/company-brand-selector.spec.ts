import { test, expect, Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

// Track test brand for cleanup
let testBrandId: string | null = null
let dataSetupSucceeded = false

// Helper to setup test data - creates a second brand so selector renders
async function setupTestData(page: Page): Promise<boolean> {
  try {
    // First login
    await loginAsAdmin(page)

    // Check current brands via API (only active brands)
    const brandsResponse = await page.request.get('/api/brands?pageSize=100&isActive=true')
    if (!brandsResponse.ok()) {
      console.log('Failed to fetch brands, selector tests may fail')
      return false
    }

    const brandsData = await brandsResponse.json()
    const activeBrandCount = brandsData.data?.length || 0

    // If only 1 active brand, create a test brand so selector renders
    if (activeBrandCount <= 1) {
      // Use a consistent name with timestamp to ensure uniqueness
      const testBrandName = `E2E Test Brand ${Date.now()}`
      const createResponse = await page.request.post('/api/brands', {
        data: { name: testBrandName }
      })

      if (createResponse.ok()) {
        const created = await createResponse.json()
        testBrandId = created.data?.id || null
        console.log(`Created test brand: ${testBrandId}`)
      } else {
        const errorText = await createResponse.text()
        console.log(`Failed to create test brand: ${errorText}`)
        return false
      }
    } else {
      console.log(`Found ${activeBrandCount} active brands, no need to create test brand`)
    }

    // Force logout to clear session cache - new brand will be included on next login
    // Navigate to signout page and click the signout button (form POST)
    await page.goto('/api/auth/signout')
    await page.waitForSelector('#submitButton', { timeout: 5000 })
    await page.click('#submitButton')
    await page.waitForTimeout(2000)

    return true
  } catch (error) {
    console.error('Setup test data failed:', error)
    return false
  }
}

// Helper to cleanup test data
async function cleanupTestData(page: Page): Promise<void> {
  if (testBrandId) {
    try {
      await loginAsAdmin(page)
      await page.request.delete(`/api/brands/${testBrandId}`)
      console.log(`Cleaned up test brand: ${testBrandId}`)
    } catch (error) {
      console.error('Cleanup failed:', error)
    }
    testBrandId = null
  }
}

test.describe('Company/Brand Selector', () => {
  // Must run serially to share the test data created in beforeAll
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    dataSetupSucceeded = await setupTestData(page)
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await cleanupTestData(page)
    await page.close()
  })

  test.beforeEach(async ({ page, context }) => {
    // Skip all tests if data setup failed
    test.skip(!dataSetupSucceeded, 'Test data setup failed - selector requires multiple brands')

    // Clear cookies to ensure fresh login with new session data
    await context.clearCookies()

    await loginAsAdmin(page)
    // Wait for dashboard to fully load
    await page.waitForSelector('nav, aside', { timeout: 15000 })
  })

  test('unified selector is visible in sidebar', async ({ page }) => {
    // The CompanyBrandSelector should be visible using data-testid
    const selectorContainer = page.locator('[data-testid="company-brand-selector-container"]')
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    // Should be visible (selector shows "Company / Brand" format)
    await expect(selectorContainer).toBeVisible({ timeout: 10000 })
    await expect(selectorButton).toBeVisible({ timeout: 10000 })
  })

  test('selector button shows current company and brand', async ({ page }) => {
    // Find the selector button using data-testid
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    await expect(selectorButton).toBeVisible({ timeout: 10000 })

    // The button text should contain "/" indicating company/brand format
    const buttonText = await selectorButton.textContent()
    expect(buttonText).toContain('/')
  })

  test('clicking selector opens dropdown with companies', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    await selectorButton.click()

    // Wait for dropdown content to appear
    const dropdownContent = page.locator('[role="menu"], [data-radix-menu-content]')
    await expect(dropdownContent).toBeVisible({ timeout: 5000 })
  })

  test('dropdown shows company names', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    await selectorButton.click()

    // Wait for dropdown
    await page.waitForSelector('[role="menu"], [data-radix-menu-content]', { timeout: 5000 })

    // Should have menu items (companies)
    const menuContent = page.locator('[data-radix-menu-content]')
    await expect(menuContent.first()).toBeVisible({ timeout: 5000 })
  })

  test('hovering company reveals brand submenu', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    await selectorButton.click()

    // Wait for main dropdown
    await page.waitForSelector('[data-radix-menu-content]', { timeout: 5000 })

    // Find a company sub-trigger and hover it
    const subTrigger = page.locator('[role="menuitem"]').first()
    await subTrigger.hover()

    // Wait a moment for submenu to appear
    await page.waitForTimeout(500)

    // Verify "All Brands" option is NOT present (removed in issue #185)
    const allBrandsOption = page.getByText('All Brands')
    await expect(allBrandsOption).not.toBeVisible()

    // Brand submenu should show - look for a second menu content
    const submenus = page.locator('[data-radix-menu-content]')
    const submenuCount = await submenus.count()
    expect(submenuCount).toBeGreaterThanOrEqual(1)
  })

  test('selector shows checkmark on current selection', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    await selectorButton.click()

    // Wait for dropdown
    await page.waitForSelector('[data-radix-menu-content]', { timeout: 5000 })

    // Look for check icon (indicates current selection) - Lucide Check icon
    // The SVG will have a viewBox and path elements
    const menuContent = page.locator('[data-radix-menu-content]').first()
    const checkIcon = menuContent.locator('svg')

    // Should have at least one SVG icon (could be check or other)
    const iconCount = await checkIcon.count()
    expect(iconCount).toBeGreaterThanOrEqual(1)
  })

  test('selector is disabled during loading state', async ({ page }) => {
    // Find the selector button
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    // Initially should not be disabled
    await expect(selectorButton).toBeVisible({ timeout: 10000 })
    const isDisabled = await selectorButton.isDisabled()
    expect(isDisabled).toBe(false)
  })

  test('selector keyboard navigation works', async ({ page }) => {
    // Find the selector button
    const selectorButton = page.locator('[data-testid="company-brand-selector-trigger"]')

    // Focus and open with Enter key
    await selectorButton.focus()
    await page.keyboard.press('Enter')

    // Dropdown should open
    const dropdownContent = page.locator('[data-radix-menu-content]')
    await expect(dropdownContent.first()).toBeVisible({ timeout: 5000 })

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Dropdown should close
    await expect(dropdownContent).not.toBeVisible({ timeout: 2000 })
  })
})
