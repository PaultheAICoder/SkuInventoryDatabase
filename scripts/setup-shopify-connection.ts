/**
 * One-time script to set up Shopify connection for Tonsil Tech
 * using the legacy custom app credentials from .env
 *
 * Run with: npx tsx scripts/setup-shopify-connection.ts
 */

import { encrypt } from '../src/lib/encryption'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const shopName = process.env.SHOPIFY_SHOP_NAME
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN

  if (!shopName || !accessToken) {
    console.error('Missing SHOPIFY_SHOP_NAME or SHOPIFY_ACCESS_TOKEN in .env')
    process.exit(1)
  }

  // Find Tonsil Tech company
  const company = await prisma.company.findFirst({
    where: { name: 'Tonsil Tech' }
  })

  if (!company) {
    console.error('Tonsil Tech company not found in database')
    process.exit(1)
  }

  console.log(`Found company: ${company.name} (${company.id})`)

  // Check for existing connection
  const existing = await prisma.shopifyConnection.findFirst({
    where: { companyId: company.id }
  })

  if (existing) {
    console.log('Shopify connection already exists, updating...')
    await prisma.shopifyConnection.update({
      where: { id: existing.id },
      data: {
        shopName,
        accessToken: encrypt(accessToken, { integrationType: 'shopify' }),
        isActive: true,
        syncStatus: 'idle',
        updatedAt: new Date(),
      }
    })
    console.log('Connection updated successfully!')
  } else {
    console.log('Creating new Shopify connection...')
    await prisma.shopifyConnection.create({
      data: {
        companyId: company.id,
        shopName,
        accessToken: encrypt(accessToken, { integrationType: 'shopify' }),
        isActive: true,
        syncStatus: 'idle',
      }
    })
    console.log('Connection created successfully!')
  }

  // Verify by fetching shop info
  console.log('\nVerifying connection...')
  const connection = await prisma.shopifyConnection.findFirst({
    where: { companyId: company.id },
    select: { id: true, shopName: true, isActive: true, syncStatus: true }
  })
  console.log('Stored connection:', connection)
  console.log('\nSetup complete! You can now sync orders via the Integrations page.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
