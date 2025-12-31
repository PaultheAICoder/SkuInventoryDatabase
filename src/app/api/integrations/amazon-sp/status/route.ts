/**
 * GET /api/integrations/amazon-sp/status
 *
 * Returns Amazon SP-API connection status.
 * Any authenticated user can view.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const credentialId = searchParams.get('credentialId')
    const brandId = searchParams.get('brandId')

    const companyId = session.user.selectedCompanyId

    if (!companyId) {
      return NextResponse.json({ error: 'No company selected' }, { status: 400 })
    }

    // Build where clause
    const where: {
      companyId: string
      integrationType: string
      id?: string
      brandId?: string | null
    } = {
      companyId,
      integrationType: 'amazon_sp',
    }

    if (credentialId) {
      where.id = credentialId
    }

    if (brandId) {
      where.brandId = brandId
    }

    // Get credentials with last sync info
    const credentials = await prisma.integrationCredential.findMany({
      where,
      select: {
        id: true,
        brandId: true,
        brand: {
          select: {
            id: true,
            name: true,
          },
        },
        status: true,
        externalAccountId: true,
        externalAccountName: true,
        lastUsedAt: true,
        lastErrorAt: true,
        lastError: true,
        createdAt: true,
        syncLogs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            recordsProcessed: true,
            errorMessage: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      credentials: credentials.map(cred => ({
        id: cred.id,
        brandId: cred.brandId,
        brandName: cred.brand?.name,
        status: cred.status,
        sellerId: cred.externalAccountId,
        businessName: cred.externalAccountName,
        lastSyncAt: cred.syncLogs[0]?.completedAt || cred.syncLogs[0]?.startedAt,
        lastSyncStatus: cred.syncLogs[0]?.status || null,
        lastError: cred.lastError,
        createdAt: cred.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching Amazon SP-API status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    )
  }
}
