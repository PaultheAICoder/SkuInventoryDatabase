import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { success, unauthorized, serverError, error, parseBody } from '@/lib/api-response'
import { submitFeedbackSchema, type SubmitFeedbackResponse } from '@/types/feedback'
import { Octokit } from '@octokit/rest'
import { enhanceIssueWithClaudeCode } from '@/lib/claude'
import { createFeedback } from '@/services/feedback'
import { getProjectConfig, DEFAULT_PROJECT_ID } from '@/lib/projects'

// Get project config for this project
const project = getProjectConfig(DEFAULT_PROJECT_ID)

// Simple in-memory rate limiting (resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetAt: Date }>()
const RATE_LIMIT = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = new Date()
  const entry = rateLimitMap.get(userId)

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS) })
    return true
  }

  if (entry.count >= RATE_LIMIT) {
    return false
  }

  entry.count++
  return true
}

/**
 * POST /api/feedback - Submit feedback and create GitHub issue
 *
 * Uses Claude Code headless mode to enhance user feedback into a
 * comprehensive GitHub issue. Falls back to simple formatting if
 * Claude Code is unavailable or fails.
 *
 * Rate limited to 5 requests per hour per user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Rate limiting
    if (!checkRateLimit(session.user.id)) {
      return error('Rate limit exceeded. Please wait before submitting more feedback.', 429, 'TooManyRequests')
    }

    const { data, error: parseError } = await parseBody(request, submitFeedbackSchema)
    if (parseError) {
      return parseError
    }

    // Use Claude Code to enhance the issue with all structured fields
    const enhanced = await enhanceIssueWithClaudeCode({
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
      // Answers
      answers: data.answers,
    })

    // Use the user-provided title as fallback if Claude doesn't generate one
    const title = enhanced.title || data.title

    // Add submitter information to the issue body
    const submitterInfo = `## Submitter Information
**Project**: ${DEFAULT_PROJECT_ID}
**Submitted by**: ${session.user.name || 'Unknown'} (${session.user.email || 'no email'})
**Submitted at**: ${new Date().toISOString()}

---

`
    const issueBody = submitterInfo + enhanced.body

    // Log if enhancement failed (but still create issue with fallback)
    if (!enhanced.success) {
      console.warn('Issue enhancement failed, using fallback:', enhanced.error)
    }

    // Label based on type
    const label = data.type === 'bug' ? 'bug' : 'enhancement'

    // Create GitHub issue using Octokit REST API
    // Note: We use GITHUB_API_TOKEN (not GITHUB_TOKEN) to avoid conflicts with gh CLI auth
    const githubToken = process.env.GITHUB_API_TOKEN
    if (!githubToken) {
      console.error('GITHUB_API_TOKEN environment variable not set')
      return error('GitHub integration not configured', 500, 'ServiceUnavailable')
    }

    const octokit = new Octokit({ auth: githubToken })

    const { data: issue } = await octokit.issues.create({
      owner: project.owner,
      repo: project.repo,
      title,
      body: issueBody,
      labels: [label],
    })

    const issueUrl = issue.html_url
    const issueNumber = issue.number

    console.log(`[Feedback] Created GitHub issue #${issueNumber} for ${session.user.email}`)

    // Create feedback record to track this submission
    try {
      await createFeedback({
        userId: session.user.id,
        githubIssueNumber: issueNumber,
        githubIssueUrl: issueUrl,
        projectId: DEFAULT_PROJECT_ID,
      })
      console.log(`[Feedback] Created feedback record for issue #${issueNumber}`)
    } catch (feedbackError) {
      // Log but don't fail - the GitHub issue was created successfully
      console.error(`[Feedback] Failed to create feedback record:`, feedbackError)
    }

    const response: SubmitFeedbackResponse = {
      issueUrl,
      issueNumber,
    }

    return success(response)
  } catch (err) {
    console.error('Error creating GitHub issue:', err)

    // Handle specific Octokit errors
    if (err instanceof Error) {
      if (err.message.includes('Bad credentials')) {
        return error('GitHub token invalid or expired', 500, 'ServiceUnavailable')
      }
      if (err.message.includes('Not Found')) {
        return error('GitHub repository not found', 500, 'ServiceUnavailable')
      }
    }

    return serverError('Failed to create GitHub issue. Please try again.')
  }
}
