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
import { getComponentQuantities } from '@/services/inventory'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/bom-versions/:id - Get BOM version details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    const bomVersion = await prisma.bOMVersion.findFirst({
      where: {
        id,
        sku: {
          brand: {
            companyId: session.user.companyId,
          },
        },
      },
      include: {
        sku: {
          select: {
            id: true,
            name: true,
            internalCode: true,
          },
        },
        lines: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                skuCode: true,
                costPerUnit: true,
                unitOfMeasure: true,
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
    })

    if (!bomVersion) {
      return notFound('BOM version')
    }

    // Get component quantities
    const componentIds = bomVersion.lines.map((l) => l.componentId)
    const quantities = await getComponentQuantities(componentIds)

    // Calculate unit cost
    const unitCost = bomVersion.lines.reduce((sum, line) => {
      return sum + line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber()
    }, 0)

    return success({
      id: bomVersion.id,
      skuId: bomVersion.skuId,
      sku: bomVersion.sku,
      versionName: bomVersion.versionName,
      effectiveStartDate: bomVersion.effectiveStartDate.toISOString().split('T')[0],
      effectiveEndDate: bomVersion.effectiveEndDate?.toISOString().split('T')[0] ?? null,
      isActive: bomVersion.isActive,
      notes: bomVersion.notes,
      defectNotes: bomVersion.defectNotes,
      qualityMetadata: bomVersion.qualityMetadata as Record<string, unknown>,
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
    console.error('Error getting BOM version:', error)
    return serverError()
  }
}
