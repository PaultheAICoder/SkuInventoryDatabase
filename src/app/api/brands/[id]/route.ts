import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateBrandSchema } from '@/types/brand'

// GET /api/brands/[id] - Get brand details (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    const brand = await prisma.brand.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            components: true,
            skus: true,
          },
        },
      },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        id: brand.id,
        name: brand.name,
        isActive: brand.isActive,
        componentCount: brand._count.components,
        skuCount: brand._count.skus,
        createdAt: brand.createdAt.toISOString(),
        updatedAt: brand.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching brand:', error)
    return NextResponse.json({ error: 'Failed to fetch brand' }, { status: 500 })
  }
}

// PATCH /api/brands/[id] - Update brand (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    const validation = updateBrandSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Check if brand exists and belongs to the selected company
    const existingBrand = await prisma.brand.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: {
          select: {
            components: true,
            skus: true,
          },
        },
      },
    })

    if (!existingBrand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Check name uniqueness if being changed
    if (validation.data.name && validation.data.name !== existingBrand.name) {
      const nameExists = await prisma.brand.findFirst({
        where: {
          companyId: selectedCompanyId,
          name: validation.data.name,
          id: { not: id },
        },
      })

      if (nameExists) {
        return NextResponse.json(
          { error: 'A brand with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Warn if trying to deactivate brand with components or SKUs
    if (validation.data.isActive === false && existingBrand.isActive) {
      const hasAssociations = existingBrand._count.components > 0 || existingBrand._count.skus > 0
      if (hasAssociations) {
        // Allow deactivation but include warning in response
        console.warn(
          `Deactivating brand ${existingBrand.name} with ${existingBrand._count.components} components and ${existingBrand._count.skus} SKUs`
        )
      }
    }

    // Prepare update data
    const updateData: Parameters<typeof prisma.brand.update>[0]['data'] = {}

    if (validation.data.name) updateData.name = validation.data.name
    if (validation.data.isActive !== undefined) updateData.isActive = validation.data.isActive

    // Update brand
    const brand = await prisma.brand.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            components: true,
            skus: true,
          },
        },
      },
    })

    return NextResponse.json({
      data: {
        id: brand.id,
        name: brand.name,
        isActive: brand.isActive,
        componentCount: brand._count.components,
        skuCount: brand._count.skus,
        createdAt: brand.createdAt.toISOString(),
        updatedAt: brand.updatedAt.toISOString(),
      },
      message: 'Brand updated successfully',
    })
  } catch (error) {
    console.error('Error updating brand:', error)
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 })
  }
}

// DELETE /api/brands/[id] - Delete brand (admin only, soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Check if brand exists and belongs to the selected company
    const existingBrand = await prisma.brand.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            components: true,
            skus: true,
          },
        },
      },
    })

    if (!existingBrand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Check for associated components or SKUs
    const hasAssociations = existingBrand._count.components > 0 || existingBrand._count.skus > 0
    if (hasAssociations) {
      return NextResponse.json(
        {
          error: `Cannot delete brand with ${existingBrand._count.components} component(s) and ${existingBrand._count.skus} SKU(s). Consider deactivating instead.`,
        },
        { status: 400 }
      )
    }

    // Soft delete by setting isActive=false
    await prisma.brand.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Brand deleted successfully' })
  } catch (error) {
    console.error('Error deleting brand:', error)
    return NextResponse.json({ error: 'Failed to delete brand' }, { status: 500 })
  }
}
