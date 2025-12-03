import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

// POST /api/import/inventory-snapshot - Import inventory snapshot from XLSX
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
    const companyId = user.companyId

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

    // Determine the date to use for transactions
    const transactionDate = parseResult.dateFromFilename ?? new Date()

    // Process each valid row
    for (let i = 0; i < parseResult.rows.length; i++) {
      const row = parseResult.rows[i]
      const rowNumber = i + 2 // 1-indexed, +1 for header

      try {
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

        // Check if component exists by SKU code
        let component = await prisma.component.findFirst({
          where: { brandId, skuCode: generatedSkuCode },
        })

        let componentCreated = false

        // If component doesn't exist, create it
        if (!component) {
          component = await prisma.component.create({
            data: {
              brandId,
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
          companyId,
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
