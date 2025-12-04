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

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Verify SKU exists and belongs to user's selected company
    const sku = await prisma.sKU.findFirst({
      where: {
        id: data.skuId,
        companyId: selectedCompanyId,
      },
      include: {
        bomVersions: {
          where: {
            effectiveStartDate: { lte: data.date },
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: data.date } }
            ]
          },
          orderBy: { effectiveStartDate: 'desc' },
          take: 1,
        },
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    if (!sku.bomVersions[0]) {
      const buildDateStr = data.date.toISOString().split('T')[0]
      return error(`No BOM version effective on ${buildDateStr} for this SKU`, 400)
    }

    const selectedBomVersionId = sku.bomVersions[0].id

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

    // Get company settings
    const settings = await getCompanySettings(selectedCompanyId)

    // Determine if we allow insufficient inventory
    // If settings.allowNegativeInventory is true, OR if user explicitly allows it
    const allowInsufficient = settings.allowNegativeInventory || data.allowInsufficientInventory

    try {
      // Create the build transaction for the selected company
      const result = await createBuildTransaction({
        companyId: selectedCompanyId,
        skuId: data.skuId,
        bomVersionId: selectedBomVersionId,
        unitsToBuild: data.unitsToBuild,
        salesChannel: data.salesChannel,
        date: data.date,
        notes: data.notes,
        defectCount: data.defectCount,
        defectNotes: data.defectNotes,
        affectedUnits: data.affectedUnits,
        createdById: session.user.id,
        allowInsufficientInventory: allowInsufficient,
        locationId: data.locationId,
      })

      return created({
        data: {
          id: result.transaction.id,
          type: result.transaction.type,
          date: result.transaction.date.toISOString().split('T')[0],
          sku: result.transaction.sku,
          bomVersion: result.transaction.bomVersion,
          locationId: result.transaction.locationId,
          location: result.transaction.location,
          salesChannel: result.transaction.salesChannel,
          unitsBuild: result.transaction.unitsBuild,
          unitBomCost: result.transaction.unitBomCost?.toString() ?? null,
          totalBomCost: result.transaction.totalBomCost?.toString() ?? null,
          notes: result.transaction.notes,
          defectCount: result.transaction.defectCount,
          defectNotes: result.transaction.defectNotes,
          affectedUnits: result.transaction.affectedUnits,
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
          bomVersionId: selectedBomVersionId,
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
