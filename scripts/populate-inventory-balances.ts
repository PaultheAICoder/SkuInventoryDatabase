/**
 * Populate InventoryBalance and FinishedGoodsBalance tables from transaction history
 *
 * This script calculates current balances by aggregating transaction lines
 * and populates the balance tables for O(1) lookups.
 *
 * Usage: DATABASE_URL="..." npx tsx scripts/populate-inventory-balances.ts
 *
 * For test database:
 * DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" npx tsx scripts/populate-inventory-balances.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL ?? ''
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

interface ComponentQuantityByLocation {
  componentId: string
  locationId: string
  quantity: number
}

interface SkuQuantityByLocation {
  skuId: string
  locationId: string
  quantity: number
}

/**
 * Calculate component quantities by location from transaction history
 * This replicates the existing getComponentQuantity logic for all components at once
 */
async function calculateComponentQuantities(): Promise<ComponentQuantityByLocation[]> {
  console.log('Calculating component quantities from transaction history...')

  // Get all active components with their companies
  const components = await prisma.component.findMany({
    where: { isActive: true },
    select: { id: true, companyId: true },
  })
  console.log(`  Found ${components.length} active components`)

  // Get all active locations
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true, companyId: true },
  })
  console.log(`  Found ${locations.length} active locations`)

  const results: ComponentQuantityByLocation[] = []

  // For each component, calculate quantities at each relevant location
  for (const component of components) {
    if (!component.companyId) continue

    // Get locations for this company
    const companyLocations = locations.filter(l => l.companyId === component.companyId)

    for (const location of companyLocations) {
      // Calculate quantity using the same logic as getComponentQuantity
      // For non-transfer transactions: use transaction.locationId
      // For transfer transactions:
      //   - negative line = fromLocationId
      //   - positive line = toLocationId

      // Get regular (non-transfer) transaction lines at this location
      const regularResult = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          transaction: {
            companyId: component.companyId,
            locationId: location.id,
            type: { not: 'transfer' },
            status: 'approved',
          },
        },
        _sum: { quantityChange: true },
      })

      // Get transfer lines where this is the FROM location (negative = outgoing)
      const transferFromResult = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          quantityChange: { lt: 0 },
          transaction: {
            companyId: component.companyId,
            type: 'transfer',
            fromLocationId: location.id,
            status: 'approved',
          },
        },
        _sum: { quantityChange: true },
      })

      // Get transfer lines where this is the TO location (positive = incoming)
      const transferToResult = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          quantityChange: { gt: 0 },
          transaction: {
            companyId: component.companyId,
            type: 'transfer',
            toLocationId: location.id,
            status: 'approved',
          },
        },
        _sum: { quantityChange: true },
      })

      const regular = regularResult._sum.quantityChange?.toNumber() ?? 0
      const transferFrom = transferFromResult._sum.quantityChange?.toNumber() ?? 0
      const transferTo = transferToResult._sum.quantityChange?.toNumber() ?? 0

      const totalQuantity = regular + transferFrom + transferTo

      // Only create balance record if quantity is non-zero
      if (totalQuantity !== 0) {
        results.push({
          componentId: component.id,
          locationId: location.id,
          quantity: totalQuantity,
        })
      }
    }
  }

  console.log(`  Calculated ${results.length} non-zero component-location balances`)
  return results
}

/**
 * Calculate SKU quantities by location from finished goods history
 */
async function calculateSkuQuantities(): Promise<SkuQuantityByLocation[]> {
  console.log('Calculating SKU quantities from finished goods history...')

  // Get quantities grouped by SKU and location
  const results = await prisma.finishedGoodsLine.groupBy({
    by: ['skuId', 'locationId'],
    _sum: { quantityChange: true },
  })

  const nonZeroResults = results
    .filter(r => (r._sum.quantityChange?.toNumber() ?? 0) !== 0)
    .map(r => ({
      skuId: r.skuId,
      locationId: r.locationId,
      quantity: r._sum.quantityChange?.toNumber() ?? 0,
    }))

  console.log(`  Calculated ${nonZeroResults.length} non-zero SKU-location balances`)
  return nonZeroResults
}

/**
 * Populate InventoryBalance table
 */
async function populateInventoryBalances(quantities: ComponentQuantityByLocation[]): Promise<number> {
  console.log('Populating InventoryBalance table...')
  let created = 0

  for (const item of quantities) {
    await prisma.inventoryBalance.upsert({
      where: {
        componentId_locationId: {
          componentId: item.componentId,
          locationId: item.locationId,
        },
      },
      create: {
        componentId: item.componentId,
        locationId: item.locationId,
        quantity: new Prisma.Decimal(item.quantity),
      },
      update: {
        quantity: new Prisma.Decimal(item.quantity),
      },
    })
    created++
  }

  console.log(`  Upserted ${created} InventoryBalance records`)
  return created
}

/**
 * Populate FinishedGoodsBalance table
 */
async function populateFinishedGoodsBalances(quantities: SkuQuantityByLocation[]): Promise<number> {
  console.log('Populating FinishedGoodsBalance table...')
  let created = 0

  for (const item of quantities) {
    await prisma.finishedGoodsBalance.upsert({
      where: {
        skuId_locationId: {
          skuId: item.skuId,
          locationId: item.locationId,
        },
      },
      create: {
        skuId: item.skuId,
        locationId: item.locationId,
        quantity: new Prisma.Decimal(item.quantity),
      },
      update: {
        quantity: new Prisma.Decimal(item.quantity),
      },
    })
    created++
  }

  console.log(`  Upserted ${created} FinishedGoodsBalance records`)
  return created
}

