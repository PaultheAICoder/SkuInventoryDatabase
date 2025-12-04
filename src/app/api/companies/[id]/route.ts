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
        brands: {
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
          orderBy: { name: 'asc' },
        },
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
        brands: company.brands.map((b) => ({
          id: b.id,
          name: b.name,
          isActive: b.isActive,
          componentCount: b._count.components,
          skuCount: b._count.skus,
        })),
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

    // Handle brand association updates if brandIds provided
    if (validation.data.brandIds !== undefined) {
      const requestedBrandIds = validation.data.brandIds

      // Get current brands for this company
      const currentBrands = await prisma.brand.findMany({
        where: { companyId: id },
        select: {
          id: true,
          name: true,
          _count: { select: { components: true, skus: true } },
        },
      })
      const currentBrandIds = currentBrands.map((b) => b.id)

      // Brands to add to this company (reassign from other companies)
      const brandsToAdd = requestedBrandIds.filter((bid) => !currentBrandIds.includes(bid))

      // Brands to remove from this company
      const brandsToRemove = currentBrandIds.filter((bid) => !requestedBrandIds.includes(bid))

      // Validate: cannot remove brands that have components or SKUs
      if (brandsToRemove.length > 0) {
        const brandsWithData = currentBrands.filter(
          (b) => brandsToRemove.includes(b.id) && (b._count.components > 0 || b._count.skus > 0)
        )

        if (brandsWithData.length > 0) {
          return NextResponse.json(
            {
              error: `Cannot disassociate brands with components or SKUs: ${brandsWithData.map((b) => b.name).join(', ')}. Delete the brand's components and SKUs first.`,
            },
            { status: 400 }
          )
        }

        // For empty brands being removed, we'll delete them
        await prisma.brand.deleteMany({
          where: {
            id: { in: brandsToRemove },
            components: { none: {} },
            skus: { none: {} },
          },
        })
      }

      // Validate brands to add exist (and get their current company info)
      if (brandsToAdd.length > 0) {
        const brandsToReassign = await prisma.brand.findMany({
          where: { id: { in: brandsToAdd } },
          select: {
            id: true,
            name: true,
            companyId: true,
            _count: { select: { components: true, skus: true } },
          },
        })

        const foundIds = brandsToReassign.map((b) => b.id)
        const missingIds = brandsToAdd.filter((bid) => !foundIds.includes(bid))

        if (missingIds.length > 0) {
          return NextResponse.json(
            { error: `Brand IDs not found: ${missingIds.join(', ')}` },
            { status: 400 }
          )
        }

        // Warn about brands with data being moved (could orphan data)
        const brandsWithData = brandsToReassign.filter(
          (b) => b._count.components > 0 || b._count.skus > 0
        )
        if (brandsWithData.length > 0) {
          // Allow but warn - the components/SKUs will move with the brand
          console.warn(
            `Moving brands with data to company ${id}: ${brandsWithData.map((b) => `${b.name} (${b._count.components} components, ${b._count.skus} SKUs)`).join(', ')}`
          )
        }

        // Reassign brands to this company
        await prisma.brand.updateMany({
          where: { id: { in: brandsToAdd } },
          data: { companyId: id },
        })
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
        brands: {
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
          orderBy: { name: 'asc' },
        },
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
        brands: company.brands.map((b) => ({
          id: b.id,
          name: b.name,
          isActive: b.isActive,
          componentCount: b._count.components,
          skuCount: b._count.skus,
        })),
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
