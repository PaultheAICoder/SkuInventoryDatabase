import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { success, unauthorized, serverError, error } from '@/lib/api-response'
import { parseInventorySnapshot, generateSkuCode } from '@/services/xlsx-import'
import { createInitialTransaction, getCompanySettings } from '@/services/inventory'

interface InventorySnapshotImportResult {
  total: number
  componentsCreated: number
  transactionsCreated: number
  imported: number  // Total successful imports (for consistency with other import types)
  overwritten: number
  skipped: number
  errors: Array<{
    rowNumber: number
    itemName: string
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

  const [companies, brands, locations] = await Promise.all([
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
  }
}

// POST /api/import/inventory-snapshot - Import inventory snapshot from XLSX
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Only ops and admin can import
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Viewers cannot import data')
    }

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Use selected brand from session, or fall back to first active brand
    let brandId = session.user.selectedBrandId

    if (!brandId) {
      const brand = await prisma.brand.findFirst({
        where: { companyId: selectedCompanyId, isActive: true },
      })
      if (!brand) {
        return error('No active brand found for selected company. Please select a brand from the sidebar or create one in Brand Management.', 400)
      }
      brandId = brand.id
    }

    const companyId = selectedCompanyId

    // Get company settings for default lead time
    const settings = await getCompanySettings(companyId)

    // Parse multipart form data
    const contentType = request.headers.get('content-type') || ''

    if (!contentType.includes('multipart/form-data')) {
      return error('Expected multipart/form-data', 400)
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return error('No file provided', 400)
    }

    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return error('Please upload an Excel (.xlsx) file', 400)
    }

    // Extract allowOverwrite parameter
    const allowOverwriteParam = formData.get('allowOverwrite')
    const allowOverwrite = allowOverwriteParam === 'true' || allowOverwriteParam === '1'

    // Parse XLSX file
    const buffer = await file.arrayBuffer()
    const parseResult = parseInventorySnapshot(buffer, file.name)

    const result: InventorySnapshotImportResult = {
      total: parseResult.rows.length,
      componentsCreated: 0,
      transactionsCreated: 0,
      imported: 0,
      overwritten: 0,
      skipped: 0,
      errors: [],
    }

    // Add parse errors to result
    for (const parseError of parseResult.errors) {
      result.errors.push({
        rowNumber: parseError.rowNumber,
        itemName: '',
        errors: parseError.errors,
      })
    }

    // If there were parsing errors for header, return early
    if (parseResult.rows.length === 0 && parseResult.errors.length > 0) {
      return success(result)
    }

    // Pre-fetch all lookup data (avoid N+1 queries)
    const lookupMaps = await buildLookupMaps(session.user.id, selectedCompanyId)

    // Determine the date to use for transactions
    const transactionDate = parseResult.dateFromFilename ?? new Date()

    // Process each valid row
    for (let i = 0; i < parseResult.rows.length; i++) {
      const row = parseResult.rows[i]
      const rowNumber = i + 2 // 1-indexed, +1 for header

      try {
        // Resolve company from file or use session default
        let resolvedCompanyId = companyId
        if (row.company) {
          const foundCompanyId = lookupMaps.companies.get(row.company.toLowerCase())
          if (!foundCompanyId) {
            result.skipped++
            result.errors.push({
              rowNumber,
              itemName: row.itemName,
              errors: [`Company "${row.company}" not found`],
            })
            continue
          }
          resolvedCompanyId = foundCompanyId
        }

        // Resolve brand from file or use session default
        let resolvedBrandId = brandId
        if (row.brand) {
          const companyName = row.company || lookupMaps.companyNames.get(resolvedCompanyId) || ''
          const brandKey = `${companyName.toLowerCase()}|${row.brand.toLowerCase()}`
          const foundBrand = lookupMaps.brands.get(brandKey)
          if (!foundBrand) {
            result.skipped++
            result.errors.push({
              rowNumber,
              itemName: row.itemName,
              errors: [`Brand "${row.brand}" not found for company`],
            })
            continue
          }
          if (foundBrand.companyId !== resolvedCompanyId) {
            result.skipped++
            result.errors.push({
              rowNumber,
              itemName: row.itemName,
              errors: [`Brand "${row.brand}" does not belong to the specified company`],
            })
            continue
          }
          resolvedBrandId = foundBrand.id
        }

        // Resolve location from file (optional validation)
        let resolvedLocationId: string | undefined
        if (row.location) {
          const companyName = row.company || lookupMaps.companyNames.get(resolvedCompanyId) || ''
          const locationKey = `${companyName.toLowerCase()}|${row.location.toLowerCase()}`
          const foundLocation = lookupMaps.locations.get(locationKey)
          if (!foundLocation) {
            result.skipped++
            result.errors.push({
              rowNumber,
              itemName: row.itemName,
              errors: [`Location "${row.location}" not found for company`],
            })
            continue
          }
          resolvedLocationId = foundLocation.id
        }

        // Generate SKU code from item name
        const generatedSkuCode = generateSkuCode(row.itemName)

        if (!generatedSkuCode) {
          result.skipped++
          result.errors.push({
            rowNumber,
            itemName: row.itemName,
            errors: ['Could not generate SKU code from item name'],
          })
          continue
        }

        // Check if component exists by SKU code (using resolved brand)
        let component = await prisma.component.findFirst({
          where: { brandId: resolvedBrandId, skuCode: generatedSkuCode },
        })

        let componentCreated = false

        // If component doesn't exist, create it
        if (!component) {
          component = await prisma.component.create({
            data: {
              brandId: resolvedBrandId,
              companyId: resolvedCompanyId,
              name: row.itemName,
              skuCode: generatedSkuCode,
              unitOfMeasure: 'each',
              costPerUnit: new Prisma.Decimal(0),
              reorderPoint: 0,
              leadTimeDays: settings.defaultLeadTimeDays || 0,
              createdById: session.user.id,
              updatedById: session.user.id,
            },
          })
          componentCreated = true
          result.componentsCreated++
        }

        // Note: resolvedLocationId is validated but not stored on Component model yet
        // When Component model is updated to include locationId, use it here
        void resolvedLocationId // Suppress unused variable warning

        // Check for existing initial transaction
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
            console.log(
              `Overwriting initial transaction ${existingInitial.id} for component ${generatedSkuCode}`
            )
            result.overwritten++
          } else {
            result.skipped++
            result.errors.push({
              rowNumber,
              itemName: row.itemName,
              errors: [
                `Component "${row.itemName}" (${generatedSkuCode}) already has an initial inventory transaction (use "Allow Overwrite" to replace)`,
              ],
            })
            continue
          }
        }

        // Create initial transaction
        await createInitialTransaction({
          companyId: resolvedCompanyId,
          componentId: component.id,
          quantity: row.currentBalance,
          date: transactionDate,
          costPerUnit: undefined, // Keep component's existing cost
          updateComponentCost: false,
          notes: componentCreated
            ? `Imported from ${file.name} (component auto-created)`
            : `Imported from ${file.name}`,
          createdById: session.user.id,
        })

        result.transactionsCreated++
        result.imported++
      } catch (err) {
        result.skipped++
        result.errors.push({
          rowNumber,
          itemName: row.itemName,
          errors: [err instanceof Error ? err.message : 'Database error'],
        })
      }
    }

    return success(result)
  } catch (err) {
    console.error('Error importing inventory snapshot:', err)
    return serverError()
  }
}
