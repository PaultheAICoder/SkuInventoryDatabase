import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions, logSecurityEvent, SECURITY_EVENTS } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  success,
  unauthorized,
  forbidden,
  parseBody,
  serverError,
} from '@/lib/api-response'

// Request body schema
const switchCompanySchema = z.object({
  companyId: z.string().uuid('Invalid company ID'),
})

// POST /api/companies/switch - Switch active company
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const bodyResult = await parseBody(request, switchCompanySchema)
    if (bodyResult.error) return bodyResult.error

    const { companyId } = bodyResult.data

    // Verify user has access to the requested company
    const userCompany = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    })

    // Also check if it's the user's primary company
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { company: { select: { id: true, name: true } } },
    })

    const hasAccess = userCompany || user?.companyId === companyId
    const company = userCompany?.company || (user?.companyId === companyId ? user.company : null)

    if (!hasAccess || !company) {
      return forbidden('You do not have access to this company')
    }

    // Log the company switch event
    await logSecurityEvent({
      companyId: session.user.selectedCompanyId, // Log from the OLD company
      userId: session.user.id,
      eventType: SECURITY_EVENTS.COMPANY_SWITCH,
      details: {
        fromCompanyId: session.user.selectedCompanyId,
        fromCompanyName: session.user.selectedCompanyName,
        toCompanyId: company.id,
        toCompanyName: company.name,
      },
    })

    // Return the new company info for client-side session update
    return success({
      selectedCompanyId: company.id,
      selectedCompanyName: company.name,
      message: `Switched to ${company.name}`,
    })
  } catch (error) {
    console.error('Error switching company:', error)
    return serverError()
  }
}
