import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { success, unauthorized, serverError, error } from '@/lib/api-response'
import {
  processComponentImport,
  type ImportSummary,
  type ComponentImportWithLookups,
} from '@/services/import'

interface ComponentImportResult {
  total: number
  imported: number
  skipped: number
  errors: Array<{
    rowNumber: number
    name: string
    errors: string[]
  }>
}

/**
 * Lookup maps for resolving entity names to IDs
 */
interface LookupMaps {
  companies: Map<string, string> // lowercase name -> id
  companyNames: Map<string, string> // id -> original name
  brands: Map<string, { id: string; companyId: string }> // "companyName|brandName" -> { id, companyId }
  locations: Map<string, { id: string; companyId: string }> // "companyName|locationName" -> { id, companyId }
  categories: Map<string, string> // lowercase name -> original name
}

/**
 * Pre-fetch all lookup data to avoid N+1 queries during import
 */
async function buildLookupMaps(
  userId: string,
  selectedCompanyId: string
): Promise<LookupMaps> {
  // Get user's accessible companies
  const userCompanies = await prisma.userCompany.findMany({
    where: { userId },
    select: { companyId: true },
  })
  const companyIds = [selectedCompanyId, ...userCompanies.map((uc) => uc.companyId)]
  const uniqueCompanyIds = Array.from(new Set(companyIds))

  const [companies, brands, locations, categories] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: uniqueCompanyIds } },
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({
      where: { companyId: { in: uniqueCompanyIds }, isActive: true },
      select: { id: true, name: true, companyId: true, company: { select: { name: true } } },
    }),
    prisma.location.findMany({
      where: { companyId: { in: uniqueCompanyIds }, isActive: true },
      select: { id: true, name: true, companyId: true, company: { select: { name: true } } },
    }),
    prisma.category.findMany({
      where: { companyId: selectedCompanyId, isActive: true },
      select: { name: true },
    }),
  ])

  return {
    companies: new Map(companies.map((c) => [c.name.toLowerCase(), c.id])),
    companyNames: new Map(companies.map((c) => [c.id, c.name])),
    brands: new Map(
      brands.map((b) => [
        `${b.company.name.toLowerCase()}|${b.name.toLowerCase()}`,
        { id: b.id, companyId: b.companyId },
      ])
    ),
    locations: new Map(
      locations.map((l) => [
        `${l.company.name.toLowerCase()}|${l.name.toLowerCase()}`,
        { id: l.id, companyId: l.companyId },
      ])
    ),
    categories: new Map(categories.map((c) => [c.name.toLowerCase(), c.name])),
  }
}

