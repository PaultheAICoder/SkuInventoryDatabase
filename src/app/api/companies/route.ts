import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createCompanySchema, companyListQuerySchema } from '@/types/company'

// GET /api/companies - List all companies (admin only)
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
    const validation = companyListQuerySchema.safeParse(searchParams)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { page, pageSize, search, sortBy, sortOrder } = validation.data

    // Build where clause - NO company scoping for this global admin view
    const where: Prisma.CompanyWhereInput = {}

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    // Get total count
    const total = await prisma.company.count({ where })

    // Get companies with counts
    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            brands: true,
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
      data: companies.map((company) => ({
        id: company.id,
        name: company.name,
        userCount: company._count.users,
        brandCount: company._count.brands,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing companies:', error)
    return NextResponse.json({ error: 'Failed to list companies' }, { status: 500 })
  }
}

// POST /api/companies - Create company (admin only)
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
    const validation = createCompanySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name } = validation.data

    // Check if name already exists (enforced by DB but check for better error)
    const existingCompany = await prisma.company.findUnique({
      where: { name },
    })

    if (existingCompany) {
      return NextResponse.json(
        { error: 'A company with this name already exists' },
        { status: 409 }
      )
    }

    // Create company
    const company = await prisma.company.create({
      data: {
        name,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(
      {
        data: {
          id: company.id,
          name: company.name,
          userCount: 0,
          brandCount: 0,
          createdAt: company.createdAt.toISOString(),
          updatedAt: company.updatedAt.toISOString(),
        },
        message: 'Company created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating company:', error)
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
  }
}
