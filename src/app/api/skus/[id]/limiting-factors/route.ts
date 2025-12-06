import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, notFound, serverError } from '@/lib/api-response'
import { calculateLimitingFactors } from '@/services/bom'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/skus/:id/limiting-factors - Get limiting components for buildable units
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Parse optional locationId query parameter
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId') ?? undefined

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId
    const selectedBrandId = session.user.selectedBrandId

    // Verify SKU exists and user has access
    const sku = await prisma.sKU.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
        ...(selectedBrandId && { brandId: selectedBrandId }),
      },
      select: { id: true },
    })

    if (!sku) {
      return notFound('SKU')
    }

    // Calculate limiting factors
    const limitingFactors = await calculateLimitingFactors(id, selectedCompanyId!, locationId)

    return success(limitingFactors)
  } catch (error) {
    console.error('Error getting limiting factors:', error)
    return serverError()
  }
}
