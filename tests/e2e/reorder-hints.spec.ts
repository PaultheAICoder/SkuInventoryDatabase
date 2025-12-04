import { test, expect } from '@playwright/test'
import { login } from './helpers/login'

/**
 * Reorder Hints E2E Tests
 *
 * Tests for Issue #19: Reorder view lead-time hints and prioritized list
 * Verifies the CriticalComponentsList displays lead time and action columns,
 * and that the dashboard API returns leadTimeDays field.
 */
test.describe('Reorder Lead-Time Hints', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Dashboard API returns leadTimeDays in criticalComponents', async ({ page }) => {
    // Test API directly
    const response = await page.request.get('/api/dashboard')
    expect(response.status()).toBe(200)

    const responseData = await response.json()
    // API wraps response in { data: { ... } }
    const data = responseData.data || responseData
    expect(data).toHaveProperty('criticalComponents')

    // If there are critical components, verify leadTimeDays field exists
    if (data.criticalComponents.length > 0) {
      const firstComponent = data.criticalComponents[0]
      expect(firstComponent).toHaveProperty('leadTimeDays')
      expect(typeof firstComponent.leadTimeDays).toBe('number')
    }
  })

  test('Critical Components list has Lead Time column header', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for the Critical Components card
    const criticalComponentsCard = page.locator('text=Critical Components')
    await expect(criticalComponentsCard.first()).toBeVisible()

    // Check if table exists and has Lead Time header
    const leadTimeHeader = page.locator('th:has-text("Lead Time")')
    const hasLeadTimeHeader = await leadTimeHeader.count()

    // Either Lead Time header exists (if there are critical components)
    // or the "No critical components" message is shown
    const noComponentsMessage = page.locator('text=No critical components')
    const hasNoComponentsMessage = await noComponentsMessage.count()

    expect(hasLeadTimeHeader > 0 || hasNoComponentsMessage > 0).toBe(true)
  })

  test('Critical Components list has Action column header', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check if table exists and has Action header
    const actionHeader = page.locator('th:has-text("Action")')
    const hasActionHeader = await actionHeader.count()

    // Either Action header exists (if there are critical components)
    // or the "No critical components" message is shown
    const noComponentsMessage = page.locator('text=No critical components')
    const hasNoComponentsMessage = await noComponentsMessage.count()

    expect(hasActionHeader > 0 || hasNoComponentsMessage > 0).toBe(true)
  })

  test('Critical Components table displays all expected columns', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for Critical Components card
    const criticalComponentsCard = page.locator('text=Critical Components')
    await expect(criticalComponentsCard.first()).toBeVisible()

    // Find the table in the Critical Components card
    const table = page.locator('table').first()

    // Get all table headers
    const headers = table.locator('thead th')
    const headerCount = await headers.count()

    // If there are headers (table exists with data)
    if (headerCount > 0) {
      // Expected headers in order: Component, On Hand, Reorder Point, Deficit, Lead Time, Status, Action
      expect(headerCount).toBe(7)

      // Verify specific headers exist
      await expect(table.locator('th:has-text("Component")')).toBeVisible()
      await expect(table.locator('th:has-text("On Hand")')).toBeVisible()
      await expect(table.locator('th:has-text("Reorder Point")')).toBeVisible()
      await expect(table.locator('th:has-text("Deficit")')).toBeVisible()
      await expect(table.locator('th:has-text("Lead Time")')).toBeVisible()
      await expect(table.locator('th:has-text("Status")')).toBeVisible()
      await expect(table.locator('th:has-text("Action")')).toBeVisible()
    }
  })

  test('Lead Time column displays values correctly', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find the table
    const table = page.locator('table').first()
    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()

    if (rowCount > 0) {
      // Get the lead time cell (5th column, index 4)
      const leadTimeCell = rows.first().locator('td').nth(4)
      const leadTimeText = await leadTimeCell.textContent()

      // Lead time should be either "Xd" (X days) or "-" (0 days)
      expect(leadTimeText).toMatch(/^\d+d$|^-$/)
    }
  })

  test('Action column displays hint text for critical components', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find the table
    const table = page.locator('table').first()
    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()

    if (rowCount > 0) {
      // Get the action cell (7th column, index 6)
      const actionCell = rows.first().locator('td').nth(6)
      const actionText = await actionCell.textContent()

      // Action should contain one of the expected hints for critical components
      // Possible hints: "Order immediately", "Order soon (X days lead time)",
      // "Order within 1 week (X days lead time)", "Order urgently (X weeks lead time)"
      const validHints = [
        'Order immediately',
        'Order soon',
        'Order within 1 week',
        'Order urgently',
        'Monitor stock',
        'Monitor ('
      ]

      const hasValidHint = validHints.some(hint => actionText?.includes(hint))
      expect(hasValidHint || actionText === '').toBe(true)
    }
  })

  test('Dashboard API sorts critical components by urgency', async ({ page }) => {
    // Test API response for urgency sorting
    const response = await page.request.get('/api/dashboard')
    expect(response.status()).toBe(200)

    const responseData = await response.json()
    // API wraps response in { data: { ... } }
    const data = responseData.data || responseData
    const components = data.criticalComponents || []

    // If there are at least 2 components, verify they are sorted by urgency
    if (components.length >= 2) {
      // Calculate urgency scores (matching the API formula)
      const calculateUrgency = (c: { quantityOnHand: number; reorderPoint: number; leadTimeDays: number }) => {
        const deficit = c.reorderPoint - c.quantityOnHand
        const deficitRatio = deficit / Math.max(c.reorderPoint, 1)
        return (deficitRatio * 100) + (c.leadTimeDays * 2)
      }

      const firstUrgency = calculateUrgency(components[0])
      const secondUrgency = calculateUrgency(components[1])

      // First component should have higher or equal urgency than second
      expect(firstUrgency).toBeGreaterThanOrEqual(secondUrgency)
    }
  })

  test('Critical Components list is responsive', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Test at desktop size (default)
    const criticalComponentsCard = page.locator('text=Critical Components')
    await expect(criticalComponentsCard.first()).toBeVisible()

    // Test at tablet size
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(criticalComponentsCard.first()).toBeVisible()

    // Test at mobile size - card should still be visible
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(criticalComponentsCard.first()).toBeVisible()
  })
})

