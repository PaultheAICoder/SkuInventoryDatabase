import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, serverError, error } from '@/lib/api-response'
import { processSKUImport, type ImportSummary } from '@/services/import'
import type { CreateSKUInput } from '@/types/sku'

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
    } else {
      csvContent = await request.text()
    }

    if (!csvContent.trim()) {
      return error('Empty file provided', 400)
    }

    // Process CSV
    const importSummary: ImportSummary<CreateSKUInput> = processSKUImport(csvContent)

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
        // Check for duplicate internal code
        const existing = await prisma.sKU.findFirst({
          where: {
            brandId,
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

        // Create SKU
        await prisma.sKU.create({
          data: {
            brandId,
            name: skuData.name,
            internalCode: skuData.internalCode,
            salesChannel: skuData.salesChannel,
            externalIds: skuData.externalIds ?? {},
            notes: skuData.notes ?? null,
            createdById: session.user.id,
            updatedById: session.user.id,
          },
        })

        result.imported++
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
