import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, serverError } from '@/lib/api-response'

// POST /api/session/refresh - Refresh session company/brand data
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return unauthorized()
    }

    // Fetch fresh user data with company assignments
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        userCompanies: {
          include: {
            company: { select: { id: true, name: true } }
          }
        }
      }
    })

    if (!user) {
      return unauthorized()
    }

    // Build companies array
    const companies = user.userCompanies.map(uc => ({
      id: uc.company.id,
      name: uc.company.name,
      role: uc.role,
    }))

    // Fetch all brands for accessible companies
    const accessibleCompanyIds = companies.map(c => c.id)
    const allBrands = await prisma.brand.findMany({
      where: {
        companyId: { in: accessibleCompanyIds },
        isActive: true,
      },
      select: { id: true, name: true, companyId: true },
      orderBy: { name: 'asc' },
    })

    // Build companiesWithBrands structure
    const companiesWithBrands = companies.map(company => ({
      id: company.id,
      name: company.name,
      role: company.role,
      brands: allBrands
        .filter(b => b.companyId === company.id)
        .map(b => ({ id: b.id, name: b.name }))
    }))

    return success({
      companies,
      companiesWithBrands,
    })
  } catch (error) {
    console.error('Error refreshing session:', error)
    return serverError()
  }
}
