import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdminInAnyCompany } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateUserCompaniesSchema } from '@/types/user'
import { UserRole } from '@prisma/client'

// GET /api/users/[id]/companies - Get user's company assignments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    // Verify user exists and belongs to admin's company (via UserCompany)
    const user = await prisma.user.findFirst({
      where: {
        id,
        userCompanies: {
          some: {
            companyId: session.user.companyId,
          },
        },
      },
      select: {
        id: true,
        userCompanies: {
          select: {
            id: true,
            companyId: true,
            company: {
              select: {
                name: true,
              },
            },
            role: true,
            isPrimary: true,
            assignedAt: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: user.userCompanies.map((uc) => ({
        id: uc.id,
        companyId: uc.companyId,
        companyName: uc.company.name,
        role: uc.role,
        isPrimary: uc.isPrimary,
        assignedAt: uc.assignedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching user companies:', error)
    return NextResponse.json({ error: 'Failed to fetch user companies' }, { status: 500 })
  }
}

// PUT /api/users/[id]/companies - Update company assignments
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const body = await request.json()

    // Validate request body
    const validation = updateUserCompaniesSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { companyIds } = validation.data

    // Verify user exists and belongs to admin's company (via UserCompany)
    const user = await prisma.user.findFirst({
      where: {
        id,
        userCompanies: {
          some: {
            companyId: session.user.companyId,
          },
        },
      },
      select: {
        id: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Validate all company IDs exist
    const companies = await prisma.company.findMany({
      where: {
        id: { in: companyIds },
      },
      select: {
        id: true,
        name: true,
      },
    })

    if (companies.length !== companyIds.length) {
      const foundIds = new Set(companies.map((c) => c.id))
      const invalidIds = companyIds.filter((cid) => !foundIds.has(cid))
      return NextResponse.json(
        { error: 'Invalid company IDs', invalidIds },
        { status: 400 }
      )
    }

    // Use transaction to update assignments
    const result = await prisma.$transaction(async (tx) => {
      // Get current primary company
      const currentPrimary = await tx.userCompany.findFirst({
        where: { userId: id, isPrimary: true },
      })

      // Determine new primary: keep current if still in list, otherwise first
      const newPrimaryCompanyId = currentPrimary && companyIds.includes(currentPrimary.companyId)
        ? currentPrimary.companyId
        : companyIds[0]

      // Fetch existing roles before deletion to preserve them
      const existingUserCompanies = await tx.userCompany.findMany({
        where: { userId: id },
        select: { companyId: true, role: true },
      })
      // Create a map of companyId -> role for lookup
      const existingRoles = new Map(
        existingUserCompanies.map((uc) => [uc.companyId, uc.role])
      )

      // Delete existing UserCompany records for this user
      await tx.userCompany.deleteMany({
        where: { userId: id },
      })

      // Create new UserCompany records with proper isPrimary
      // Preserve existing role, default to 'ops' for newly assigned companies
      const userCompanyRecords = companyIds.map((companyId) => ({
        userId: id,
        companyId,
        role: existingRoles.get(companyId) ?? UserRole.ops,
        isPrimary: companyId === newPrimaryCompanyId,
      }))

      await tx.userCompany.createMany({
        data: userCompanyRecords,
      })

      // Fetch updated assignments
      return tx.userCompany.findMany({
        where: { userId: id },
        select: {
          id: true,
          companyId: true,
          company: {
            select: {
              name: true,
            },
          },
          role: true,
          isPrimary: true,
          assignedAt: true,
        },
      })
    })

    return NextResponse.json({
      data: result.map((uc) => ({
        id: uc.id,
        companyId: uc.companyId,
        companyName: uc.company.name,
        role: uc.role,
        isPrimary: uc.isPrimary,
        assignedAt: uc.assignedAt.toISOString(),
      })),
      message: 'Company assignments updated successfully',
    })
  } catch (error) {
    console.error('Error updating user companies:', error)
    return NextResponse.json({ error: 'Failed to update user companies' }, { status: 500 })
  }
}