test.describe('Reorder Hints with Different Time Ranges', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Dashboard API returns leadTimeDays with days filter', async ({ page }) => {
    // Test API with different day ranges
    const response7 = await page.request.get('/api/dashboard?days=7')
    expect(response7.status()).toBe(200)
    const responseData7 = await response7.json()
    // API wraps response in { data: { ... } }
    const data7 = responseData7.data || responseData7
    expect(data7).toHaveProperty('criticalComponents')
    if (data7.criticalComponents.length > 0) {
      expect(data7.criticalComponents[0]).toHaveProperty('leadTimeDays')
    }

    const response30 = await page.request.get('/api/dashboard?days=30')
    expect(response30.status()).toBe(200)
    const responseData30 = await response30.json()
    const data30 = responseData30.data || responseData30
    expect(data30).toHaveProperty('criticalComponents')
    if (data30.criticalComponents.length > 0) {
      expect(data30.criticalComponents[0]).toHaveProperty('leadTimeDays')
    }

    const response90 = await page.request.get('/api/dashboard?days=90')
    expect(response90.status()).toBe(200)
    const responseData90 = await response90.json()
    const data90 = responseData90.data || responseData90
    expect(data90).toHaveProperty('criticalComponents')
    if (data90.criticalComponents.length > 0) {
      expect(data90.criticalComponents[0]).toHaveProperty('leadTimeDays')
    }
  })

  test('Changing time filter preserves lead time columns', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find and click the time filter dropdown (use data-testid for specificity)
    const selectTrigger = page.locator('[data-testid="time-filter-trigger"]')

    // Check initial state has Lead Time header
    const leadTimeHeader = page.locator('th:has-text("Lead Time")')

    // Change time filter to 7 days
    await selectTrigger.click()
    await page.locator('[role="option"]:has-text("Last 7 days")').click()

    // Wait for the dashboard API response after filter change
    await page.waitForResponse(
      response => response.url().includes('/api/dashboard') && response.status() === 200,
      { timeout: 10000 }
    )

    // Wait for DOM to update after API response
    await page.waitForLoadState('domcontentloaded')

    // Verify Lead Time header still exists (or no critical components)
    // Use a more robust check that waits for either condition
    const leadTimeHeaderVisible = leadTimeHeader.first()
    const noComponentsMessage = page.locator('text=No critical components')

    // Wait for either the Lead Time header OR the no components message to be visible
    await expect(leadTimeHeaderVisible.or(noComponentsMessage.first())).toBeVisible({ timeout: 5000 })
  })
})
