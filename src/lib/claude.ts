import Anthropic from '@anthropic-ai/sdk'

// Initialize client lazily to handle missing API key gracefully
let client: Anthropic | null = null

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not set - AI clarification will be unavailable')
    return null
  }

  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  return client
}

export interface GenerateQuestionsParams {
  type: 'bug' | 'feature'
  description: string
}

export interface GenerateQuestionsResult {
  questions: string[]
  error?: string
}

/**
 * Generate 3 clarifying questions for a feedback submission using Claude API.
 * Returns default questions if API is unavailable or errors.
 */
export async function generateClarifyingQuestions(
  params: GenerateQuestionsParams
): Promise<GenerateQuestionsResult> {
  const { type, description } = params

  const anthropic = getClient()

  // Fallback questions if API unavailable
  const fallbackQuestions = type === 'bug'
    ? [
        'What steps can we follow to reproduce this issue?',
        'What did you expect to happen instead?',
        'When did you first notice this problem?',
      ]
    : [
        'What problem would this feature solve for you?',
        'How would you ideally use this feature?',
        'How important is this feature to your workflow?',
      ]

  if (!anthropic) {
    return { questions: fallbackQuestions }
  }

  try {
    const systemPrompt = type === 'bug'
      ? `You are helping gather information about a software bug report. Based on the user's initial description, generate exactly 3 specific, targeted clarifying questions that would help developers understand and fix the issue. Focus on: reproduction steps, expected vs actual behavior, and environment/context. Each question should be concise (under 100 characters). Return ONLY the 3 questions, one per line, without numbering or bullets.`
      : `You are helping gather information about a software feature request. Based on the user's initial description, generate exactly 3 specific, targeted clarifying questions that would help developers understand and implement the feature. Focus on: use cases, expected behavior, and priority/importance. Each question should be concise (under 100 characters). Return ONLY the 3 questions, one per line, without numbering or bullets.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `${type === 'bug' ? 'Bug Report' : 'Feature Request'}: ${description}`,
        },
      ],
      system: systemPrompt,
    })

    // Extract text from response
    const textContent = message.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return { questions: fallbackQuestions }
    }

    // Parse questions from response (one per line)
    const questions = textContent.text
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && q.length < 150)
      .slice(0, 3)

    // Ensure we have exactly 3 questions
    if (questions.length < 3) {
      return { questions: fallbackQuestions }
    }

    return { questions }
  } catch (error) {
    console.error('Error generating clarifying questions:', error)
    return {
      questions: fallbackQuestions,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
