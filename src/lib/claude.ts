import Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'child_process'

// Safety limits for Claude Code execution
const CLAUDE_CODE_TIMEOUT_MS = 60000 // 60 seconds max
const MAX_OUTPUT_SIZE = 100000 // 100KB max output

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

// ============================================================================
// Claude Code Headless Mode Integration
// ============================================================================

export interface EnhanceIssueParams {
  type: 'bug' | 'feature'
  description: string
  answers: string[]
}

export interface EnhanceIssueResult {
  success: boolean
  title: string
  body: string
  error?: string
}

/**
 * Use Claude Code headless mode to generate a high-quality GitHub issue
 * from user feedback. Falls back to simple formatting if Claude Code fails.
 */
export async function enhanceIssueWithClaudeCode(
  params: EnhanceIssueParams
): Promise<EnhanceIssueResult> {
  const { type, description, answers } = params

  const claudePath = process.env.CLAUDE_CODE_PATH || 'claude'

  // Build the prompt with user input
  const userContext = buildUserContext(type, description, answers)
  const systemPrompt = buildSystemPrompt(type)

  try {
    const result = await executeClaudeCode(claudePath, userContext, systemPrompt)
    return parseClaudeCodeOutput(result, type, description, answers)
  } catch (error) {
    console.error('Claude Code execution failed:', error)
    // Fall back to simple formatting
    return {
      success: false,
      title: description.length > 80 ? description.substring(0, 77) + '...' : description,
      body: type === 'bug'
        ? formatFallbackBugBody(description, answers)
        : formatFallbackFeatureBody(description, answers),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

function buildUserContext(type: 'bug' | 'feature', description: string, answers: string[]): string {
  const label = type === 'bug' ? 'Bug Report' : 'Feature Request'
  return `${label}:

Description: ${description}

Clarifying Questions and Answers:
Q1: ${type === 'bug' ? 'What steps can we follow to reproduce this issue?' : 'What problem would this feature solve for you?'}
A1: ${answers[0] || 'Not provided'}

Q2: ${type === 'bug' ? 'What did you expect to happen instead?' : 'How would you ideally use this feature?'}
A2: ${answers[1] || 'Not provided'}

Q3: ${type === 'bug' ? 'When did you first notice this problem?' : 'How important is this feature to your workflow?'}
A3: ${answers[2] || 'Not provided'}`
}

function buildSystemPrompt(type: 'bug' | 'feature'): string {
  if (type === 'bug') {
    return `You are creating a GitHub issue for a bug report. Based on the user's feedback, generate:
1. A clear, concise title (max 80 characters)
2. A comprehensive issue body following this format:

## Reported Issue
**What's broken**: <summarize the issue>
**Expected behavior**: <from user's answer>
**Severity**: <Critical/High/Medium/Low based on impact>

## Error Details
**Error Type**: <infer from description>
**Error Message**: <if provided>
**Location**: <if mentioned>
**URL/Route**: <if mentioned>

## How to Reproduce
<Based on user's steps, format as numbered list>

## Investigation Notes
- Error pattern detected: <your analysis>
- Likely affected components: <your analysis>
- Related files to check: <your suggestions>

## Next Steps
- Investigate root cause (not just symptom)
- Add regression test to prevent recurrence
- Ensure minimal, surgical fix

Respond with JSON: {"title": "...", "body": "..."}`
  } else {
    return `You are creating a GitHub issue for a feature request. Based on the user's feedback, generate:
1. A clear, concise title (max 80 characters)
2. A comprehensive issue body following this format:

## Feature Description
<summarize what the user wants>

## User Stories
### Primary User Story
**As a** user
**I want to** <action from description>
**So that** <benefit from user's answer>

## Requirements
### Functional Requirements
- [ ] <specific capability>
- [ ] <data handling>
- [ ] <workflow>

### Non-Functional Requirements
- [ ] Performance: <if applicable>
- [ ] Privacy: <if applicable>
- [ ] Reliability: <error handling>

## Technical Context
### Affected Areas
- **Database**: <your analysis>
- **Backend**: <your analysis>
- **Frontend**: <your analysis>

## Acceptance Criteria
- [ ] Feature works as described
- [ ] No TypeScript errors
- [ ] All tests passing

## Notes
- Estimated complexity: <Small/Medium/Large>
- Priority based on user input: <High/Medium/Low>

Respond with JSON: {"title": "...", "body": "..."}`
  }
}

function executeClaudeCode(
  claudePath: string,
  userContext: string,
  systemPrompt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--system-prompt', systemPrompt,
      userContext,
    ]

    const child = spawn(claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
      if (stdout.length > MAX_OUTPUT_SIZE) {
        killed = true
        child.kill()
        reject(new Error('Output size limit exceeded'))
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (killed) return // Already rejected
      if (code !== 0) {
        reject(new Error(`Claude Code exited with code ${code}: ${stderr}`))
      } else {
        resolve(stdout)
      }
    })

    // Set timeout
    const timeoutId = setTimeout(() => {
      killed = true
      child.kill()
      reject(new Error('Claude Code execution timed out'))
    }, CLAUDE_CODE_TIMEOUT_MS)

    // Clear timeout when process ends
    child.on('close', () => {
      clearTimeout(timeoutId)
    })
  })
}

