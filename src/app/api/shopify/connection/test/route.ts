import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptToken } from '@/lib/crypto'
import { ShopifyClient, ShopifyAuthError } from '@/services/shopify'
import { testConnectionSchema } from '@/types/shopify-connection'

// POST /api/shopify/connection/test - Test connection (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = testConnectionSchema.safeParse(body)

    // Determine which credentials to use
    let shopName: string
    let accessToken: string

    if (validation.success && validation.data.shopName && validation.data.accessToken) {
      // Use provided credentials
      shopName = validation.data.shopName
      accessToken = validation.data.accessToken
    } else {
      // Use stored credentials
      const connection = await prisma.shopifyConnection.findUnique({
        where: { companyId: session.user.selectedCompanyId },
      })

      if (!connection) {
        return NextResponse.json({
          data: { success: false, error: 'No connection configured' },
        })
      }

      if (!connection.accessToken) {
        return NextResponse.json({
          data: { success: false, error: 'No access token stored' },
        })
      }

      shopName = connection.shopName
      try {
        accessToken = decryptToken(connection.accessToken)
      } catch {
        return NextResponse.json({
          data: { success: false, error: 'Failed to decrypt stored token' },
        })
      }
    }

    // Test the connection
    try {
      const client = new ShopifyClient(shopName, accessToken)
      const shopInfo = await client.fetchShopInfo()

      return NextResponse.json({
        data: {
          success: true,
          shopInfo: {
            name: shopInfo.name,
            email: shopInfo.email,
            domain: shopInfo.domain,
            currency: shopInfo.currency,
            plan: shopInfo.plan_name,
          },
        },
      })
    } catch (error) {
      let errorMessage = 'Connection failed'

      if (error instanceof ShopifyAuthError) {
        errorMessage = 'Invalid credentials or insufficient permissions'
      } else if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          errorMessage = 'Network error - could not reach Shopify'
        } else if (error.message.includes('not found')) {
          errorMessage = 'Shop not found - check shop name'
        }
      }

      return NextResponse.json({
        data: {
          success: false,
          error: errorMessage,
        },
      })
    }
  } catch (error) {
    console.error('Error testing Shopify connection:', error)
    return NextResponse.json({ error: 'Failed to test connection' }, { status: 500 })
  }
}
