import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'

/**
 * Route permission configuration
 * Maps URL patterns to required roles
 */
const ROUTE_PERMISSIONS = {
  // Admin-only routes (UI)
  '/settings/users': ['admin'] as UserRole[],
  '/settings': ['admin'] as UserRole[],

  // Admin-only API routes
  '/api/users': ['admin'] as UserRole[],
  '/api/settings': ['admin'] as UserRole[],

  // Write routes (ops and admin can access)
  '/components/new': ['admin', 'ops'] as UserRole[],
  '/components/[^/]+/edit': ['admin', 'ops'] as UserRole[],
  '/skus/new': ['admin', 'ops'] as UserRole[],
  '/skus/[^/]+/edit': ['admin', 'ops'] as UserRole[],
  '/skus/[^/]+/bom': ['admin', 'ops'] as UserRole[],
}

/**
 * API routes that viewers cannot write to
 */
const WRITE_RESTRICTED_API_ROUTES = [
  '/api/components',
  '/api/skus',
  '/api/transactions',
  '/api/bom-versions',
  '/api/import',
]

/**
 * Check if a path matches a route pattern
 */
function matchRoute(path: string, pattern: string): boolean {
  // Convert route pattern to regex
  const regexPattern = pattern
    .replace(/\[.*?\]/g, '[^/]+') // Handle Next.js dynamic segments
    .replace(/\//g, '\\/') // Escape forward slashes
  const regex = new RegExp(`^${regexPattern}`)
  return regex.test(path)
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname
    const method = req.method

    // Check route-specific permissions
    for (const [pattern, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
      if (matchRoute(path, pattern)) {
        if (!allowedRoles.includes(token?.role as UserRole)) {
          // For API routes, return JSON error
          if (path.startsWith('/api/')) {
            return NextResponse.json(
              { error: 'Forbidden', message: 'You do not have permission to access this resource' },
              { status: 403 }
            )
          }
          // For UI routes, redirect to home
          return NextResponse.redirect(new URL('/', req.url))
        }
        break
      }
    }

    // Viewer restrictions on write operations
    const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    const isWriteRestrictedRoute = WRITE_RESTRICTED_API_ROUTES.some((route) =>
      path.startsWith(route)
    )

    if (isWriteRestrictedRoute && isWriteMethod && token?.role === 'viewer') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Viewers cannot modify data' },
        { status: 403 }
      )
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: [
    // Protect all routes except auth, api/auth, and static files
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}
