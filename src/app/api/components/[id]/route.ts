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
import { updateComponentSchema } from '@/types/component'
import type { ComponentTrendPoint } from '@/types/component'
import {
  getComponentQuantity,
  getComponentQuantitiesByLocation,
  calculateReorderStatus,
  canDeleteComponent,
  getCompanySettings,
} from '@/services/inventory'
import { calculateMaxBuildableUnitsForSKUs } from '@/services/bom'
import { toLocalDateString } from '@/lib/utils'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * Calculate on-hand quantity trend for a component over a given period.
 * Returns data points showing cumulative quantity at regular intervals.
 */
async function calculateComponentTrend(
  componentId: string,
  days: number
): Promise<ComponentTrendPoint[]> {
  // Get all transaction lines for this component, ordered by date
  const transactionLines = await prisma.transactionLine.findMany({
    where: { componentId },
    include: {
      transaction: {
        select: { date: true },
      },
    },
    orderBy: {
      transaction: { date: 'asc' },
    },
  })

  if (transactionLines.length === 0) {
    return []
  }

  // Calculate running total grouped by date
  const dailyTotals = new Map<string, number>()
  let runningTotal = 0

  for (const line of transactionLines) {
    const dateStr = toLocalDateString(line.transaction.date)
    runningTotal += line.quantityChange.toNumber()
    dailyTotals.set(dateStr, runningTotal)
  }

  // Generate date range for the requested period
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - days)
  startDate.setHours(0, 0, 0, 0)

  const trend: ComponentTrendPoint[] = []
  let lastKnownQuantity = 0

  // Find the quantity at startDate by looking at transactions before that date
  const sortedDates = Array.from(dailyTotals.keys()).sort()
  for (const dateStr of sortedDates) {
    if (new Date(dateStr) < startDate) {
      lastKnownQuantity = dailyTotals.get(dateStr) ?? 0
    }
  }

  // Generate trend points for the date range
  // Limit to ~30 points for performance (sample if more days)
  const step = Math.max(1, Math.floor(days / 30))
  const currentDate = new Date(startDate)

  while (currentDate <= today) {
    const dateStr = toLocalDateString(currentDate)

    // Check if we have data for this date
    if (dailyTotals.has(dateStr)) {
      lastKnownQuantity = dailyTotals.get(dateStr)!
    }

    trend.push({
      date: dateStr,
      quantityOnHand: lastKnownQuantity,
    })

    currentDate.setDate(currentDate.getDate() + step)
  }

  // Ensure we include today if not already included
  const todayStr = toLocalDateString(today)
  const lastEntry = trend[trend.length - 1]
  if (lastEntry && lastEntry.date !== todayStr) {
    if (dailyTotals.has(todayStr)) {
      lastKnownQuantity = dailyTotals.get(todayStr)!
    }
    trend.push({
      date: todayStr,
      quantityOnHand: lastKnownQuantity,
    })
  }

  return trend
}

// GET /api/components/:id - Get component details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Parse optional query parameters
    const { searchParams } = new URL(request.url)
    const trendDaysParam = searchParams.get('trendDays')
    const trendDays = trendDaysParam ? parseInt(trendDaysParam, 10) : null
    const locationId = searchParams.get('locationId') ?? undefined

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Get selected brand (may be null for "all brands")
    const selectedBrandId = session.user.selectedBrandId

    // Get company settings
    const settings = await getCompanySettings(selectedCompanyId)

    const component = await prisma.component.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
        ...(selectedBrandId && { brandId: selectedBrandId }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        bomLines: {
          where: { bomVersion: { isActive: true } },
          include: {
            bomVersion: {
              include: {
                sku: { select: { id: true, name: true } },
              },
            },
          },
        },
        transactionLines: {
          take: 10,
          orderBy: { transaction: { createdAt: 'desc' } },
          include: {
            transaction: {
              select: {
                id: true,
                type: true,
                date: true,
                createdAt: true,
              },
            },
          },
        },
      },
    })

    if (!component) {
      return notFound('Component')
    }

    const quantityOnHand = await getComponentQuantity(id, selectedCompanyId!, locationId)

    // Get SKU IDs that use this component
    const skuIds = component.bomLines.map((line) => line.bomVersion.sku.id)

    // Calculate max buildable units for these SKUs (filtered by location if specified)
    const buildableUnits = skuIds.length > 0
      ? await calculateMaxBuildableUnitsForSKUs(skuIds, selectedCompanyId!, locationId)
      : new Map<string, number | null>()

    // Find constrained SKUs (ones where this component limits buildable units)
    const constrainedSkus = component.bomLines
      .filter((line) => {
        const maxBuildable = buildableUnits.get(line.bomVersion.sku.id)
        if (maxBuildable == null) return false
        // This component constrains the SKU if buildable units is limited
        const componentCanBuild = Math.floor(quantityOnHand / line.quantityPerUnit.toNumber())
        return componentCanBuild <= maxBuildable
      })
      .map((line) => ({
        id: line.bomVersion.sku.id,
        name: line.bomVersion.sku.name,
        quantityPerUnit: line.quantityPerUnit.toString(),
        maxBuildableUnits: buildableUnits.get(line.bomVersion.sku.id) ?? 0,
      }))

    // Calculate trend data if requested
    let trend: ComponentTrendPoint[] | undefined
    if (trendDays) {
      trend = await calculateComponentTrend(id, trendDays)
    }

    // Get per-location inventory breakdown
    const locationQuantities = await getComponentQuantitiesByLocation(id, selectedCompanyId)

    return success({
      id: component.id,
      name: component.name,
      skuCode: component.skuCode,
      category: component.category,
      unitOfMeasure: component.unitOfMeasure,
      costPerUnit: component.costPerUnit.toString(),
      reorderPoint: component.reorderPoint,
      leadTimeDays: component.leadTimeDays,
      notes: component.notes,
      isActive: component.isActive,
      quantityOnHand,
      reorderStatus: calculateReorderStatus(quantityOnHand, component.reorderPoint, settings.reorderWarningMultiplier),
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      createdBy: component.createdBy,
      updatedBy: component.updatedBy,
      usedInSkus: component.bomLines.map((line) => ({
        id: line.bomVersion.sku.id,
        name: line.bomVersion.sku.name,
        quantityPerUnit: line.quantityPerUnit.toString(),
        maxBuildableUnits: buildableUnits.get(line.bomVersion.sku.id) ?? null,
      })),
      constrainedSkus,
      recentTransactions: component.transactionLines.map((line) => ({
        id: line.transaction.id,
        type: line.transaction.type,
        date: line.transaction.date.toISOString(),
        quantityChange: line.quantityChange.toString(),
        createdAt: line.transaction.createdAt.toISOString(),
      })),
      ...(trend && { trend }),
      ...(locationQuantities.length > 0 && { locationQuantities }),
    })
  } catch (error) {
    console.error('Error getting component:', error)
    return serverError()
  }
}

