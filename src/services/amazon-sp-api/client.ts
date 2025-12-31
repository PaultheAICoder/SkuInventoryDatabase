/**
 * Amazon SP-API (Selling Partner API) Client
 *
 * Handles OAuth2 LWA authentication and API communication with Amazon SP-API.
 * Includes automatic token refresh middleware and AWS Signature V4 signing.
 *
 * Key differences from Amazon Ads API:
 * - Uses AWS Signature V4 for request signing (in addition to Bearer token)
 * - Different API endpoint (sellingpartnerapi-na.amazon.com)
 * - Different scopes (sellingpartnerapi::*)
 */

import aws4 from 'aws4'
import { encrypt, decrypt, logCredentialAccess } from '@/lib/encryption'
import { prisma } from '@/lib/db'
import type {
  AmazonSpTokenResponse,
  AmazonSpApiResponse,
} from './types'

// ============================================
// Configuration
// ============================================

const AMAZON_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'
const SP_API_BASE_NA = 'https://sellingpartnerapi-na.amazon.com'

// Token refresh buffer - refresh if expiring within 5 minutes
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// ============================================
// Environment Variables
// ============================================

function getClientId(): string {
  const clientId = process.env.AMAZON_SP_CLIENT_ID
  if (!clientId) {
    throw new Error('AMAZON_SP_CLIENT_ID environment variable is required')
  }
  return clientId
}

function getClientSecret(): string {
  const clientSecret = process.env.AMAZON_SP_CLIENT_SECRET
  if (!clientSecret) {
    throw new Error('AMAZON_SP_CLIENT_SECRET environment variable is required')
  }
  return clientSecret
}

function getRedirectUri(): string {
  const redirectUri = process.env.AMAZON_SP_REDIRECT_URI
  if (!redirectUri) {
    throw new Error('AMAZON_SP_REDIRECT_URI environment variable is required')
  }
  return redirectUri
}

function getAwsCredentials(): { accessKeyId: string; secretAccessKey: string } {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SP-API')
  }

  return { accessKeyId, secretAccessKey }
}

// ============================================
// OAuth2 Methods
// ============================================

/**
 * Generate authorization URL for Amazon SP-API OAuth flow
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    application_id: getClientId(),
    state,
    redirect_uri: getRedirectUri(),
    version: 'beta', // For self-authorization flow
  })

  return `https://sellercentral.amazon.com/apps/authorize/consent?${params.toString()}`
}

/**
 * Exchange authorization code (spapi_oauth_code) for access/refresh tokens
 */
export async function exchangeCode(code: string): Promise<AmazonSpApiResponse<AmazonSpTokenResponse>> {
  try {
    const response = await fetch(AMAZON_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
        client_id: getClientId(),
        client_secret: getClientSecret(),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: {
          code: 'TOKEN_EXCHANGE_FAILED',
          message: `Failed to exchange authorization code: ${response.status}`,
          details: errorText,
        },
      }
    }

    const data = await response.json() as AmazonSpTokenResponse
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'TOKEN_EXCHANGE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error during token exchange',
      },
    }
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(refreshTokenValue: string): Promise<AmazonSpApiResponse<AmazonSpTokenResponse>> {
  try {
    const response = await fetch(AMAZON_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: getClientId(),
        client_secret: getClientSecret(),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: {
          code: 'TOKEN_REFRESH_FAILED',
          message: `Failed to refresh token: ${response.status}`,
          details: errorText,
        },
      }
    }

    const data = await response.json() as AmazonSpTokenResponse
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'TOKEN_REFRESH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error during token refresh',
      },
    }
  }
}

// ============================================
// Token Management & Auto-Refresh
// ============================================

/**
 * Get valid access token, refreshing if expired or expiring soon
 * This is the automatic token refresh middleware
 */
export async function getValidAccessToken(credentialId: string): Promise<AmazonSpApiResponse<string>> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { id: credentialId },
  })

  if (!credential) {
    return {
      success: false,
      error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Integration credential not found' },
    }
  }

  if (credential.status === 'revoked') {
    return {
      success: false,
      error: { code: 'CREDENTIAL_REVOKED', message: 'Integration has been revoked. Please reconnect.' },
    }
  }

  // Log credential access
  logCredentialAccess({
    credentialId,
    integrationType: credential.integrationType,
    action: 'access',
  })

  // Check if token needs refresh
  const now = new Date()
  const expiresAt = credential.expiresAt
  const needsRefresh = !expiresAt || now.getTime() > expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS

  if (needsRefresh) {
    // Decrypt and refresh the token
    if (!credential.encryptedRefreshToken) {
      return {
        success: false,
        error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token available. Please reconnect.' },
      }
    }

    const decryptedRefreshToken = decrypt(credential.encryptedRefreshToken, {
      credentialId,
      integrationType: credential.integrationType,
    })

    const refreshResult = await refreshToken(decryptedRefreshToken)

    if (!refreshResult.success || !refreshResult.data) {
      // Update credential status to expired
      await prisma.integrationCredential.update({
        where: { id: credentialId },
        data: {
          status: 'expired',
          lastErrorAt: now,
          lastError: refreshResult.error?.message || 'Token refresh failed',
        },
      })

      return {
        success: false,
        error: refreshResult.error || { code: 'REFRESH_FAILED', message: 'Token refresh failed' },
      }
    }

    // Encrypt and store new tokens
    const newAccessToken = refreshResult.data.access_token
    const newRefreshToken = refreshResult.data.refresh_token || decryptedRefreshToken
    const newExpiresAt = new Date(now.getTime() + refreshResult.data.expires_in * 1000)

    await prisma.integrationCredential.update({
      where: { id: credentialId },
      data: {
        encryptedAccessToken: encrypt(newAccessToken, {
          credentialId,
          integrationType: credential.integrationType,
        }),
        encryptedRefreshToken: encrypt(newRefreshToken, {
          credentialId,
          integrationType: credential.integrationType,
        }),
        expiresAt: newExpiresAt,
        status: 'active',
        lastUsedAt: now,
        lastError: null,
        lastErrorAt: null,
      },
    })

    return { success: true, data: newAccessToken }
  }

  // Token is still valid, decrypt and return
  const accessToken = decrypt(credential.encryptedAccessToken, {
    credentialId,
    integrationType: credential.integrationType,
  })

  // Update last used timestamp
  await prisma.integrationCredential.update({
    where: { id: credentialId },
    data: { lastUsedAt: now },
  })

  return { success: true, data: accessToken }
}

