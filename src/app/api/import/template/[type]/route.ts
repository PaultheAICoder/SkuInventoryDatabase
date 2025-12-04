import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unauthorized, notFound } from '@/lib/api-response'
import {
  generateComponentTemplate,
  generateSKUTemplate,
  generateInitialInventoryTemplate,
  type TemplateReferenceData,
} from '@/services/import'

interface RouteParams {
  params: Promise<{
    type: string
  }>
}

/**
 * Fetch reference data for templates (companies, brands, locations, categories, and optionally components)
 */
async function fetchReferenceData(
  userId: string,
  selectedCompanyId: string,
  includeComponents: boolean = false
): Promise<TemplateReferenceData> {
  // Get user's accessible companies via UserCompany
  const userCompanies = await prisma.userCompany.findMany({
    where: { userId },
    select: { companyId: true },
  })

  // Also include the user's primary company from session
  const companyIds = [selectedCompanyId, ...userCompanies.map((uc) => uc.companyId)]
  const uniqueCompanyIds = Array.from(new Set(companyIds))

  // Only fetch components for SKU template
  const componentQuery = includeComponents
    ? prisma.component.findMany({
        where: { companyId: { in: uniqueCompanyIds }, isActive: true },
        select: { skuCode: true, name: true, costPerUnit: true },
        orderBy: [{ name: 'asc' }],
      })
    : Promise.resolve([])

  // Fetch all reference data in parallel
  const [companies, brands, locations, categories, components] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: uniqueCompanyIds } },
      select: { name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.brand.findMany({
      where: { companyId: { in: uniqueCompanyIds }, isActive: true },
      select: { name: true, company: { select: { name: true } } },
      orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.location.findMany({
      where: { companyId: { in: uniqueCompanyIds }, isActive: true },
      select: { name: true, company: { select: { name: true } } },
      orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.category.findMany({
      where: { companyId: selectedCompanyId, isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    }),
    componentQuery,
  ])

  return {
    companies: companies.map((c) => ({ name: c.name })),
    brands: brands.map((b) => ({ name: b.name, companyName: b.company.name })),
    locations: locations.map((l) => ({ name: l.name, companyName: l.company.name })),
    categories: categories.map((c) => ({ name: c.name })),
    components: components.map((c) => ({
      skuCode: c.skuCode,
      name: c.name,
      costPerUnit: c.costPerUnit.toString(),
    })),
  }
}

// GET /api/import/template/[type] - Download CSV import template
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return unauthorized()
  }

  // Only ops and admin can access import templates
  if (session.user.role === 'viewer') {
    return unauthorized('Viewers cannot access import templates')
  }

  const { type } = await params

  // Fetch reference data for components and skus templates
  // For SKUs, also include components for BOM reference
  let referenceData: TemplateReferenceData | undefined
  if (type === 'components') {
    referenceData = await fetchReferenceData(session.user.id, session.user.selectedCompanyId, false)
  } else if (type === 'skus') {
    referenceData = await fetchReferenceData(session.user.id, session.user.selectedCompanyId, true)
  }

  let csvContent: string
  let filename: string

  switch (type) {
    case 'components':
      csvContent = generateComponentTemplate(referenceData)
      filename = 'component-import-template.csv'
      break
    case 'skus':
      csvContent = generateSKUTemplate(referenceData)
      filename = 'sku-import-template.csv'
      break
    case 'initial-inventory':
      csvContent = generateInitialInventoryTemplate()
      filename = 'initial-inventory-import-template.csv'
      break
    default:
      return notFound('Template type')
  }

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
