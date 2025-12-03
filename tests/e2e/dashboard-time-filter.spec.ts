import { test, expect } from '@playwright/test'

/**
 * Dashboard Time Filter E2E Tests
 *
 * Tests for Issue #18: Dashboard time filter and component on-hand trend sparkline
 * Verifies the dashboard time filter dropdown and component sparkline features.
 */
test.describe('Dashboard Time Filter', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('Dashboard displays time filter dropdown', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The time filter should be visible on the dashboard
    const timeFilter = page.locator('text=Time Range')
    await expect(timeFilter).toBeVisible()

    // The select trigger should be visible
    const selectTrigger = page.locator('[role="combobox"]').first()
    await expect(selectTrigger).toBeVisible()
  })

  test('Time filter shows all options when clicked', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find and click the time filter dropdown
    const selectTrigger = page.locator('[role="combobox"]').first()
    await selectTrigger.click()

    // Wait for dropdown to appear
    await page.waitForSelector('[role="option"]', { timeout: 5000 })

    // Verify all options are present
    await expect(page.locator('[role="option"]:has-text("Last 7 days")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("Last 30 days")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("Last 90 days")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("All time")')).toBeVisible()
  })

  test('Changing time filter updates dashboard data', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Track API calls
    const apiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/dashboard')) {
        apiCalls.push(request.url())
      }
    })

    // Clear previous calls
    apiCalls.length = 0

    // Find and click the time filter dropdown
    const selectTrigger = page.locator('[role="combobox"]').first()
    await selectTrigger.click()

    // Select 7 days option
    await page.locator('[role="option"]:has-text("Last 7 days")').click()

    // Wait for API call
    await page.waitForTimeout(1000)

    // Verify API was called with days parameter
    const hasDaysParam = apiCalls.some((url) => url.includes('days=7'))
    expect(hasDaysParam).toBe(true)
  })

  test('Time filter is visible on all screen sizes', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Test at desktop size (default)
    const timeFilterDesktop = page.locator('text=Time Range')
    await expect(timeFilterDesktop).toBeVisible()

    // Test at tablet size
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(timeFilterDesktop).toBeVisible()

    // Test at mobile size
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(timeFilterDesktop).toBeVisible()
  })

  test('Dashboard API accepts days parameter', async ({ page }) => {
    // Test API directly
    const response7 = await page.request.get('/api/dashboard?days=7')
    expect(response7.status()).toBe(200)

    const response30 = await page.request.get('/api/dashboard?days=30')
    expect(response30.status()).toBe(200)

    const response90 = await page.request.get('/api/dashboard?days=90')
    expect(response90.status()).toBe(200)

    // Without days parameter (all time)
    const responseAll = await page.request.get('/api/dashboard')
    expect(responseAll.status()).toBe(200)
  })
})

test.describe('Component Sparkline', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    // Wait for either dashboard or components page
    await Promise.race([
      page.waitForURL('/', { timeout: 20000 }),
      page.waitForURL('/components', { timeout: 20000 }),
    ])
  })

  test('Component detail page displays sparkline time filter buttons', async ({ page }) => {
    // Navigate to components list
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on first component to go to detail page
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    if (linkCount > 0) {
      await componentLinks.first().click()
      await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })
      await page.waitForLoadState('networkidle')

      // The sparkline time filter buttons should be visible (7d, 30d, 90d)
      const filterButtons = page.locator('button:has-text("7d"), button:has-text("30d"), button:has-text("90d")')
      const count = await filterButtons.count()
      expect(count).toBeGreaterThanOrEqual(3)
    }
  })

  test('Component detail page displays trend section', async ({ page }) => {
    // Navigate to components list
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on first component to go to detail page
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    if (linkCount > 0) {
      await componentLinks.first().click()
      await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })
      await page.waitForLoadState('networkidle')

      // The Trend section should be visible
      const trendSection = page.locator('text=Trend')
      await expect(trendSection.first()).toBeVisible()
    }
  })

  test('Sparkline time filter buttons change data', async ({ page }) => {
    // Navigate to components list
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on first component to go to detail page
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    if (linkCount > 0) {
      await componentLinks.first().click()
      await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })
      await page.waitForLoadState('networkidle')

      // Track API calls
      const apiCalls: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/api/components/')) {
          apiCalls.push(request.url())
        }
      })

      // Click on 7d button
      const sevenDayButton = page.locator('button:has-text("7d")')
      if ((await sevenDayButton.count()) > 0) {
        apiCalls.length = 0
        await sevenDayButton.first().click()
        await page.waitForTimeout(1000)

        // Verify API was called with trendDays parameter
        const hasTrendDays = apiCalls.some((url) => url.includes('trendDays=7'))
        expect(hasTrendDays).toBe(true)
      }
    }
  })

  test('Component API accepts trendDays parameter', async ({ page }) => {
    // Get a component ID first
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    if (linkCount > 0) {
      // Extract component ID from the first link
      const href = await componentLinks.first().getAttribute('href')
      if (href) {
        const componentId = href.split('/').pop()

        // Test API with trendDays
        const response7 = await page.request.get(`/api/components/${componentId}?trendDays=7`)
        expect(response7.status()).toBe(200)
        const data7 = await response7.json()
        expect(data7.data).toHaveProperty('trend')

        const response30 = await page.request.get(`/api/components/${componentId}?trendDays=30`)
        expect(response30.status()).toBe(200)
        const data30 = await response30.json()
        expect(data30.data).toHaveProperty('trend')

        // Without trendDays - should not have trend
        const responseNoTrend = await page.request.get(`/api/components/${componentId}`)
        expect(responseNoTrend.status()).toBe(200)
        const dataNoTrend = await responseNoTrend.json()
        expect(dataNoTrend.data.trend).toBeUndefined()
      }
    }
  })

  test('Sparkline is visible on component detail page', async ({ page }) => {
    // Navigate to components list
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on first component to go to detail page
    const componentLinks = page.locator('table tbody tr td a')
    const linkCount = await componentLinks.count()

    if (linkCount > 0) {
      await componentLinks.first().click()
      await page.waitForURL(/\/components\/[a-z0-9-]+/, { timeout: 10000 })
      await page.waitForLoadState('networkidle')

      // Wait for sparkline chart to render (recharts creates SVG)
      // The sparkline should either show data or show "No trend data available"
      const hasSparkline = await page.locator('.recharts-wrapper').count()
      const hasNoDataMessage = await page.locator('text=No trend data available').count()

      // Either the chart is visible or the "no data" message is visible
      expect(hasSparkline > 0 || hasNoDataMessage > 0).toBe(true)
    }
  })
})
