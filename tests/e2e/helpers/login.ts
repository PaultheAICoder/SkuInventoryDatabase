import { Page, expect } from '@playwright/test'

/**
 * Login helper for E2E tests
 * Uses a robust approach that waits for actual navigation to complete
 */
export async function login(
  page: Page,
  email: string = 'admin@tonsil.tech',
  password: string = 'changeme123'
): Promise<void> {
  // Navigate to login page
  await page.goto('/login')
  await page.waitForSelector('#email', { timeout: 10000 })

  // Fill credentials
  await page.fill('#email', email)
  await page.fill('#password', password)

  // Click submit button
  await page.click('button[type="submit"]')

  // Wait for successful login - use multiple strategies
  // Strategy 1: Wait for URL to change from /login
  // Strategy 2: Wait for dashboard content to appear
  await Promise.race([
    // Wait for URL to be exactly '/' (networkidle may not work with client-side routing)
    page.waitForURL('/', { timeout: 20000, waitUntil: 'domcontentloaded' }),
    // Or wait for a dashboard-specific element
    page.waitForSelector('[data-testid="dashboard-container"], main.flex-1', { timeout: 20000 }),
  ]).catch(async () => {
    // Fallback: just check the URL manually after a short delay
    await page.waitForTimeout(2000)
    const currentUrl = page.url()
    if (!currentUrl.endsWith('/') && !currentUrl.endsWith('/login')) {
      // Might be on dashboard with trailing path
      return
    }
    if (currentUrl.includes('/login')) {
      // Still on login page, check for error message
      const errorVisible = await page.locator('.text-destructive').isVisible()
      if (errorVisible) {
        throw new Error('Login failed - invalid credentials')
      }
      throw new Error('Login failed - still on login page after timeout')
    }
  })
}

/**
 * Login as specific user role
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, 'admin@tonsil.tech', 'changeme123')
}

export async function loginAsOps(page: Page): Promise<void> {
  await login(page, 'ops@tonsil.tech', 'changeme123')
}

export async function loginAsViewer(page: Page): Promise<void> {
  await login(page, 'viewer@tonsil.tech', 'changeme123')
}
