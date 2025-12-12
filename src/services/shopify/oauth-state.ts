/**
 * Shopify OAuth State Token Management
 *
 * Stores temporary state tokens for CSRF protection during OAuth flow.
 */

interface ShopifyOAuthStateData {
  shop: string
  companyId: string
  userId: string
  createdAt: number
}

// In-memory store - for production, consider using Redis
const stateStore = new Map<string, ShopifyOAuthStateData>()

// State token expiry time (10 minutes)
const STATE_EXPIRY_MS = 10 * 60 * 1000

/**
 * Store OAuth state data
 */
export function storeOAuthState(
  state: string,
  data: Omit<ShopifyOAuthStateData, 'createdAt'>,
  expiryMinutes = 10
): void {
  stateStore.set(state, {
    ...data,
    createdAt: Date.now(),
  })

  // Schedule cleanup after expiry
  setTimeout(() => {
    stateStore.delete(state)
  }, expiryMinutes * 60 * 1000)
}

/**
 * Retrieve and consume OAuth state data
 * Returns null if state is invalid or expired
 */
export function retrieveOAuthState(state: string): ShopifyOAuthStateData | null {
  const data = stateStore.get(state)

  if (!data) {
    return null
  }

  // Check if expired
  if (Date.now() - data.createdAt > STATE_EXPIRY_MS) {
    stateStore.delete(state)
    return null
  }

  // Consume the state token (one-time use)
  stateStore.delete(state)
  return data
}

/**
 * Clean up expired state tokens
 * Called periodically to prevent memory leaks
 */
export function cleanupExpiredStates(): void {
  const now = Date.now()
  stateStore.forEach((data, state) => {
    if (now - data.createdAt > STATE_EXPIRY_MS) {
      stateStore.delete(state)
    }
  })
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredStates, 5 * 60 * 1000)
}
