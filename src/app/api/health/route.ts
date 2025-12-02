import { NextResponse } from 'next/server'

// Force dynamic rendering to avoid build-time database connection
export const dynamic = 'force-dynamic'

export async function GET() {
  const health: {
    status: string
    timestamp: string
    uptime: number
    database: string
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'unknown',
  }

  try {
    // Dynamic import to avoid build-time database connection
    const { prisma } = await import('@/lib/db')
    // Check database connectivity with a simple query
    await prisma.$queryRaw`SELECT 1`
    health.database = 'connected'
  } catch {
    // App is healthy even if database is not yet available
    // This allows Docker healthcheck to pass during initial setup
    health.database = 'disconnected'
  }

  // Always return 200 if the app is running
  // The database status is informational only
  return NextResponse.json(health, { status: 200 })
}
