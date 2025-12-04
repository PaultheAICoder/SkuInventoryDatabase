import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateCategorySchema } from '@/types/category'

// GET /api/categories/[id] - Get category details (admin only)
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

    const category = await prisma.category.findUnique({
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
      },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Count components using this category
    const componentCount = await prisma.component.count({
      where: {
        companyId: selectedCompanyId,
        category: category.name,
      },
    })

    return NextResponse.json({
      data: {
        id: category.id,
        name: category.name,
        isActive: category.isActive,
        componentCount,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching category:', error)
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}

// PATCH /api/categories/[id] - Update category (admin only)
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

    const validation = updateCategorySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Check if category exists and belongs to the selected company
    const existingCategory = await prisma.category.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    })

    if (!existingCategory) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const oldName = existingCategory.name

    // Check name uniqueness if being changed
    if (validation.data.name && validation.data.name !== existingCategory.name) {
      const nameExists = await prisma.category.findFirst({
        where: {
          companyId: selectedCompanyId,
          name: validation.data.name,
          id: { not: id },
        },
      })

      if (nameExists) {
        return NextResponse.json(
          { error: 'A category with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Prepare update data
    const updateData: Parameters<typeof prisma.category.update>[0]['data'] = {}

    if (validation.data.name) updateData.name = validation.data.name
    if (validation.data.isActive !== undefined) updateData.isActive = validation.data.isActive

    // Update category
    const category = await prisma.category.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // If name changed, update all components using the old category name
    if (validation.data.name && validation.data.name !== oldName) {
      await prisma.component.updateMany({
        where: {
          companyId: selectedCompanyId,
          category: oldName,
        },
        data: {
          category: validation.data.name,
        },
      })
    }

    // Count components
    const componentCount = await prisma.component.count({
      where: {
        companyId: selectedCompanyId,
        category: category.name,
      },
    })

    return NextResponse.json({
      data: {
        id: category.id,
        name: category.name,
        isActive: category.isActive,
        componentCount,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
      message: 'Category updated successfully',
    })
  } catch (error) {
    console.error('Error updating category:', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

// DELETE /api/categories/[id] - Delete category (admin only, soft delete)
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

    // Check if category exists and belongs to the selected company
    const existingCategory = await prisma.category.findUnique({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: {
        id: true,
        name: true,
      },
    })

    if (!existingCategory) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Check for associated components
    const componentCount = await prisma.component.count({
      where: {
        companyId: selectedCompanyId,
        category: existingCategory.name,
      },
    })

    if (componentCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete category with ${componentCount} component(s). Consider deactivating instead.`,
        },
        { status: 400 }
      )
    }

    // Soft delete by setting isActive=false
    await prisma.category.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Category deleted successfully' })
  } catch (error) {
    console.error('Error deleting category:', error)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
