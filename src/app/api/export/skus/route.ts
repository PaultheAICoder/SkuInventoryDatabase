import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unauthorized, serverError } from '@/lib/api-response'
import { calculateBOMUnitCost, calculateMaxBuildableUnits } from '@/services/bom'
import { toCSV, skuExportColumns, generateExportFilename, type SKUExportData } from '@/services/export'

// GET /api/export/skus - Export all SKUs to CSV
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Get user's brand
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { company: { include: { brands: { where: { isActive: true }, take: 1 } } } },
    })

    if (!user?.company.brands[0]) {
      // Return empty CSV
      const csv = toCSV([], skuExportColumns)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${generateExportFilename('skus')}"`,
        },
      })
    }

    const brandId = user.company.brands[0].id

    // Get all SKUs for the brand with active BOM versions
    const skus = await prisma.sKU.findMany({
      where: { brandId },
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

    // Transform to export format
    const exportData: SKUExportData[] = await Promise.all(
      skus.map(async (sku) => {
        const activeBom = sku.bomVersions[0]
        let bomCost: string | null = null
        let maxBuildableUnits: number | null = null

        if (activeBom) {
          bomCost = await calculateBOMUnitCost(activeBom.id).then((c) => c?.toString() ?? null)
          maxBuildableUnits = await calculateMaxBuildableUnits(sku.id)
        }

        return {
          id: sku.id,
          name: sku.name,
          internalCode: sku.internalCode,
          salesChannel: sku.salesChannel,
          notes: sku.notes,
          isActive: sku.isActive,
          bomCost,
          maxBuildableUnits,
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