// POST /api/import/components - Import components from CSV
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Only ops and admin can import
    if (session.user.role === 'viewer') {
      return unauthorized('Viewers cannot import data')
    }

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Use selected brand from session, or fall back to first active brand
    let defaultBrandId = session.user.selectedBrandId

    if (!defaultBrandId) {
      const brand = await prisma.brand.findFirst({
        where: { companyId: selectedCompanyId, isActive: true },
      })
      if (!brand) {
        return error('No active brand found for selected company', 400)
      }
      defaultBrandId = brand.id
    }

    // Parse multipart form data or raw CSV
    const contentType = request.headers.get('content-type') || ''

    let csvContent: string

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return error('No file provided', 400)
      }

      csvContent = await file.text()
    } else {
      csvContent = await request.text()
    }

    if (!csvContent.trim()) {
      return error('Empty file provided', 400)
    }

    // Pre-fetch all lookup data (avoid N+1 queries)
    const lookupMaps = await buildLookupMaps(session.user.id, selectedCompanyId)

    // Process CSV
    const importSummary: ImportSummary<ComponentImportWithLookups> =
      processComponentImport(csvContent)

    const result: ComponentImportResult = {
      total: importSummary.total,
      imported: 0,
      skipped: 0,
      errors: [],
    }

    // Import successful rows
    for (const row of importSummary.results) {
      if (!row.success || !row.data) {
        result.skipped++
        result.errors.push({
          rowNumber: row.rowNumber,
          name: '',
          errors: row.errors,
        })
        continue
      }

      const componentData = row.data

      try {
        // Resolve company (use provided or default to selected)
        let companyId = selectedCompanyId
        if (componentData.company) {
          const resolvedCompanyId = lookupMaps.companies.get(componentData.company.toLowerCase())
          if (!resolvedCompanyId) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              name: componentData.name,
              errors: [
                `Company "${componentData.company}" not found. Valid options are listed in the template.`,
              ],
            })
            continue
          }
          companyId = resolvedCompanyId
        }

        // Resolve brand (use provided or default)
        let brandId = defaultBrandId
        if (componentData.brand) {
          // Find brand for the resolved company
          const companyName =
            componentData.company || lookupMaps.companyNames.get(companyId) || ''
          const brandKey = `${companyName.toLowerCase()}|${componentData.brand.toLowerCase()}`
          const resolvedBrand = lookupMaps.brands.get(brandKey)
          if (!resolvedBrand) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              name: componentData.name,
              errors: [
                `Brand "${componentData.brand}" not found for company. Valid options are listed in the template.`,
              ],
            })
            continue
          }
          brandId = resolvedBrand.id
          // Verify brand belongs to resolved company
          if (resolvedBrand.companyId !== companyId) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              name: componentData.name,
              errors: [`Brand "${componentData.brand}" does not belong to the specified company.`],
            })
            continue
          }
        }

        // Resolve location (optional) - validate it exists even though we don't store it yet
        if (componentData.location) {
          const companyName =
            componentData.company || lookupMaps.companyNames.get(companyId) || ''
          const locationKey = `${companyName.toLowerCase()}|${componentData.location.toLowerCase()}`
          const resolvedLocation = lookupMaps.locations.get(locationKey)
          if (!resolvedLocation) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              name: componentData.name,
              errors: [
                `Location "${componentData.location}" not found for company. Valid options are listed in the template.`,
              ],
            })
            continue
          }
          // Note: locationId (resolvedLocation.id) is currently not stored on Component model
          // When Component model is updated to include locationId, use it here
        }

        // Resolve category (use canonical casing from database)
        let category = componentData.category
        if (category) {
          const canonicalCategory = lookupMaps.categories.get(category.toLowerCase())
          if (canonicalCategory) {
            category = canonicalCategory
          }
          // Note: Categories can be free-text, so we don't fail on unknown categories
        }

        // Check for duplicate name or skuCode within the resolved company
        const existing = await prisma.component.findFirst({
          where: {
            companyId,
            OR: [{ name: componentData.name }, { skuCode: componentData.skuCode }],
          },
        })

        if (existing) {
          result.skipped++
          result.errors.push({
            rowNumber: row.rowNumber,
            name: componentData.name,
            errors: [
              existing.name === componentData.name
                ? `Component with name "${componentData.name}" already exists`
                : `Component with SKU code "${componentData.skuCode}" already exists`,
            ],
          })
          continue
        }

        // Create component with resolved IDs
        await prisma.component.create({
          data: {
            brandId,
            companyId,
            name: componentData.name,
            skuCode: componentData.skuCode,
            category: category ?? null,
            unitOfMeasure: componentData.unitOfMeasure ?? 'each',
            costPerUnit: new Prisma.Decimal(componentData.costPerUnit ?? 0),
            reorderPoint: componentData.reorderPoint ?? 0,
            leadTimeDays: componentData.leadTimeDays ?? 0,
            notes: componentData.notes ?? null,
            createdById: session.user.id,
            updatedById: session.user.id,
          },
        })

        result.imported++
      } catch (err) {
        result.skipped++
        result.errors.push({
          rowNumber: row.rowNumber,
          name: componentData.name,
          errors: [err instanceof Error ? err.message : 'Database error'],
        })
      }
    }

    return success(result)
  } catch (err) {
    console.error('Error importing components:', err)
    return serverError()
  }
}
