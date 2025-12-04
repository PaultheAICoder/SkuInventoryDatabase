import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { success, unauthorized, serverError, error } from '@/lib/api-response'
import { processComponentImport, type ImportSummary } from '@/services/import'
import type { CreateComponentInput } from '@/types/component'

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
    let brandId = session.user.selectedBrandId

    if (!brandId) {
      const brand = await prisma.brand.findFirst({
        where: { companyId: selectedCompanyId, isActive: true },
      })
      if (!brand) {
        return error('No active brand found for selected company', 400)
      }
      brandId = brand.id
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

    // Process CSV
    const importSummary: ImportSummary<CreateComponentInput> = processComponentImport(csvContent)

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
        // Check for duplicate name or skuCode within the selected company
        const existing = await prisma.component.findFirst({
          where: {
            companyId: selectedCompanyId,
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

        // Create component with companyId
        await prisma.component.create({
          data: {
            brandId,
            companyId: selectedCompanyId,
            name: componentData.name,
            skuCode: componentData.skuCode,
            category: componentData.category ?? null,
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
