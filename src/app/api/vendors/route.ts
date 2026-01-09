import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdminInAnyCompany } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createVendorSchema, vendorListQuerySchema } from '@/types/vendor'

// GET /api/vendors - List vendors (all authenticated users can read)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // All authenticated users can read vendors (no role check for GET)

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const validation = vendorListQuerySchema.safeParse(searchParams)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { page, pageSize, search, isActive, sortBy, sortOrder } = validation.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Build where clause - scope by selected company
    const where: Prisma.VendorWhereInput = {
      companyId: selectedCompanyId,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (isActive !== undefined) {
      where.isActive = isActive
    }

    // Get total count
    const total = await prisma.vendor.count({ where })

    // Get vendors
    const vendors = await prisma.vendor.findMany({
      where,
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
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({
      data: vendors.map((vendor) => ({
        ...vendor,
        createdAt: vendor.createdAt.toISOString(),
        updatedAt: vendor.updatedAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing vendors:', error)
    return NextResponse.json({ error: 'Failed to list vendors' }, { status: 500 })
  }
}

// POST /api/vendors - Create vendor (admin only)
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
    const validation = createVendorSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, contactEmail, contactPhone, address, notes } = validation.data

    // Check if name already exists for this company
    const existingVendor = await prisma.vendor.findFirst({
      where: {
        companyId: selectedCompanyId,
        name,
      },
    })

    if (existingVendor) {
      return NextResponse.json(
        { error: 'A vendor with this name already exists' },
        { status: 409 }
      )
    }

    // Create vendor in the selected company
    const vendor = await prisma.vendor.create({
      data: {
        companyId: selectedCompanyId,
        name,
        contactEmail: contactEmail ?? null,
        contactPhone: contactPhone ?? null,
        address: address ?? null,
        notes: notes ?? null,
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

    return NextResponse.json(
      {
        data: {
          ...vendor,
          createdAt: vendor.createdAt.toISOString(),
          updatedAt: vendor.updatedAt.toISOString(),
        },
        message: 'Vendor created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating vendor:', error)
    return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 })
  }
}
