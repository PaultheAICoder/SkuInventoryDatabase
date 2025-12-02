import { test, expect } from '@playwright/test'

test.describe('Component Reorder Status Pagination', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('API returns correct total when filtering by reorderStatus', async ({ page }) => {
    // Use page.request which shares the authenticated session
    const request = page.request

    // Test each reorder status filter
    // The key test: meta.total should match the count when we filter by status
    for (const status of ['critical', 'warning', 'ok']) {
      // Get first page with filter
      const response = await request.get(
        `/api/components?reorderStatus=${status}&page=1&pageSize=10`
      )
      if (!response.ok()) {
        console.error('Response status:', response.status())
        console.error('Response text:', await response.text())
      }
      expect(response.ok()).toBeTruthy()
      const data = await response.json()

      // Skip if no components with this status
      if (data.meta.total === 0) continue

      // Verify all returned items have correct status
      for (const component of data.data) {
        expect(component.reorderStatus).toBe(status)
      }

      // Verify pagination is correct (totalPages should match the total / pageSize)
      expect(data.meta.totalPages).toBe(Math.ceil(data.meta.total / 10))

      // If there are multiple pages, verify the second page also has correct status
      if (data.meta.totalPages > 1) {
        const page2Response = await request.get(
          `/api/components?reorderStatus=${status}&page=2&pageSize=10`
        )
        expect(page2Response.ok()).toBeTruthy()
        const page2Data = await page2Response.json()

        // All items on page 2 should also have the correct status
        for (const component of page2Data.data) {
          expect(component.reorderStatus).toBe(status)
        }

        // Total count should be consistent across pages
        expect(page2Data.meta.total).toBe(data.meta.total)
      }
    }
  })

  test('Page correctly shows filtered components count', async ({ page }) => {
    // Navigate to components page
    await page.goto('/components')
    await page.waitForSelector('table', { timeout: 10000 })

    // Find and use the reorder status filter (if components exist)
    const filterSelect = page.locator(
      'select[name="reorderStatus"], [data-testid="reorder-status-filter"]'
    )

    if (await filterSelect.isVisible()) {
      // Select 'critical' filter
      await filterSelect.selectOption('critical')

      // Wait for the page to reload/update
      await page.waitForTimeout(1000)

      // Verify the page shows filtered results
      // The pagination should reflect the filtered count
      const paginationInfo = page.locator('[data-testid="pagination-info"], .pagination-info')
      if (await paginationInfo.isVisible()) {
        const text = await paginationInfo.textContent()
        // Should show filtered count, not total unfiltered count
        expect(text).not.toContain('of 0') // Should have some critical components
      }
    }
  })

  test('Pagination works correctly with reorderStatus filter', async ({ page }) => {
    // Use page.request which shares the authenticated session
    const request = page.request

    // Get critical components with small page size
    const page1Response = await request.get('/api/components?reorderStatus=critical&page=1&pageSize=5')
    expect(page1Response.ok()).toBeTruthy()
    const page1Data = await page1Response.json()

    if (page1Data.meta.totalPages > 1) {
      // Get second page
      const page2Response = await request.get(
        '/api/components?reorderStatus=critical&page=2&pageSize=5'
      )
      expect(page2Response.ok()).toBeTruthy()
      const page2Data = await page2Response.json()

      // Verify no duplicate IDs between pages
      const page1Ids = new Set(page1Data.data.map((c: { id: string }) => c.id))
      for (const component of page2Data.data) {
        expect(page1Ids.has(component.id)).toBeFalsy()
      }

      // All items on page 2 should also be critical
      for (const component of page2Data.data) {
        expect(component.reorderStatus).toBe('critical')
      }
    }
  })

  test('Combined filters work with reorderStatus', async ({ page }) => {
    // Use page.request which shares the authenticated session
    const request = page.request

    // Test reorderStatus combined with search
    const response = await request.get('/api/components?reorderStatus=ok&search=test&pageSize=50')
    expect(response.ok()).toBeTruthy()
    const data = await response.json()

    // All returned items should match both filters
    for (const component of data.data) {
      expect(component.reorderStatus).toBe('ok')
      // Name or SKU should contain 'test' (case insensitive)
      const matchesSearch =
        component.name.toLowerCase().includes('test') ||
        component.skuCode.toLowerCase().includes('test')
      expect(matchesSearch).toBeTruthy()
    }
  })
})
