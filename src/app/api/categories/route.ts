import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createCategorySchema, categoryListQuerySchema } from '@/types/category'

// GET /api/categories - List categories (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const validation = categoryListQuerySchema.safeParse(searchParams)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { page, pageSize, search, isActive, sortBy, sortOrder } = validation.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Build where clause
    const where: Prisma.CategoryWhereInput = {
      companyId: selectedCompanyId,
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    if (isActive !== undefined) {
      where.isActive = isActive
    }

    // Get total count
    const total = await prisma.category.count({ where })

    // Get categories with component counts
    const categories = await prisma.category.findMany({
      where,
      select: {
        id: true,
        name: true,
        isActive: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    // Count components using each category (by name match)
    const categoryNames = categories.map(c => c.name)
    const componentCounts = await prisma.component.groupBy({
      by: ['category'],
      where: {
        companyId: selectedCompanyId,
        category: { in: categoryNames },
      },
      _count: { category: true },
    })

    const countMap = new Map(componentCounts.map(c => [c.category, c._count.category]))

    return NextResponse.json({
      data: categories.map((category) => ({
        id: category.id,
        name: category.name,
        isActive: category.isActive,
        companyId: category.companyId,
        companyName: category.company?.name,
        componentCount: countMap.get(category.name) || 0,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing categories:', error)
    return NextResponse.json({ error: 'Failed to list categories' }, { status: 500 })
  }
}

// POST /api/categories - Create category (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = createCategorySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name } = validation.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Check if name already exists for this company
    const existingCategory = await prisma.category.findFirst({
      where: {
        companyId: selectedCompanyId,
        name,
      },
    })

    if (existingCategory) {
      return NextResponse.json(
        { error: 'A category with this name already exists' },
        { status: 409 }
      )
    }

    // Create category in the selected company
    const category = await prisma.category.create({
      data: {
        companyId: selectedCompanyId,
        name,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(
      {
        data: {
          id: category.id,
          name: category.name,
          isActive: category.isActive,
          componentCount: 0,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
        },
        message: 'Category created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating category:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
