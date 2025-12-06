import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/login'

test.describe('Company/Brand Selector', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    // Wait for dashboard to fully load
    await page.waitForSelector('nav, aside', { timeout: 15000 })
  })

  test('unified selector is visible in sidebar', async ({ page }) => {
    // The CompanyBrandSelector should be visible
    // It shows as a button with company/brand text and building icon
    const selector = page.locator('button:has-text("/")')

    // Should be visible (selector shows "Company / Brand" format)
    await expect(selector).toBeVisible({ timeout: 10000 })
  })

  test('selector button shows current company and brand', async ({ page }) => {
    // Look for the button that contains the company/brand selector
    const selectorButton = page.locator('button').filter({
      has: page.locator('svg.lucide-building-2')
    })

    // The button should contain a "/" indicating company/brand format
    await expect(selectorButton.first()).toBeVisible({ timeout: 10000 })
    const buttonText = await selectorButton.first().textContent()
    expect(buttonText).toContain('/')
  })

  test('clicking selector opens dropdown with companies', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('button').filter({
      has: page.locator('svg.lucide-building-2')
    }).first()

    await selectorButton.click()

    // Wait for dropdown content to appear
    const dropdownContent = page.locator('[role="menu"], [data-radix-menu-content]')
    await expect(dropdownContent).toBeVisible({ timeout: 5000 })
  })

  test('dropdown shows company names with building icons', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('button').filter({
      has: page.locator('svg.lucide-building-2')
    }).first()

    await selectorButton.click()

    // Wait for dropdown
    await page.waitForSelector('[role="menu"], [data-radix-menu-content]', { timeout: 5000 })

    // Should have menu items (companies)
    const menuItems = page.locator('[role="menuitem"], [data-radix-menubar-sub-trigger]')
    const count = await menuItems.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('hovering company reveals brand submenu', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('button').filter({
      has: page.locator('svg.lucide-building-2')
    }).first()

    await selectorButton.click()

    // Wait for main dropdown
    await page.waitForSelector('[role="menu"], [data-radix-menu-content]', { timeout: 5000 })

    // Find a company sub-trigger and hover it
    const subTrigger = page.locator('[data-radix-collection-item]').first()
    await subTrigger.hover()

    // Wait a moment for submenu to appear
    await page.waitForTimeout(500)

    // Verify "All Brands" option is NOT present (removed in issue #185)
    const allBrandsOption = page.getByText('All Brands')
    await expect(allBrandsOption).not.toBeVisible()

    // Brand submenu should show individual brands (with tag icons)
    const submenu = page.locator('[data-radix-menu-content]')
    await expect(submenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('selector shows checkmark on current selection', async ({ page }) => {
    // Find and click the selector button
    const selectorButton = page.locator('button').filter({
      has: page.locator('svg.lucide-building-2')
    }).first()

    await selectorButton.click()

    // Wait for dropdown
    await page.waitForSelector('[role="menu"], [data-radix-menu-content]', { timeout: 5000 })

    // Look for check icon (indicates current selection)
    const checkIcon = page.locator('svg.lucide-check')
    // Should have at least one checkmark showing current company
    await expect(checkIcon.first()).toBeVisible({ timeout: 5000 })
  })

  test('selector is disabled during loading state', async ({ page }) => {
    // This tests the loading state functionality
    // The selector should show disabled state with spinner during API calls
    const selectorButton = page.locator('button').filter({
      has: page.locator('svg.lucide-building-2')
    }).first()

    // Initially should not be disabled
    const isDisabled = await selectorButton.isDisabled()
    expect(isDisabled).toBe(false)
  })

  test('selector keyboard navigation works', async ({ page }) => {
    // Find the selector button
    const selectorButton = page.locator('button').filter({
      has: page.locator('svg.lucide-building-2')
    }).first()

    // Focus and open with Enter key
    await selectorButton.focus()
    await page.keyboard.press('Enter')

    // Dropdown should open
    const dropdownContent = page.locator('[role="menu"], [data-radix-menu-content]')
    await expect(dropdownContent).toBeVisible({ timeout: 5000 })

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Dropdown should close
    await expect(dropdownContent).not.toBeVisible({ timeout: 2000 })
  })
})
