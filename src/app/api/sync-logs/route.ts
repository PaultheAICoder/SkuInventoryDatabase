/**
 * GET /api/sync-logs
 *
 * Lists sync operation history.
 * Any authenticated user can view.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check selectedCompanyId BEFORE role check to return proper 400 error
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected. Please refresh the page and try again.' },
        { status: 400 }
      )
    }

    // Admin or Ops only for viewing sync logs
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin' && companyRole !== 'ops') {
      return NextResponse.json(
        { error: 'Admin or Ops permission required' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const credentialId = searchParams.get('credentialId')
    const syncType = searchParams.get('syncType')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Build where clause
    const where: Prisma.SyncLogWhereInput = {}

    if (credentialId) {
      where.credentialId = credentialId
    } else {
      // Filter to only credentials belonging to user's company
      where.credential = {
        companyId: selectedCompanyId,
      }
    }

    if (syncType) {
      where.syncType = syncType
    }

    if (status) {
      where.status = status
    }

    // Get total count
    const total = await prisma.syncLog.count({ where })

    // Get logs with pagination
    const logs = await prisma.syncLog.findMany({
      where,
      select: {
        id: true,
        syncType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        recordsProcessed: true,
        recordsCreated: true,
        recordsUpdated: true,
        recordsFailed: true,
        errorMessage: true,
        fileName: true,
        fileSize: true,
        triggeredBy: {
          select: {
            id: true,
            name: true,
          },
        },
        credential: {
          select: {
            id: true,
            integrationType: true,
            externalAccountName: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 100),
      skip: offset,
    })

    return NextResponse.json({
      logs: logs.map(log => ({
        id: log.id,
        syncType: log.syncType,
        status: log.status,
        startedAt: log.startedAt.toISOString(),
        completedAt: log.completedAt?.toISOString() || null,
        recordsProcessed: log.recordsProcessed,
        recordsCreated: log.recordsCreated,
        recordsUpdated: log.recordsUpdated,
        recordsFailed: log.recordsFailed,
        errorMessage: log.errorMessage,
        fileName: log.fileName,
        fileSize: log.fileSize,
        triggeredBy: log.triggeredBy ? log.triggeredBy.name : 'Scheduled',
        credentialId: log.credential?.id,
        integrationType: log.credential?.integrationType,
        accountName: log.credential?.externalAccountName,
      })),
      total,
    })
  } catch (error) {
    console.error('Error fetching sync logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sync logs' },
      { status: 500 }
    )
  }
}
