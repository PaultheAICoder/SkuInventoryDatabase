import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { unauthorized, forbidden, notFound, serverError, error } from '@/lib/api-response'
import { updateDraftSchema } from '@/types/draft'
import {
  getDraftTransaction,
  updateDraftTransaction,
  deleteDraftTransaction,
} from '@/services/draft-transaction'

// =============================================================================
// GET /api/transactions/drafts/[id] - Get single draft transaction
// =============================================================================

export async function GET(
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

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const draft = await getDraftTransaction({
      id,
      companyId: selectedCompanyId,
    })

    if (!draft) {
      return notFound('Draft transaction not found')
    }

    return NextResponse.json({ data: draft })
  } catch (error) {
    console.error('Error getting draft transaction:', error)
    return serverError()
  }
}

// =============================================================================
// PUT /api/transactions/drafts/[id] - Update draft transaction
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    // Only admin and ops can update drafts
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return forbidden()
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const body = await request.json()
    const parsed = updateDraftSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const updated = await updateDraftTransaction({
      id,
      companyId: selectedCompanyId,
      input: parsed.data,
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Error updating draft transaction:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return notFound(error.message)
    }
    return serverError()
  }
}

// =============================================================================
// DELETE /api/transactions/drafts/[id] - Delete draft transaction
// =============================================================================

export async function DELETE(
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

    // Only admin and ops can delete drafts
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return forbidden()
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    await deleteDraftTransaction({
      id,
      companyId: selectedCompanyId,
      deletedById: session.user.id,  // Pass user ID for audit trail
    })

    return NextResponse.json({ message: 'Draft deleted successfully' })
  } catch (error) {
    console.error('Error deleting draft transaction:', error)
    if (error instanceof Error && error.message.includes('not found')) {
      return notFound(error.message)
    }
    return serverError()
  }
}
