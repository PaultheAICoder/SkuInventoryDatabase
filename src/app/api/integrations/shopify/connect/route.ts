/**
 * Shopify Connect API Route
 *
 * Initiates OAuth flow for connecting a Shopify store.
 * POST /api/integrations/shopify/connect
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getAuthUrl } from '@/services/shopify/client'
import { storeOAuthState } from '@/services/shopify/oauth-state'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check selectedCompanyId BEFORE role check to return proper 400 error
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected. Please refresh the page and try again.' },
        { status: 400 }
      )
    }

    // Admin only (using company-specific role)
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can connect integrations' },
        { status: 403 }
      )
    }

    const companyId = selectedCompanyId

    // Check if already connected
    const existing = await prisma.shopifyConnection.findFirst({
      where: {
        companyId,
        isActive: true,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A Shopify store is already connected. Disconnect it first.' },
        { status: 400 }
      )
    }

    // Get shop from request
    const body = await request.json()
    const { shop } = body as { shop?: string }

    if (!shop) {
      return NextResponse.json(
        { error: 'Shop name is required (e.g., mystore.myshopify.com)' },
        { status: 400 }
      )
    }

    // Generate state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')

    // Store state with associated data
    storeOAuthState(state, {
      shop,
      companyId,
      userId: session.user.id,
    })

    // Generate authorization URL
    const authUrl = getAuthUrl(shop, state)

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Shopify connect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate connection' },
      { status: 500 }
    )
  }
}
