import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdminInAnyCompany } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createBrandSchema, brandListQuerySchema } from '@/types/brand'

// GET /api/brands - List brands (admin only)
// Supports ?all=true to return brands from all companies the user has access to
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

    if (!isAdminInAnyCompany(session)) {
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

    const { page, pageSize, search, isActive, sortBy, sortOrder, all: showAll } = validation.data

    // Get all company IDs this user has access to
    const accessibleCompanyIds = session.user.companies.map(c => c.id)

    // Build where clause - always scope to accessible companies
    const where: Prisma.BrandWhereInput = {}

    if (showAll) {
      // Return brands from ALL companies user has access to (not just selected)
      where.companyId = { in: accessibleCompanyIds }
    } else {
      // Return brands from selected company only
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
        defaultLocationId: true,
        defaultLocation: {
          select: {
            id: true,
            name: true,
          },
        },
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
        defaultLocationId: brand.defaultLocationId,
        defaultLocationName: brand.defaultLocation?.name ?? null,
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

    const body = await request.json()
    const validation = createBrandSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, defaultLocationId } = validation.data

    // Verify location belongs to company if provided
    if (defaultLocationId) {
      const location = await prisma.location.findFirst({
        where: { id: defaultLocationId, companyId: selectedCompanyId, isActive: true }
      })
      if (!location) {
        return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
      }
    }

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
        defaultLocationId: defaultLocationId || null,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        defaultLocationId: true,
        defaultLocation: {
          select: { id: true, name: true },
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
    })

    return NextResponse.json(
      {
        data: {
          id: brand.id,
          name: brand.name,
          isActive: brand.isActive,
          componentCount: brand._count.components,
          skuCount: brand._count.skus,
          defaultLocationId: brand.defaultLocationId,
          defaultLocationName: brand.defaultLocation?.name ?? null,
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
