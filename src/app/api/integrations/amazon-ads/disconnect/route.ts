/**
 * POST /api/integrations/amazon-ads/disconnect
 *
 * Disconnects Amazon Ads integration (revokes and deletes credentials).
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { revokeAccess } from '@/services/amazon-ads/client'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json(
        { error: 'Admin permission required' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { credentialId } = body

    if (!credentialId) {
      return NextResponse.json(
        { error: 'credentialId is required' },
        { status: 400 }
      )
    }

    // Verify credential exists and belongs to user's company
    const credential = await prisma.integrationCredential.findUnique({
      where: { id: credentialId },
    })

    if (!credential) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      )
    }

    if (credential.companyId !== session.user.selectedCompanyId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    if (credential.integrationType !== 'amazon_ads') {
      return NextResponse.json(
        { error: 'Invalid credential type' },
        { status: 400 }
      )
    }

    // Revoke access (marks as revoked and clears tokens)
    await revokeAccess(credentialId)

    return NextResponse.json({
      success: true,
      message: 'Amazon Ads disconnected successfully',
    })
  } catch (error) {
    console.error('Error disconnecting Amazon Ads:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    )
  }
}
