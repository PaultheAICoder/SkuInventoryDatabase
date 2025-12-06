import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unauthorized, serverError } from '@/lib/api-response'
import { calculateBOMUnitCost, calculateMaxBuildableUnits } from '@/services/bom'
import { toCSV, skuExportColumns, generateExportFilename, type SKUExportData } from '@/services/export'
import { getSkuQuantities } from '@/services/finished-goods'

// GET /api/export/skus - Export all SKUs to CSV
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Parse optional locationId query parameter
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId') ?? undefined

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Get selected brand (may be null for "all brands")
    const selectedBrandId = session.user.selectedBrandId

    // Get all SKUs for the selected company (and optionally brand) with active BOM versions
    const skus = await prisma.sKU.findMany({
      where: {
        companyId: selectedCompanyId,
        ...(selectedBrandId && { brandId: selectedBrandId }),
      },
      orderBy: { name: 'asc' },
      include: {
        bomVersions: {
          where: { isActive: true },
          take: 1,
          include: {
            lines: {
              include: {
                component: true,
              },
            },
          },
        },
      },
    })

    // Get all SKU IDs and fetch FG quantities
    const skuIds = skus.map((sku) => sku.id)
    const fgQuantities = await getSkuQuantities(skuIds, locationId)

    // Transform to export format
    const exportData: SKUExportData[] = await Promise.all(
      skus.map(async (sku) => {
        const activeBom = sku.bomVersions[0]
        let bomCost: string | null = null
        let maxBuildableUnits: number | null = null

        if (activeBom) {
          bomCost = await calculateBOMUnitCost(activeBom.id).then((c) => c?.toString() ?? null)
          maxBuildableUnits = await calculateMaxBuildableUnits(sku.id, selectedCompanyId!, locationId)
        }

        // Get FG balance (0 if none)
        const finishedGoodsOnHand = fgQuantities.get(sku.id) ?? 0

        return {
          id: sku.id,
          name: sku.name,
          internalCode: sku.internalCode,
          salesChannel: sku.salesChannel,
          notes: sku.notes,
          isActive: sku.isActive,
          bomCost,
          maxBuildableUnits,
          finishedGoodsOnHand,
          createdAt: sku.createdAt.toISOString(),
          updatedAt: sku.updatedAt.toISOString(),
        }
      })
    )

    // Generate CSV
    const csv = toCSV(exportData, skuExportColumns)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${generateExportFilename('skus')}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting SKUs:', error)
    return serverError()
  }
}
