/**
 * Shopify Disconnect API Route
 *
 * Disconnects the Shopify store from the user's company.
 * POST /api/integrations/shopify/disconnect
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logCredentialAudit } from '@/lib/encryption'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's primary company and verify admin role
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

    // Only admin can disconnect
    if (userCompany.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can disconnect integrations' },
        { status: 403 }
      )
    }

    // Find and deactivate connection
    const connection = await prisma.shopifyConnection.findFirst({
      where: {
        companyId: userCompany.companyId,
        isActive: true,
      },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'No Shopify store connected' },
        { status: 400 }
      )
    }

    // Deactivate connection (keep record for audit)
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        isActive: false,
        accessToken: '', // Clear token
      },
    })

    // Log credential deletion for audit
    logCredentialAudit({
      action: 'delete',
      credentialId: connection.id,
      integrationType: 'shopify_oauth',
      userId: session.user.id,
      timestamp: new Date(),
      success: true,
      metadata: {
        shopName: connection.shopName,
        companyId: userCompany.companyId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Shopify disconnect error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect store' },
      { status: 500 }
    )
  }
}
