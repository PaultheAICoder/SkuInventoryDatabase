import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, unauthorized, notFound, error, serverError, parseBody } from '@/lib/api-response'
import { createBuildSchema } from '@/types/transaction'
import { createBuildTransaction, getCompanySettings, checkInsufficientInventory } from '@/services/inventory'

// POST /api/transactions/build - Create a build transaction
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

    const bodyResult = await parseBody(request, createBuildSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Verify SKU exists and belongs to user's company
    const sku = await prisma.sKU.findFirst({
      where: {
        id: data.skuId,
        brand: {
          company: { id: session.user.companyId },
        },
      },
      include: {
        bomVersions: {
          where: { isActive: true },
          take: 1,
        },
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    if (!sku.bomVersions[0]) {
      return error('SKU has no active BOM', 400)
    }

    const activeBomVersionId = sku.bomVersions[0].id

    // Get company settings
    const settings = await getCompanySettings(session.user.companyId)

    // Determine if we allow insufficient inventory
    // If settings.allowNegativeInventory is true, OR if user explicitly allows it
    const allowInsufficient = settings.allowNegativeInventory || data.allowInsufficientInventory

    try {
      // Create the build transaction
      const result = await createBuildTransaction({
        companyId: session.user.companyId,
        skuId: data.skuId,
        bomVersionId: activeBomVersionId,
        unitsToBuild: data.unitsToBuild,
        salesChannel: data.salesChannel,
        date: data.date,
        notes: data.notes,
        createdById: session.user.id,
        allowInsufficientInventory: allowInsufficient,
      })

      return created({
        data: {
          id: result.transaction.id,
          type: result.transaction.type,
          date: result.transaction.date.toISOString().split('T')[0],
          sku: result.transaction.sku,
          bomVersion: result.transaction.bomVersion,
          salesChannel: result.transaction.salesChannel,
          unitsBuild: result.transaction.unitsBuild,
          unitBomCost: result.transaction.unitBomCost?.toString() ?? null,
          totalBomCost: result.transaction.totalBomCost?.toString() ?? null,
          notes: result.transaction.notes,
          createdAt: result.transaction.createdAt.toISOString(),
          createdBy: result.transaction.createdBy,
          lines: result.transaction.lines.map((line) => ({
            id: line.id,
            component: line.component,
            quantityChange: line.quantityChange.toString(),
            costPerUnit: line.costPerUnit?.toString() ?? null,
          })),
          warning: result.warning,
          insufficientItems: result.insufficientItems,
        },
      })
    } catch (error) {
      // Handle insufficient inventory error
      if (error instanceof Error && error.message.includes('Insufficient inventory')) {
        // Return 400 with insufficient items so frontend can show warning
        const insufficientItems = await checkInsufficientInventory({
          bomVersionId: activeBomVersionId,
          unitsToBuild: data.unitsToBuild,
        })

        return NextResponse.json(
          {
            error: 'Insufficient inventory',
            insufficientItems,
          },
          { status: 400 }
        )
      }
      throw error
    }
  } catch (error) {
    console.error('Error creating build transaction:', error)
    return serverError()
  }
}
