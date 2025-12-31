/**
 * Reconcile FinishedGoodsBalance records with FinishedGoodsLine entries
 *
 * This script identifies FinishedGoodsBalance records that have no matching
 * FinishedGoodsLine entries (missing audit trail) and optionally creates
 * corrective adjustment transactions to restore data integrity.
 *
 * Usage:
 * - Dry run (default):
 *   DATABASE_URL="..." npx tsx scripts/reconcile-finished-goods-balances.ts
 *
 * - Fix discrepancies:
 *   DATABASE_URL="..." npx tsx scripts/reconcile-finished-goods-balances.ts --fix
 *
 * For test database:
 * DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" npx tsx scripts/reconcile-finished-goods-balances.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL ?? ''
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Tolerance for floating point comparisons
const TOLERANCE = 0.0001

interface FinishedGoodsDiscrepancy {
  skuId: string
  skuName: string
  skuInternalCode: string
  locationId: string
  locationName: string
  balance: number
  linesSum: number
  discrepancy: number
}

/**
 * Find discrepancies between FinishedGoodsBalance and FinishedGoodsLine records
 * A discrepancy exists when the balance quantity doesn't match the sum of all lines
 */
export async function findDiscrepancies(): Promise<FinishedGoodsDiscrepancy[]> {
  console.log('Finding FinishedGoodsBalance records without matching FinishedGoodsLine entries...')

  // Get all FinishedGoodsBalance records with SKU and Location details
  const balances = await prisma.finishedGoodsBalance.findMany({
    include: {
      sku: {
        select: {
          name: true,
          internalCode: true,
        },
      },
      location: {
        select: {
          name: true,
        },
      },
    },
  })

  console.log(`  Found ${balances.length} FinishedGoodsBalance records`)

  const discrepancies: FinishedGoodsDiscrepancy[] = []

  for (const balance of balances) {
    // Aggregate all FinishedGoodsLine entries for this SKU + Location
    const linesResult = await prisma.finishedGoodsLine.aggregate({
      where: {
        skuId: balance.skuId,
        locationId: balance.locationId,
      },
      _sum: {
        quantityChange: true,
      },
    })

    const balanceQty = balance.quantity.toNumber()
    const linesSum = linesResult._sum.quantityChange?.toNumber() ?? 0
    const diff = balanceQty - linesSum

    // Check if there's a significant discrepancy
    if (Math.abs(diff) > TOLERANCE) {
      discrepancies.push({
        skuId: balance.skuId,
        skuName: balance.sku.name,
        skuInternalCode: balance.sku.internalCode,
        locationId: balance.locationId,
        locationName: balance.location.name,
        balance: balanceQty,
        linesSum: linesSum,
        discrepancy: diff,
      })
    }
  }

  return discrepancies
}

/**
 * Log discrepancies in a formatted table
 */
function logDiscrepancies(discrepancies: FinishedGoodsDiscrepancy[]): void {
  console.log(`\nDISCREPANCIES FOUND: ${discrepancies.length}\n`)

  // Table header
  const skuColWidth = 25
  const locColWidth = 15
  const numColWidth = 12

  console.log(
    'SKU'.padEnd(skuColWidth) + ' | ' +
    'Location'.padEnd(locColWidth) + ' | ' +
    'Balance'.padStart(numColWidth) + ' | ' +
    'Lines Sum'.padStart(numColWidth) + ' | ' +
    'Discrepancy'.padStart(numColWidth)
  )
  console.log(
    '-'.repeat(skuColWidth) + '-|-' +
    '-'.repeat(locColWidth) + '-|-' +
    '-'.repeat(numColWidth) + '-|-' +
    '-'.repeat(numColWidth) + '-|-' +
    '-'.repeat(numColWidth)
  )

  for (const d of discrepancies) {
    const skuDisplay = `${d.skuName} (${d.skuInternalCode})`.substring(0, skuColWidth)
    const locDisplay = d.locationName.substring(0, locColWidth)
    const discSign = d.discrepancy >= 0 ? '+' : ''

    console.log(
      skuDisplay.padEnd(skuColWidth) + ' | ' +
      locDisplay.padEnd(locColWidth) + ' | ' +
      d.balance.toFixed(2).padStart(numColWidth) + ' | ' +
      d.linesSum.toFixed(2).padStart(numColWidth) + ' | ' +
      (discSign + d.discrepancy.toFixed(2)).padStart(numColWidth)
    )
  }
}

/**
 * Create corrective adjustment transactions for all discrepancies
 */
