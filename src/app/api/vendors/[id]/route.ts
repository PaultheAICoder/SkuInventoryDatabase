import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdminInAnyCompany } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateVendorSchema } from '@/types/vendor'

// GET /api/vendors/[id] - Get vendor details (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (!isAdminInAnyCompany(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const vendor = await prisma.vendor.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        notes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        ...vendor,
        createdAt: vendor.createdAt.toISOString(),
        updatedAt: vendor.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching vendor:', error)
    return NextResponse.json({ error: 'Failed to fetch vendor' }, { status: 500 })
  }
}

// PATCH /api/vendors/[id] - Update vendor (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (!isAdminInAnyCompany(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    const validation = updateVendorSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Check if vendor exists and belongs to the selected company
    const existingVendor = await prisma.vendor.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existingVendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Check name uniqueness if being changed
    if (validation.data.name && validation.data.name !== existingVendor.name) {
      const nameExists = await prisma.vendor.findFirst({
        where: {
          companyId: selectedCompanyId,
          name: validation.data.name,
          id: { not: id },
        },
      })

      if (nameExists) {
        return NextResponse.json(
          { error: 'A vendor with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Prepare update data
    const updateData: Parameters<typeof prisma.vendor.update>[0]['data'] = {}

    if (validation.data.name) updateData.name = validation.data.name
    if (validation.data.contactEmail !== undefined) updateData.contactEmail = validation.data.contactEmail
    if (validation.data.contactPhone !== undefined) updateData.contactPhone = validation.data.contactPhone
    if (validation.data.address !== undefined) updateData.address = validation.data.address
    if (validation.data.notes !== undefined) updateData.notes = validation.data.notes
    if (validation.data.isActive !== undefined) updateData.isActive = validation.data.isActive

    // Update vendor
    const vendor = await prisma.vendor.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        notes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      data: {
        ...vendor,
        createdAt: vendor.createdAt.toISOString(),
        updatedAt: vendor.updatedAt.toISOString(),
      },
      message: 'Vendor updated successfully',
    })
  } catch (error) {
    console.error('Error updating vendor:', error)
    return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 })
  }
}

// DELETE /api/vendors/[id] - Soft delete vendor (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (!isAdminInAnyCompany(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Check if vendor exists and belongs to the selected company
    const existingVendor = await prisma.vendor.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existingVendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Soft delete by setting isActive=false
    await prisma.vendor.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Vendor deactivated successfully' })
  } catch (error) {
    console.error('Error deleting vendor:', error)
    return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 })
  }
}
