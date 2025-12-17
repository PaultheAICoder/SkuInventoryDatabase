import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, unauthorized, notFound, serverError, parseBody, error } from '@/lib/api-response'
import { createOutboundSchema } from '@/types/transaction'
import { createOutboundTransaction } from '@/services/finished-goods'
import { getDefaultLocationId } from '@/services/location'
import { toLocalDateString } from '@/lib/utils'

// POST /api/transactions/outbound - Create an outbound transaction (ship SKUs)
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

    const bodyResult = await parseBody(request, createOutboundSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Verify SKU exists and belongs to user's selected company
    const sku = await prisma.sKU.findFirst({
      where: {
        id: data.skuId,
        companyId: selectedCompanyId,
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    // Get location - use provided or default
    let locationId: string | null | undefined = data.locationId
    if (!locationId) {
      // Get default finished goods location
      const defaultLocation = await prisma.location.findFirst({
        where: {
          companyId: selectedCompanyId,
          type: 'finished_goods',
          isActive: true,
        },
      })
      if (defaultLocation) {
        locationId = defaultLocation.id
      } else {
        locationId = await getDefaultLocationId(selectedCompanyId)
      }
    } else {
      // Validate provided location
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          companyId: selectedCompanyId,
          isActive: true,
        },
      })
      if (!location) {
        return notFound('Location')
      }
    }

    // Ensure we have a location
    if (!locationId) {
      return error('No location available for outbound transaction', 400)
    }

    try {
      // Create the outbound transaction
      const result = await createOutboundTransaction({
        companyId: selectedCompanyId,
        skuId: data.skuId,
        locationId,
        quantity: data.quantity,
        salesChannel: data.salesChannel,
        notes: data.notes,
        date: data.date,
        createdById: session.user.id,
      })

      return created({
        id: result.id,
        type: 'outbound',
        date: toLocalDateString(data.date),
        skuId: data.skuId,
        sku: { id: sku.id, name: sku.name },
        salesChannel: data.salesChannel,
        quantity: data.quantity,
        locationId,
        notes: data.notes,
        newBalance: result.newBalance,
        createdAt: new Date().toISOString(),
        createdBy: { id: session.user.id, name: session.user.name },
      })
    } catch (err) {
      if (err instanceof Error && err.message.includes('Insufficient')) {
        return error(err.message, 400)
      }
      throw err
    }
  } catch (err) {
    console.error('Error creating outbound transaction:', err)
    return serverError()
  }
}
