import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, serverError } from '@/lib/api-response'
import { getComponentQuantities, calculateReorderStatus, getCompanySettings } from '@/services/inventory'
import { calculateMaxBuildableUnitsForSKUs, calculateBOMUnitCosts } from '@/services/bom'
import type { ReorderStatus } from '@/types'

/**
 * Calculate urgency score for reorder prioritization.
 * Higher score = more urgent (should appear first in list).
 * Formula: (deficitRatio * 100) + (leadTimeDays * 2)
 * - Deficit ratio is primary factor (0-100+ range)
 * - Lead time adds secondary weight (2 points per day)
 */
function calculateUrgencyScore(
  quantityOnHand: number,
  reorderPoint: number,
  leadTimeDays: number
): number {
  const deficit = reorderPoint - quantityOnHand
  const deficitRatio = deficit / Math.max(reorderPoint, 1)
  return (deficitRatio * 100) + (leadTimeDays * 2)
}

interface DashboardResponse {
  componentStats: {
    total: number
    critical: number
    warning: number
    ok: number
  }
  criticalComponents: Array<{
    id: string
    name: string
    skuCode: string
    quantityOnHand: number
    reorderPoint: number
    leadTimeDays: number
    reorderStatus: ReorderStatus
  }>
  topBuildableSkus: Array<{
    id: string
    name: string
    internalCode: string
    maxBuildableUnits: number
    unitCost: string
  }>
  recentTransactions: Array<{
    id: string
    type: string
    date: string
    createdAt: string
    createdBy: { id: string; name: string }
    lines: Array<{
      component: { id: string; name: string }
      quantityChange: string
    }>
  }>
}

// GET /api/dashboard - Get dashboard data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Parse optional days query parameter for filtering recent transactions
    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get('days')
    const days = daysParam ? parseInt(daysParam, 10) : null
    const startDate = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null

    // Get user's brand
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { company: { include: { brands: { where: { isActive: true }, take: 1 } } } },
    })

    if (!user?.company.brands[0]) {
      return success<DashboardResponse>({
        componentStats: { total: 0, critical: 0, warning: 0, ok: 0 },
        criticalComponents: [],
        topBuildableSkus: [],
        recentTransactions: [],
      })
    }

    const brandId = user.company.brands[0].id

    // Get company settings
    const settings = await getCompanySettings(session.user.companyId)

    // Get all active components
    const components = await prisma.component.findMany({
      where: { brandId, isActive: true },
      select: {
        id: true,
        name: true,
        skuCode: true,
        reorderPoint: true,
        leadTimeDays: true,
      },
    })

    // Get quantities for all components
    const componentIds = components.map((c) => c.id)
    const quantities = await getComponentQuantities(componentIds)

    // Calculate stats
    let critical = 0
    let warning = 0
    let ok = 0

    const componentsWithStatus = components.map((component) => {
      const quantityOnHand = quantities.get(component.id) ?? 0
      const status = calculateReorderStatus(quantityOnHand, component.reorderPoint, settings.reorderWarningMultiplier)

      switch (status) {
        case 'critical':
          critical++
          break
        case 'warning':
          warning++
          break
        case 'ok':
          ok++
          break
      }

      return {
        ...component,
        quantityOnHand,
        reorderStatus: status,
      }
    })

    // Get critical components (sorted by urgency score - deficit ratio + lead time)
    const criticalComponents = componentsWithStatus
      .filter((c) => c.reorderStatus === 'critical')
      .sort((a, b) => {
        const aUrgency = calculateUrgencyScore(a.quantityOnHand, a.reorderPoint, a.leadTimeDays)
        const bUrgency = calculateUrgencyScore(b.quantityOnHand, b.reorderPoint, b.leadTimeDays)
        return bUrgency - aUrgency  // Higher urgency first
      })
      .slice(0, 10)

    // Get active SKUs with their active BOMs
    const skus = await prisma.sKU.findMany({
      where: { brandId, isActive: true },
      include: {
        bomVersions: {
          where: { isActive: true },
          take: 1,
        },
      },
    })

    // Calculate buildable units and costs
    const skuIds = skus.map((s) => s.id)
    const activeBomIds = skus
      .filter((s) => s.bomVersions[0])
      .map((s) => s.bomVersions[0].id)

    const [buildableUnits, bomCosts] = await Promise.all([
      skuIds.length > 0 ? calculateMaxBuildableUnitsForSKUs(skuIds) : new Map<string, number | null>(),
      activeBomIds.length > 0 ? calculateBOMUnitCosts(activeBomIds) : new Map<string, number>(),
    ])

    // Get top buildable SKUs (sorted by buildable units descending)
    const topBuildableSkus = skus
      .map((sku) => {
        const activeBom = sku.bomVersions[0]
        const maxBuildable = buildableUnits.get(sku.id)
        const unitCost = activeBom ? bomCosts.get(activeBom.id) ?? 0 : 0

        return {
          id: sku.id,
          name: sku.name,
          internalCode: sku.internalCode,
          maxBuildableUnits: maxBuildable ?? 0,
          unitCost: unitCost.toFixed(4),
          hasBom: !!activeBom,
        }
      })
      .filter((sku) => sku.hasBom && sku.maxBuildableUnits > 0)
      .sort((a, b) => b.maxBuildableUnits - a.maxBuildableUnits)
      .slice(0, 10)
      .map(({ hasBom: _hasBom, ...sku }) => sku)

    // Get recent transactions (with optional date filtering)
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        companyId: session.user.companyId,
        ...(startDate && { date: { gte: startDate } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        createdBy: { select: { id: true, name: true } },
        lines: {
          include: {
            component: { select: { id: true, name: true } },
          },
        },
      },
    })

    const response: DashboardResponse = {
      componentStats: {
        total: components.length,
        critical,
        warning,
        ok,
      },
      criticalComponents,
      topBuildableSkus,
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        date: tx.date.toISOString().split('T')[0],
        createdAt: tx.createdAt.toISOString(),
        createdBy: tx.createdBy,
        lines: tx.lines.map((line) => ({
          component: line.component,
          quantityChange: line.quantityChange.toString(),
        })),
      })),
    }

    return success(response)
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return serverError()
  }
}
