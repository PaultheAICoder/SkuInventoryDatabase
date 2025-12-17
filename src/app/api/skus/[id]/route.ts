import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  success,
  unauthorized,
  notFound,
  conflict,
  versionConflict,
  serverError,
  parseBody,
  error,
} from '@/lib/api-response'
import { updateSKUSchema } from '@/types/sku'
import { calculateBOMUnitCosts, calculateMaxBuildableUnits } from '@/services/bom'
import { getSkuInventorySummary } from '@/services/finished-goods'
import { updateSku, VersionConflictError } from '@/services/sku'
import { toLocalDateString } from '@/lib/utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/skus/:id - Get SKU details
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
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Get selected brand (may be null for "all brands")
    const selectedBrandId = session.user.selectedBrandId

    const sku = await prisma.sKU.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
        ...(selectedBrandId && { brandId: selectedBrandId }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        bomVersions: {
          orderBy: { createdAt: 'desc' },
          include: {
            lines: true,
            createdBy: { select: { id: true, name: true } },
          },
        },
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            date: true,
            unitsBuild: true,
            createdAt: true,
          },
        },
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    // Calculate costs for all BOM versions
    const bomVersionIds = sku.bomVersions.map((v) => v.id)
    const bomCosts = await calculateBOMUnitCosts(bomVersionIds, selectedCompanyId)

    // Calculate max buildable units (filtered by location if specified)
    const maxBuildableUnits = await calculateMaxBuildableUnits(id, selectedCompanyId, locationId)

    // Get finished goods inventory
    const finishedGoodsInventory = await getSkuInventorySummary(id, selectedCompanyId)

    // Find active BOM
    const activeBom = sku.bomVersions.find((v) => v.isActive)
    const activeBomCost = activeBom ? bomCosts.get(activeBom.id) ?? 0 : null

    return success({
      id: sku.id,
      name: sku.name,
      internalCode: sku.internalCode,
      salesChannel: sku.salesChannel,
      externalIds: sku.externalIds as Record<string, string>,
      notes: sku.notes,
      isActive: sku.isActive,
      version: sku.version,
      createdAt: sku.createdAt.toISOString(),
      updatedAt: sku.updatedAt.toISOString(),
      createdBy: sku.createdBy,
      updatedBy: sku.updatedBy,
      activeBom: activeBom
        ? {
            id: activeBom.id,
            versionName: activeBom.versionName,
            unitCost: activeBomCost?.toFixed(4) ?? '0.0000',
          }
        : null,
      maxBuildableUnits,
      bomVersions: sku.bomVersions.map((v) => ({
        id: v.id,
        versionName: v.versionName,
        effectiveStartDate: toLocalDateString(v.effectiveStartDate),
        effectiveEndDate: v.effectiveEndDate ? toLocalDateString(v.effectiveEndDate) : null,
        isActive: v.isActive,
        unitCost: (bomCosts.get(v.id) ?? 0).toFixed(4),
        lineCount: v.lines.length,
        createdAt: v.createdAt.toISOString(),
      })),
      recentTransactions: sku.transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        date: tx.date.toISOString(),
        unitsBuild: tx.unitsBuild,
        createdAt: tx.createdAt.toISOString(),
      })),
      finishedGoodsInventory,
    })
  } catch (error) {
    console.error('Error getting SKU:', error)
    return serverError()
  }
}

// PATCH /api/skus/:id - Update SKU
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Non-viewer role required for update operations
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Insufficient permissions')
    }

    const { id } = await params

    const bodyResult = await parseBody(request, updateSKUSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Update via service (handles version check and duplicate code check)
    const result = await updateSku({
      skuId: id,
      companyId: selectedCompanyId,
      userId: session.user.id,
      input: data,
    })

    // Calculate active BOM cost
    const activeBom = await prisma.sKU.findUnique({
      where: { id },
      select: {
        bomVersions: {
          where: { isActive: true },
          take: 1,
          select: { id: true, versionName: true },
        },
      },
    })

    let activeBomCost: number | null = null
    if (activeBom?.bomVersions[0]) {
      const costs = await calculateBOMUnitCosts([activeBom.bomVersions[0].id], selectedCompanyId)
      activeBomCost = costs.get(activeBom.bomVersions[0].id) ?? 0
    }

    const maxBuildableUnits = await calculateMaxBuildableUnits(id, selectedCompanyId)

    return success({
      ...result,
      activeBom: activeBom?.bomVersions[0]
        ? {
            id: activeBom.bomVersions[0].id,
            versionName: activeBom.bomVersions[0].versionName,
            unitCost: activeBomCost?.toFixed(4) ?? '0.0000',
          }
        : null,
      maxBuildableUnits,
    })
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return versionConflict('SKU')
    }
    if (err instanceof Error) {
      switch (err.message) {
        case 'SKU_NOT_FOUND':
          return notFound('SKU')
        case 'DUPLICATE_INTERNAL_CODE':
          return conflict('A SKU with this internal code already exists')
      }
    }
    console.error('Error updating SKU:', err)
    return serverError()
  }
}

// DELETE /api/skus/:id - Soft delete (deactivate) SKU
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Non-viewer role required for delete operations
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Insufficient permissions')
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Check SKU exists and belongs to user's selected company
    const existing = await prisma.sKU.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existing) {
      return notFound('SKU')
    }

    await prisma.sKU.update({
      where: { id },
      data: {
        isActive: false,
        updatedById: session.user.id,
      },
    })

    return success({ message: 'SKU deactivated' })
  } catch (error) {
    console.error('Error deleting SKU:', error)
    return serverError()
  }
}
