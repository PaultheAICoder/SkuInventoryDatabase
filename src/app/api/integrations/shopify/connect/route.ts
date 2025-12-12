/**
 * Shopify Connect API Route
 *
 * Initiates OAuth flow for connecting a Shopify store.
 * POST /api/integrations/shopify/connect
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

    // Get user's primary company
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: session.user.id,
        isPrimary: true,
      },
      select: { companyId: true, role: true },
    })

    if (!userCompany) {
      return NextResponse.json(
        { error: 'User must belong to a company' },
        { status: 400 }
      )
    }

    // Only admin can connect integrations
    if (userCompany.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can connect integrations' },
        { status: 403 }
      )
    }

    // Check if already connected
    const existing = await prisma.shopifyConnection.findFirst({
      where: {
        companyId: userCompany.companyId,
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
      companyId: userCompany.companyId,
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
