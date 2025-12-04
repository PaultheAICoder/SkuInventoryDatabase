import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createBrandSchema, brandListQuerySchema } from '@/types/brand'

// GET /api/brands - List brands (admin only)
// Supports ?all=true to return brands from all companies (for admin editing)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const validation = brandListQuerySchema.safeParse(searchParams)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { page, pageSize, search, isActive, sortBy, sortOrder } = validation.data

    // Check for admin "all brands" mode
    const showAll = request.nextUrl.searchParams.get('all') === 'true'

    // Use selected company for scoping (unless showing all)
    const selectedCompanyId = session.user.selectedCompanyId

    // Build where clause - only scope by company if NOT showing all
    const where: Prisma.BrandWhereInput = {}

    if (!showAll) {
      where.companyId = selectedCompanyId
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    if (isActive !== undefined) {
      where.isActive = isActive
    }

    // Get total count
    const total = await prisma.brand.count({ where })

    // Get brands with component and SKU counts (include company info when showing all)
    const brands = await prisma.brand.findMany({
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
        _count: {
          select: {
            components: true,
            skus: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({
      data: brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        isActive: brand.isActive,
        companyId: brand.companyId,
        companyName: brand.company?.name,
        componentCount: brand._count.components,
        skuCount: brand._count.skus,
        createdAt: brand.createdAt.toISOString(),
        updatedAt: brand.updatedAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing brands:', error)
    return NextResponse.json({ error: 'Failed to list brands' }, { status: 500 })
  }
}

// POST /api/brands - Create brand (admin only)
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
    const validation = createBrandSchema.safeParse(body)

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
    const existingBrand = await prisma.brand.findFirst({
      where: {
        companyId: selectedCompanyId,
        name,
      },
    })

    if (existingBrand) {
      return NextResponse.json(
        { error: 'A brand with this name already exists' },
        { status: 409 }
      )
    }

    // Create brand in the selected company
    const brand = await prisma.brand.create({
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
        _count: {
          select: {
            components: true,
            skus: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        data: {
          id: brand.id,
          name: brand.name,
          isActive: brand.isActive,
          componentCount: brand._count.components,
          skuCount: brand._count.skus,
          createdAt: brand.createdAt.toISOString(),
          updatedAt: brand.updatedAt.toISOString(),
        },
        message: 'Brand created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating brand:', error)
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  }
}
