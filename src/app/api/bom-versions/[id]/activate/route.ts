import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  success,
  unauthorized,
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

    const bomVersion = await activateBOMVersion(id)

    // Calculate unit cost
    const unitCost = await calculateBOMUnitCost(bomVersion.id)

    // Get component quantities
    const componentIds = bomVersion.lines.map((l) => l.componentId)
    const quantities = await getComponentQuantities(componentIds)

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
    if (error instanceof Error && error.message === 'BOM version not found') {
      const { notFound } = await import('@/lib/api-response')
      return notFound('BOM version')
    }
    console.error('Error activating BOM version:', error)
    return serverError()
  }
}
