/**
 * CSV Upload Status API Route
 *
 * Gets the status of a CSV upload by sync log ID.
 * GET /api/csv/upload/[uploadId]/status
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error } from '@/lib/api-response'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { uploadId } = await params

    // Use selected company from session
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const companyId = selectedCompanyId

    // Get sync log for upload
    const syncLog = await prisma.syncLog.findFirst({
      where: {
        id: uploadId,
        companyId,
        integrationType: {
          startsWith: 'csv_',
        },
      },
    })

    if (!syncLog) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      )
    }

    // Extract metadata
    const metadata = syncLog.metadata as Record<string, unknown> | null

    return NextResponse.json({
      id: syncLog.id,
      status: syncLog.status,
      source: syncLog.integrationType.replace('csv_', ''),
      fileName: metadata?.fileName,
      fileSize: metadata?.fileSize,
      startedAt: syncLog.startedAt,
      completedAt: syncLog.completedAt,
      recordsProcessed: syncLog.recordsProcessed,
      recordsCreated: syncLog.recordsCreated,
      recordsUpdated: syncLog.recordsUpdated,
      recordsFailed: syncLog.recordsFailed,
      errorMessage: syncLog.errorMessage,
      errorDetails: syncLog.errorDetails,
    })
  } catch (error) {
    console.error('CSV upload status error:', error)
    return NextResponse.json(
      { error: 'Failed to get upload status' },
      { status: 500 }
    )
  }
}
