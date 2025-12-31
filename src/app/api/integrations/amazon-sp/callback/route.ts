/**
 * GET /api/integrations/amazon-sp/callback
 *
 * OAuth callback handler for Amazon SP-API.
 * Exchanges spapi_oauth_code for tokens and stores encrypted credentials.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt, logCredentialAudit } from '@/lib/encryption'
import { exchangeCode, getSellerInfo } from '@/services/amazon-sp-api/client'
import { retrieveOAuthState } from '@/services/amazon-sp-api/auth'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  // SP-API uses spapi_oauth_code instead of code
  const code = searchParams.get('spapi_oauth_code')
  const state = searchParams.get('state')
  const sellingPartnerId = searchParams.get('selling_partner_id')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('Amazon SP-API OAuth error:', error, errorDescription)
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

    // Require refresh token for SP-API (needed for long-term access)
    if (!refresh_token) {
      return NextResponse.redirect(
        new URL('/integrations?error=No%20refresh%20token%20received', request.url)
      )
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + expires_in * 1000)

    // Create credential
    const credential = await prisma.integrationCredential.create({
      data: {
        companyId,
        brandId: brandId || null,
        integrationType: 'amazon_sp',
        encryptedAccessToken: encrypt(access_token, { integrationType: 'amazon_sp' }),
        encryptedRefreshToken: encrypt(refresh_token, { integrationType: 'amazon_sp' }),
        scopes: ['sellingpartnerapi::migration'],
        expiresAt,
        status: 'active',
        externalAccountId: sellingPartnerId || null,
      },
    })

    // Get seller info to populate account name
    const sellerResult = await getSellerInfo(credential.id)

    let externalAccountName: string | null = null

    if (sellerResult.success && sellerResult.data?.payload?.[0]) {
      const seller = sellerResult.data.payload[0]
      externalAccountName = seller.businessName || `Amazon Seller (${seller.sellerId})`

      // Update credential with account info
      await prisma.integrationCredential.update({
        where: { id: credential.id },
        data: {
          externalAccountId: seller.sellerId,
          externalAccountName,
        },
      })
    }

    // Log successful credential creation
    logCredentialAudit({
      action: 'store',
      credentialId: credential.id,
      integrationType: 'amazon_sp',
      timestamp: new Date(),
      success: true,
      metadata: { sellingPartnerId, externalAccountName },
    })

    // Redirect to integrations page with success
    return NextResponse.redirect(
      new URL('/integrations?status=connected&type=amazon-sp', request.url)
    )
  } catch (error) {
    console.error('Error in Amazon SP-API callback:', error)

    // Log failed credential creation
    logCredentialAudit({
      action: 'store',
      integrationType: 'amazon_sp',
      timestamp: new Date(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.redirect(
      new URL('/integrations?error=Failed%20to%20complete%20connection', request.url)
    )
  }
}
