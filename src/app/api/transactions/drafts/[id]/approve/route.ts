import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { unauthorized, forbidden, serverError, error } from '@/lib/api-response'
import { approveDraftTransaction } from '@/services/draft-transaction'

// =============================================================================
// POST /api/transactions/drafts/[id]/approve - Approve a draft transaction
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Mark request as used
  void request

  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    // Only admin and ops can approve drafts
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return forbidden()
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const result = await approveDraftTransaction({
      id,
      companyId: selectedCompanyId,
      reviewedById: session.user.id,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      data: result.transaction,
      message: 'Draft transaction approved',
    })
  } catch (error) {
    console.error('Error approving draft transaction:', error)
    return serverError()
  }
}
