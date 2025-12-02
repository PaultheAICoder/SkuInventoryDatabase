import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, unauthorized, notFound, serverError, parseBody } from '@/lib/api-response'
import { createAdjustmentSchema } from '@/types/transaction'
import { createAdjustmentTransaction } from '@/services/inventory'

// POST /api/transactions/adjustment - Create an adjustment transaction
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

    const bodyResult = await parseBody(request, createAdjustmentSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Verify component exists and belongs to user's company
    const component = await prisma.component.findFirst({
      where: {
        id: data.componentId,
        brand: {
          company: { id: session.user.companyId },
        },
      },
    })

    if (!component) {
      return notFound('Component')
    }

    // Create the adjustment transaction
    const transaction = await createAdjustmentTransaction({
      companyId: session.user.companyId,
      componentId: data.componentId,
      quantity: data.quantity,
      date: data.date,
      reason: data.reason,
      notes: data.notes,
      createdById: session.user.id,
    })

    return created({
      id: transaction.id,
      type: transaction.type,
      date: transaction.date.toISOString().split('T')[0],
      reason: transaction.reason,
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
  } catch (error) {
    console.error('Error creating adjustment transaction:', error)
    return serverError()
  }
}
