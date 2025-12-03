import { test, expect } from '@playwright/test'

/**
 * Defect Analytics Dashboard E2E Tests
 *
 * These tests verify the defect analytics feature:
 * - Navigation item visibility
 * - Dashboard page loads correctly
 * - Charts and filters render
 * - API endpoint works
 */
test.describe('Defect Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Analytics navigation item is visible in sidebar', async ({ page }) => {
    await page.goto('/')

    // Find the Analytics navigation link in the sidebar
    const analyticsLink = page.locator('a[href="/analytics/defects"]')
    await expect(analyticsLink).toBeVisible()

    // Verify it has the correct text
    await expect(analyticsLink).toContainText('Analytics')
  })

  test('Analytics page loads successfully', async ({ page }) => {
    await page.goto('/analytics/defects')

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Verify the page header
    const header = page.locator('h1')
    await expect(header).toBeVisible()
    await expect(header).toContainText('Defect Analytics')
  })

  test('Analytics page displays filter controls', async ({ page }) => {
    await page.goto('/analytics/defects')
    await page.waitForLoadState('networkidle')

    // Verify date filter inputs exist
    const dateFromInput = page.locator('input[type="date"]#dateFrom')
    await expect(dateFromInput).toBeVisible()

    const dateToInput = page.locator('input[type="date"]#dateTo')
    await expect(dateToInput).toBeVisible()

    // Verify Group By selector exists
    const groupBySelect = page.locator('button#groupBy')
    await expect(groupBySelect).toBeVisible()

    // Verify Apply Filters button exists
    const applyButton = page.locator('button', { hasText: 'Apply Filters' })
    await expect(applyButton).toBeVisible()
  })

  test('Analytics page displays summary stats cards', async ({ page }) => {
    await page.goto('/analytics/defects')
    await page.waitForLoadState('networkidle')

    // Wait for data to load (might show loading spinner first)
    await page.waitForSelector('text=Total Builds', { timeout: 15000 })

    // Verify summary stat cards exist
    await expect(page.locator('text=Total Builds')).toBeVisible()
    await expect(page.locator('text=Overall Defect Rate')).toBeVisible()
    await expect(page.locator('text=Affected Rate')).toBeVisible()
    await expect(page.locator('text=Defect Rate Range')).toBeVisible()
  })

  test('Analytics page displays charts', async ({ page }) => {
    await page.goto('/analytics/defects')
    await page.waitForLoadState('networkidle')

    // Wait for charts to load
    await page.waitForSelector('text=Defect Rate Trend', { timeout: 15000 })

    // Verify chart titles
    await expect(page.locator('text=Defect Rate Trend')).toBeVisible()
    await expect(page.locator('text=Defect Rate by BOM Version')).toBeVisible()
  })

  test('Export CSV button is visible', async ({ page }) => {
    await page.goto('/analytics/defects')
    await page.waitForLoadState('networkidle')

    // Verify export button exists
    const exportButton = page.locator('button', { hasText: 'Export CSV' })
    await expect(exportButton).toBeVisible()
  })

  test('Analytics API returns data for authenticated user', async ({ page, request }) => {
    // First login via the page to get session
    await page.goto('/analytics/defects')
    await page.waitForLoadState('networkidle')

    // Get cookies from authenticated session
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    // Make API request with session cookies
    const response = await request.get('http://172.16.20.50:4545/api/analytics/defects', {
      headers: {
        Cookie: cookieHeader,
      },
    })

    expect(response.ok()).toBeTruthy()
    const data = await response.json()

    // Verify response structure
    expect(data.data).toHaveProperty('summary')
    expect(data.data).toHaveProperty('trends')
    expect(data.data).toHaveProperty('byBOMVersion')
    expect(data.data).toHaveProperty('bySKU')
    expect(data.data).toHaveProperty('filters')

    // Verify summary structure
    expect(data.data.summary).toHaveProperty('totalBuilds')
    expect(data.data.summary).toHaveProperty('overallDefectRate')
  })

  test('Analytics API returns filter options', async ({ page, request }) => {
    // Login first
    await page.goto('/analytics/defects')
    await page.waitForLoadState('networkidle')

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const response = await request.get(
      'http://172.16.20.50:4545/api/analytics/defects?filters=true',
      {
        headers: {
          Cookie: cookieHeader,
        },
      }
    )

    expect(response.ok()).toBeTruthy()
    const data = await response.json()

    // Verify filter options structure
    expect(data.data).toHaveProperty('skus')
    expect(data.data).toHaveProperty('bomVersions')
    expect(data.data).toHaveProperty('salesChannels')
    expect(Array.isArray(data.data.salesChannels)).toBeTruthy()
  })
})