// ============================================
// AWS Signature V4 Signing
// ============================================

interface SignedRequest {
  url: string
  headers: Record<string, string>
}

/**
 * Sign a request with AWS Signature V4
 * SP-API requires this for all API calls
 */
function signRequest(
  method: string,
  path: string,
  accessToken: string,
  body?: string
): SignedRequest {
  const { accessKeyId, secretAccessKey } = getAwsCredentials()

  const url = new URL(path, SP_API_BASE_NA)

  const opts: aws4.Request = {
    host: url.hostname,
    path: url.pathname + url.search,
    method,
    service: 'execute-api',
    region: 'us-east-1',
    headers: {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
      'User-Agent': 'TrevorInventory/1.0 (Language=Node.js)',
    },
    body,
  }

  // Sign the request
  aws4.sign(opts, {
    accessKeyId,
    secretAccessKey,
  })

  return {
    url: url.toString(),
    headers: opts.headers as Record<string, string>,
  }
}

// ============================================
// API Helper Methods
// ============================================

interface ApiCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  queryParams?: Record<string, string>
}

/**
 * Make authenticated API call to Amazon SP-API
 * Includes AWS Signature V4 signing
 */
async function apiCall<T>(
  credentialId: string,
  endpoint: string,
  options: ApiCallOptions = {}
): Promise<AmazonSpApiResponse<T>> {
  const { method = 'GET', body, queryParams } = options

  // Get valid access token (auto-refresh if needed)
  const tokenResult = await getValidAccessToken(credentialId)
  if (!tokenResult.success || !tokenResult.data) {
    return {
      success: false,
      error: tokenResult.error || { code: 'TOKEN_ERROR', message: 'Failed to get access token' },
    }
  }

  // Build path with query params
  let path = endpoint
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams(queryParams)
    path = `${endpoint}?${params.toString()}`
  }

  // Sign the request
  const bodyString = body ? JSON.stringify(body) : undefined
  const signed = signRequest(method, path, tokenResult.data, bodyString)

  try {
    const response = await fetch(signed.url, {
      method,
      headers: signed.headers,
      body: bodyString,
    })

    if (!response.ok) {
      const errorText = await response.text()

      // Handle rate limiting
      if (response.status === 429) {
        return {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded. Please try again later.',
            details: errorText,
          },
        }
      }

      // Handle auth errors
      if (response.status === 401 || response.status === 403) {
        // Update credential status
        await prisma.integrationCredential.update({
          where: { id: credentialId },
          data: {
            status: 'error',
            lastErrorAt: new Date(),
            lastError: `Authentication failed: ${response.status}`,
          },
        })

        return {
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Authentication failed. Token may be invalid.',
            details: errorText,
          },
        }
      }

      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: `API call failed: ${response.status}`,
          details: errorText,
        },
      }
    }

    const data = await response.json() as T
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'API_CALL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error during API call',
      },
    }
  }
}

// ============================================
// Seller Info Methods
// ============================================

interface SellersResponse {
  payload: Array<{
    sellerId: string
    marketplaceId: string
    businessName?: string
  }>
}

/**
 * Get seller participation (marketplace info)
 * This is a good test to verify the connection works
 */
export async function getSellerInfo(credentialId: string): Promise<AmazonSpApiResponse<SellersResponse>> {
  return apiCall<SellersResponse>(credentialId, '/sellers/v1/marketplaceParticipations')
}

// ============================================
// Token Revocation
// ============================================

/**
 * Revoke access (mark credential as revoked in database)
 */
export async function revokeAccess(credentialId: string): Promise<void> {
  await prisma.integrationCredential.update({
    where: { id: credentialId },
    data: {
      status: 'revoked',
      encryptedAccessToken: '', // Clear sensitive data
      encryptedRefreshToken: null,
      expiresAt: null,
    },
  })

  logCredentialAccess({
    credentialId,
    integrationType: 'amazon_sp',
    action: 'delete',
  })
}

// ============================================
// Connection Verification
// ============================================

/**
 * Verify the connection is working by making a test API call
 */
export async function verifyConnection(credentialId: string): Promise<AmazonSpApiResponse<boolean>> {
  const result = await getSellerInfo(credentialId)

  if (result.success) {
    return { success: true, data: true }
  }

  return {
    success: false,
    error: result.error,
  }
}
