import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, unauthorized, notFound, serverError, parseBody } from '@/lib/api-response'
import { createReceiptSchema } from '@/types/transaction'
import { createReceiptTransaction } from '@/services/inventory'
import { toLocalDateString } from '@/lib/utils'

// POST /api/transactions/receipt - Create a receipt transaction
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

    const bodyResult = await parseBody(request, createReceiptSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Verify component exists and belongs to user's selected company
    const component = await prisma.component.findFirst({
      where: {
        id: data.componentId,
        companyId: selectedCompanyId,
      },
    })

    if (!component) {
      return notFound('Component')
    }

    // Validate location if provided
    if (data.locationId) {
      const location = await prisma.location.findFirst({
        where: {
          id: data.locationId,
          companyId: selectedCompanyId,
          isActive: true,
        },
      })
      if (!location) {
        return notFound('Location')
      }
    }

    // Create the receipt transaction for the selected company
    const transaction = await createReceiptTransaction({
      companyId: selectedCompanyId,
      componentId: data.componentId,
      quantity: data.quantity,
      date: data.date,
      supplier: data.supplier,
      costPerUnit: data.costPerUnit,
      updateComponentCost: data.updateComponentCost,
      notes: data.notes,
      createdById: session.user.id,
      locationId: data.locationId,
      lotNumber: data.lotNumber,
      expiryDate: data.expiryDate,
    })

    return created({
      id: transaction.id,
      type: transaction.type,
      date: toLocalDateString(transaction.date),
      supplier: transaction.supplier,
      notes: transaction.notes,
      locationId: transaction.locationId,
      location: transaction.location,
      createdAt: transaction.createdAt.toISOString(),
      createdBy: transaction.createdBy,
      lines: transaction.lines.map((line) => ({
        id: line.id,
        component: line.component,
        quantityChange: line.quantityChange.toString(),
        costPerUnit: line.costPerUnit?.toString() ?? null,
        lotId: line.lotId ?? null,
        lot: line.lot
          ? {
              id: line.lot.id,
              lotNumber: line.lot.lotNumber,
              expiryDate: line.lot.expiryDate ? toLocalDateString(line.lot.expiryDate) : null,
            }
          : null,
      })),
    })
  } catch (error) {
    console.error('Error creating receipt transaction:', error)
    return serverError()
  }
}
