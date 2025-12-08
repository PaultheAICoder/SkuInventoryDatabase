import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Starting UserCompany data migration...')

  // Get all users with their companyId and userCompanies
  const users = await prisma.user.findMany({
    include: {
      userCompanies: true,
    },
  })

  console.log(`Processing ${users.length} users...`)

  for (const user of users) {
    const existingPrimaryRecord = user.userCompanies.find(uc => uc.companyId === user.companyId)

    if (!existingPrimaryRecord) {
      // Create missing UserCompany record
      await prisma.userCompany.create({
        data: {
          userId: user.id,
          companyId: user.companyId,
          role: user.role,
          isPrimary: true,
        },
      })
      console.log(`Created UserCompany for ${user.email} -> company ${user.companyId}`)
    } else {
      // Ensure isPrimary is set
      await prisma.userCompany.update({
        where: { id: existingPrimaryRecord.id },
        data: { isPrimary: true },
      })
      console.log(`Set isPrimary for ${user.email} -> company ${user.companyId}`)
    }

    // Clear any other isPrimary flags for this user
    await prisma.userCompany.updateMany({
      where: {
        userId: user.id,
        companyId: { not: user.companyId },
      },
      data: { isPrimary: false },
    })
  }

  console.log('Migration complete!')

  // Verify
  const orphanedUsers = await prisma.user.findMany({
    where: {
      userCompanies: { none: {} },
    },
  })

  if (orphanedUsers.length > 0) {
    console.error('ERROR: Users without UserCompany records:', orphanedUsers.map(u => u.email))
  } else {
    console.log('SUCCESS: All users have at least one UserCompany record')
  }

  // Verify each user has exactly one isPrimary=true
  const usersWithPrimary = await prisma.user.findMany({
    include: {
      userCompanies: {
        where: { isPrimary: true },
      },
    },
  })

  const usersWithMultiplePrimary = usersWithPrimary.filter(u => u.userCompanies.length > 1)
  const usersWithNoPrimary = usersWithPrimary.filter(u => u.userCompanies.length === 0)

  if (usersWithMultiplePrimary.length > 0) {
    console.error('ERROR: Users with multiple isPrimary=true:', usersWithMultiplePrimary.map(u => u.email))
  }

  if (usersWithNoPrimary.length > 0) {
    console.error('ERROR: Users with no isPrimary=true:', usersWithNoPrimary.map(u => u.email))
  }

  if (usersWithMultiplePrimary.length === 0 && usersWithNoPrimary.length === 0) {
    console.log('SUCCESS: Each user has exactly one isPrimary=true record')
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