// PATCH /api/components/:id - Update component
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Get company settings
    const settings = await getCompanySettings(selectedCompanyId)

    const bodyResult = await parseBody(request, updateComponentSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Check component exists and belongs to user's selected company
    const existing = await prisma.component.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existing) {
      return notFound('Component')
    }

    // Check for duplicate name or skuCode if changed
    if (data.name || data.skuCode) {
      const duplicate = await prisma.component.findFirst({
        where: {
          brandId: existing.brandId,
          id: { not: id },
          OR: [
            ...(data.name ? [{ name: data.name }] : []),
            ...(data.skuCode ? [{ skuCode: data.skuCode }] : []),
          ],
        },
      })

      if (duplicate) {
        if (data.name && duplicate.name === data.name) {
          return conflict('A component with this name already exists')
        }
        if (data.skuCode && duplicate.skuCode === data.skuCode) {
          return conflict('A component with this SKU code already exists')
        }
      }
    }

    const component = await prisma.component.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.skuCode !== undefined && { skuCode: data.skuCode }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.unitOfMeasure !== undefined && { unitOfMeasure: data.unitOfMeasure }),
        ...(data.costPerUnit !== undefined && { costPerUnit: new Prisma.Decimal(data.costPerUnit) }),
        ...(data.reorderPoint !== undefined && { reorderPoint: data.reorderPoint }),
        ...(data.leadTimeDays !== undefined && { leadTimeDays: data.leadTimeDays }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    const quantityOnHand = await getComponentQuantity(id, selectedCompanyId!)

    return success({
      id: component.id,
      name: component.name,
      skuCode: component.skuCode,
      category: component.category,
      unitOfMeasure: component.unitOfMeasure,
      costPerUnit: component.costPerUnit.toString(),
      reorderPoint: component.reorderPoint,
      leadTimeDays: component.leadTimeDays,
      notes: component.notes,
      isActive: component.isActive,
      quantityOnHand,
      reorderStatus: calculateReorderStatus(quantityOnHand, component.reorderPoint, settings.reorderWarningMultiplier),
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      createdBy: component.createdBy,
    })
  } catch (error) {
    console.error('Error updating component:', error)
    return serverError()
  }
}

// DELETE /api/components/:id - Soft delete (deactivate) component
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Check component exists and belongs to user's selected company
    const existing = await prisma.component.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existing) {
      return notFound('Component')
    }

    // Check if component can be safely deactivated (not used in transactions, BOMs, or lots)
    const deleteCheck = await canDeleteComponent(id, selectedCompanyId!)
    if (!deleteCheck.canDelete) {
      return conflict(deleteCheck.reason ?? 'Cannot deactivate component due to existing references')
    }

    await prisma.component.update({
      where: { id },
      data: {
        isActive: false,
        updatedById: session.user.id,
      },
    })

    return success({ message: 'Component deactivated' })
  } catch (error) {
    console.error('Error deleting component:', error)
    return serverError()
  }
}
