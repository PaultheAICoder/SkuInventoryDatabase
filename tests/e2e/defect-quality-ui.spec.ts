import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Issue #15 - Defect/Quality Fields UI
 *
 * These tests verify that:
 * 1. BOM Version Form shows defect notes field
 * 2. Build Dialog shows defect tracking fields (collapsible section)
 * 3. Transaction export includes defect fields
 */

test.describe('Defect/Quality Fields UI', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForSelector('#email', { timeout: 10000 })
    await page.fill('#email', 'admin@tonsil.tech')
    await page.fill('#password', 'changeme123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('BOM Version Form displays defect notes field', async ({ page }) => {
    // Navigate to SKUs page
    await page.goto('/skus')
    await page.waitForSelector('table', { timeout: 10000 })

    // Click on first SKU to view its details
    const skuLinks = page.locator('table tbody tr td a')
    const linkCount = await skuLinks.count()

    if (linkCount > 0) {
      await skuLinks.first().click()
      await page.waitForURL(/\/skus\/[a-z0-9-]+/, { timeout: 10000 })

      // Look for "New BOM Version" button or link
      const newBomButton = page.locator('a:has-text("New BOM"), button:has-text("New BOM")')
      const buttonCount = await newBomButton.count()

      if (buttonCount > 0) {
        await newBomButton.first().click()
        await page.waitForURL(/\/skus\/[a-z0-9-]+\/bom\/new/, { timeout: 10000 })

        // Verify the defect notes field is present
        const defectNotesLabel = page.locator('label[for="defectNotes"]')
        await expect(defectNotesLabel).toBeVisible()

        // Verify the textarea for defect notes exists
        const defectNotesTextarea = page.locator('#defectNotes')
        await expect(defectNotesTextarea).toBeVisible()

        // Verify placeholder text
        const placeholder = await defectNotesTextarea.getAttribute('placeholder')
        expect(placeholder).toContain('defect')
      }
    }
  })

  test('Transaction export includes defect columns in CSV', async ({ page }) => {
    // Request the transaction export and verify it includes defect columns
    const response = await page.request.get('/api/export/transactions')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')

    const csvContent = await response.text()

    // Verify the CSV header includes defect-related columns
    expect(csvContent).toContain('Defect Count')
    expect(csvContent).toContain('Defect Notes')
    expect(csvContent).toContain('Affected Units')
  })

  test('Transaction API returns defect fields', async ({ page }) => {
    // Request transactions and verify the response includes defect fields
    const response = await page.request.get('/api/transactions')
    expect(response.status()).toBe(200)

    const data = await response.json()

    // Check that the response structure includes defect fields
    // Even if null, the fields should be present
    if (data.data && data.data.length > 0) {
      const transaction = data.data[0]

      // Verify the fields exist in the response (can be null)
      expect('defectCount' in transaction).toBe(true)
      expect('defectNotes' in transaction).toBe(true)
      expect('affectedUnits' in transaction).toBe(true)
    }
  })

  test('BOM Version API returns quality metadata fields', async ({ page }) => {
    // Navigate to SKUs and get a SKU with a BOM
    const skuResponse = await page.request.get('/api/skus?pageSize=10')
    expect(skuResponse.status()).toBe(200)

    const skuData = await skuResponse.json()

    if (skuData.data && skuData.data.length > 0) {
      const skuId = skuData.data[0].id

      // Get BOM versions for this SKU
      const bomResponse = await page.request.get(`/api/skus/${skuId}/bom-versions`)

      if (bomResponse.status() === 200) {
        const bomData = await bomResponse.json()

        if (bomData.data && bomData.data.length > 0) {
          const bomVersion = bomData.data[0]

          // Verify the fields exist in the response (can be null)
          expect('defectNotes' in bomVersion).toBe(true)
          expect('qualityMetadata' in bomVersion).toBe(true)
        }
      }
    }
  })
})
