/**
 * Shopify Status API Route
 *
 * Returns connection status for the user's company.
 * GET /api/integrations/shopify/status
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getConnectionStatus } from '@/services/shopify/client'

export async function GET() {
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
      select: { companyId: true },
    })

    if (!userCompany) {
      return NextResponse.json(
        { error: 'User must belong to a company' },
        { status: 400 }
      )
    }

    const status = await getConnectionStatus(userCompany.companyId)

    return NextResponse.json(status)
  } catch (error) {
    console.error('Shopify status error:', error)
    return NextResponse.json(
      { error: 'Failed to get connection status' },
      { status: 500 }
    )
  }
}
