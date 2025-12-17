import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { unauthorized, serverError, error } from '@/lib/api-response'
import { getDraftCount } from '@/services/draft-transaction'

// =============================================================================
// GET /api/transactions/drafts/count - Get count of pending drafts
// =============================================================================

export async function GET(request: NextRequest) {
  // Mark request as used
  void request

  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const count = await getDraftCount(selectedCompanyId)

    return NextResponse.json({ count })
  } catch (error) {
    console.error('Error getting draft count:', error)
    return serverError()
  }
}
