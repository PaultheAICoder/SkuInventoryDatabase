/**
 * ASIN Mapping Individual Route
 *
 * DELETE /api/asin-mapping/[id] - Remove mapping (admin only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * DELETE /api/asin-mapping/[id]
 * Remove an ASIN-SKU mapping (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Get user's company and role
    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, isPrimary: true },
      select: { companyId: true, role: true },
    })

    if (!userCompany) {
      return NextResponse.json({ error: 'User must belong to a company' }, { status: 400 })
    }

    // Only admin can delete mappings
    if (userCompany.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can delete ASIN mappings' },
        { status: 403 }
      )
    }

    // Find the mapping
    const mapping = await prisma.asinSkuMapping.findUnique({
      where: { id },
      include: {
        brand: { select: { companyId: true } },
      },
    })

    if (!mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    // Verify mapping belongs to user's company
    if (mapping.brand.companyId !== userCompany.companyId) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    // Delete the mapping
    await prisma.asinSkuMapping.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('ASIN mapping delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete mapping' },
      { status: 500 }
    )
  }
}
