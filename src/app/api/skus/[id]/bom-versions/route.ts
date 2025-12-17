import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  success,
  created,
  unauthorized,
  notFound,
  serverError,
  parseBody,
  parseQuery,
} from '@/lib/api-response'
import { createBOMVersionSchema, bomVersionListQuerySchema } from '@/types/bom'
import { createBOMVersion, calculateBOMUnitCost } from '@/services/bom'
import { getComponentQuantities } from '@/services/inventory'
import { toLocalDateString } from '@/lib/utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/skus/:id/bom-versions - List BOM versions for a SKU
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id: skuId } = await params
    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, bomVersionListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { includeInactive } = queryResult.data
    const locationId = searchParams.get('locationId') ?? undefined

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Check SKU exists and belongs to user's selected company
    const sku = await prisma.sKU.findFirst({
      where: {
        id: skuId,
        companyId: selectedCompanyId,
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    // Get BOM versions
    const bomVersions = await prisma.bOMVersion.findMany({
      where: {
        skuId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
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

    // Get component quantities for all components in all versions (filtered by location if specified)
    const allComponentIds = new Set<string>()
    for (const version of bomVersions) {
      for (const line of version.lines) {
        allComponentIds.add(line.componentId)
      }
    }
    const quantities = await getComponentQuantities(Array.from(allComponentIds), selectedCompanyId!, locationId)

    // Transform response
    const data = bomVersions.map((version) => {
      const unitCost = version.lines.reduce((sum, line) => {
        return sum + line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber()
      }, 0)

      return {
        id: version.id,
        skuId: version.skuId,
        versionName: version.versionName,
        effectiveStartDate: toLocalDateString(version.effectiveStartDate),
        effectiveEndDate: version.effectiveEndDate ? toLocalDateString(version.effectiveEndDate) : null,
        isActive: version.isActive,
        notes: version.notes,
        defectNotes: version.defectNotes,
        qualityMetadata: version.qualityMetadata as Record<string, unknown>,
        unitCost: unitCost.toFixed(4),
        lines: version.lines.map((line) => ({
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
        createdAt: version.createdAt.toISOString(),
        createdBy: version.createdBy,
      }
    })

    return success(data)
  } catch (error) {
    console.error('Error listing BOM versions:', error)
    return serverError()
  }
}

// POST /api/skus/:id/bom-versions - Create a new BOM version
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id: skuId } = await params

    // Parse optional locationId query parameter
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId') ?? undefined

    const bodyResult = await parseBody(request, createBOMVersionSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Check SKU exists and belongs to user's selected company
    const sku = await prisma.sKU.findFirst({
      where: {
        id: skuId,
        companyId: selectedCompanyId,
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    // Verify all components exist, are active, and belong to user's selected company
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

    // Create BOM version with lines
    const bomVersion = await createBOMVersion({
      skuId,
      companyId: selectedCompanyId!,
      versionName: data.versionName,
      effectiveStartDate: data.effectiveStartDate,
      isActive: data.isActive,
      notes: data.notes,
      defectNotes: data.defectNotes,
      qualityMetadata: data.qualityMetadata,
      lines: data.lines,
      createdById: session.user.id,
    })

    // Calculate unit cost
    const unitCost = await calculateBOMUnitCost(bomVersion.id, selectedCompanyId!)

    // Get component quantities (filtered by location if specified)
    const quantities = await getComponentQuantities(componentIds, selectedCompanyId!, locationId)

    return created({
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
    console.error('Error creating BOM version:', error)
    return serverError()
  }
}
