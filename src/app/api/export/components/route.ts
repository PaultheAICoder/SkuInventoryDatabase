import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unauthorized, serverError } from '@/lib/api-response'
import { getComponentQuantities, calculateReorderStatus, getCompanySettings } from '@/services/inventory'
import {
  toCSV,
  componentExportColumns,
  generateExportFilename,
  type ComponentExportData,
} from '@/services/export'

// GET /api/export/components - Export all components to CSV
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

    // Get company settings
    const settings = await getCompanySettings(selectedCompanyId)

    // Get all components for the selected company (and optionally brand)
    const components = await prisma.component.findMany({
      where: {
        companyId: selectedCompanyId,
        ...(selectedBrandId && { brandId: selectedBrandId }),
      },
      orderBy: { name: 'asc' },
    })

    // Get quantities for all components (filtered by location if specified)
    const componentIds = components.map((c) => c.id)
    const quantities = await getComponentQuantities(componentIds, selectedCompanyId!, locationId)

    // Transform to export format
    const exportData: ComponentExportData[] = components.map((component) => {
      const quantityOnHand = quantities.get(component.id) ?? 0
      const reorderStatus = calculateReorderStatus(quantityOnHand, component.reorderPoint, settings.reorderWarningMultiplier)

      return {
        id: component.id,
        name: component.name,
        skuCode: component.skuCode,
        category: component.category,
        unitOfMeasure: component.unitOfMeasure,
        costPerUnit: component.costPerUnit.toString(),
        reorderPoint: component.reorderPoint,
        leadTimeDays: component.leadTimeDays,
        quantityOnHand,
        reorderStatus,
        notes: component.notes,
        isActive: component.isActive,
        createdAt: component.createdAt.toISOString(),
        updatedAt: component.updatedAt.toISOString(),
      }
    })

    // Generate CSV
    const csv = toCSV(exportData, componentExportColumns)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${generateExportFilename('components')}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting components:', error)
    return serverError()
  }
}
