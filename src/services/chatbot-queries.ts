/**
 * Chatbot Queries Service
 *
 * Read-only Prisma queries for chatbot tool use.
 * All functions return data suitable for Claude to interpret and explain.
 */

import { prisma } from '@/lib/db'
import { calculateLimitingFactors, calculateMaxBuildableUnits } from './bom'
import { getComponentQuantity, getComponentQuantitiesByLocation } from './inventory'
import type {
  SkuBuildableDetails,
  ComponentInventoryDetails,
  TransactionHistoryResult,
} from '@/types/chatbot'

/**
 * Get SKU buildable details including limiting components and BOM lines
 * Used by chatbot to explain "why can I only build X units?"
 */
export async function getSkuBuildableDetails(
  skuCode: string,
  companyId: string
): Promise<SkuBuildableDetails | null> {
  // Find SKU by internal code
  const sku = await prisma.sKU.findFirst({
    where: {
      internalCode: skuCode,
      companyId,
      isActive: true,
    },
    include: {
      bomVersions: {
        where: { isActive: true },
        include: {
          lines: {
            include: {
              component: {
                select: {
                  id: true,
                  name: true,
                  skuCode: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!sku) {
    return null
  }

  // Calculate max buildable and limiting factors
  const maxBuildable = await calculateMaxBuildableUnits(sku.id, companyId)
  const limitingFactors = await calculateLimitingFactors(sku.id, companyId, undefined, 10) // Get top 10

  // Get BOM lines with current quantities
  const activeBom = sku.bomVersions[0]
  const bomLines: SkuBuildableDetails['bomLines'] = []

  if (activeBom) {
    for (const line of activeBom.lines) {
      const qty = await getComponentQuantity(line.componentId, companyId)
      bomLines.push({
        componentName: line.component.name,
        skuCode: line.component.skuCode,
        quantityPerUnit: line.quantityPerUnit.toNumber(),
        quantityOnHand: qty,
      })
    }
  }

  return {
    skuCode: sku.internalCode,
    skuName: sku.name,
    maxBuildable,
    limitingComponents: limitingFactors?.map((lf) => ({
      componentName: lf.componentName,
      skuCode: lf.skuCode,
      quantityOnHand: lf.quantityOnHand,
      quantityPerUnit: lf.quantityPerUnit,
      maxBuildable: lf.maxBuildable,
      rank: lf.rank,
    })) ?? [],
    bomLines,
  }
}

/**
 * Get component inventory details including breakdown by location
 * Used by chatbot to answer "how much of X do I have?"
 */
export async function getComponentInventoryDetails(
  componentCode: string,
  companyId: string
): Promise<ComponentInventoryDetails | null> {
  // Find component by SKU code
  const component = await prisma.component.findFirst({
    where: {
      skuCode: componentCode,
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      skuCode: true,
    },
  })

  if (!component) {
    return null
  }

  // Get total quantity
  const totalQuantity = await getComponentQuantity(component.id, companyId)

  // Get breakdown by location
  const locationBreakdown = await getComponentQuantitiesByLocation(component.id, companyId)

  // Get recent transactions (last 10)
  const recentTx = await prisma.transactionLine.findMany({
    where: {
      componentId: component.id,
      transaction: { status: 'approved' },
    },
    include: {
      transaction: {
        select: {
          type: true,
          date: true,
          notes: true,
        },
      },
    },
    orderBy: { transaction: { createdAt: 'desc' } },
    take: 10,
  })

  return {
    componentCode: component.skuCode,
    componentName: component.name,
    totalQuantity,
    byLocation: locationBreakdown.map((loc) => ({
      locationName: loc.locationName,
      locationType: loc.locationType,
      quantity: loc.quantity,
    })),
    recentTransactions: recentTx.map((tx) => ({
      type: tx.transaction.type,
      date: tx.transaction.date.toISOString().split('T')[0],
      quantityChange: tx.quantityChange.toNumber(),
      notes: tx.transaction.notes,
    })),
  }
}

/**
 * Get transaction history for an entity (SKU or component)
 * Used by chatbot to explain recent changes
 */
export async function getTransactionHistory(
  entityType: 'sku' | 'component',
  code: string,
  companyId: string,
  limit: number = 10
): Promise<TransactionHistoryResult | null> {
  if (entityType === 'component') {
    const component = await prisma.component.findFirst({
      where: {
        skuCode: code,
        companyId,
        isActive: true,
      },
    })

    if (!component) return null

    const transactions = await prisma.transactionLine.findMany({
      where: {
        componentId: component.id,
        transaction: { status: 'approved' },
      },
      include: {
        transaction: {
          select: {
            id: true,
            type: true,
            date: true,
            notes: true,
          },
        },
      },
      orderBy: { transaction: { createdAt: 'desc' } },
      take: limit,
    })

    return {
      entityType: 'component',
      code,
      transactions: transactions.map((tx) => ({
        id: tx.transaction.id,
        type: tx.transaction.type,
        date: tx.transaction.date.toISOString().split('T')[0],
        quantityChange: tx.quantityChange.toNumber(),
        notes: tx.transaction.notes,
      })),
    }
  } else {
    const sku = await prisma.sKU.findFirst({
      where: {
        internalCode: code,
        companyId,
        isActive: true,
      },
    })

    if (!sku) return null

    const transactions = await prisma.transaction.findMany({
      where: {
        skuId: sku.id,
        status: 'approved',
      },
      select: {
        id: true,
        type: true,
        date: true,
        unitsBuild: true,
        notes: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return {
      entityType: 'sku',
      code,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        date: tx.date.toISOString().split('T')[0],
        unitsBuild: tx.unitsBuild ?? undefined,
        notes: tx.notes,
      })),
    }
  }
}
