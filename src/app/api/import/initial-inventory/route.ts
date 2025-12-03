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

    // Get user's brand
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { company: { include: { brands: { where: { isActive: true }, take: 1 } } } },
    })

    if (!user?.company.brands[0]) {
      return error('No active brand found', 400)
    }

    const brandId = user.company.brands[0].id

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
        // Look up component by SKU code
        const component = await prisma.component.findFirst({
          where: {
            brandId,
            skuCode: rowData.componentSkuCode,
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

        // Create initial transaction
        await createInitialTransaction({
          companyId: session.user.companyId,
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
