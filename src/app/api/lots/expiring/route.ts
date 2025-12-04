import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { success, unauthorized, serverError } from '@/lib/api-response'
import { getExpiringLots, getExpiredLotCount } from '@/services/expiry'
import { getCompanySettings } from '@/services/inventory'

// GET /api/lots/expiring - Get lots expiring soon
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const selectedCompanyId = session.user.selectedCompanyId

    // Get warning days from settings
    const settings = await getCompanySettings(selectedCompanyId)
    const warningDays = settings.expiryWarningDays ?? 30

    // Get expiring and expired lot counts
    const [expiringLots, expiredCount] = await Promise.all([
      getExpiringLots(selectedCompanyId, warningDays),
      getExpiredLotCount(selectedCompanyId),
    ])

    return success({
      expiringLots: expiringLots.map((lot) => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        componentId: lot.componentId,
        componentName: lot.componentName,
        componentSkuCode: lot.componentSkuCode,
        expiryDate: lot.expiryDate.toISOString().split('T')[0],
        balance: lot.balance,
        daysUntilExpiry: lot.daysUntilExpiry,
      })),
      expiringCount: expiringLots.length,
      expiredCount,
      warningDays,
    })
  } catch (error) {
    console.error('Error fetching expiring lots:', error)
    return serverError()
  }
}
