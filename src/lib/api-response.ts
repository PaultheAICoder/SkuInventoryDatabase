import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import type { ApiError, ApiSuccess, PaginatedResponse } from '@/types'

// Success response helpers
export function success<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data }, { status })
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return success(data, 201)
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json({
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}

// Error response helpers
export function error(
  message: string,
  status = 400,
  errorCode = 'BadRequest',
  details?: Array<{ field: string; message: string }>
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: errorCode,
      message,
      details,
    },
    { status }
  )
}

export function unauthorized(message = 'Please log in to access this resource'): NextResponse<ApiError> {
  return error(message, 401, 'Unauthorized')
}

export function forbidden(message = 'You do not have permission to perform this action'): NextResponse<ApiError> {
  return error(message, 403, 'Forbidden')
}

export function notFound(resource = 'Resource'): NextResponse<ApiError> {
  return error(`${resource} not found`, 404, 'NotFound')
}

export function conflict(message: string): NextResponse<ApiError> {
  return error(message, 409, 'Conflict')
}

export function versionConflict(resource = 'Record'): NextResponse<ApiError> {
  return error(
    `${resource} has been modified by another user. Please refresh and try again.`,
    409,
    'VersionConflict'
  )
}

export function validationError(zodError: ZodError): NextResponse<ApiError> {
  const details = zodError.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))

  return NextResponse.json(
    {
      error: 'ValidationError',
      message: 'Invalid request data',
      details,
    },
    { status: 400 }
  )
}

export function serverError(message = 'An unexpected error occurred'): NextResponse<ApiError> {
  return error(message, 500, 'InternalServerError')
}

// Helper to parse and validate request body with Zod
export async function parseBody<T>(
  request: Request,
  schema: { parse: (data: unknown) => T }
): Promise<{ data: T; error: null } | { data: null; error: NextResponse<ApiError> }> {
  try {
    const body = await request.json()
    const data = schema.parse(body)
    return { data, error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      return { data: null, error: validationError(err) }
    }
    return { data: null, error: error('Invalid JSON body', 400) }
  }
}

// Helper to parse query params with Zod
export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: { parse: (data: unknown) => T }
): { data: T; error: null } | { data: null; error: NextResponse<ApiError> } {
  try {
    const params = Object.fromEntries(searchParams.entries())
    const data = schema.parse(params)
    return { data, error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      return { data: null, error: validationError(err) }
    }
    return { data: null, error: error('Invalid query parameters', 400) }
  }
}
