import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateUserSchema } from '@/types/user'

// GET /api/users/[id] - Get user details (admin only)
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

    const user = await prisma.user.findUnique({
      where: {
        id,
        companyId: session.user.companyId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        ...user,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

// PATCH /api/users/[id] - Update user (admin only)
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

    const validation = updateUserSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Check if user exists and belongs to the same company
    const existingUser = await prisma.user.findUnique({
      where: {
        id,
        companyId: session.user.companyId,
      },
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Prevent deactivating yourself
    if (id === session.user.id && validation.data.isActive === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
    }

    // Prevent demoting yourself if you're the only admin
    if (id === session.user.id && validation.data.role && validation.data.role !== 'admin') {
      const adminCount = await prisma.user.count({
        where: {
          companyId: session.user.companyId,
          role: 'admin',
          isActive: true,
        },
      })

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the only admin user' },
          { status: 400 }
        )
      }
    }

    // Check email uniqueness if being changed
    if (validation.data.email && validation.data.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: validation.data.email },
      })

      if (emailExists) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
      }
    }

    // Prepare update data
    const updateData: Parameters<typeof prisma.user.update>[0]['data'] = {}

    if (validation.data.email) updateData.email = validation.data.email
    if (validation.data.name) updateData.name = validation.data.name
    if (validation.data.role) updateData.role = validation.data.role
    if (validation.data.isActive !== undefined) updateData.isActive = validation.data.isActive
    if (validation.data.password) {
      updateData.passwordHash = await bcrypt.hash(validation.data.password, 12)
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      data: {
        ...user,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      message: 'User updated successfully',
    })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

// DELETE /api/users/[id] - Delete user (admin only)
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

    // Prevent deleting yourself
    if (id === session.user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
    }

    // Check if user exists and belongs to the same company
    const existingUser = await prisma.user.findUnique({
      where: {
        id,
        companyId: session.user.companyId,
      },
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Instead of hard delete, deactivate the user
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
