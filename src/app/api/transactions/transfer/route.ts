import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { created, unauthorized, serverError, parseBody, error } from '@/lib/api-response'
import { createTransferSchema } from '@/types/transaction'
import { createTransferTransaction } from '@/services/transfer'

// POST /api/transactions/transfer - Create a transfer transaction
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Check role - Viewer cannot create transactions
    if (session.user.role === 'viewer') {
      return unauthorized('You do not have permission to create transactions')
    }

    const bodyResult = await parseBody(request, createTransferSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Create the transfer transaction
    const transaction = await createTransferTransaction({
      companyId: selectedCompanyId,
      componentId: data.componentId,
      quantity: data.quantity,
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      date: data.date,
      notes: data.notes,
      createdById: session.user.id,
    })

    return created({
      id: transaction.id,
      type: transaction.type,
      date: transaction.date.toISOString().split('T')[0],
      fromLocationId: transaction.fromLocationId,
      fromLocation: transaction.fromLocation,
      toLocationId: transaction.toLocationId,
      toLocation: transaction.toLocation,
      notes: transaction.notes,
      createdAt: transaction.createdAt.toISOString(),
      createdBy: transaction.createdBy,
      lines: transaction.lines.map((line) => ({
        id: line.id,
        component: line.component,
        quantityChange: line.quantityChange.toString(),
        costPerUnit: line.costPerUnit?.toString() ?? null,
      })),
    })
  } catch (err) {
    console.error('Error creating transfer transaction:', err)

    // Return specific error messages for known validation errors
    if (err instanceof Error) {
      if (err.message.includes('same location') ||
          err.message.includes('not found') ||
          err.message.includes('not active') ||
          err.message.includes('Insufficient inventory')) {
        return error(err.message, 400)
      }
    }

    return serverError()
  }
}
