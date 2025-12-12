/**
 * Shopify OAuth Callback Route
 *
 * Handles OAuth callback from Shopify and stores credentials.
 * GET /api/integrations/shopify/callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exchangeCode, fetchShopInfo } from '@/services/shopify/client'
import { retrieveOAuthState } from '@/services/shopify/oauth-state'
import { encrypt, logCredentialAudit } from '@/lib/encryption'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const shop = searchParams.get('shop')

  // Validate required parameters
  if (!code || !state || !shop) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent('Missing OAuth parameters')}`, request.url)
    )
  }

  // Validate state token
  const stateData = retrieveOAuthState(state)
  if (!stateData) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent('Invalid or expired state token')}`, request.url)
    )
  }

  // Verify shop matches
  const normalizedShop = shop.replace('.myshopify.com', '').replace(/^https?:\/\//, '')
  const normalizedStoredShop = stateData.shop.replace('.myshopify.com', '').replace(/^https?:\/\//, '')
  if (normalizedShop !== normalizedStoredShop) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent('Shop mismatch')}`, request.url)
    )
  }

  try {
    // Exchange code for access token
    const tokenResult = await exchangeCode(shop, code)
    if (!tokenResult.success) {
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(tokenResult.error.message)}`, request.url)
      )
    }

    // Encrypt access token before storing
    const encryptedToken = encrypt(tokenResult.data.access_token)

    // Create connection record
    const connection = await prisma.shopifyConnection.create({
      data: {
        companyId: stateData.companyId,
        shopName: normalizedShop,
        accessToken: encryptedToken,
        isActive: true,
        syncStatus: 'idle',
      },
    })

    // Log credential creation for audit
    logCredentialAudit({
      action: 'store',
      credentialId: connection.id,
      integrationType: 'shopify_oauth',
      userId: stateData.userId,
      timestamp: new Date(),
      success: true,
      metadata: {
        shopName: normalizedShop,
        scopes: tokenResult.data.scope,
        companyId: stateData.companyId,
      },
    })

    // Test connection by fetching shop info
    const shopInfo = await fetchShopInfo(connection.id)
    if (shopInfo.success) {
      console.log(`Shopify connected: ${shopInfo.data.name} (${shopInfo.data.myshopify_domain})`)
    }

    return NextResponse.redirect(
      new URL('/integrations?status=connected&type=shopify', request.url)
    )
  } catch (error) {
    console.error('Shopify callback error:', error)
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent('Failed to complete connection')}`, request.url)
    )
  }
}
