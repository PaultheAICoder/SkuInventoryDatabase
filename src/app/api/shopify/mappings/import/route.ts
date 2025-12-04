import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, forbidden, error, serverError } from '@/lib/api-response'
import { parseCSV } from '@/services/import'
import { z } from 'zod'
import { channelTypes, type MappingImportResult } from '@/types/channel-mapping'

// Schema for validating import rows
const mappingImportRowSchema = z.object({
  channel_type: z.string().optional().default('shopify'),
  external_id: z.string().min(1, 'External ID is required'),
  external_sku: z.string().optional(),
  internal_sku_code: z.string().min(1, 'Internal SKU code is required'),
})

// Normalize CSV header to field name
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

// Create a record from CSV row using header mapping
function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeHeader(headers[i])
    record[key] = row[i] ?? ''
  }
  return record
}

// POST /api/shopify/mappings/import - Import mappings from CSV (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Admin only for import
    if (session.user.role !== 'admin') {
      return forbidden('Only admins can import channel mappings')
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
    } else {
      csvContent = await request.text()
    }

    if (!csvContent.trim()) {
      return error('Empty file provided', 400)
    }

    // Parse CSV
    const rows = parseCSV(csvContent)

    if (rows.length < 2) {
      return error('CSV file must have a header row and at least one data row', 400)
    }

    const headers = rows[0]
    const dataRows = rows.slice(1)

    const result: MappingImportResult = {
      total: dataRows.length,
      imported: 0,
      skipped: 0,
      errors: [],
    }

    // Pre-fetch all SKUs for this company for efficient lookups
    const skus = await prisma.sKU.findMany({
      where: { companyId: selectedCompanyId },
      select: { id: true, internalCode: true },
    })
    const skuByCode = new Map(skus.map((s) => [s.internalCode.toLowerCase(), s]))

    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2 // +2 for 1-indexed and header row
      const record = rowToRecord(headers, dataRows[i])

      try {
        // Validate row data
        const parsed = mappingImportRowSchema.safeParse(record)

        if (!parsed.success) {
          result.skipped++
          result.errors.push({
            rowNumber,
            externalId: record.external_id || '',
            errors: parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
          })
          continue
        }

        const { channel_type, external_id, external_sku, internal_sku_code } = parsed.data

        // Validate channel type
        const normalizedChannelType = channel_type.toLowerCase()
        if (!channelTypes.includes(normalizedChannelType as typeof channelTypes[number])) {
          result.skipped++
          result.errors.push({
            rowNumber,
            externalId: external_id,
            errors: [`Invalid channel type "${channel_type}". Must be one of: ${channelTypes.join(', ')}`],
          })
          continue
        }

        // Look up SKU by internal code
        const sku = skuByCode.get(internal_sku_code.toLowerCase())
        if (!sku) {
          result.skipped++
          result.errors.push({
            rowNumber,
            externalId: external_id,
            errors: [`SKU with internal code "${internal_sku_code}" not found`],
          })
          continue
        }

        // Check for duplicate mapping
        const existingMapping = await prisma.skuChannelMapping.findUnique({
          where: {
            companyId_channelType_externalId: {
              companyId: selectedCompanyId,
              channelType: normalizedChannelType,
              externalId: external_id,
            },
          },
        })

        if (existingMapping) {
          result.skipped++
          result.errors.push({
            rowNumber,
            externalId: external_id,
            errors: [`Mapping for external ID "${external_id}" already exists`],
          })
          continue
        }

        // Create mapping
        await prisma.skuChannelMapping.create({
          data: {
            companyId: selectedCompanyId,
            channelType: normalizedChannelType,
            externalId: external_id,
            externalSku: external_sku || null,
            skuId: sku.id,
          },
        })

        result.imported++
      } catch (err) {
        result.skipped++
        result.errors.push({
          rowNumber,
          externalId: record.external_id || '',
          errors: [err instanceof Error ? err.message : 'Database error'],
        })
      }
    }

    return success(result)
  } catch (err) {
    console.error('Error importing mappings:', err)
    return serverError()
  }
}

// GET /api/shopify/mappings/import - Download template (admin and ops)
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Viewer cannot access
    if (session.user.role === 'viewer') {
      return forbidden()
    }

    // Generate CSV template
    const headers = ['Channel Type', 'External ID', 'External SKU', 'Internal SKU Code']
    const exampleRow = ['shopify', '12345678901234', 'SHOP-SKU-001', 'TT-3PK-AMZ']

    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n')

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="channel-mapping-template.csv"',
      },
    })
  } catch (err) {
    console.error('Error generating template:', err)
    return serverError()
  }
}
