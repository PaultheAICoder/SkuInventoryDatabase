import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { success, unauthorized, serverError, error, parseBody } from '@/lib/api-response'
import { submitFeedbackSchema, type SubmitFeedbackResponse } from '@/types/feedback'
import { Octokit } from '@octokit/rest'

// GitHub repo configuration
const GITHUB_OWNER = 'PaultheAICoder'
const GITHUB_REPO = 'SkuInventoryDatabase'

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

function formatBugBody(description: string, answers: string[]): string {
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

## Verification Checkpoint
- [ ] **Last Verified**: Pending investigation
- [ ] **File paths verified**: No
- [ ] **Checked for previous partial fixes**: No
- [ ] **Reproduction confirmed today**: No

## How to Reproduce
See user's answer to Q1 above.

## Investigation Notes
- Error pattern detected: User-reported issue
- Likely affected components: TBD
- Related files to check: TBD

## Next Steps
- Investigate root cause (not just symptom)
- Add regression test to prevent recurrence
- Ensure minimal, surgical fix`
}

function formatFeatureBody(description: string, answers: string[]): string {
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

## Requirements

### Functional Requirements
- [ ] Implement core feature as described
- [ ] Handle edge cases appropriately
- [ ] Follow existing code patterns

### Non-Functional Requirements
- [ ] Performance: Maintain current app performance
- [ ] Privacy: Handle user data appropriately
- [ ] Reliability: Include proper error handling

## Technical Context

### Affected Areas
- **Database**: TBD during implementation
- **Backend**: TBD during implementation
- **Frontend**: TBD during implementation
- **External APIs**: None expected

### Related Features
To be determined during planning.

### Data Involved
- **New Tables**: TBD
- **Modified Tables**: TBD
- **Relationships**: TBD

### Dependencies
- **Prerequisites**: None identified
- **Blocks**: None

## Acceptance Criteria
- [ ] Feature works as described
- [ ] No TypeScript errors
- [ ] All tests passing
- [ ] Build completes successfully

## Verification Checkpoint
- [ ] **Last Verified**: N/A - new feature
- [ ] **Pattern references verified**: No
- [ ] **Similar feature identified**: TBD
- [ ] **Dependencies confirmed**: No

## Notes
- Estimated complexity: TBD
- May require phasing: TBD
- Design pattern to follow: TBD`
}

// POST /api/feedback - Submit feedback and create GitHub issue
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

    const { type, description, answers } = data

    // Format issue body based on type
    const issueBody = type === 'bug'
      ? formatBugBody(description, answers)
      : formatFeatureBody(description, answers)

    // Create title from description (truncate if needed)
    const title = description.length > 80
      ? description.substring(0, 77) + '...'
      : description

    // Label based on type
    const label = type === 'bug' ? 'bug' : 'enhancement'

    // Create GitHub issue using Octokit REST API
    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) {
      console.error('GITHUB_TOKEN environment variable not set')
      return error('GitHub integration not configured', 500, 'ServiceUnavailable')
    }

    const octokit = new Octokit({ auth: githubToken })

    const { data: issue } = await octokit.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title,
      body: issueBody,
      labels: [label],
    })

    const issueUrl = issue.html_url
    const issueNumber = issue.number

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
