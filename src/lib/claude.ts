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

// ============================================================================
// Follow-Up Clarification Questions (for failed fix reports)
// ============================================================================

import type {
  FollowUpClarificationParams,
  FollowUpClarificationResult,
  GenerateEnrichedFollowUpParams,
  EnrichedFollowUpResult,
} from '@/types/feedback'

/**
 * Fallback questions when no context is available or API fails
 */
const FALLBACK_CLARIFICATION_QUESTIONS = [
  'What specifically is not working after the fix?',
  'Is the issue exactly the same as before, or is it a different problem now?',
  'Can you describe the steps that show the problem still exists?',
]

/**
 * Generate 3 context-specific clarification questions for a failed fix report.
 *
 * Uses the implementation context (files modified, root cause, etc.) to generate
 * questions specific to what was attempted, rather than generic questions.
 */
export async function generateFollowUpClarificationQuestions(
  params: FollowUpClarificationParams
): Promise<FollowUpClarificationResult> {
  const { originalIssue, implementationContext, userFeedback } = params

  const anthropic = getClient()

  // Build context summary for the response
  let contextSummary = ''
  if (implementationContext.fixDescription) {
    contextSummary = implementationContext.fixDescription
  } else if (implementationContext.filesModified.length > 0) {
    contextSummary = `Modified ${implementationContext.filesModified.length} file(s): ${implementationContext.filesModified.map((f) => f.path.split('/').pop()).join(', ')}`
  }

  // If no API client or minimal context, return fallback questions
  if (!anthropic || implementationContext.filesModified.length === 0) {
    return {
      questions: FALLBACK_CLARIFICATION_QUESTIONS,
      contextSummary: contextSummary || 'Unable to retrieve implementation details',
    }
  }

  try {
    // Build file list for prompt
    const filesList = implementationContext.filesModified
      .slice(0, 8)
      .map((f) => `- ${f.path}${f.description ? ` (${f.description})` : ''}`)
      .join('\n')

    const systemPrompt = `You are helping gather information about why a software fix didn't work for a user.

Based on the context below, generate exactly 3 specific, targeted clarification questions that will help developers understand what specifically failed.

CONTEXT:
- Original Issue Title: ${originalIssue.title}
- Issue Type: ${originalIssue.type}
- Root Cause Identified: ${implementationContext.rootCauseIdentified || 'Not specified'}
- Fix Description: ${implementationContext.fixDescription || 'Not specified'}
- Files Modified:
${filesList}
${implementationContext.testsAdded?.length ? `- Tests Added: ${implementationContext.testsAdded.join(', ')}` : ''}

USER'S INITIAL FEEDBACK: "${userFeedback}"

Generate 3 questions that:
1. Ask if the issue is in the specific area that was modified (reference actual file names or features)
2. Determine if the root cause was correctly identified or if it's something different
3. Clarify whether the fix is partially working, completely broken, or causing a new issue

Each question should be:
- Specific to this implementation (not generic)
- Under 120 characters
- Actionable (the answer will help debug the issue)

Return ONLY the 3 questions, one per line, without numbering or bullets.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Generate clarification questions for this failed fix report.`,
        },
      ],
      system: systemPrompt,
    })

    // Extract text from response
    const textContent = message.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return {
        questions: FALLBACK_CLARIFICATION_QUESTIONS,
        contextSummary,
      }
    }

    // Parse questions from response (one per line)
    const questions = textContent.text
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && q.length < 150 && !q.startsWith('#'))
      .slice(0, 3)

    // Ensure we have exactly 3 questions
    if (questions.length < 3) {
      return {
        questions: FALLBACK_CLARIFICATION_QUESTIONS,
        contextSummary,
      }
    }

    return { questions, contextSummary }
  } catch (error) {
    console.error('[Claude] Error generating clarification questions:', error)
    return {
      questions: FALLBACK_CLARIFICATION_QUESTIONS,
      contextSummary,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Generate an enriched follow-up GitHub issue using all available context.
 *
 * This creates a detailed issue that includes:
 * - What was originally reported
 * - What fix was attempted (files changed, approach taken)
 * - Why user says it didn't work
 * - AI analysis of likely remaining issue
 */
export async function generateEnrichedFollowUpIssue(
  params: GenerateEnrichedFollowUpParams
): Promise<EnrichedFollowUpResult> {
  const {
    originalIssue,
    implementationContext,
    initialUserFeedback,
    clarificationQuestions,
    clarificationAnswers,
  } = params

  const anthropic = getClient()

  // Build file list for the issue body
  const filesList = implementationContext.filesModified
    .map((f) => `- \`${f.path}\`${f.description ? ` - ${f.description}` : ''}`)
    .join('\n')

  // Default analysis if Claude unavailable
  const defaultAnalysis = {
    likelyRemainingIssue: 'Unable to determine - manual investigation required',
    areasToInvestigate: implementationContext.filesModified.map((f) => f.path),
    isRegressionLikely: false,
  }

  // Try to get AI analysis
  let analysis = defaultAnalysis
  if (anthropic) {
    try {
      const analysisPrompt = `Analyze this failed fix report and provide a brief analysis.

ORIGINAL ISSUE: ${originalIssue.title}
TYPE: ${originalIssue.type}

FIX THAT WAS ATTEMPTED:
- Root Cause Identified: ${implementationContext.rootCauseIdentified || 'Not specified'}
- Fix Description: ${implementationContext.fixDescription || 'Not specified'}
- Files Modified: ${implementationContext.filesModified.map((f) => f.path).join(', ')}

USER'S INITIAL FEEDBACK: "${initialUserFeedback}"

CLARIFICATION QUESTIONS ASKED:
${clarificationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

USER'S CLARIFICATION RESPONSE:
"${clarificationAnswers}"

Provide a JSON response with:
1. likelyRemainingIssue: A 1-2 sentence description of what's likely still wrong
2. areasToInvestigate: Array of 2-4 specific file paths or component areas to check
3. isRegressionLikely: Boolean - does this seem like a new issue caused by the fix?

Respond with ONLY valid JSON, no markdown.`

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: analysisPrompt }],
      })

      const textContent = message.content.find((block) => block.type === 'text')
      if (textContent?.type === 'text') {
        try {
          const parsed = JSON.parse(textContent.text)
          if (parsed.likelyRemainingIssue && parsed.areasToInvestigate) {
            analysis = {
              likelyRemainingIssue: parsed.likelyRemainingIssue,
              areasToInvestigate: parsed.areasToInvestigate,
              isRegressionLikely: Boolean(parsed.isRegressionLikely),
            }
          }
        } catch {
          // JSON parse failed, use default analysis
        }
      }
    } catch (error) {
      console.error('[Claude] Error generating analysis:', error)
    }
  }

  // Generate the issue title
  const title = `[Follow-up] Re: #${originalIssue.number} - ${originalIssue.title}`.substring(0, 100)

  // Generate the issue body
  const body = `## Follow-up to Issue #${originalIssue.number}

**Original Issue**: ${originalIssue.url}
**Original Title**: ${originalIssue.title}

---

### What Was Originally Reported
${originalIssue.body.substring(0, 500)}${originalIssue.body.length > 500 ? '...' : ''}

---

### Fix That Was Attempted

**Root Cause Identified**: ${implementationContext.rootCauseIdentified || 'Not explicitly documented'}

**Files Modified**:
${filesList || '- No file changes documented'}

${implementationContext.fixDescription ? `**Fix Description**: ${implementationContext.fixDescription}` : ''}

${implementationContext.testsAdded?.length ? `**Tests Added**: ${implementationContext.testsAdded.join(', ')}` : ''}

---

### Why User Says It Didn't Work

**Initial Feedback**:
> ${initialUserFeedback}

**Clarification Questions Asked**:
${clarificationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

**User's Clarification Response**:
> ${clarificationAnswers}

---

### Analysis

**Likely Remaining Issue**: ${analysis.likelyRemainingIssue}

**Areas to Investigate**:
${analysis.areasToInvestigate.map((a) => `- ${a}`).join('\n')}

**Is This Possibly a Regression?**: ${analysis.isRegressionLikely ? 'Yes - the fix may have introduced a new issue' : 'No - appears to be incomplete fix of original issue'}

---

### Next Steps
- Review the analysis above
- Check the specific areas identified
- Verify the original tests still pass
- Investigate if the fix inadvertently affected related functionality`

  return {
    title,
    body,
    analysis,
  }
}
