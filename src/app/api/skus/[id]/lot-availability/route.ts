import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, notFound, serverError } from '@/lib/api-response'
import { checkLotAvailabilityForBuild } from '@/services/lot-selection'
import { toLocalDateString } from '@/lib/utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/skus/[id]/lot-availability?units=N
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const units = parseInt(searchParams.get('units') || '0')

    if (units <= 0) {
      return success([])
    }

    const selectedCompanyId = session.user.selectedCompanyId

    // Get SKU with active BOM
    const sku = await prisma.sKU.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      include: {
        bomVersions: {
          where: { isActive: true },
          take: 1,
          include: {
            lines: {
              include: {
                component: {
                  select: { id: true, name: true, skuCode: true },
                },
              },
            },
          },
        },
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    const activeBom = sku.bomVersions[0]
    if (!activeBom) {
      return success([])
    }

    // Get lot availability for all BOM components
    const bomLines = activeBom.lines.map((line) => ({
      componentId: line.componentId,
      componentName: line.component.name,
      skuCode: line.component.skuCode,
      quantityRequired: line.quantityPerUnit.toNumber() * units,
    }))

    const availability = await checkLotAvailabilityForBuild({ bomLines })

    return success(
      availability.map((a) => ({
        componentId: a.componentId,
        componentName: a.componentName,
        requiredQuantity: a.requiredQuantity,
        availableQuantity: a.availableQuantity,
        hasLots: a.hasLots,
        selectedLots: a.selectedLots.map((lot) => ({
          lotId: lot.lotId,
          lotNumber: lot.lotNumber,
          quantity: lot.quantity,
          expiryDate: lot.expiryDate ? toLocalDateString(lot.expiryDate) : null,
        })),
        isPooled: a.isPooled,
        isSufficient: a.isSufficient,
      }))
    )
  } catch (error) {
    console.error('Error fetching lot availability:', error)
    return serverError()
  }
}
