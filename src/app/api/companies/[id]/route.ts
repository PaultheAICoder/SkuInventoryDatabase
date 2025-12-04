import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateCompanySchema } from '@/types/company'

// GET /api/companies/[id] - Get company details (admin only)
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

    const company = await prisma.company.findUnique({
      where: { id },
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
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        id: company.id,
        name: company.name,
        userCount: company._count.users,
        brandCount: company._count.brands,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching company:', error)
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 })
  }
}

// PATCH /api/companies/[id] - Update company (admin only)
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

    const validation = updateCompanySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id },
    })

    if (!existingCompany) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Check name uniqueness if being changed
    if (validation.data.name && validation.data.name !== existingCompany.name) {
      const nameExists = await prisma.company.findUnique({
        where: { name: validation.data.name },
      })

      if (nameExists) {
        return NextResponse.json(
          { error: 'A company with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Prepare update data
    const updateData: Parameters<typeof prisma.company.update>[0]['data'] = {}

    if (validation.data.name) updateData.name = validation.data.name

    // Update company
    const company = await prisma.company.update({
      where: { id },
      data: updateData,
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
    })

    return NextResponse.json({
      data: {
        id: company.id,
        name: company.name,
        userCount: company._count.users,
        brandCount: company._count.brands,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      },
      message: 'Company updated successfully',
    })
  } catch (error) {
    console.error('Error updating company:', error)
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 })
  }
}

// DELETE /api/companies/[id] - Delete company (admin only)
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

    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            brands: true,
            locations: true,
            transactions: true,
            components: true,
            skus: true,
            userCompanies: true,
          },
        },
      },
    })

    if (!existingCompany) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Prevent deletion of current company
    if (id === session.user.selectedCompanyId) {
      return NextResponse.json(
        { error: 'Cannot delete the company you are currently viewing' },
        { status: 400 }
      )
    }

    // Check if company has any associated data
    const totalCount =
      existingCompany._count.users +
      existingCompany._count.brands +
      existingCompany._count.locations +
      existingCompany._count.transactions +
      existingCompany._count.components +
      existingCompany._count.skus +
      existingCompany._count.userCompanies

    if (totalCount > 0) {
      const details = []
      if (existingCompany._count.users > 0) details.push(`${existingCompany._count.users} users`)
      if (existingCompany._count.brands > 0) details.push(`${existingCompany._count.brands} brands`)
      if (existingCompany._count.locations > 0) details.push(`${existingCompany._count.locations} locations`)
      if (existingCompany._count.userCompanies > 0) details.push(`${existingCompany._count.userCompanies} user assignments`)

      return NextResponse.json(
        {
          error: `Cannot delete company with associated data: ${details.join(', ')}. Remove all associated data first.`
        },
        { status: 400 }
      )
    }

    // Delete company (hard delete since it has no data)
    await prisma.company.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Company deleted successfully' })
  } catch (error) {
    console.error('Error deleting company:', error)
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 })
  }
}
