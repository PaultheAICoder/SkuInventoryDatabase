import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, validateUserExists } from '@/lib/auth'
import {
  created,
  paginated,
  unauthorized,
  conflict,
  serverError,
  parseBody,
  parseQuery,
  error,
} from '@/lib/api-response'
import { createSKUSchema, skuListQuerySchema } from '@/types/sku'
import { getSkusWithCosts, createSku } from '@/services/sku'

// GET /api/skus - List SKUs with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, skuListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, search, salesChannel, isActive, sortBy, sortOrder } = queryResult.data
    const locationId = searchParams.get('locationId') ?? undefined

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Get selected brand (may be null for "all brands")
    const selectedBrandId = session.user.selectedBrandId

    // Use service to get SKUs with costs
    const result = await getSkusWithCosts({
      companyId: selectedCompanyId,
      brandId: selectedBrandId ?? undefined,
      page,
      pageSize,
      search,
      salesChannel,
      isActive,
      sortBy,
      sortOrder,
      locationId,
    })

    return paginated(result.data, result.meta.total, result.meta.page, result.meta.pageSize)
  } catch (err) {
    console.error('Error listing SKUs:', err)
    return serverError()
  }
}

// POST /api/skus - Create a new SKU
export async function POST(request: NextRequest) {
  // Store context for error logging
  let errorContext: {
    userId?: string
    companyId?: string | null
    brandId?: string | null
    internalCode?: string
  } = {}

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Store session info for error logging
    errorContext = {
      userId: session.user.id,
      companyId: session.user.selectedCompanyId,
      brandId: session.user.selectedBrandId,
    }

    // Validate session has required company context
    if (!session.user.selectedCompanyId) {
      console.error('SKU creation failed: No selectedCompanyId in session', {
        userId: session.user.id,
        email: session.user.email,
      })
      return error('Company context is required. Please select a company and try again.', 400, 'BadRequest')
    }

    // Defense-in-depth: Validate user still exists in database
    const validUser = await validateUserExists(session.user.id)
    if (!validUser) {
      console.error('SKU creation failed: User ID not found in database (stale JWT token)', {
        userId: session.user.id,
        email: session.user.email,
      })
      return error('Your session has expired. Please log out and log back in.', 401, 'Unauthorized')
    }
    if (!validUser.isActive) {
      console.error('SKU creation failed: User is inactive', {
        userId: session.user.id,
        email: session.user.email,
      })
      return error('Your account is inactive. Please contact an administrator.', 403, 'Forbidden')
    }

    const bodyResult = await parseBody(request, createSKUSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data
    errorContext.internalCode = data.internalCode

    // Delegate to service
    const result = await createSku({
      companyId: session.user.selectedCompanyId,
      brandId: session.user.selectedBrandId,
      userId: session.user.id,
      input: data,
    })

    return created(result)
  } catch (err) {
    // Handle known service errors
    if (err instanceof Error) {
      switch (err.message) {
        case 'NO_ACTIVE_BRAND':
          return serverError('No active brand found for selected company')
        case 'INVALID_BRAND':
          console.error('SKU creation failed: Brand does not belong to company', {
            brandId: errorContext.brandId,
            companyId: errorContext.companyId,
          })
          return error('Invalid brand selection. Please refresh the page and try again.', 400, 'BadRequest')
        case 'DUPLICATE_INTERNAL_CODE':
          return conflict('A SKU with this internal code already exists')
      }

      // Handle database constraint violations
      if (err.message.includes('Unique constraint')) {
        return conflict('A SKU with this internal code already exists')
      }
      if (err.message.includes('Foreign key constraint')) {
        if (err.message.includes('createdById') || err.message.includes('updatedById')) {
          return error('Your session has expired. Please log out and log back in.', 401, 'Unauthorized')
        }
        if (err.message.includes('brandId')) {
          return error('Invalid brand selection. Please refresh the page and try again.', 400, 'BadRequest')
        }
        if (err.message.includes('companyId')) {
          return error('Company context is invalid. Please log out and log back in.', 400, 'BadRequest')
        }
      }
    }

    // Log detailed error for debugging
    const errorDetails = {
      message: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined,
      ...errorContext,
    }
    console.error('Error creating SKU:', JSON.stringify(errorDetails, null, 2))

    return serverError('Failed to create SKU. Please try again or contact support.')
  }
}
