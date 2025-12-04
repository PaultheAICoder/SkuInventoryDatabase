import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { unauthorized, forbidden, serverError, validationError } from '@/lib/api-response'
import { batchApproveDraftsSchema } from '@/types/draft'
import { batchApproveDrafts } from '@/services/draft-transaction'

// =============================================================================
// POST /api/transactions/drafts/batch-approve - Batch approve draft transactions
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    // Only admin and ops can approve drafts
    if (session.user.role === 'viewer') {
      return forbidden()
    }

    const body = await request.json()
    const parsed = batchApproveDraftsSchema.safeParse(body)

    if (!parsed.success) {
      return validationError(parsed.error)
    }

    const selectedCompanyId = session.user.selectedCompanyId

    const result = await batchApproveDrafts({
      draftIds: parsed.data.draftIds,
      companyId: selectedCompanyId,
      reviewedById: session.user.id,
    })

    return NextResponse.json({
      data: result,
      message: `Approved ${result.succeeded} of ${result.total} drafts`,
    })
  } catch (error) {
    console.error('Error batch approving drafts:', error)
    return serverError()
  }
}
