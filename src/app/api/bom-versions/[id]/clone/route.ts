import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  created,
  unauthorized,
  serverError,
  parseBody,
} from '@/lib/api-response'
import { cloneBOMVersionSchema } from '@/types/bom'
import { cloneBOMVersion, calculateBOMUnitCost } from '@/services/bom'
import { getComponentQuantities } from '@/services/inventory'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/bom-versions/:id/clone - Clone a BOM version
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    const bodyResult = await parseBody(request, cloneBOMVersionSchema)
    if (bodyResult.error) return bodyResult.error

    const { versionName } = bodyResult.data

    const newBomVersion = await cloneBOMVersion({
      bomVersionId: id,
      newVersionName: versionName,
      createdById: session.user.id,
    })

    // Calculate unit cost
    const unitCost = await calculateBOMUnitCost(newBomVersion.id)

    // Get component quantities
    const componentIds = newBomVersion.lines.map((l) => l.componentId)
    const quantities = await getComponentQuantities(componentIds)

    return created({
      id: newBomVersion.id,
      skuId: newBomVersion.skuId,
      versionName: newBomVersion.versionName,
      effectiveStartDate: newBomVersion.effectiveStartDate.toISOString().split('T')[0],
      effectiveEndDate: newBomVersion.effectiveEndDate?.toISOString().split('T')[0] ?? null,
      isActive: newBomVersion.isActive,
      notes: newBomVersion.notes,
      unitCost: unitCost.toFixed(4),
      lines: newBomVersion.lines.map((line) => ({
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
      createdAt: newBomVersion.createdAt.toISOString(),
      createdBy: newBomVersion.createdBy,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'BOM version not found') {
      const { notFound } = await import('@/lib/api-response')
      return notFound('BOM version')
    }
    console.error('Error cloning BOM version:', error)
    return serverError()
  }
}