function parseClaudeCodeOutput(
  output: string,
  type: 'bug' | 'feature',
  originalDescription: string,
  answers: string[]
): EnhanceIssueResult {
  try {
    // Parse JSON output from Claude Code
    const parsed = JSON.parse(output)

    // Handle the Claude Code output format: { result: "..." } or { content: [...] }
    let textResult: string | null = null

    if (parsed.result && typeof parsed.result === 'string') {
      textResult = parsed.result
    } else if (parsed.content && Array.isArray(parsed.content)) {
      const textBlock = parsed.content.find((b: { type: string }) => b.type === 'text')
      if (textBlock?.text) {
        textResult = textBlock.text
      }
    }

    if (textResult) {
      // Try to extract JSON from the text result
      const jsonMatch = textResult.match(/\{[\s\S]*"title"[\s\S]*"body"[\s\S]*\}/)
      if (jsonMatch) {
        const innerParsed = JSON.parse(jsonMatch[0])
        if (innerParsed.title && innerParsed.body) {
          return {
            success: true,
            title: innerParsed.title.substring(0, 80),
            body: innerParsed.body,
          }
        }
      }
    }

    throw new Error('Could not parse Claude Code output')
  } catch (parseError) {
    console.error('Failed to parse Claude Code output:', parseError)
    // Return fallback
    return {
      success: false,
      title: originalDescription.length > 80
        ? originalDescription.substring(0, 77) + '...'
        : originalDescription,
      body: type === 'bug'
        ? formatFallbackBugBody(originalDescription, answers)
        : formatFallbackFeatureBody(originalDescription, answers),
      error: 'Failed to parse Claude Code output',
    }
  }
}

function formatFallbackBugBody(description: string, answers: string[]): string {
  return `## Reported Issue
**What's broken**: ${description}
**Expected behavior**: ${answers[1] || 'Not specified'}
**Severity**: Medium

## Error Details
**Error Type**: User-reported bug
**Error Message**: See description above
**Location**: User feedback submission
**URL/Route**: N/A

## Clarifying Questions & Answers
**Q1**: What steps can we follow to reproduce this issue?
**A1**: ${answers[0] || 'Not provided'}

**Q2**: What did you expect to happen instead?
**A2**: ${answers[1] || 'Not provided'}

**Q3**: When did you first notice this problem?
**A3**: ${answers[2] || 'Not provided'}

## Next Steps
- Investigate root cause (not just symptom)
- Add regression test to prevent recurrence
- Ensure minimal, surgical fix`
}

function formatFallbackFeatureBody(description: string, answers: string[]): string {
  return `## Feature Description
${description}

## User Stories
### Primary User Story
**As a** user
**I want to** ${description.toLowerCase()}
**So that** ${answers[0] || 'it improves my workflow'}

## Clarifying Questions & Answers
**Q1**: What problem would this feature solve for you?
**A1**: ${answers[0] || 'Not provided'}

**Q2**: How would you ideally use this feature?
**A2**: ${answers[1] || 'Not provided'}

**Q3**: How important is this feature to your workflow?
**A3**: ${answers[2] || 'Not provided'}

## Acceptance Criteria
- [ ] Feature works as described
- [ ] No TypeScript errors
- [ ] All tests passing
- [ ] Build completes successfully`
}
