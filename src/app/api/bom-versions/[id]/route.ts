import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  success,
  unauthorized,
  notFound,
  versionConflict,
  serverError,
  parseBody,
} from '@/lib/api-response'
import { updateBOMVersionSchema } from '@/types/bom'
import { getComponentQuantities } from '@/services/inventory'
import { calculateBOMUnitCost, updateBOMVersion, VersionConflictError } from '@/services/bom'
import { toLocalDateString } from '@/lib/utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/bom-versions/:id - Get BOM version details
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const bomVersion = await prisma.bOMVersion.findFirst({
      where: {
        id,
        sku: {
          companyId: selectedCompanyId,
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

    // Get component quantities (filtered by location if specified)
    const componentIds = bomVersion.lines.map((l) => l.componentId)
    const quantities = await getComponentQuantities(componentIds, selectedCompanyId!, locationId)

    // Calculate unit cost
    const unitCost = bomVersion.lines.reduce((sum, line) => {
      return sum + line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber()
    }, 0)

    return success({
      id: bomVersion.id,
      skuId: bomVersion.skuId,
      sku: bomVersion.sku,
      versionName: bomVersion.versionName,
      effectiveStartDate: toLocalDateString(bomVersion.effectiveStartDate),
      effectiveEndDate: bomVersion.effectiveEndDate ? toLocalDateString(bomVersion.effectiveEndDate) : null,
      isActive: bomVersion.isActive,
      notes: bomVersion.notes,
      defectNotes: bomVersion.defectNotes,
      qualityMetadata: bomVersion.qualityMetadata as Record<string, unknown>,
      unitCost: unitCost.toFixed(4),
      version: bomVersion.version,
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

// PATCH /api/bom-versions/:id - Update BOM version
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Parse optional locationId query parameter
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId') ?? undefined

    const bodyResult = await parseBody(request, updateBOMVersionSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // If updating lines, verify all components exist and are active
    if (data.lines && data.lines.length > 0) {
      const componentIds = data.lines.map((l) => l.componentId)
      const components = await prisma.component.findMany({
        where: {
          id: { in: componentIds },
          isActive: true,
          companyId: selectedCompanyId,
        },
      })

      if (components.length !== componentIds.length) {
        return serverError('One or more components not found or inactive')
      }
    }

    // Update BOM version (handles version check)
    const bomVersion = await updateBOMVersion({
      bomVersionId: id,
      companyId: selectedCompanyId!,
      ...data,
      version: data.version, // Pass version for optimistic locking
    })

    // Calculate unit cost
    const unitCost = await calculateBOMUnitCost(bomVersion.id, selectedCompanyId!)

    // Get component quantities (filtered by location if specified)
    const componentIds = bomVersion.lines.map((l) => l.componentId)
    const quantities = await getComponentQuantities(componentIds, selectedCompanyId!, locationId)

    return success({
      id: bomVersion.id,
      skuId: bomVersion.skuId,
      versionName: bomVersion.versionName,
      effectiveStartDate: toLocalDateString(bomVersion.effectiveStartDate),
      effectiveEndDate: bomVersion.effectiveEndDate ? toLocalDateString(bomVersion.effectiveEndDate) : null,
      isActive: bomVersion.isActive,
      notes: bomVersion.notes,
      defectNotes: bomVersion.defectNotes,
      qualityMetadata: bomVersion.qualityMetadata as Record<string, unknown>,
      unitCost: unitCost.toFixed(4),
      version: bomVersion.version,
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
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return versionConflict('BOM version')
    }
    if (err instanceof Error && err.message === 'BOM version not found') {
      return notFound('BOM version')
    }
    console.error('Error updating BOM version:', err)
    return serverError()
  }
}
