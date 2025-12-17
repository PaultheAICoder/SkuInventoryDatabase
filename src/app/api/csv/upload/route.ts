/**
 * Spreadsheet Upload API Route
 *
 * Handles multipart file upload for keyword/search term CSV and XLSX files.
 * POST /api/csv/upload
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error } from '@/lib/api-response'
import { parseFile, validateFile, previewFile, detectFileType } from '@/services/csv/parser'
import { isSourceSupported, getSupportedSources } from '@/services/csv/mappers'
import type { CsvSource, FileType } from '@/services/csv/types'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use selected company from session (not primary company)
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Use selected brand from session if available
    const selectedBrandId = session.user.selectedBrandId

    // Admin or Ops only for file uploads (check via company-specific role)
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin' && companyRole !== 'ops') {
      return NextResponse.json(
        { error: 'Admin or Ops permission required' },
        { status: 403 }
      )
    }

    const companyId = selectedCompanyId

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const source = formData.get('source') as string | null
    const brandId = formData.get('brandId') as string | null
    const startDate = formData.get('startDate') as string | null
    const endDate = formData.get('endDate') as string | null
    const previewOnly = formData.get('preview') === 'true'

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!source) {
      return NextResponse.json(
        { error: 'Source type is required', supportedSources: getSupportedSources() },
        { status: 400 }
      )
    }

    if (!isSourceSupported(source)) {
      return NextResponse.json(
        { error: `Unsupported source: ${source}`, supportedSources: getSupportedSources() },
        { status: 400 }
      )
    }

    // Validate brand: use form brandId, fall back to session selectedBrandId
    const effectiveBrandId = brandId || selectedBrandId
    if (effectiveBrandId) {
      const brand = await prisma.brand.findFirst({
        where: {
          id: effectiveBrandId,
          companyId,
        },
      })

      if (!brand) {
        return NextResponse.json(
          { error: 'Brand not found or does not belong to your company' },
          { status: 400 }
        )
      }
    }

    // Validate file
    const fileValidation = validateFile({
      size: file.size,
      type: file.type,
      name: file.name,
    })

    if (!fileValidation.valid) {
      return NextResponse.json(
        { error: fileValidation.error },
        { status: 400 }
      )
    }

    const fileType = fileValidation.fileType || detectFileType(file.name) || 'csv'

    // Read file content - different handling for CSV vs XLSX
    let fileContent: string | ArrayBuffer
    if (fileType === 'xlsx') {
      fileContent = await file.arrayBuffer()
    } else {
      fileContent = await file.text()
    }

    // Preview mode - return first few rows without processing
    if (previewOnly) {
      const preview = previewFile(fileContent, fileType, 5)
      return NextResponse.json({
        preview: true,
        headers: preview.headers,
        data: preview.data,
        totalRows: preview.totalRows,
        fileType,
      })
    }

    // Create sync log for tracking
    const syncLog = await prisma.syncLog.create({
      data: {
        companyId,
        integrationType: `csv_${source}`,
        syncType: 'manual',
        status: 'running',
        startedAt: new Date(),
        initiatedBy: session.user.id,
        fileName: file.name,
        fileSize: file.size,
        metadata: {
          source,
          brandId: effectiveBrandId || brandId,
          fileType,
          dateRange: startDate && endDate ? { startDate, endDate } : undefined,
        },
      },
    })

    // Process file
    const result = await parseFile(
      fileContent,
      {
        source: source as CsvSource,
        brandId: effectiveBrandId || brandId || undefined,
        fileType: fileType as FileType,
        dateRange: startDate && endDate
          ? { startDate, endDate }
          : undefined,
      },
      {
        syncLogId: syncLog.id,
        onProgress: (processed, total) => {
          // Progress tracking - could be used for websocket updates
          console.log(`${fileType.toUpperCase()} processing: ${processed}/${total} rows`)
        },
      }
    )

    // Create notification if there were errors
    if (!result.success || result.errors.length > 0) {
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: result.success ? 'warning' : 'error',
          title: result.success
            ? 'File Upload Completed with Warnings'
            : 'File Upload Failed',
          message: result.success
            ? `Processed ${result.totalRows} rows with ${result.errors.length} errors`
            : `Failed to process file: ${result.errors[0]?.message || 'Unknown error'}`,
          relatedType: 'sync_log',
          relatedId: syncLog.id,
        },
      })
    }

    return NextResponse.json({
      success: result.success,
      syncLogId: syncLog.id,
      totalRows: result.totalRows,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsFailed: result.recordsFailed,
      errors: result.errors.slice(0, 10), // Limit errors in response
      hasMoreErrors: result.errors.length > 10,
      fileType,
    })
  } catch (error) {
    console.error('File upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process file upload' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/csv/upload
 * Returns supported sources and their expected columns
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use selected company from session
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Admin or Ops only for file upload info (check via company-specific role)
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin' && companyRole !== 'ops') {
      return NextResponse.json(
        { error: 'Admin or Ops permission required' },
        { status: 403 }
      )
    }

    // Import mappers to get column info
    const { amazonSearchTermMapper, zonguruMapper, helium10Mapper } = await import('@/services/csv/mappers')

    return NextResponse.json({
      supportedSources: [
        {
          id: 'amazon_search_term',
          name: 'Amazon Search Term Report',
          description: 'Search term report from Amazon Ads console',
          requiredColumns: amazonSearchTermMapper.requiredColumns,
          optionalColumns: amazonSearchTermMapper.optionalColumns,
        },
        {
          id: 'zonguru',
          name: 'ZonGuru Keywords',
          description: 'Keyword export from ZonGuru',
          requiredColumns: zonguruMapper.requiredColumns,
          optionalColumns: zonguruMapper.optionalColumns,
        },
        {
          id: 'helium10',
          name: 'Helium10 Keywords',
          description: 'Keyword export from Helium10',
          requiredColumns: helium10Mapper.requiredColumns,
          optionalColumns: helium10Mapper.optionalColumns,
        },
      ],
      maxFileSize: '50MB',
      acceptedFormats: ['.csv', '.xlsx', '.xls'],
    })
  } catch (error) {
    console.error('File upload info error:', error)
    return NextResponse.json(
      { error: 'Failed to get upload info' },
      { status: 500 }
    )
  }
}
