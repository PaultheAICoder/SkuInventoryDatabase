import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, serverError, error } from '@/lib/api-response'
import { processSKUImport, type ImportSummary, type SKUImportWithLookups } from '@/services/import'
import { createBOMVersion } from '@/services/bom'

interface SKUImportResult {
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
  components: Map<string, { id: string; costPerUnit: number }> // lowercase skuCode -> { id, costPerUnit }
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

  const [companies, brands, components] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: uniqueCompanyIds } },
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({
      where: { companyId: { in: uniqueCompanyIds }, isActive: true },
      select: { id: true, name: true, companyId: true, company: { select: { name: true } } },
    }),
    prisma.component.findMany({
      where: { companyId: { in: uniqueCompanyIds }, isActive: true },
      select: { id: true, skuCode: true, costPerUnit: true },
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
    components: new Map(
      components.map((c) => [
        c.skuCode.toLowerCase(),
        { id: c.id, costPerUnit: c.costPerUnit.toNumber() },
      ])
    ),
  }
}

// POST /api/import/skus - Import SKUs from CSV
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
    const importSummary: ImportSummary<SKUImportWithLookups> = processSKUImport(csvContent)

    const result: SKUImportResult = {
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

      const skuData = row.data

      try {
        // Resolve company (use provided or default to selected)
        let companyId = selectedCompanyId
        if (skuData.company) {
          const resolvedCompanyId = lookupMaps.companies.get(skuData.company.toLowerCase())
          if (!resolvedCompanyId) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              name: skuData.name,
              errors: [
                `Company "${skuData.company}" not found. Valid options are listed in the template.`,
              ],
            })
            continue
          }
          companyId = resolvedCompanyId
        }

        // Resolve brand (use provided or default)
        let brandId = defaultBrandId
        if (skuData.brand) {
          // Find brand for the resolved company
          const companyName = skuData.company || lookupMaps.companyNames.get(companyId) || ''
          const brandKey = `${companyName.toLowerCase()}|${skuData.brand.toLowerCase()}`
          const resolvedBrand = lookupMaps.brands.get(brandKey)
          if (!resolvedBrand) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              name: skuData.name,
              errors: [
                `Brand "${skuData.brand}" not found for company. Valid options are listed in the template.`,
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
              name: skuData.name,
              errors: [`Brand "${skuData.brand}" does not belong to the specified company.`],
            })
            continue
          }
        }

        // Check for duplicate internal code within the resolved company
        const existing = await prisma.sKU.findFirst({
          where: {
            companyId,
            internalCode: skuData.internalCode,
          },
        })

        if (existing) {
          result.skipped++
          result.errors.push({
            rowNumber: row.rowNumber,
            name: skuData.name,
            errors: [`SKU with internal code "${skuData.internalCode}" already exists`],
          })
          continue
        }

        // Create SKU with resolved IDs
        const newSku = await prisma.sKU.create({
          data: {
            brandId,
            companyId,
            name: skuData.name,
            internalCode: skuData.internalCode,
            salesChannel: skuData.salesChannel,
            externalIds: {},
            notes: skuData.notes ?? null,
            createdById: session.user.id,
            updatedById: session.user.id,
          },
        })

        result.imported++

        // Create BOM version if BOM components are provided
        if (skuData.bomComponents && skuData.bomComponents.length > 0) {
          // Validate and resolve components
          const bomLines: Array<{ componentId: string; quantityPerUnit: number }> = []
          let bomValid = true

          for (const bomComp of skuData.bomComponents) {
            const component = lookupMaps.components.get(bomComp.componentSkuCode.toLowerCase())
            if (!component) {
              result.errors.push({
                rowNumber: row.rowNumber,
                name: skuData.name,
                errors: [`BOM component "${bomComp.componentSkuCode}" not found`],
              })
              bomValid = false
              break
            }
            bomLines.push({
              componentId: component.id,
              quantityPerUnit: bomComp.quantity,
            })
          }

          if (bomValid && bomLines.length > 0) {
            // Use try-catch to not fail the whole import if BOM creation fails
            try {
              await createBOMVersion({
                skuId: newSku.id,
                versionName: 'v1-import',
                effectiveStartDate: new Date(),
                isActive: true,
                notes: 'Created via CSV import',
                lines: bomLines,
                createdById: session.user.id,
              })
            } catch (bomError) {
              console.error('Failed to create BOM during import:', bomError)
              // SKU was created, just note the BOM failure in results
              result.errors.push({
                rowNumber: row.rowNumber,
                name: skuData.name,
                errors: [
                  'SKU created but BOM creation failed: ' +
                    (bomError instanceof Error ? bomError.message : 'Unknown error'),
                ],
              })
            }
          }
        }
      } catch (err) {
        result.skipped++
        result.errors.push({
          rowNumber: row.rowNumber,
          name: skuData.name,
          errors: [err instanceof Error ? err.message : 'Database error'],
        })
      }
    }

    return success(result)
  } catch (err) {
    console.error('Error importing SKUs:', err)
    return serverError()
  }
}
