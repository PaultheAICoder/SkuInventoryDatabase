import { test, expect } from '@playwright/test'

test.describe('BuildFooter', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    // Wait for login form to be ready
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    // Wait for redirect to dashboard
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('footer is visible on dashboard', async ({ page }) => {
    // Verify we're on the dashboard
    await expect(page).toHaveURL('/')

    // Check footer exists
    const footer = page.locator('footer')
    await expect(footer).toBeVisible()
  })

  test('footer displays version in correct format', async ({ page }) => {
    const footer = page.locator('footer')

    // Check for "Build X.X.X" format
    await expect(footer).toContainText(/Build \d+\.\d+\.\d+/)
  })

  test('footer displays timestamp', async ({ page }) => {
    const footer = page.locator('footer')

    // Check for date format (e.g., "Dec 2, 2025")
    await expect(footer).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)
  })

  test('footer has correct styling classes', async ({ page }) => {
    const footer = page.locator('footer')

    // Verify footer has border-top and muted text
    await expect(footer).toHaveClass(/border-t/)
    await expect(footer).toHaveClass(/text-muted-foreground/)
  })

  test('footer is visible on other dashboard pages', async ({ page }) => {
    // Navigate to components page
    await page.goto('/components')
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText(/Build \d+\.\d+\.\d+/)

    // Navigate to SKUs page
    await page.goto('/skus')
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText(/Build \d+\.\d+\.\d+/)

    // Navigate to transactions page
    await page.goto('/transactions')
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText(/Build \d+\.\d+\.\d+/)
  })

})

// Separate test without login - checking login page itself
test('footer is NOT visible on login page', async ({ page }) => {
  await page.goto('/login')
  // Wait for page to load
  await page.waitForSelector('#email', { timeout: 10000 })

  // Login page should not have the BuildFooter
  // (it uses a different layout)
  const footer = page.locator('footer')
  await expect(footer).not.toBeVisible()
})
