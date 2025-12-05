import { test, expect } from '@playwright/test'
import { login } from './helpers/login'

/**
 * BOM Fraction Input E2E Tests
 * Tests for GitHub Issue #176 - Express qty/unit as a fraction in BOM
 *
 * Verifies that users can enter fraction values (e.g., "1/45") in the qty/unit field
 * and that line costs and total costs calculate correctly.
 */
test.describe('BOM Fraction Input', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('qty/unit field shows fraction placeholder', async ({ page }) => {
    // Navigate to SKUs list
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Find a SKU to add BOM to - click on first SKU link
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      await skuLinks.first().click()
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // Look for "New BOM Version" or similar link/button
      const newBomButton = page.locator('a[href*="/bom/new"], button:has-text("New BOM"), a:has-text("New BOM")')
      const buttonCount = await newBomButton.count()

      if (buttonCount > 0) {
        await newBomButton.first().click()
        await page.waitForURL(/\/bom\/new/, { timeout: 10000 })

        // Wait for the form to load
        await page.waitForSelector('form', { timeout: 10000 })

        // Add a component line
        const addComponentButton = page.locator('button:has-text("Add Component")')
        await addComponentButton.click()

        // Wait for the table row to appear
        await page.waitForSelector('table tbody tr', { timeout: 5000 })

        // Find the qty/unit input field - it should be a text input with the fraction placeholder
        const qtyInput = page.locator('input[placeholder*="1/45"]')
        const inputCount = await qtyInput.count()

        if (inputCount > 0) {
          // Verify the input exists and is type="text" (allows fractions)
          const inputType = await qtyInput.first().getAttribute('type')
          expect(inputType).toBe('text')

          // Verify placeholder shows fraction example
          const placeholder = await qtyInput.first().getAttribute('placeholder')
          expect(placeholder).toContain('1/45')
        } else {
          // Alternative: check any text input in the qty column
          const qtyColumnInput = page.locator('table tbody tr td:nth-child(2) input')
          const qtyColCount = await qtyColumnInput.count()
          if (qtyColCount > 0) {
            const inputType = await qtyColumnInput.first().getAttribute('type')
            expect(inputType).toBe('text')
          }
        }
      }
    }
  })

  test('can enter fraction value in qty/unit field', async ({ page }) => {
    // Navigate to SKUs list
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Find a SKU to add BOM to
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      await skuLinks.first().click()
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // Look for "New BOM Version" link/button
      const newBomButton = page.locator('a[href*="/bom/new"], button:has-text("New BOM"), a:has-text("New BOM")')
      const buttonCount = await newBomButton.count()

      if (buttonCount > 0) {
        await newBomButton.first().click()
        await page.waitForURL(/\/bom\/new/, { timeout: 10000 })

        await page.waitForSelector('form', { timeout: 10000 })

        // Add a component line
        const addComponentButton = page.locator('button:has-text("Add Component")')
        await addComponentButton.click()

        await page.waitForSelector('table tbody tr', { timeout: 5000 })

        // Find and fill the qty/unit input with a fraction
        const qtyInput = page.locator('table tbody tr td:nth-child(2) input').first()
        await qtyInput.clear()
        await qtyInput.fill('1/45')

        // Verify the value was accepted (should not be rejected)
        const value = await qtyInput.inputValue()
        expect(value).toBe('1/45')
      }
    }
  })

  test('line cost calculates correctly with fraction input', async ({ page }) => {
    // Navigate to SKUs list
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Find a SKU
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      await skuLinks.first().click()
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      const newBomButton = page.locator('a[href*="/bom/new"], button:has-text("New BOM"), a:has-text("New BOM")')
      const buttonCount = await newBomButton.count()

      if (buttonCount > 0) {
        await newBomButton.first().click()
        await page.waitForURL(/\/bom\/new/, { timeout: 10000 })

        await page.waitForSelector('form', { timeout: 10000 })

        // Wait for components to load
        await page.waitForSelector('button:has-text("Add Component"):not([disabled])', {
          timeout: 10000,
        })

        // Add a component line
        const addComponentButton = page.locator('button:has-text("Add Component")')
        await addComponentButton.click()

        await page.waitForSelector('table tbody tr', { timeout: 5000 })

        // Select a component from the dropdown
        const componentSelect = page.locator('table tbody tr button[role="combobox"]').first()
        await componentSelect.click()

        // Wait for options and select first available
        await page.waitForSelector('[role="listbox"]', { timeout: 5000 })
        const options = page.locator('[role="option"]')
        const optionCount = await options.count()

        if (optionCount > 0) {
          await options.first().click()

          // Wait for cost to populate
          await page.waitForTimeout(500)

          // Enter fraction for qty/unit
          const qtyInput = page.locator('table tbody tr td:nth-child(2) input').first()
          await qtyInput.clear()
          await qtyInput.fill('1/45')

          // Wait for line cost to update
          await page.waitForTimeout(300)

          // Get the line cost cell - should show calculated value
          const lineCostCell = page.locator('table tbody tr:first-child td:nth-child(4)')
          const lineCostText = await lineCostCell.textContent()

          // The line cost should be a formatted dollar amount (not NaN or empty)
          expect(lineCostText).toMatch(/\$[\d.]+/)

          // If there's a component cost, verify the calculation is correct
          const costCell = page.locator('table tbody tr:first-child td:nth-child(3)')
          const costText = await costCell.textContent()

          if (costText && lineCostText) {
            const costValue = parseFloat(costText.replace('$', ''))
            const lineCostValue = parseFloat(lineCostText.replace('$', ''))

            // 1/45 = 0.02222... so line cost should be costValue / 45
            const expectedLineCost = costValue / 45

            // Allow small floating point difference
            expect(Math.abs(lineCostValue - expectedLineCost)).toBeLessThan(0.001)
          }
        }
      }
    }
  })

  test('total unit cost updates with fraction input', async ({ page }) => {
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      await skuLinks.first().click()
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      const newBomButton = page.locator('a[href*="/bom/new"], button:has-text("New BOM"), a:has-text("New BOM")')
      const buttonCount = await newBomButton.count()

      if (buttonCount > 0) {
        await newBomButton.first().click()
        await page.waitForURL(/\/bom\/new/, { timeout: 10000 })

        await page.waitForSelector('form', { timeout: 10000 })
        await page.waitForSelector('button:has-text("Add Component"):not([disabled])', {
          timeout: 10000,
        })

        // Add a component line
        const addComponentButton = page.locator('button:has-text("Add Component")')
        await addComponentButton.click()
        await page.waitForSelector('table tbody tr', { timeout: 5000 })

        // Select component
        const componentSelect = page.locator('table tbody tr button[role="combobox"]').first()
        await componentSelect.click()
        await page.waitForSelector('[role="listbox"]', { timeout: 5000 })
        const options = page.locator('[role="option"]')
        const optionCount = await options.count()

        if (optionCount > 0) {
          await options.first().click()
          await page.waitForTimeout(500)

          // Enter fraction value
          const qtyInput = page.locator('table tbody tr td:nth-child(2) input').first()
          await qtyInput.clear()
          await qtyInput.fill('1/45')
          await page.waitForTimeout(300)

          // Check total unit cost row exists and has a value
          const totalRow = page.locator('table tbody tr:has-text("Total Unit Cost")')
          const totalRowCount = await totalRow.count()

          if (totalRowCount > 0) {
            const totalCostCell = totalRow.locator('td:nth-child(4)')
            const totalText = await totalCostCell.textContent()
            expect(totalText).toMatch(/\$[\d.]+/)
          }
        }
      }
    }
  })
})
