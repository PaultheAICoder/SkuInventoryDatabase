import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { unauthorized, notFound } from '@/lib/api-response'
import { generateComponentTemplate, generateSKUTemplate } from '@/services/import'

interface RouteParams {
  params: Promise<{
    type: string
  }>
}

// GET /api/import/template/[type] - Download CSV import template
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return unauthorized()
  }

  // Only ops and admin can access import templates
  if (session.user.role === 'viewer') {
    return unauthorized('Viewers cannot access import templates')
  }

  const { type } = await params

  let csvContent: string
  let filename: string

  switch (type) {
    case 'components':
      csvContent = generateComponentTemplate()
      filename = 'component-import-template.csv'
      break
    case 'skus':
      csvContent = generateSKUTemplate()
      filename = 'sku-import-template.csv'
      break
    default:
      return notFound('Template type')
  }

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
