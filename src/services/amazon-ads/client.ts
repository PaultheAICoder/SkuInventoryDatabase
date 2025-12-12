/**
 * Amazon Ads API Client
 *
 * Handles OAuth2 authentication and API communication with Amazon Advertising API.
 * Includes automatic token refresh middleware for expired access tokens (1-hour expiry).
 */

import { encrypt, decrypt, logCredentialAccess } from '@/lib/encryption'
import { prisma } from '@/lib/db'
import type {
  AmazonAdsTokenResponse,
  AmazonAdsProfile,
  AmazonAdsPortfolio,
  AmazonAdsCampaign,
  AmazonAdsAdGroup,
  AmazonAdsApiResponse,
  ReportRequest,
  ReportResponse,
} from './types'

// ============================================
// Configuration
// ============================================

const AMAZON_AUTH_URL = 'https://www.amazon.com/ap/oa'
const AMAZON_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'
const AMAZON_ADS_API_BASE = 'https://advertising-api.amazon.com'

// Token refresh buffer - refresh if expiring within 5 minutes
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// ============================================
// Environment Variables
// ============================================

function getClientId(): string {
  const clientId = process.env.AMAZON_ADS_CLIENT_ID
  if (!clientId) {
    throw new Error('AMAZON_ADS_CLIENT_ID environment variable is required')
  }
  return clientId
}

function getClientSecret(): string {
  const clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET
  if (!clientSecret) {
    throw new Error('AMAZON_ADS_CLIENT_SECRET environment variable is required')
  }
  return clientSecret
}

function getRedirectUri(): string {
  const redirectUri = process.env.AMAZON_ADS_REDIRECT_URI
  if (!redirectUri) {
    throw new Error('AMAZON_ADS_REDIRECT_URI environment variable is required')
  }
  return redirectUri
}

// ============================================
// OAuth2 Methods
// ============================================

/**
 * Generate authorization URL for Amazon OAuth flow
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    scope: 'advertising::campaign_management',
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    state,
  })

  return `${AMAZON_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for access/refresh tokens
 */
export async function exchangeCode(code: string): Promise<AmazonAdsApiResponse<AmazonAdsTokenResponse>> {
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

    const data = await response.json() as AmazonAdsTokenResponse
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
export async function refreshToken(refreshToken: string): Promise<AmazonAdsApiResponse<AmazonAdsTokenResponse>> {
  try {
    const response = await fetch(AMAZON_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
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

    const data = await response.json() as AmazonAdsTokenResponse
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
 * This is the automatic token refresh middleware (FR-021)
 */
export async function getValidAccessToken(credentialId: string): Promise<AmazonAdsApiResponse<string>> {
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
// API Helper Methods
// ============================================

interface ApiCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  profileId?: string
}

/**
 * Make authenticated API call to Amazon Ads API
 */
async function apiCall<T>(
  credentialId: string,
  endpoint: string,
  options: ApiCallOptions = {}
): Promise<AmazonAdsApiResponse<T>> {
  const { method = 'GET', body, profileId } = options

  // Get valid access token (auto-refresh if needed)
  const tokenResult = await getValidAccessToken(credentialId)
  if (!tokenResult.success || !tokenResult.data) {
    return {
      success: false,
      error: tokenResult.error || { code: 'TOKEN_ERROR', message: 'Failed to get access token' },
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${tokenResult.data}`,
    'Amazon-Advertising-API-ClientId': getClientId(),
    'Content-Type': 'application/json',
  }

  if (profileId) {
    headers['Amazon-Advertising-API-Scope'] = profileId
  }

  try {
    const response = await fetch(`${AMAZON_ADS_API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
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
// Profile Methods
// ============================================

/**
 * Get advertising profiles associated with the account
 */
export async function getProfiles(credentialId: string): Promise<AmazonAdsApiResponse<AmazonAdsProfile[]>> {
  return apiCall<AmazonAdsProfile[]>(credentialId, '/v2/profiles')
}

// ============================================
// Portfolio Methods (US2 Extension)
// ============================================

/**
 * Get all portfolios for a profile
 */
export async function getPortfolios(
  credentialId: string,
  profileId: string
): Promise<AmazonAdsApiResponse<AmazonAdsPortfolio[]>> {
  return apiCall<AmazonAdsPortfolio[]>(credentialId, '/v2/portfolios', { profileId })
}

// ============================================
// Campaign Methods (US2 Extension)
// ============================================

/**
 * Get all campaigns for a profile
 */
export async function getCampaigns(
  credentialId: string,
  profileId: string
): Promise<AmazonAdsApiResponse<AmazonAdsCampaign[]>> {
  return apiCall<AmazonAdsCampaign[]>(credentialId, '/v2/sp/campaigns', { profileId })
}

// ============================================
// Ad Group Methods (US2 Extension)
// ============================================

/**
 * Get all ad groups for a profile
 */
export async function getAdGroups(
  credentialId: string,
  profileId: string
): Promise<AmazonAdsApiResponse<AmazonAdsAdGroup[]>> {
  return apiCall<AmazonAdsAdGroup[]>(credentialId, '/v2/sp/adGroups', { profileId })
}

// ============================================
// Report Methods (US2 Extension)
// ============================================

/**
 * Request a new report
 */
export async function requestReport(
  credentialId: string,
  profileId: string,
  request: ReportRequest
): Promise<AmazonAdsApiResponse<ReportResponse>> {
  return apiCall<ReportResponse>(credentialId, '/reporting/reports', {
    method: 'POST',
    profileId,
    body: request,
  })
}

/**
 * Get report status
 */
export async function getReportStatus(
  credentialId: string,
  profileId: string,
  reportId: string
): Promise<AmazonAdsApiResponse<ReportResponse>> {
  return apiCall<ReportResponse>(credentialId, `/reporting/reports/${reportId}`, { profileId })
}

/**
 * Download completed report
 * Returns the raw report data (usually gzipped JSON)
 */
export async function downloadReport(reportUrl: string): Promise<AmazonAdsApiResponse<Buffer>> {
  try {
    const response = await fetch(reportUrl)

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'REPORT_DOWNLOAD_FAILED',
          message: `Failed to download report: ${response.status}`,
        },
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return { success: true, data: buffer }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'REPORT_DOWNLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error downloading report',
      },
    }
  }
}

// ============================================
// Token Revocation
// ============================================

/**
 * Revoke access (mark credential as revoked in database)
 * Note: Amazon doesn't provide a token revocation endpoint
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
    integrationType: 'amazon_ads',
    action: 'delete',
  })
}
