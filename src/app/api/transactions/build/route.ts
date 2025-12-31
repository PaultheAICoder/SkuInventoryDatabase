import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, unauthorized, notFound, error, serverError, parseBody } from '@/lib/api-response'
import { createBuildSchema } from '@/types/transaction'
import { createBuildTransaction, getCompanySettings, checkInsufficientInventory, checkExpiredLotsForBuild } from '@/services/inventory'
import { validateLotOverrides } from '@/services/lot-selection'
import { toLocalDateString } from '@/lib/utils'

// POST /api/transactions/build - Create a build transaction
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Check role - Viewer cannot create transactions
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('You do not have permission to create transactions')
    }

    const bodyResult = await parseBody(request, createBuildSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company and try again.', 400)
    }

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
      const buildDateStr = toLocalDateString(data.date)
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

    // Validate output location if provided
    if (data.outputLocationId) {
      const outputLocation = await prisma.location.findFirst({
        where: {
          id: data.outputLocationId,
          companyId: selectedCompanyId,
          isActive: true,
        },
      })
      if (!outputLocation) {
        return notFound('Output Location')
      }
    }

    // Get company settings
    const settings = await getCompanySettings(selectedCompanyId)

    // Determine if we allow insufficient inventory
    // If settings.allowNegativeInventory is true, OR if user explicitly allows it
    const allowInsufficient = settings.allowNegativeInventory || data.allowInsufficientInventory

    // Check for expired lots if enforcement is enabled
    const enforceExpiry = settings.expiryEnforcementEnabled
    const allowExpiredOverride = settings.allowExpiredOverride

    if (enforceExpiry && !data.allowExpiredLots) {
      const expiredLots = await checkExpiredLotsForBuild({
        bomVersionId: selectedBomVersionId,
        unitsToBuild: data.unitsToBuild,
      })

      if (expiredLots.length > 0 && !allowExpiredOverride) {
        return NextResponse.json(
          {
            error: 'Build would use expired lots and override is not allowed',
            expiredLots,
          },
          { status: 400 }
        )
      }

      if (expiredLots.length > 0) {
        return NextResponse.json(
          {
            error: 'Build would use expired lots',
            expiredLots,
            canOverride: true,
          },
          { status: 400 }
        )
      }
    }

    // Validate lot overrides if provided (tenant isolation security check)
    if (data.lotOverrides && data.lotOverrides.length > 0) {
      const lotValidation = await validateLotOverrides(data.lotOverrides, selectedCompanyId)
      if (!lotValidation.valid) {
        return error(
          `Invalid lot overrides: ${lotValidation.errors.join('; ')}`,
          400
        )
      }
    }

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
        outputToFinishedGoods: data.outputToFinishedGoods,
        outputLocationId: data.outputLocationId,
        outputQuantity: data.outputQuantity,
        lotOverrides: data.lotOverrides,
        allowExpiredLots: data.allowExpiredLots,
      })

      return created({
        data: {
          id: result.transaction.id,
          type: result.transaction.type,
          date: toLocalDateString(result.transaction.date),
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
            lotId: line.lotId ?? null,
            lot: line.lot
              ? {
                  id: line.lot.id,
                  lotNumber: line.lot.lotNumber,
                  expiryDate: line.lot.expiryDate ? toLocalDateString(line.lot.expiryDate) : null,
                }
              : null,
          })),
          outputToFinishedGoods: result.transaction.outputToFinishedGoods ?? true,
          outputLocationId: result.transaction.outputLocationId ?? null,
          outputLocation: result.transaction.outputLocation ?? null,
          outputQuantity: result.transaction.outputQuantity ?? null,
          warning: result.warning,
          insufficientItems: result.insufficientItems,
        },
      })
    } catch (err) {
      // Handle missing output location error
      if (err instanceof Error && err.message.includes('No output location')) {
        return error(err.message, 400, 'BadRequest')
      }
      // Handle insufficient inventory error
      if (err instanceof Error && err.message.includes('Insufficient inventory')) {
        // Return 400 with insufficient items so frontend can show warning
        const insufficientItems = await checkInsufficientInventory({
          bomVersionId: selectedBomVersionId,
          companyId: selectedCompanyId,
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
      throw err
    }
  } catch (error) {
    console.error('Error creating build transaction:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return serverError()
  }
}
