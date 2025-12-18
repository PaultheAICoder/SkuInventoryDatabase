import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { success, unauthorized, serverError, parseBody } from '@/lib/api-response'
import { generateClarifyingQuestions } from '@/lib/claude'
import { clarifyRequestSchema, type ClarifyResponse } from '@/types/feedback'

// POST /api/feedback/clarify - Generate clarifying questions
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { data, error } = await parseBody(request, clarifyRequestSchema)
    if (error) {
      return error
    }

    // Pass all structured data to AI for context-aware question generation
    const result = await generateClarifyingQuestions({
      type: data.type,
      pageUrl: data.pageUrl,
      title: data.title,
      // Bug fields
      expectedBehavior: data.expectedBehavior,
      actualBehavior: data.actualBehavior,
      stepsToReproduce: data.stepsToReproduce,
      screenshotUrl: data.screenshotUrl,
      // Feature fields
      whoBenefits: data.whoBenefits,
      desiredAction: data.desiredAction,
      businessValue: data.businessValue,
    })

    const response: ClarifyResponse = {
      questions: result.questions,
    }

    return success(response)
  } catch (error) {
    console.error('Error in feedback clarify endpoint:', error)
    return serverError()
  }
}
