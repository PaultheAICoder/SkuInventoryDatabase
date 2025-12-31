/**
 * Seed Sandbox brand with sample data for safe testing
 *
 * Usage: DATABASE_URL="..." npx tsx scripts/seed-sandbox-brand.ts
 *
 * For test database:
 * DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" npx tsx scripts/seed-sandbox-brand.ts
 *
 * For production database (use with caution):
 * DATABASE_URL="postgresql://postgres:password@localhost:4546/inventory" npx tsx scripts/seed-sandbox-brand.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL ?? ''
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Component seed data with initial quantities
const componentData = [
  { name: 'Sample Box', skuCode: 'SBOX-001', cost: 0.50, category: 'Packaging', initialQty: 500, description: 'Cardboard box for shipping' },
  { name: 'Sample Label', skuCode: 'SLBL-001', cost: 0.05, category: 'Packaging', initialQty: 1000, description: 'Product label' },
  { name: 'Sample Insert', skuCode: 'SINS-001', cost: 0.10, category: 'Packaging', initialQty: 800, description: 'Information insert' },
  { name: 'Widget A', skuCode: 'WDGT-A', cost: 2.00, category: 'Parts', initialQty: 200, description: 'Core product component' },
  { name: 'Widget B', skuCode: 'WDGT-B', cost: 1.50, category: 'Parts', initialQty: 300, description: 'Secondary component' },
  { name: 'Bubble Wrap', skuCode: 'BWRP-001', cost: 0.15, category: 'Packaging', initialQty: 600, description: 'Protective packaging' },
]

// SKU seed data with BOM definitions
const skuData = [
  {
    name: 'Basic Kit',
    internalCode: 'SBOX-BASIC',
    salesChannel: 'Amazon',
    bom: [
      { skuCode: 'SBOX-001', qty: 1 },
      { skuCode: 'SLBL-001', qty: 1 },
      { skuCode: 'SINS-001', qty: 1 },
      { skuCode: 'WDGT-A', qty: 1 },
      { skuCode: 'BWRP-001', qty: 1 },
    ],
  },
  {
    name: 'Premium Kit',
    internalCode: 'SBOX-PREMIUM',
    salesChannel: 'Amazon',
    bom: [
      { skuCode: 'SBOX-001', qty: 1 },
      { skuCode: 'SLBL-001', qty: 1 },
      { skuCode: 'SINS-001', qty: 1 },
      { skuCode: 'WDGT-A', qty: 1 },
      { skuCode: 'WDGT-B', qty: 2 },
      { skuCode: 'BWRP-001', qty: 2 },
    ],
  },
]

async function main() {
  console.log('Seeding Sandbox brand with sample data...\n')

  // Get or create company (use existing Tonsil Tech)
  let company = await prisma.company.findFirst({ where: { name: 'Tonsil Tech' } })
  if (!company) {
    // Create company if running standalone
    company = await prisma.company.create({
      data: {
        name: 'Tonsil Tech',
        settings: { blockNegativeInventory: false },
      },
    })
    console.log('Created company: Tonsil Tech')
  } else {
    console.log('Found existing company: Tonsil Tech')
  }

  // Create Sandbox brand
  const brand = await prisma.brand.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: 'Sandbox',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: 'Sandbox',
    },
  })
  console.log(`Brand: ${brand.name} (${brand.id})`)

  // Get admin user for audit fields (via UserCompany)
  const adminUser = await prisma.user.findFirst({
    where: {
      userCompanies: {
        some: { companyId: company.id },
      },
      role: 'admin',
    },
  })
  if (!adminUser) {
    throw new Error('No admin user found. Please run the main seed first.')
  }
  console.log(`Using admin user: ${adminUser.email}\n`)

  // Create locations
  const mainWarehouse = await prisma.location.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: 'Sandbox Warehouse',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: 'Sandbox Warehouse',
      type: 'warehouse',
      isDefault: false, // Don't override existing default
      isActive: true,
    },
  })

  const fbaCenter = await prisma.location.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: 'Sandbox FBA',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: 'Sandbox FBA',
      type: 'fba',
      isDefault: false,
      isActive: true,
    },
  })
  console.log(`Created locations: ${mainWarehouse.name}, ${fbaCenter.name}`)

  // Store component IDs by skuCode for later reference
  const components: Record<string, string> = {}

  // Create components
  console.log('\nCreating components...')
  for (const item of componentData) {
    const existing = await prisma.component.findFirst({
      where: { brandId: brand.id, skuCode: item.skuCode },
    })

    if (existing) {
      components[item.skuCode] = existing.id
      console.log(`  Skipped: ${item.name} (already exists)`)
      continue
    }

    const component = await prisma.component.create({
      data: {
        brandId: brand.id,
        companyId: company.id,
        name: item.name,
        skuCode: item.skuCode,
        category: item.category,
        unitOfMeasure: 'each',
        costPerUnit: item.cost,
        reorderPoint: Math.floor(item.initialQty * 0.2), // 20% reorder point
        leadTimeDays: 7,
        notes: item.description,
        createdById: adminUser.id,
        updatedById: adminUser.id,
      },
    })
    components[item.skuCode] = component.id
    console.log(`  Created: ${item.name} (${item.skuCode})`)
  }

  // Create initial inventory transactions and update InventoryBalance
  console.log('\nCreating initial inventory transactions...')
  for (const item of componentData) {
    const componentId = components[item.skuCode]

    // Check if initial transaction already exists for this component
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        companyId: company.id,
        type: 'initial',
        notes: 'Sandbox initial inventory',
        lines: {
          some: { componentId },
        },
      },
    })

    if (existingTransaction) {
      console.log(`  Skipped initial transaction for: ${item.name} (already exists)`)
      continue
    }

    // Create initial transaction
    await prisma.transaction.create({
      data: {
        companyId: company.id,
        type: 'initial',
        date: new Date(),
        locationId: mainWarehouse.id,
        notes: 'Sandbox initial inventory',
        status: 'approved',
        createdById: adminUser.id,
        lines: {
          create: {
            componentId,
            quantityChange: item.initialQty,
            costPerUnit: item.cost,
          },
        },
      },
    })

    // Update InventoryBalance for O(1) lookups
    await prisma.inventoryBalance.upsert({
      where: {
        componentId_locationId: {
          componentId,
          locationId: mainWarehouse.id,
        },
      },
      create: {
        componentId,
        locationId: mainWarehouse.id,
        quantity: new Prisma.Decimal(item.initialQty),
      },
      update: {
        quantity: new Prisma.Decimal(item.initialQty),
      },
    })
    console.log(`  Created initial transaction for: ${item.name} (${item.initialQty} units)`)
  }

  // Create SKUs and BOMs
  console.log('\nCreating SKUs and BOMs...')
  for (const item of skuData) {
    // Check if SKU exists
    let sku = await prisma.sKU.findFirst({
      where: { brandId: brand.id, internalCode: item.internalCode },
    })

    if (!sku) {
      sku = await prisma.sKU.create({
        data: {
          brandId: brand.id,
          companyId: company.id,
          name: item.name,
          internalCode: item.internalCode,
          salesChannel: item.salesChannel,
          createdById: adminUser.id,
          updatedById: adminUser.id,
        },
      })
      console.log(`  Created SKU: ${item.name}`)
    } else {
      console.log(`  Skipped SKU: ${item.name} (already exists)`)
    }

    // Create BOM version if doesn't exist
    let bomVersion = await prisma.bOMVersion.findFirst({
      where: { skuId: sku.id, isActive: true },
    })

    if (!bomVersion) {
      bomVersion = await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1',
          effectiveStartDate: new Date(),
          isActive: true,
          notes: 'Initial BOM version',
          createdById: adminUser.id,
        },
      })

      // Create BOM lines
      for (const bomItem of item.bom) {
        await prisma.bOMLine.create({
          data: {
            bomVersionId: bomVersion.id,
            componentId: components[bomItem.skuCode],
            quantityPerUnit: bomItem.qty,
          },
        })
      }
      console.log(`    Created BOM with ${item.bom.length} lines`)
    } else {
      console.log(`    Skipped BOM (already exists)`)
    }
  }

  // Create sample receipt transaction
  console.log('\nCreating sample transactions...')

  // Check if sample receipt already exists
  const existingReceipt = await prisma.transaction.findFirst({
    where: {
      companyId: company.id,
      type: 'receipt',
      notes: 'Sandbox sample receipt',
    },
  })

  if (!existingReceipt) {
    await prisma.transaction.create({
      data: {
        companyId: company.id,
        type: 'receipt',
        date: new Date(),
        locationId: mainWarehouse.id,
        supplier: 'Sample Supplier Co.',
        notes: 'Sandbox sample receipt',
        status: 'approved',
        createdById: adminUser.id,
        lines: {
          create: [
            { componentId: components['WDGT-A'], quantityChange: 50, costPerUnit: 2.00 },
            { componentId: components['WDGT-B'], quantityChange: 75, costPerUnit: 1.50 },
          ],
        },
      },
    })

    // Update balances for receipt
    await prisma.inventoryBalance.update({
      where: {
        componentId_locationId: {
          componentId: components['WDGT-A'],
          locationId: mainWarehouse.id,
        },
      },
      data: { quantity: { increment: 50 } },
    })
    await prisma.inventoryBalance.update({
      where: {
        componentId_locationId: {
          componentId: components['WDGT-B'],
          locationId: mainWarehouse.id,
        },
      },
      data: { quantity: { increment: 75 } },
    })
    console.log('  Created sample receipt transaction (+50 Widget A, +75 Widget B)')
  } else {
    console.log('  Skipped sample receipt (already exists)')
  }

  // Create sample adjustment transaction
  const existingAdjustment = await prisma.transaction.findFirst({
    where: {
      companyId: company.id,
      type: 'adjustment',
      notes: 'Sandbox sample adjustment - inventory count correction',
    },
  })

  if (!existingAdjustment) {
    await prisma.transaction.create({
      data: {
        companyId: company.id,
        type: 'adjustment',
        date: new Date(),
        locationId: mainWarehouse.id,
        reason: 'Inventory count correction',
        notes: 'Sandbox sample adjustment - inventory count correction',
        status: 'approved',
        createdById: adminUser.id,
        lines: {
          create: [
            { componentId: components['SLBL-001'], quantityChange: -10, costPerUnit: 0.05 },
          ],
        },
      },
    })

    // Update balance for adjustment
    await prisma.inventoryBalance.update({
      where: {
        componentId_locationId: {
          componentId: components['SLBL-001'],
          locationId: mainWarehouse.id,
        },
      },
      data: { quantity: { decrement: 10 } },
    })
    console.log('  Created sample adjustment transaction (-10 Sample Label)')
  } else {
    console.log('  Skipped sample adjustment (already exists)')
  }

  // Print summary
  console.log('\n========================================')
  console.log('Sandbox Brand Seed Summary')
  console.log('========================================')
  console.log(`  Company: ${company.name}`)
  console.log(`  Brand: ${brand.name}`)
  console.log(`  Components: ${componentData.length}`)
  console.log(`  SKUs: ${skuData.length}`)
  console.log(`  Locations: 2`)
  console.log('\nSandbox brand seeded successfully!')
  console.log('Switch to Sandbox brand in the UI to start testing.')

  await pool.end()
}

main()
  .catch((e) => {
    console.error('Error seeding Sandbox brand:', e)
    process.exit(1)
  })
