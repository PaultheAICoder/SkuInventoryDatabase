/**
 * Seed inventory data from 2025-11-20 TonsilTech Inventory snapshot
 *
 * Usage: DATABASE_URL="..." npx tsx scripts/seed-inventory.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL ?? ''
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Inventory data from 2025-11-20_TonsilTech_Inventory.xlsx
const inventoryItems = [
  { name: '3pk IFU', skuCode: '3PK-IFU', quantity: 4664 },
  { name: '3pk boxes', skuCode: '3PK-BOXE', quantity: 4120 },
  { name: 'Avery labels', skuCode: 'AVER-LABE', quantity: 4160 },
  { name: 'Bubble Mailers', skuCode: 'BUBB-MAIL', quantity: 3345 },
  { name: 'Casepacks', skuCode: 'CASE', quantity: 52 },
  { name: 'Large tools', skuCode: 'LARG-TOOL', quantity: 4695 },
  { name: 'Medium Tools', skuCode: 'MEDI-TOOL', quantity: 4395 },
  { name: 'Single IFU', skuCode: 'SING-IFU', quantity: 900 },
  { name: 'Single boxes', skuCode: 'SING-BOXE', quantity: 1825 },
  { name: 'Small tools', skuCode: 'SMAL-TOOL', quantity: 3820 },
  { name: 'Travel cases', skuCode: 'TRAV-CASE', quantity: 2381 },
  { name: 'We want a review', skuCode: 'WE-WANT-A-REVI', quantity: 3295 },
  { name: 'Wrist straps', skuCode: 'WRIS-STRA', quantity: 7204 },
]

async function main() {
  console.log('Seeding inventory data from 2025-11-20 snapshot...\n')

  // Get or create company
  let company = await prisma.company.findFirst({ where: { name: 'Tonsil Tech' } })
  if (!company) {
    company = await prisma.company.create({
      data: { name: 'Tonsil Tech', settings: { blockNegativeInventory: false } },
    })
    console.log('Created company: Tonsil Tech')
  } else {
    console.log('Found existing company: Tonsil Tech')
  }

  // Get or create brand
  let brand = await prisma.brand.findFirst({
    where: { companyId: company.id, name: 'Tonsil Tech' },
  })
  if (!brand) {
    brand = await prisma.brand.create({
      data: { companyId: company.id, name: 'Tonsil Tech' },
    })
    console.log('Created brand: Tonsil Tech')
  } else {
    console.log('Found existing brand: Tonsil Tech')
  }

  // Get admin user for audit fields
  const adminUser = await prisma.user.findFirst({
    where: { companyId: company.id, role: 'admin' },
  })
  if (!adminUser) {
    throw new Error('No admin user found. Please run the main seed first.')
  }
  console.log(`Using admin user: ${adminUser.email}\n`)

  // Create components and initial transactions
  const transactionDate = new Date('2025-11-20')
  let created = 0
  let skipped = 0

  for (const item of inventoryItems) {
    // Check if component already exists
    const existing = await prisma.component.findFirst({
      where: { brandId: brand.id, skuCode: item.skuCode },
    })

    if (existing) {
      console.log(`  Skipped: ${item.name} (${item.skuCode}) - already exists`)
      skipped++
      continue
    }

    // Create component with initial transaction
    await prisma.$transaction(async (tx) => {
      // Create component
      const component = await tx.component.create({
        data: {
          brandId: brand.id,
          name: item.name,
          skuCode: item.skuCode,
          category: 'Inventory',
          unitOfMeasure: 'each',
          costPerUnit: 0,
          reorderPoint: 0,
          leadTimeDays: 0,
          createdById: adminUser.id,
          updatedById: adminUser.id,
        },
      })

      // Create initial transaction
      await tx.transaction.create({
        data: {
          companyId: company.id,
          type: 'initial',
          date: transactionDate,
          notes: 'Initial inventory from 2025-11-20 snapshot',
          createdById: adminUser.id,
          lines: {
            create: {
              componentId: component.id,
              quantityChange: item.quantity,
              costPerUnit: 0,
            },
          },
        },
      })

      console.log(`  Created: ${item.name} (${item.skuCode}) = ${item.quantity} units`)
    })

    created++
  }

  console.log(`\nSeed completed!`)
  console.log(`  Created: ${created} components with initial inventory`)
  console.log(`  Skipped: ${skipped} existing components`)

  await pool.end()
}

main()
  .catch((e) => {
    console.error('Error seeding inventory:', e)
    process.exit(1)
  })
