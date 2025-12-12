/**
 * GET /api/integrations/amazon-ads/callback
 *
 * OAuth callback handler for Amazon Ads.
 * Exchanges authorization code for tokens and stores encrypted credentials.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt, logCredentialAudit } from '@/lib/encryption'
import { exchangeCode, getProfiles } from '@/services/amazon-ads/client'
import { retrieveOAuthState } from '@/services/amazon-ads/oauth-state'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('Amazon Ads OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(errorDescription || error)}`, request.url)
    )
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/integrations?error=Missing%20authorization%20code%20or%20state', request.url)
    )
  }

  // Verify state token (CSRF protection)
  const stateData = retrieveOAuthState(state)
  if (!stateData) {
    return NextResponse.redirect(
      new URL('/integrations?error=Invalid%20or%20expired%20state%20token', request.url)
    )
  }

  const { companyId, brandId } = stateData

  try {
    // Exchange authorization code for tokens
    const tokenResult = await exchangeCode(code)

    if (!tokenResult.success || !tokenResult.data) {
      console.error('Token exchange failed:', tokenResult.error)
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(tokenResult.error?.message || 'Token exchange failed')}`, request.url)
      )
    }

    const { access_token, refresh_token, expires_in } = tokenResult.data

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + expires_in * 1000)

    // Create temporary credential for profile lookup
    // We'll update it with proper external account info after
    const tempCredential = await prisma.integrationCredential.create({
      data: {
        companyId,
        brandId: brandId || null,
        integrationType: 'amazon_ads',
        encryptedAccessToken: encrypt(access_token, { integrationType: 'amazon_ads' }),
        encryptedRefreshToken: encrypt(refresh_token, { integrationType: 'amazon_ads' }),
        scopes: ['advertising::campaign_management'],
        expiresAt,
        status: 'active',
      },
    })

    // Get profiles to extract account information
    const profilesResult = await getProfiles(tempCredential.id)

    let externalAccountId: string | null = null
    let externalAccountName: string | null = null

    if (profilesResult.success && profilesResult.data && profilesResult.data.length > 0) {
      // Find US marketplace profile preferentially
      const usProfile = profilesResult.data.find(p => p.countryCode === 'US') || profilesResult.data[0]
      externalAccountId = usProfile.profileId.toString()
      externalAccountName = usProfile.accountInfo?.name || `Amazon Ads (${usProfile.countryCode})`
    }

    // Update credential with account info
    await prisma.integrationCredential.update({
      where: { id: tempCredential.id },
      data: {
        externalAccountId,
        externalAccountName,
      },
    })

    // Log successful credential creation
    logCredentialAudit({
      action: 'store',
      credentialId: tempCredential.id,
      integrationType: 'amazon_ads',
      timestamp: new Date(),
      success: true,
      metadata: { externalAccountId, externalAccountName },
    })

    // Redirect to integrations page with success
    return NextResponse.redirect(
      new URL('/integrations?status=connected', request.url)
    )
  } catch (error) {
    console.error('Error in Amazon Ads callback:', error)

    // Log failed credential creation
    logCredentialAudit({
      action: 'store',
      integrationType: 'amazon_ads',
      timestamp: new Date(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.redirect(
      new URL('/integrations?error=Failed%20to%20complete%20connection', request.url)
    )
  }
}
