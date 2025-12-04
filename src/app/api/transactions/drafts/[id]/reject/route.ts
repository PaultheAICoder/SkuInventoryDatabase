import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { unauthorized, forbidden, serverError } from '@/lib/api-response'
import { rejectDraftSchema } from '@/types/draft'
import { rejectDraftTransaction } from '@/services/draft-transaction'

// =============================================================================
// POST /api/transactions/drafts/[id]/reject - Reject a draft transaction
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    // Only admin and ops can reject drafts
    if (session.user.role === 'viewer') {
      return forbidden()
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    // Parse optional reason from body
    let reason: string | undefined
    try {
      const body = await request.json()
      const parsed = rejectDraftSchema.safeParse(body)
      if (parsed.success) {
        reason = parsed.data.reason
      }
    } catch {
      // No body or invalid JSON is fine - reason is optional
    }

    const result = await rejectDraftTransaction({
      id,
      companyId: selectedCompanyId,
      reviewedById: session.user.id,
      reason,
    })

    return NextResponse.json({
      data: result,
      message: 'Draft transaction rejected',
    })
  } catch (error) {
    console.error('Error rejecting draft transaction:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return serverError()
  }
}
