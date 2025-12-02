import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    // Admin-only routes
    const adminRoutes = ['/settings/users', '/api/users', '/api/settings']
    const isAdminRoute = adminRoutes.some((route) => path.startsWith(route))

    if (isAdminRoute && token?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', req.url))
    }

    // Viewer restrictions (no write operations)
    const writeRoutes = [
      '/components/new',
      '/skus/new',
      '/api/components',
      '/api/skus',
      '/api/transactions',
      '/api/bom-versions',
      '/api/import',
    ]
    const isWriteRoute = writeRoutes.some((route) => path.startsWith(route))
    const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)

    if (isWriteRoute && isWriteMethod && token?.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden', message: 'Viewers cannot modify data' }, { status: 403 })
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
