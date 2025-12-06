import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encryptToken } from '@/lib/crypto'
import { createConnectionSchema } from '@/types/shopify-connection'

// GET /api/shopify/connection - Get current connection (admin and ops can read, viewer cannot)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Viewer role cannot access connection
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: session.user.selectedCompanyId },
    })

    if (!connection) {
      return NextResponse.json({ data: null })
    }

    return NextResponse.json({
      data: {
        id: connection.id,
        shopName: connection.shopName,
        isActive: connection.isActive,
        lastSyncAt: connection.lastSyncAt?.toISOString() || null,
        syncStatus: connection.syncStatus,
        hasToken: !!connection.accessToken,
        createdAt: connection.createdAt.toISOString(),
        updatedAt: connection.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching Shopify connection:', error)
    return NextResponse.json({ error: 'Failed to fetch connection' }, { status: 500 })
  }
}

// POST /api/shopify/connection - Create or update connection (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = createConnectionSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { shopName, accessToken } = validation.data
    const encryptedToken = encryptToken(accessToken)
    const companyId = session.user.selectedCompanyId

    // Upsert connection (create or update)
    const connection = await prisma.shopifyConnection.upsert({
      where: { companyId },
      create: {
        companyId,
        shopName,
        accessToken: encryptedToken,
        isActive: true,
        syncStatus: 'idle',
      },
      update: {
        shopName,
        accessToken: encryptedToken,
        isActive: true,
        syncStatus: 'idle',
      },
    })

    return NextResponse.json(
      {
        data: {
          id: connection.id,
          shopName: connection.shopName,
          isActive: connection.isActive,
          lastSyncAt: connection.lastSyncAt?.toISOString() || null,
          syncStatus: connection.syncStatus,
          hasToken: !!connection.accessToken,
          createdAt: connection.createdAt.toISOString(),
          updatedAt: connection.updatedAt.toISOString(),
        },
        message: 'Connection saved successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error saving Shopify connection:', error)
    return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
  }
}

// DELETE /api/shopify/connection - Soft delete connection (admin only)
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const companyId = session.user.selectedCompanyId

    // Check if connection exists
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId },
    })

    if (!connection) {
      return NextResponse.json({ error: 'No connection found' }, { status: 404 })
    }

    // Soft delete - set isActive to false
    await prisma.shopifyConnection.update({
      where: { companyId },
      data: {
        isActive: false,
        syncStatus: 'disconnected',
      },
    })

    return NextResponse.json({
      message: 'Connection disconnected successfully',
    })
  } catch (error) {
    console.error('Error disconnecting Shopify connection:', error)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
