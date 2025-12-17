/**
 * ASIN Mapping Individual Route
 *
 * DELETE /api/asin-mapping/[id] - Remove mapping (admin only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error } from '@/lib/api-response'

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

    // Use selected company from session
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Only admin can delete mappings (check via session role)
    if (session.user.role !== 'admin') {
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
    if (mapping.brand.companyId !== selectedCompanyId) {
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
