import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, serverError, error } from '@/lib/api-response'
import {
  processInitialInventoryImport,
  type InitialInventoryRowData,
  type ImportSummary,
} from '@/services/import'
import { createInitialTransaction } from '@/services/inventory'

interface InitialInventoryImportResult {
  total: number
  imported: number
  overwritten: number
  skipped: number
  errors: Array<{
    rowNumber: number
    componentSkuCode: string
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

  const [companies, brands] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: uniqueCompanyIds } },
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({
      where: { companyId: { in: uniqueCompanyIds }, isActive: true },
      select: { id: true, name: true, companyId: true, company: { select: { name: true } } },
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
  }
}

// POST /api/import/initial-inventory - Import initial inventory from CSV
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

      // Extract allowOverwrite parameter (for re-importing)
      const allowOverwriteParam = formData.get('allowOverwrite')
      const allowOverwrite = allowOverwriteParam === 'true' || allowOverwriteParam === '1'
      ;(request as NextRequest & { allowOverwrite?: boolean }).allowOverwrite = allowOverwrite
    } else {
      csvContent = await request.text()
    }

    // Get allowOverwrite flag (set from form data processing above, defaults to false)
    const allowOverwrite = (request as NextRequest & { allowOverwrite?: boolean }).allowOverwrite ?? false

    if (!csvContent.trim()) {
      return error('Empty file provided', 400)
    }

    // Process CSV
    const importSummary: ImportSummary<InitialInventoryRowData> =
      processInitialInventoryImport(csvContent)

    // Pre-fetch all lookup data (avoid N+1 queries)
    const lookupMaps = await buildLookupMaps(session.user.id, selectedCompanyId)

    const result: InitialInventoryImportResult = {
      total: importSummary.total,
      imported: 0,
      overwritten: 0,
      skipped: 0,
      errors: [],
    }

    // Import successful rows
    for (const row of importSummary.results) {
      if (!row.success || !row.data) {
        result.skipped++
        result.errors.push({
          rowNumber: row.rowNumber,
          componentSkuCode: '',
          errors: row.errors,
        })
        continue
      }

      const rowData = row.data

      try {
        // Resolve company from file or use session default
        let resolvedCompanyId = selectedCompanyId
        if (rowData.company) {
          const foundCompanyId = lookupMaps.companies.get(rowData.company.toLowerCase())
          if (!foundCompanyId) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              componentSkuCode: rowData.componentSkuCode,
              errors: [`Company "${rowData.company}" not found`],
            })
            continue
          }
          resolvedCompanyId = foundCompanyId
        }

        // Resolve brand from file if provided (for component lookup scoping)
        let resolvedBrandId: string | undefined
        if (rowData.brand) {
          const companyName = rowData.company || lookupMaps.companyNames.get(resolvedCompanyId) || ''
          const brandKey = `${companyName.toLowerCase()}|${rowData.brand.toLowerCase()}`
          const foundBrand = lookupMaps.brands.get(brandKey)
          if (!foundBrand) {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              componentSkuCode: rowData.componentSkuCode,
              errors: [`Brand "${rowData.brand}" not found for company`],
            })
            continue
          }
          resolvedBrandId = foundBrand.id
        }

        // Look up component by SKU code within the resolved company (and optionally brand)
        const component = await prisma.component.findFirst({
          where: {
            companyId: resolvedCompanyId,
            skuCode: rowData.componentSkuCode,
            ...(resolvedBrandId ? { brandId: resolvedBrandId } : {}),
          },
        })

        if (!component) {
          result.skipped++
          result.errors.push({
            rowNumber: row.rowNumber,
            componentSkuCode: rowData.componentSkuCode,
            errors: [`Component with SKU code "${rowData.componentSkuCode}" not found`],
          })
          continue
        }

        // Idempotency check: Check for existing initial transaction
        const existingInitial = await prisma.transaction.findFirst({
          where: {
            type: 'initial',
            lines: {
              some: { componentId: component.id },
            },
          },
        })

        if (existingInitial) {
          if (allowOverwrite) {
            // Delete existing transaction (cascade deletes lines)
            await prisma.transaction.delete({
              where: { id: existingInitial.id },
            })
            // Log for audit trail
            console.log(
              `Overwriting initial transaction ${existingInitial.id} for component ${rowData.componentSkuCode}`
            )
            result.overwritten++
          } else {
            result.skipped++
            result.errors.push({
              rowNumber: row.rowNumber,
              componentSkuCode: rowData.componentSkuCode,
              errors: [
                `Component "${rowData.componentSkuCode}" already has an initial inventory transaction (use "Allow Overwrite" to replace)`,
              ],
            })
            continue
          }
        }

        // Create initial transaction for the resolved company
        await createInitialTransaction({
          companyId: resolvedCompanyId,
          componentId: component.id,
          quantity: rowData.quantity,
          date: rowData.date,
          costPerUnit: rowData.costPerUnit,
          updateComponentCost: rowData.costPerUnit !== undefined,
          notes: rowData.notes,
          createdById: session.user.id,
        })

        result.imported++
      } catch (err) {
        result.skipped++
        result.errors.push({
          rowNumber: row.rowNumber,
          componentSkuCode: rowData.componentSkuCode,
          errors: [err instanceof Error ? err.message : 'Database error'],
        })
      }
    }

    return success(result)
  } catch (err) {
    console.error('Error importing initial inventory:', err)
    return serverError()
  }
}
