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

    // Get user's primary company via UserCompany junction
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: session.user.id,
        isPrimary: true,
      },
      select: { companyId: true },
    })

    if (!userCompany?.companyId) {
      return NextResponse.json(
        { error: 'User must belong to a company' },
        { status: 400 }
      )
    }

    const companyId = userCompany.companyId

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
