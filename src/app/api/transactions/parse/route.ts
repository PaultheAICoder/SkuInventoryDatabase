import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, serverError, parseBody } from '@/lib/api-response'
import {
  parseTransactionInputSchema,
  type ParseTransactionResponse,
} from '@/types/parser'
import {
  parseTransactionText,
  resolveItemToRecord,
  buildSuggestions,
} from '@/lib/transaction-parser'

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // 2. Check role - Viewer cannot create transactions
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('You do not have permission to create transactions')
    }

    // 3. Parse and validate input
    const bodyResult = await parseBody(request, parseTransactionInputSchema)
    if (bodyResult.error) return bodyResult.error

    const { text } = bodyResult.data
    const selectedCompanyId = session.user.selectedCompanyId

    // 4. Fetch context data for fuzzy matching
    const [components, skus, locations] = await Promise.all([
      prisma.component.findMany({
        where: { companyId: selectedCompanyId, isActive: true },
        select: { id: true, name: true, skuCode: true },
      }),
      prisma.sKU.findMany({
        where: { companyId: selectedCompanyId, isActive: true },
        select: { id: true, name: true, internalCode: true, salesChannel: true },
      }),
      prisma.location.findMany({
        where: { companyId: selectedCompanyId, isActive: true },
        select: { id: true, name: true },
      }),
    ])

    // 5. Parse with Claude
    const parsed = await parseTransactionText(text, {
      components,
      skus,
      locations,
    })

    // 6. Resolve item name to database record
    const resolvedItem = resolveItemToRecord(
      parsed.itemName.value,
      parsed.itemType.value,
      { components, skus }
    )

    // 7. Update parsed with resolved ID
    const finalParsed = {
      ...parsed,
      itemId: {
        value: resolvedItem?.id ?? null,
        confidence: resolvedItem?.confidence ?? 'low' as const,
        rawText: parsed.itemName.value,
      },
    }

    // Update overall confidence based on item resolution
    if (!resolvedItem) {
      finalParsed.overallConfidence = 'low'
    } else if (resolvedItem.confidence === 'high' && finalParsed.overallConfidence !== 'low') {
      finalParsed.overallConfidence = 'high'
    }

    // Also update item name to use resolved name if found
    if (resolvedItem) {
      finalParsed.itemName = {
        ...finalParsed.itemName,
        value: resolvedItem.name,
      }
    }

    // 8. Build suggestions for low-confidence fields
    const suggestions = buildSuggestions(finalParsed, { components, skus })

    return success<ParseTransactionResponse>({
      parsed: finalParsed,
      suggestions,
    })
  } catch (error) {
    console.error('Error parsing transaction:', error)
    return serverError()
  }
}
