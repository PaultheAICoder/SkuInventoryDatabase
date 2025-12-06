import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  success,
  unauthorized,
  notFound,
  serverError,
} from '@/lib/api-response'
import { activateBOMVersion, calculateBOMUnitCost } from '@/services/bom'
import { getComponentQuantities } from '@/services/inventory'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/bom-versions/:id/activate - Activate a BOM version
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Parse optional locationId query parameter
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId') ?? undefined

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Verify BOM version exists and belongs to user's selected company
    const existingBom = await prisma.bOMVersion.findFirst({
      where: {
        id,
        sku: {
          companyId: selectedCompanyId,
        },
      },
    })

    if (!existingBom) {
      return notFound('BOM version')
    }

    const bomVersion = await activateBOMVersion(id)

    // Calculate unit cost
    const unitCost = await calculateBOMUnitCost(bomVersion.id)

    // Get component quantities (filtered by location if specified)
    const componentIds = bomVersion.lines.map((l) => l.componentId)
    const quantities = await getComponentQuantities(componentIds, selectedCompanyId!, locationId)

    return success({
      id: bomVersion.id,
      skuId: bomVersion.skuId,
      versionName: bomVersion.versionName,
      effectiveStartDate: bomVersion.effectiveStartDate.toISOString().split('T')[0],
      effectiveEndDate: bomVersion.effectiveEndDate?.toISOString().split('T')[0] ?? null,
      isActive: bomVersion.isActive,
      notes: bomVersion.notes,
      unitCost: unitCost.toFixed(4),
      lines: bomVersion.lines.map((line) => ({
        id: line.id,
        component: {
          id: line.component.id,
          name: line.component.name,
          skuCode: line.component.skuCode,
          costPerUnit: line.component.costPerUnit.toString(),
          unitOfMeasure: line.component.unitOfMeasure,
          quantityOnHand: quantities.get(line.componentId) ?? 0,
        },
        quantityPerUnit: line.quantityPerUnit.toString(),
        lineCost: (line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber()).toFixed(4),
        notes: line.notes,
      })),
      createdAt: bomVersion.createdAt.toISOString(),
      createdBy: bomVersion.createdBy,
    })
  } catch (error) {
    console.error('Error activating BOM version:', error)
    return serverError()
  }
}
