import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseQuery, unauthorized, forbidden, serverError, validationError, error } from '@/lib/api-response'
import { createDraftSchema, draftListQuerySchema } from '@/types/draft'
import { createDraftTransaction, getDraftTransactions } from '@/services/draft-transaction'

// =============================================================================
// GET /api/transactions/drafts - List draft transactions
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, draftListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, type, status, sortBy, sortOrder } = queryResult.data

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const result = await getDraftTransactions({
      companyId: selectedCompanyId,
      page,
      pageSize,
      type,
      status,
      sortBy,
      sortOrder,
    })

    return NextResponse.json({
      data: result.data,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing draft transactions:', error)
    return serverError()
  }
}

// =============================================================================
// POST /api/transactions/drafts - Create a draft transaction
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    // Only admin and ops can create drafts
    if (session.user.role === 'viewer') {
      return forbidden()
    }

    const body = await request.json()
    const parsed = createDraftSchema.safeParse(body)

    if (!parsed.success) {
      return validationError(parsed.error)
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const draft = await createDraftTransaction({
      companyId: selectedCompanyId,
      createdById: session.user.id,
      input: parsed.data,
    })

    return NextResponse.json({ data: draft }, { status: 201 })
  } catch (error) {
    console.error('Error creating draft transaction:', error)
    return serverError()
  }
}
