import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, serverError } from '@/lib/api-response'
import { getComponentQuantities, calculateReorderStatus } from '@/services/inventory'
import type { ReorderStatus } from '@/types'

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
    reorderStatus: ReorderStatus
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

    // Get user's brand
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { company: { include: { brands: { where: { isActive: true }, take: 1 } } } },
    })

    if (!user?.company.brands[0]) {
      return success<DashboardResponse>({
        componentStats: { total: 0, critical: 0, warning: 0, ok: 0 },
        criticalComponents: [],
        recentTransactions: [],
      })
    }

    const brandId = user.company.brands[0].id

    // Get all active components
    const components = await prisma.component.findMany({
      where: { brandId, isActive: true },
      select: {
        id: true,
        name: true,
        skuCode: true,
        reorderPoint: true,
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
      const status = calculateReorderStatus(quantityOnHand, component.reorderPoint)

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

    // Get critical components (sorted by how far below reorder point)
    const criticalComponents = componentsWithStatus
      .filter((c) => c.reorderStatus === 'critical')
      .sort((a, b) => {
        const aDeficit = a.reorderPoint - a.quantityOnHand
        const bDeficit = b.reorderPoint - b.quantityOnHand
        return bDeficit - aDeficit
      })
      .slice(0, 10)

    // Get recent transactions
    const recentTransactions = await prisma.transaction.findMany({
      where: { companyId: session.user.companyId },
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
