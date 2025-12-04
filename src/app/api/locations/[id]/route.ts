import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateLocationSchema } from '@/types/location'
import { setDefaultLocation, canDeactivateLocation, canDeleteLocation } from '@/services/location'

// GET /api/locations/[id] - Get location details (admin only)
export async function GET(
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

    const location = await prisma.location.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        isDefault: true,
        isActive: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        ...location,
        createdAt: location.createdAt.toISOString(),
        updatedAt: location.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching location:', error)
    return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 })
  }
}

// PATCH /api/locations/[id] - Update location (admin only)
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

    const validation = updateLocationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Check if location exists and belongs to the selected company
    const existingLocation = await prisma.location.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existingLocation) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Check name uniqueness if being changed
    if (validation.data.name && validation.data.name !== existingLocation.name) {
      const nameExists = await prisma.location.findFirst({
        where: {
          companyId: selectedCompanyId,
          name: validation.data.name,
          id: { not: id },
        },
      })

      if (nameExists) {
        return NextResponse.json(
          { error: 'A location with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Check if trying to deactivate
    if (validation.data.isActive === false && existingLocation.isActive) {
      const check = await canDeactivateLocation(selectedCompanyId, id)
      if (!check.canDeactivate) {
        return NextResponse.json({ error: check.reason }, { status: 400 })
      }
    }

    // If setting isDefault to false when it's currently the default, prevent it
    if (validation.data.isDefault === false && existingLocation.isDefault) {
      return NextResponse.json(
        { error: 'Cannot unset default. Set another location as default instead.' },
        { status: 400 }
      )
    }

    // Prepare update data
    const updateData: Parameters<typeof prisma.location.update>[0]['data'] = {}

    if (validation.data.name) updateData.name = validation.data.name
    if (validation.data.type) updateData.type = validation.data.type
    if (validation.data.isActive !== undefined) updateData.isActive = validation.data.isActive
    if (validation.data.notes !== undefined) updateData.notes = validation.data.notes

    // Handle setting as default
    if (validation.data.isDefault === true && !existingLocation.isDefault) {
      await setDefaultLocation(selectedCompanyId, id)
    }

    // Update location
    const location = await prisma.location.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        type: true,
        isDefault: true,
        isActive: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      data: {
        ...location,
        createdAt: location.createdAt.toISOString(),
        updatedAt: location.updatedAt.toISOString(),
      },
      message: 'Location updated successfully',
    })
  } catch (error) {
    console.error('Error updating location:', error)
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 })
  }
}

// DELETE /api/locations/[id] - Delete location (admin only)
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

    // Check if location exists and belongs to the selected company
    const existingLocation = await prisma.location.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!existingLocation) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Check if can delete
    const check = await canDeleteLocation(id)
    if (!check.canDelete) {
      return NextResponse.json({ error: check.reason }, { status: 400 })
    }

    // Soft delete by setting isActive=false
    await prisma.location.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Location deleted successfully' })
  } catch (error) {
    console.error('Error deleting location:', error)
    return NextResponse.json({ error: 'Failed to delete location' }, { status: 500 })
  }
}
