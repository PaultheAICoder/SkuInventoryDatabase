import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions, logSecurityEvent } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  success,
  unauthorized,
  forbidden,
  parseBody,
  serverError,
} from '@/lib/api-response'

// Request body schema
const switchBrandSchema = z.object({
  brandId: z.string().uuid('Invalid brand ID').nullable(),
})

// POST /api/brands/switch - Switch active brand within current company
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const bodyResult = await parseBody(request, switchBrandSchema)
    if (bodyResult.error) return bodyResult.error

    const { brandId } = bodyResult.data
    const selectedCompanyId = session.user.selectedCompanyId

    // If brandId is null, reject the request - "All Brands" mode is no longer supported
    if (brandId === null) {
      console.warn('Deprecated: null brandId in brand switch - All Brands mode has been removed')
      return forbidden('All Brands mode is no longer supported. Please select a specific brand.')
    }

    // Verify brand exists and belongs to user's selected company
    const brand = await prisma.brand.findFirst({
      where: {
        id: brandId,
        companyId: selectedCompanyId,
        isActive: true,
      },
      select: { id: true, name: true },
    })

    if (!brand) {
      return forbidden('Brand not found or does not belong to selected company')
    }

    // Log the brand switch event
    await logSecurityEvent({
      companyId: selectedCompanyId,
      userId: session.user.id,
      eventType: 'brand_switch',
      details: {
        fromBrandId: session.user.selectedBrandId,
        fromBrandName: session.user.selectedBrandName,
        toBrandId: brand.id,
        toBrandName: brand.name,
      },
    })

    return success({
      selectedBrandId: brand.id,
      selectedBrandName: brand.name,
      message: `Switched to ${brand.name}`,
    })
  } catch (error) {
    console.error('Error switching brand:', error)
    return serverError()
  }
}