async function createCorrectiveAdjustments(discrepancies: FinishedGoodsDiscrepancy[]): Promise<number> {
  console.log('\nCreating corrective adjustment transactions...\n')

  // Find an admin user to use as createdById
  const adminUser = await prisma.user.findFirst({
    where: {
      role: 'admin',
      isActive: true,
    },
    select: {
      id: true,
    },
  })

  if (!adminUser) {
    throw new Error('No active admin user found to create adjustment transactions')
  }

  let adjustmentsCreated = 0
  const today = new Date()
  const reason = 'Data reconciliation - missing transaction history'

  for (let i = 0; i < discrepancies.length; i++) {
    const d = discrepancies[i]
    console.log(`[${i + 1}/${discrepancies.length}] SKU: ${d.skuInternalCode} @ ${d.locationName}`)
    const discSign = d.discrepancy >= 0 ? '+' : ''
    console.log(`      Creating adjustment for ${discSign}${d.discrepancy.toFixed(2)} units...`)

    // Get SKU's company for the transaction
    const sku = await prisma.sKU.findUnique({
      where: { id: d.skuId },
      select: { companyId: true },
    })

    if (!sku || !sku.companyId) {
      console.log(`      WARNING: SKU ${d.skuId} has no company - skipping`)
      continue
    }

    // Create the corrective adjustment transaction
    const transaction = await prisma.$transaction(async (tx) => {
      // Create adjustment transaction with finished goods line
      const trans = await tx.transaction.create({
        data: {
          companyId: sku.companyId as string,
          type: 'adjustment',
          date: today,
          skuId: d.skuId,
          reason: reason,
          notes: `Automated reconciliation: Balance was ${d.balance}, lines sum was ${d.linesSum}`,
          createdById: adminUser.id,
          finishedGoodsLines: {
            create: {
              skuId: d.skuId,
              locationId: d.locationId,
              quantityChange: new Prisma.Decimal(d.discrepancy),
              costPerUnit: null,
            },
          },
        },
        select: { id: true },
      })

      // Note: We do NOT update the balance here because the balance is already correct
      // We're just creating the missing line entries to match the existing balance

      return trans
    })

    console.log(`      Transaction created: ${transaction.id}`)
    adjustmentsCreated++
  }

  return adjustmentsCreated
}

/**
 * Print summary statistics
 */
function printSummary(
  totalBalances: number,
  discrepancies: FinishedGoodsDiscrepancy[],
  adjustmentsCreated?: number
): void {
  console.log('\n========================================')
  console.log('Summary')
  console.log('========================================')
  console.log(`  Total balances checked: ${totalBalances}`)
  console.log(`  Discrepancies found: ${discrepancies.length}`)

  if (discrepancies.length > 0) {
    const totalDiscrepancy = discrepancies.reduce((sum, d) => sum + Math.abs(d.discrepancy), 0)
    console.log(`  Total discrepancy amount: ${totalDiscrepancy.toFixed(2)} units`)
  }

  if (adjustmentsCreated !== undefined) {
    console.log('\n========================================')
    console.log('Fix Summary')
    console.log('========================================')
    console.log(`  Adjustments created: ${adjustmentsCreated}`)
    if (discrepancies.length > 0) {
      const totalAdjusted = discrepancies.reduce((sum, d) => sum + d.discrepancy, 0)
      console.log(`  Total units adjusted: ${totalAdjusted.toFixed(2)}`)
    }
  }
}

async function main() {
  console.log('========================================')
  console.log('Finished Goods Balance Reconciliation')
  console.log('========================================\n')

  // Parse command line args
  const args = process.argv.slice(2)
  const shouldFix = args.includes('--fix')

  if (shouldFix) {
    console.log('Mode: FIX (will create corrective transactions)')
  } else {
    console.log('Mode: DRY RUN (read-only, use --fix to create corrections)')
  }
  console.log()

  try {
    // Count total balances for summary
    const totalBalances = await prisma.finishedGoodsBalance.count()

    // Find discrepancies
    const discrepancies = await findDiscrepancies()

    if (discrepancies.length === 0) {
      console.log('\nNo discrepancies found! All FinishedGoodsBalance records match their FinishedGoodsLine entries.')
      printSummary(totalBalances, discrepancies)
      return
    }

    // Log discrepancies
    logDiscrepancies(discrepancies)

    if (!shouldFix) {
      console.log('\nTo create corrective adjustment transactions, run with --fix flag.')
      printSummary(totalBalances, discrepancies)
      return
    }

    // Create corrective adjustments
    const adjustmentsCreated = await createCorrectiveAdjustments(discrepancies)
    printSummary(totalBalances, discrepancies, adjustmentsCreated)

    console.log('\nReconciliation completed successfully!')
  } finally {
    await pool.end()
  }
}

main()
  .catch((e) => {
    console.error('Error during reconciliation:', e)
    process.exit(1)
  })
