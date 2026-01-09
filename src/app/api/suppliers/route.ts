import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/suppliers - List distinct supplier values from Transaction table
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected' },
        { status: 400 }
      )
    }

    // Get search param for filtering
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''

    // Query distinct supplier values from Transaction table
    // Only include non-null, non-empty suppliers
    let suppliers: Array<{ supplier: string }>

    if (search) {
      suppliers = await prisma.$queryRaw<Array<{ supplier: string }>>`
        SELECT DISTINCT supplier
        FROM "Transaction"
        WHERE "companyId" = ${selectedCompanyId}
          AND supplier IS NOT NULL
          AND supplier != ''
          AND supplier != 'Unknown'
          AND supplier ILIKE ${`%${search}%`}
        ORDER BY supplier ASC
        LIMIT 100
      `
    } else {
      suppliers = await prisma.$queryRaw<Array<{ supplier: string }>>`
        SELECT DISTINCT supplier
        FROM "Transaction"
        WHERE "companyId" = ${selectedCompanyId}
          AND supplier IS NOT NULL
          AND supplier != ''
          AND supplier != 'Unknown'
        ORDER BY supplier ASC
        LIMIT 100
      `
    }

    // Format response to match expected structure
    const data = suppliers.map((s) => ({ value: s.supplier }))

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error listing suppliers:', error)
    return NextResponse.json(
      { error: 'Failed to list suppliers' },
      { status: 500 }
    )
  }
}
