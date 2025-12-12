/**
 * POST /api/integrations/amazon-ads/connect
 *
 * Initiates OAuth flow for Amazon Ads connection.
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { getAuthUrl } from '@/services/amazon-ads/client'
import { storeOAuthState } from '@/services/amazon-ads/oauth-state'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin permission required' },
        { status: 403 }
      )
    }

    // Parse request body
    let brandId: string | undefined
    try {
      const body = await request.json()
      brandId = body.brandId
    } catch {
      // Body is optional
    }

    const companyId = session.user.selectedCompanyId

    // Generate secure state token for CSRF protection
    const state = randomBytes(32).toString('hex')

    // Store state with company/brand context (expires in 10 minutes)
    storeOAuthState(state, { companyId, brandId })

    // Generate authorization URL
    const authUrl = getAuthUrl(state)

    return NextResponse.json({
      authUrl,
      state,
    })
  } catch (error) {
    console.error('Error initiating Amazon Ads OAuth:', error)
    return NextResponse.json(
      { error: 'Failed to initiate connection' },
      { status: 500 }
    )
  }
}
