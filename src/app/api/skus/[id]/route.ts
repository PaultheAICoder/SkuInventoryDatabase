import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  success,
  unauthorized,
  notFound,
  conflict,
  serverError,
  parseBody,
} from '@/lib/api-response'
import { updateSKUSchema } from '@/types/sku'
import { calculateBOMUnitCosts, calculateMaxBuildableUnits } from '@/services/bom'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/skus/:id - Get SKU details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    const sku = await prisma.sKU.findFirst({
      where: {
        id,
        brand: {
          companyId: session.user.companyId,
        },
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
    const bomCosts = await calculateBOMUnitCosts(bomVersionIds)

    // Calculate max buildable units
    const maxBuildableUnits = await calculateMaxBuildableUnits(id)

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
        effectiveStartDate: v.effectiveStartDate.toISOString().split('T')[0],
        effectiveEndDate: v.effectiveEndDate?.toISOString().split('T')[0] ?? null,
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

    const { id } = await params

    const bodyResult = await parseBody(request, updateSKUSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Check SKU exists and belongs to user's company
    const existing = await prisma.sKU.findFirst({
      where: {
        id,
        brand: {
          companyId: session.user.companyId,
        },
      },
    })

    if (!existing) {
      return notFound('SKU')
    }

    // Check for duplicate internalCode if changed
    if (data.internalCode && data.internalCode !== existing.internalCode) {
      const duplicate = await prisma.sKU.findFirst({
        where: {
          brandId: existing.brandId,
          internalCode: data.internalCode,
          id: { not: id },
        },
      })

      if (duplicate) {
        return conflict('A SKU with this internal code already exists')
      }
    }

    const sku = await prisma.sKU.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.internalCode !== undefined && { internalCode: data.internalCode }),
        ...(data.salesChannel !== undefined && { salesChannel: data.salesChannel }),
        ...(data.externalIds !== undefined && { externalIds: data.externalIds as Prisma.InputJsonValue }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        bomVersions: {
          where: { isActive: true },
          take: 1,
        },
      },
    })

    // Calculate active BOM cost
    const activeBom = sku.bomVersions[0]
    let activeBomCost: number | null = null
    if (activeBom) {
      const costs = await calculateBOMUnitCosts([activeBom.id])
      activeBomCost = costs.get(activeBom.id) ?? 0
    }

    const maxBuildableUnits = await calculateMaxBuildableUnits(id)

    return success({
      id: sku.id,
      name: sku.name,
      internalCode: sku.internalCode,
      salesChannel: sku.salesChannel,
      externalIds: sku.externalIds as Record<string, string>,
      notes: sku.notes,
      isActive: sku.isActive,
      createdAt: sku.createdAt.toISOString(),
      updatedAt: sku.updatedAt.toISOString(),
      createdBy: sku.createdBy,
      activeBom: activeBom
        ? {
            id: activeBom.id,
            versionName: activeBom.versionName,
            unitCost: activeBomCost?.toFixed(4) ?? '0.0000',
          }
        : null,
      maxBuildableUnits,
    })
  } catch (error) {
    console.error('Error updating SKU:', error)
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

    const { id } = await params

    // Check SKU exists and belongs to user's company
    const existing = await prisma.sKU.findFirst({
      where: {
        id,
        brand: {
          companyId: session.user.companyId,
        },
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
