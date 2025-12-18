/**
 * Shopify Status API Route
 *
 * Returns connection status for the user's company.
 * GET /api/integrations/shopify/status
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

    // Use selected company from session (not primary company)
    const companyId = session.user.selectedCompanyId

    const status = await getConnectionStatus(companyId)

    return NextResponse.json(status)
  } catch (error) {
    console.error('Shopify status error:', error)
    return NextResponse.json(
      { error: 'Failed to get connection status' },
      { status: 500 }
    )
  }
}
