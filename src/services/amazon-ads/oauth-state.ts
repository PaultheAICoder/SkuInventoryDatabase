/**
 * OAuth State Store for Amazon Ads
 *
 * Manages CSRF state tokens for OAuth flow.
 * In-memory storage with automatic expiry cleanup.
 */

interface OAuthStateData {
  companyId: string
  brandId?: string
  expiresAt: Date
}

// In-memory store for OAuth state tokens (short-lived, 10 min expiry)
// In production, consider using Redis or database for multi-instance deployments
const stateStore = new Map<string, OAuthStateData>()

/**
 * Store a new OAuth state token
 */
export function storeOAuthState(
  state: string,
  data: Omit<OAuthStateData, 'expiresAt'>,
  expiryMinutes = 10
): void {
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000)
  stateStore.set(state, { ...data, expiresAt })

  // Cleanup expired states
  cleanupExpiredStates()
}

/**
 * Retrieve and validate an OAuth state token
 * Returns the data if valid, null if invalid or expired
 */
export function retrieveOAuthState(state: string): OAuthStateData | null {
  const data = stateStore.get(state)

  if (!data) {
    return null
  }

  // Check expiry
  if (data.expiresAt < new Date()) {
    stateStore.delete(state)
    return null
  }

  // Remove used state token (one-time use)
  stateStore.delete(state)

  return data
}

/**
 * Clean up expired state tokens
 */
function cleanupExpiredStates(): void {
  const now = new Date()
  const keysToDelete: string[] = []

  stateStore.forEach((value, key) => {
    if (value.expiresAt < now) {
      keysToDelete.push(key)
    }
  })

  keysToDelete.forEach(key => stateStore.delete(key))
}
