import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateMappingSchema } from '@/types/channel-mapping'

// GET /api/shopify/mappings/[id] - Get mapping details (admin and ops only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Viewer role cannot access mappings
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    const mapping = await prisma.skuChannelMapping.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        channelType: true,
        externalId: true,
        externalSku: true,
        skuId: true,
        sku: {
          select: {
            id: true,
            name: true,
            internalCode: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        ...mapping,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching mapping:', error)
    return NextResponse.json({ error: 'Failed to fetch mapping' }, { status: 500 })
  }
}

// PATCH /api/shopify/mappings/[id] - Update mapping (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    const validation = updateMappingSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Check if mapping exists and belongs to the selected company
    const existingMapping = await prisma.skuChannelMapping.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existingMapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    const { skuId, externalSku, isActive } = validation.data

    // If changing skuId, verify new SKU belongs to company
    if (skuId && skuId !== existingMapping.skuId) {
      const sku = await prisma.sKU.findFirst({
        where: {
          id: skuId,
          companyId: selectedCompanyId,
        },
      })

      if (!sku) {
        return NextResponse.json(
          { error: 'SKU not found or does not belong to this company' },
          { status: 400 }
        )
      }
    }

    // Prepare update data
    const updateData: { skuId?: string; externalSku?: string | null; isActive?: boolean } = {}

    if (skuId !== undefined) updateData.skuId = skuId
    if (externalSku !== undefined) updateData.externalSku = externalSku || null
    if (isActive !== undefined) updateData.isActive = isActive

    // Update mapping
    const mapping = await prisma.skuChannelMapping.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        channelType: true,
        externalId: true,
        externalSku: true,
        skuId: true,
        sku: {
          select: {
            id: true,
            name: true,
            internalCode: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      data: {
        ...mapping,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      },
      message: 'Mapping updated successfully',
    })
  } catch (error) {
    console.error('Error updating mapping:', error)
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 })
  }
}

// DELETE /api/shopify/mappings/[id] - Delete mapping (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Check if mapping exists and belongs to the selected company
    const existingMapping = await prisma.skuChannelMapping.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existingMapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    // Hard delete the mapping (channel mappings can be safely deleted)
    await prisma.skuChannelMapping.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Mapping deleted successfully' })
  } catch (error) {
    console.error('Error deleting mapping:', error)
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 })
  }
}
