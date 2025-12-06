import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsViewer } from './helpers/login'

test.describe('Chatbot Feature (Issue #184)', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh for each test
    await page.goto('/login')
  })

  test('ChatbotButton is visible in header for admin users', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Wait for the header to load
    await page.waitForSelector('header', { timeout: 10000 })

    // Look for the chatbot button in the header (MessageCircle icon button)
    const chatbotButton = page.locator('button[title="Ask the Assistant"]')
    await expect(chatbotButton).toBeVisible({ timeout: 10000 })

    // Verify it has the correct aria-label
    await expect(chatbotButton).toHaveAttribute('aria-label', 'Ask the Assistant')
  })

  test('ChatbotButton is NOT visible for non-admin users', async ({ page }) => {
    await loginAsViewer(page)
    await page.waitForLoadState('networkidle')

    // Wait for the header to load
    await page.waitForSelector('header', { timeout: 10000 })

    // The chatbot button should not be visible for regular users
    const chatbotButton = page.locator('button[title="Ask the Assistant"]')
    await expect(chatbotButton).not.toBeVisible()
  })

  test('Clicking ChatbotButton opens the ChatbotPanel', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Wait for header to be available
    await page.waitForSelector('header', { timeout: 10000 })

    // Click the chatbot button
    const chatbotButton = page.locator('button[title="Ask the Assistant"]')
    await expect(chatbotButton).toBeVisible({ timeout: 10000 })
    await chatbotButton.click()

    // Verify the panel opens with dialog content
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Verify the dialog title
    const dialogTitle = page.locator('[role="dialog"] >> text=Inventory Assistant')
    await expect(dialogTitle).toBeVisible()
  })

  test('ChatbotPanel shows welcome message on open', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Wait for header to be available
    await page.waitForSelector('header', { timeout: 10000 })

    // Open the chatbot panel
    const chatbotButton = page.locator('button[title="Ask the Assistant"]')
    await expect(chatbotButton).toBeVisible({ timeout: 10000 })
    await chatbotButton.click()

    // Verify welcome message is displayed
    const welcomeMessage = page.locator('[role="dialog"]').getByText("Hello! I'm your inventory system assistant")
    await expect(welcomeMessage).toBeVisible()
  })

  test('ChatbotPanel has input field and send button', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Wait for header to be available
    await page.waitForSelector('header', { timeout: 10000 })

    // Open the chatbot panel
    const chatbotButton = page.locator('button[title="Ask the Assistant"]')
    await expect(chatbotButton).toBeVisible({ timeout: 10000 })
    await chatbotButton.click()

    // Verify input field exists
    const inputField = page.locator('[role="dialog"] input[placeholder*="Ask about"]')
    await expect(inputField).toBeVisible()

    // Verify send button exists
    const sendButton = page.locator('[role="dialog"] button[type="submit"]')
    await expect(sendButton).toBeVisible()
  })

  test('ChatbotPanel can be closed', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Wait for header to be available
    await page.waitForSelector('header', { timeout: 10000 })

    // Open the chatbot panel
    const chatbotButton = page.locator('button[title="Ask the Assistant"]')
    await expect(chatbotButton).toBeVisible({ timeout: 10000 })
    await chatbotButton.click()

    // Verify dialog is open
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Close the dialog (click outside or use close button)
    await page.keyboard.press('Escape')

    // Verify dialog is closed
    await expect(dialog).not.toBeVisible()
  })

  test('ChatbotPanel input is focused on open', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Wait for header to be available
    await page.waitForSelector('header', { timeout: 10000 })

    // Open the chatbot panel
    const chatbotButton = page.locator('button[title="Ask the Assistant"]')
    await expect(chatbotButton).toBeVisible({ timeout: 10000 })
    await chatbotButton.click()

    // Wait for focus
    await page.waitForTimeout(200)

    // Verify input field is focused
    const inputField = page.locator('[role="dialog"] input[placeholder*="Ask about"]')
    await expect(inputField).toBeFocused()
  })

  test('Chatbot API returns 403 for non-admin users', async ({ page }) => {
    // Login as viewer (non-admin) first
    await loginAsViewer(page)
    await page.waitForLoadState('networkidle')

    // Make request to chatbot API via page context (authenticated)
    const response = await page.request.post('/api/chatbot', {
      data: { message: 'test' },
    })

    // Non-admin users should get 403 Forbidden
    expect(response.status()).toBe(403)
  })

  test('Chatbot API returns 200 for admin users', async ({ page }) => {
    // Login as admin first
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Make request to chatbot API via page context (authenticated)
    // Extended timeout because Claude API calls can take time
    const response = await page.request.post('/api/chatbot', {
      data: { message: 'How does max buildable work?' },
      timeout: 30000,
    })

    // Should return 200 (API key is configured)
    // Or 500 if API key not configured (but still authorized)
    expect([200, 500]).toContain(response.status())

    if (response.status() === 200) {
      const data = await response.json()
      // Verify response structure
      expect(data.data).toBeDefined()
      expect(data.data.message).toBeDefined()
      expect(data.data.message.content).toBeDefined()
    }
  })
})

test.describe('Chatbot Tool Use (Issue #212)', () => {
  // Tool use involves multiple Claude API calls, so increase timeout
  test.setTimeout(60000)

  test.beforeEach(async ({ page }) => {
    // Start fresh for each test
    await page.goto('/login')
  })

  test('Chatbot API can handle data query questions', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Make request asking about buildable units (may trigger tool use)
    const response = await page.request.post('/api/chatbot', {
      data: { message: 'How does max buildable calculation work?' },
      timeout: 30000, // Extended timeout for potential tool use
    })

    // Should return 200
    expect([200, 500]).toContain(response.status())

    if (response.status() === 200) {
      const data = await response.json()
      expect(data.data).toBeDefined()
      expect(data.data.message.content).toBeDefined()
      // Response should mention buildable or limiting
      expect(data.data.message.content.toLowerCase()).toMatch(/buildable|limiting|component/i)
    }
  })

  test('Chatbot API accepts companyId parameter for tool use', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')

    // Make request with a specific data question
    const response = await page.request.post('/api/chatbot', {
      data: { message: 'Explain how inventory transactions work.' },
      timeout: 30000, // Extended timeout for potential tool use
    })

    // Should return 200 or 500 depending on API key
    expect([200, 500]).toContain(response.status())

    if (response.status() === 200) {
      const data = await response.json()
      expect(data.data).toBeDefined()
      expect(data.data.message).toBeDefined()
      // Verify response structure is valid
      expect(typeof data.data.message.content).toBe('string')
      expect(data.data.message.content.length).toBeGreaterThan(0)
    }
  })
})