/**
 * Verify balance totals match calculated values
 * Note: We verify by spot-checking a sample of components/SKUs
 * because the global transaction total includes:
 * - Transactions without locationId (legacy data)
 * - Components from different companies than the locations
 */
async function verifyBalances(): Promise<{ componentMatch: boolean; skuMatch: boolean }> {
  console.log('Verifying balance records...')

  // Get all balance records
  const inventoryBalances = await prisma.inventoryBalance.findMany({
    take: 10, // Spot check first 10
    include: {
      component: { select: { id: true, companyId: true } },
      location: { select: { id: true, companyId: true } },
    },
  })

  let componentMatch = true
  let mismatches = 0

  for (const balance of inventoryBalances) {
    if (!balance.component.companyId) continue

    // Recalculate using the same logic
    const regularResult = await prisma.transactionLine.aggregate({
      where: {
        componentId: balance.componentId,
        transaction: {
          companyId: balance.component.companyId,
          locationId: balance.locationId,
          type: { not: 'transfer' },
          status: 'approved',
        },
      },
      _sum: { quantityChange: true },
    })

    const transferFromResult = await prisma.transactionLine.aggregate({
      where: {
        componentId: balance.componentId,
        quantityChange: { lt: 0 },
        transaction: {
          companyId: balance.component.companyId,
          type: 'transfer',
          fromLocationId: balance.locationId,
          status: 'approved',
        },
      },
      _sum: { quantityChange: true },
    })

    const transferToResult = await prisma.transactionLine.aggregate({
      where: {
        componentId: balance.componentId,
        quantityChange: { gt: 0 },
        transaction: {
          companyId: balance.component.companyId,
          type: 'transfer',
          toLocationId: balance.locationId,
          status: 'approved',
        },
      },
      _sum: { quantityChange: true },
    })

    const regular = regularResult._sum.quantityChange?.toNumber() ?? 0
    const transferFrom = transferFromResult._sum.quantityChange?.toNumber() ?? 0
    const transferTo = transferToResult._sum.quantityChange?.toNumber() ?? 0
    const calculated = regular + transferFrom + transferTo

    const balanceQty = balance.quantity.toNumber()
    if (Math.abs(balanceQty - calculated) > 0.0001) {
      console.log(`    MISMATCH: Component ${balance.componentId} @ Location ${balance.locationId}: balance=${balanceQty}, calculated=${calculated}`)
      componentMatch = false
      mismatches++
    }
  }

  if (inventoryBalances.length > 0 && mismatches === 0) {
    console.log(`  Component balances: ${inventoryBalances.length} spot-checked - ALL MATCH`)
  } else if (inventoryBalances.length === 0) {
    console.log(`  Component balances: No records to verify`)
  }

  // Verify SKU balances
  const fgBalances = await prisma.finishedGoodsBalance.findMany({
    take: 10,
  })

  let skuMatch = true
  let fgMismatches = 0

  for (const balance of fgBalances) {
    const result = await prisma.finishedGoodsLine.aggregate({
      where: {
        skuId: balance.skuId,
        locationId: balance.locationId,
      },
      _sum: { quantityChange: true },
    })

    const calculated = result._sum.quantityChange?.toNumber() ?? 0
    const balanceQty = balance.quantity.toNumber()

    if (Math.abs(balanceQty - calculated) > 0.0001) {
      console.log(`    MISMATCH: SKU ${balance.skuId} @ Location ${balance.locationId}: balance=${balanceQty}, calculated=${calculated}`)
      skuMatch = false
      fgMismatches++
    }
  }

  if (fgBalances.length > 0 && fgMismatches === 0) {
    console.log(`  SKU balances: ${fgBalances.length} spot-checked - ALL MATCH`)
  } else if (fgBalances.length === 0) {
    console.log(`  SKU balances: No records to verify`)
  }

  return { componentMatch, skuMatch }
}

async function main() {
  console.log('========================================')
  console.log('Inventory Balance Population Script')
  console.log('========================================\n')

  try {
    // Calculate quantities from transaction history
    const componentQuantities = await calculateComponentQuantities()
    const skuQuantities = await calculateSkuQuantities()

    console.log()

    // Populate balance tables
    const componentCount = await populateInventoryBalances(componentQuantities)
    const skuCount = await populateFinishedGoodsBalances(skuQuantities)

    console.log()

    // Verify totals match
    const verification = await verifyBalances()

    console.log('\n========================================')
    console.log('Summary')
    console.log('========================================')
    console.log(`  InventoryBalance records: ${componentCount}`)
    console.log(`  FinishedGoodsBalance records: ${skuCount}`)
    console.log(`  Verification: ${verification.componentMatch && verification.skuMatch ? 'PASSED' : 'FAILED'}`)

    if (!verification.componentMatch || !verification.skuMatch) {
      console.error('\nWARNING: Balance verification failed! Please investigate.')
      process.exit(1)
    }

    console.log('\nBalance population completed successfully!')
  } finally {
    await pool.end()
  }
}

main()
  .catch((e) => {
    console.error('Error populating balances:', e)
    process.exit(1)
  })
