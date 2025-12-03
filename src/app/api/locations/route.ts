import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createLocationSchema, locationListQuerySchema } from '@/types/location'

// GET /api/locations - List locations (admin only)
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
    const validation = locationListQuerySchema.safeParse(searchParams)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { page, pageSize, search, type, isActive, sortBy, sortOrder } = validation.data

    // Build where clause
    const where: Prisma.LocationWhereInput = {
      companyId: session.user.companyId,
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    if (type) {
      where.type = type
    }

    if (isActive !== undefined) {
      where.isActive = isActive
    }

    // Get total count
    const total = await prisma.location.count({ where })

    // Get locations
    const locations = await prisma.location.findMany({
      where,
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
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({
      data: locations.map((location) => ({
        ...location,
        createdAt: location.createdAt.toISOString(),
        updatedAt: location.updatedAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing locations:', error)
    return NextResponse.json({ error: 'Failed to list locations' }, { status: 500 })
  }
}

// POST /api/locations - Create location (admin only)
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
    const validation = createLocationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, type, isDefault, notes } = validation.data

    // Check if name already exists for this company
    const existingLocation = await prisma.location.findFirst({
      where: {
        companyId: session.user.companyId,
        name,
      },
    })

    if (existingLocation) {
      return NextResponse.json(
        { error: 'A location with this name already exists' },
        { status: 409 }
      )
    }

    // If setting as default, unset other defaults first
    if (isDefault) {
      await prisma.location.updateMany({
        where: {
          companyId: session.user.companyId,
          isDefault: true,
        },
        data: { isDefault: false },
      })
    }

    // Create location
    const location = await prisma.location.create({
      data: {
        companyId: session.user.companyId,
        name,
        type,
        isDefault: isDefault ?? false,
        notes,
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

    return NextResponse.json(
      {
        data: {
          ...location,
          createdAt: location.createdAt.toISOString(),
          updatedAt: location.updatedAt.toISOString(),
        },
        message: 'Location created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating location:', error)
    return NextResponse.json({ error: 'Failed to create location' }, { status: 500 })
  }
}
