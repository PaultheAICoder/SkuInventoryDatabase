import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { hash } from 'bcryptjs'

const connectionString = process.env.DATABASE_URL ?? ''
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create company
  const company = await prisma.company.upsert({
    where: { name: 'Tonsil Tech' },
    update: {},
    create: {
      name: 'Tonsil Tech',
      settings: {
        blockNegativeInventory: false,
      },
    },
  })
  console.log('Created company:', company.name)

  // Create brand
  const brand = await prisma.brand.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: 'Tonsil Tech',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: 'Tonsil Tech',
    },
  })
  console.log('Created brand:', brand.name)

  // Create admin user
  const adminPassword = await hash('changeme123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@tonsil.tech' },
    update: {},
    create: {
      companyId: company.id,
      email: 'admin@tonsil.tech',
      passwordHash: adminPassword,
      name: 'Admin User',
      role: 'admin',
    },
  })
  console.log('Created admin user:', admin.email)

  // Create ops user
  const opsPassword = await hash('changeme123', 12)
  const opsUser = await prisma.user.upsert({
    where: { email: 'ops@tonsil.tech' },
    update: {},
    create: {
      companyId: company.id,
      email: 'ops@tonsil.tech',
      passwordHash: opsPassword,
      name: 'Operations User',
      role: 'ops',
    },
  })
  console.log('Created ops user:', opsUser.email)

  // Create viewer user
  const viewerPassword = await hash('changeme123', 12)
  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@tonsil.tech' },
    update: {},
    create: {
      companyId: company.id,
      email: 'viewer@tonsil.tech',
      passwordHash: viewerPassword,
      name: 'Viewer User',
      role: 'viewer',
    },
  })
  console.log('Created viewer user:', viewerUser.email)

  console.log('Seed completed successfully!')
  console.log('')
  console.log('Default credentials:')
  console.log('  Admin:  admin@tonsil.tech / changeme123')
  console.log('  Ops:    ops@tonsil.tech / changeme123')
  console.log('  Viewer: viewer@tonsil.tech / changeme123')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
