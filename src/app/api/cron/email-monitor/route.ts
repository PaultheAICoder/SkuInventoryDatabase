/**
 * Email Monitoring Cron Endpoint
 *
 * Polls the feedback email inbox for reply emails and processes them
 * to determine if users have verified fixes or requested changes.
 *
 * Two-Stage Clarification Flow:
 * 1. User replies "not working" -> Send clarification questions (status: clarification_requested)
 * 2. User replies with answers -> Create enriched follow-up issue (status: changes_requested)
 *
 * This endpoint should be called by a cron job every 5 minutes.
 * Protected by CRON_SECRET header authentication.
 */

import { NextRequest } from 'next/server'
import { Octokit } from '@octokit/rest'
import {
  fetchNewReplies,
  isGraphEmailConfigured,
  sendGraphReplyEmail,
  formatClarificationEmail,
  type GraphEmailMessage,
} from '@/lib/graph-email'
import {
  extractIssueNumber,
  parseReplyDecision,
  parseClarificationResponse,
} from '@/services/email-parsing'
import {
  getLastCheckTime,
  updateLastCheckTime,
  getFeedbackByIssueNumber,
  updateFeedbackStatus,
  updateFeedbackClarification,
  completeClarification,
  getTimedOutClarifications,
  timeoutClarification,
} from '@/services/feedback'
import { getProjectConfig, DEFAULT_PROJECT_ID } from '@/lib/projects'
import { extractImplementationContext, formatContextSummary } from '@/services/completion-report'
import {
  generateFollowUpClarificationQuestions,
  generateEnrichedFollowUpIssue,
} from '@/lib/claude'
import type { FeedbackRecord } from '@/types/feedback'

/**
 * Extract submitter email from issue body
 */
function extractSubmitterEmail(body: string): string | null {
  const match = body.match(/\*\*Submitted by\*\*:\s*[^(]+\s*\(([^)]+)\)/)
  return match ? match[1].trim() : null
}

/**
 * Extract submitter name from issue body
 */
function extractSubmitterName(body: string): string {
  const match = body.match(/\*\*Submitted by\*\*:\s*([^(]+)\s*\(/)
  return match ? match[1].trim() : 'User'
}

/**
 * GET /api/cron/email-monitor - Poll for email replies
 *
 * Should be called by a cron job every 5 minutes.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Email Monitor] Unauthorized request - invalid or missing CRON_SECRET')
    return new Response('Unauthorized', { status: 401 })
  }

  // Check if email is configured
  if (!isGraphEmailConfigured()) {
    console.log('[Email Monitor] Email monitoring not configured, skipping')
    return Response.json({
      status: 'skipped',
      reason: 'Email monitoring not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and FEEDBACK_EMAIL environment variables.',
      timestamp: new Date().toISOString(),
    })
  }

  const githubToken = process.env.GITHUB_API_TOKEN
  if (!githubToken) {
    console.error('[Email Monitor] GITHUB_API_TOKEN not configured')
    return Response.json({
      status: 'error',
      message: 'GITHUB_API_TOKEN not configured',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }

  const octokit = new Octokit({ auth: githubToken })

  const results = {
    processed: 0,
    verified: 0,
    clarificationSent: 0,
    clarificationReceived: 0,
    changesRequested: 0,
    timedOut: 0,
    skipped: 0,
    skippedReasons: [] as string[],
    errors: [] as string[],
  }

  try {
    // First, handle any timed-out clarifications (48 hours)
    await handleTimedOutClarifications(octokit, results)

    const previousCheckTime = await getLastCheckTime()
    console.log(`[Email Monitor] Starting email check since ${previousCheckTime.toISOString()}`)

    const emails = await fetchNewReplies(previousCheckTime)
    const newCheckTime = new Date()

    if (emails.length === 0) {
      console.log('[Email Monitor] No new reply emails found')
      await updateLastCheckTime(newCheckTime)
      return Response.json({
        status: 'success',
        emailsChecked: 0,
        ...results,
        lastCheckTimeUpdated: true,
        timestamp: new Date().toISOString(),
        checkWindow: {
          from: previousCheckTime.toISOString(),
          to: newCheckTime.toISOString(),
        },
      })
    }

    console.log(`[Email Monitor] Found ${emails.length} new reply emails`)

    for (const email of emails) {
      try {
        await processEmail(email, octokit, results)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Email Monitor] Error processing email: ${errorMessage}`)
        results.errors.push(errorMessage)
      }
    }

    console.log(
      `[Email Monitor] Complete: ${results.processed} processed, ${results.verified} verified, ` +
      `${results.clarificationSent} clarifications sent, ${results.clarificationReceived} clarification responses, ` +
      `${results.changesRequested} follow-ups created, ${results.timedOut} timed out, ${results.skipped} skipped`
    )

    // Only update lastCheckTime if processing was successful
    let lastCheckTimeUpdated = false
    if (results.errors.length === 0 || results.processed > 0) {
      await updateLastCheckTime(newCheckTime)
      lastCheckTimeUpdated = true
    } else if (results.errors.length > 0) {
      console.warn('[Email Monitor] All emails failed to process, not updating lastCheckTime')
    }

    return Response.json({
      status: 'success',
      emailsChecked: emails.length,
      ...results,
      lastCheckTimeUpdated,
      timestamp: new Date().toISOString(),
      checkWindow: {
        from: previousCheckTime.toISOString(),
        to: newCheckTime.toISOString(),
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Email Monitor] Error in email monitoring:', errorMessage)

    return Response.json(
      {
        status: 'error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

/**
 * Process a single email
 */
async function processEmail(
  email: GraphEmailMessage,
  octokit: Octokit,
  results: {
    processed: number
    verified: number
    clarificationSent: number
    clarificationReceived: number
    changesRequested: number
    skipped: number
    skippedReasons: string[]
    errors: string[]
  }
): Promise<void> {
  // Extract issue number from subject
  const issueNumber = extractIssueNumber(email.subject)
  if (!issueNumber) {
    console.log(`[Email Monitor] Could not extract issue number from subject: ${email.subject}`)
    return
  }

  // Fetch feedback record
  const feedback = await getFeedbackByIssueNumber(issueNumber)
  if (!feedback) {
    const skipReason = `No feedback record for issue #${issueNumber}`
    console.log(`[Email Monitor] ${skipReason}, skipping`)
    results.skipped++
    results.skippedReasons.push(skipReason)
    return
  }

  // Get project config
  const projectId = feedback.projectId ?? DEFAULT_PROJECT_ID
  const project = getProjectConfig(projectId)

  // Fetch the original issue from GitHub
  let issue
  try {
    const response = await octokit.issues.get({
      owner: project.owner,
      repo: project.repo,
      issue_number: issueNumber,
    })
    issue = response.data
  } catch {
    console.log(`[Email Monitor] Issue #${issueNumber} not found on GitHub (${project.repo})`)
    return
  }

  // Only process closed issues
  if (issue.state !== 'closed') {
    console.log(`[Email Monitor] Issue #${issueNumber} is not closed (state: ${issue.state})`)
    return
  }

  // Extract and verify submitter email
  const submitterEmail = issue.body ? extractSubmitterEmail(issue.body) : null
  if (!submitterEmail) {
    console.log(`[Email Monitor] No submitter email in issue #${issueNumber} body`)
    return
  }

  if (submitterEmail.toLowerCase() !== email.from.toLowerCase()) {
    console.warn(`[Email Monitor] Email from ${email.from} doesn't match submitter ${submitterEmail}`)
    return
  }

  console.log(`[Email Monitor] Processing reply for issue #${issueNumber} from ${email.from} (status: ${feedback.status})`)

  // Check idempotency
  if (feedback.responseEmailId === email.id) {
    const skipReason = `Email ${email.id} already processed for issue #${issueNumber}`
    console.log(`[Email Monitor] ${skipReason}, skipping`)
    results.skipped++
    results.skippedReasons.push(skipReason)
    return
  }

  // Route based on feedback status
  if (feedback.status === 'resolved') {
    // Initial response - determine if verified or needs clarification
    await handleInitialResponse(email, feedback, issue, project, octokit, results)
  } else if (feedback.status === 'clarification_requested') {
    // Clarification response - create enriched follow-up
    await handleClarificationResponse(email, feedback, issue, project, octokit, results)
  } else {
    const skipReason = `Feedback for issue #${issueNumber} not in processable status (${feedback.status})`
    console.log(`[Email Monitor] ${skipReason}, skipping`)
    results.skipped++
    results.skippedReasons.push(skipReason)
  }
}

/**
 * Handle initial response to resolution notification
 * - If verified: update status and close
 * - If changes requested: send clarification questions
 */
async function handleInitialResponse(
  email: GraphEmailMessage,
  feedback: FeedbackRecord,
  issue: { number: number; title: string; body?: string | null; html_url: string; labels: unknown[] },
  project: { owner: string; repo: string },
  octokit: Octokit,
  results: {
    processed: number
    verified: number
    clarificationSent: number
    changesRequested: number
    skipped: number
    skippedReasons: string[]
  }
): Promise<void> {
  const { action, cleanedBody, confidence } = parseReplyDecision(email.body)
  console.log(`[Email Monitor] Parsed action: ${action}, confidence: ${confidence}`)

  if (!action) {
    const skipReason = `Could not determine action from reply for issue #${issue.number}`
    console.log(`[Email Monitor] ${skipReason}`)
    results.skipped++
    results.skippedReasons.push(skipReason)
    return
  }

  results.processed++

  if (action === 'verified') {
    // User confirmed fix works
    await updateFeedbackStatus(feedback.id, {
      status: 'verified',
      responseReceivedAt: new Date(email.receivedAt),
      responseEmailId: email.id,
      responseContent: cleanedBody.substring(0, 1000),
    })

    await octokit.issues.createComment({
      owner: project.owner,
      repo: project.repo,
      issue_number: issue.number,
      body: `✅ **User Verified**: The submitter confirmed the fix works.\n\n> ${cleanedBody.substring(0, 200)}${cleanedBody.length > 200 ? '...' : ''}`,
    })

    results.verified++
    console.log(`[Email Monitor] Issue #${issue.number} verified by user`)
    return
  }

  // action === 'changes_requested' - send clarification questions
  console.log(`[Email Monitor] Sending clarification questions for issue #${issue.number}`)

  // Extract implementation context from completion reports
  const implementationContext = await extractImplementationContext(issue.number, issue.title)

  // Generate context-specific questions
  const issueType = (issue.labels as Array<{ name: string }>).some(l => l.name === 'bug') ? 'bug' : 'feature'
  const { questions, contextSummary } = await generateFollowUpClarificationQuestions({
    originalIssue: {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      type: issueType as 'bug' | 'feature',
    },
    implementationContext,
    userFeedback: cleanedBody,
  })

  // Format and send clarification email
  const submitterName = issue.body ? extractSubmitterName(issue.body) : 'User'
  const formattedContextSummary = contextSummary || formatContextSummary(implementationContext)
  const clarificationEmailBody = formatClarificationEmail(
    submitterName,
    issue.number,
    issue.title,
    formattedContextSummary,
    questions
  )

  const { success, messageId } = await sendGraphReplyEmail({
    to: email.from,
    subject: `Re: Issue #${issue.number} - Need More Information`,
    body: clarificationEmailBody,
    inReplyTo: email.inReplyTo || undefined,
  })

  if (!success) {
    console.error(`[Email Monitor] Failed to send clarification email for issue #${issue.number}`)
    // Fall back to creating follow-up issue immediately
    await createImmediateFollowUp(email, feedback, issue, project, octokit, cleanedBody, results)
    return
  }

  // Update feedback to clarification_requested status
  await updateFeedbackClarification(feedback.id, {
    clarificationSentAt: new Date(),
    clarificationMessageId: messageId,
    clarificationQuestions: JSON.stringify(questions),
    clarificationContext: JSON.stringify(implementationContext),
  })

  // Store the initial response content
  await updateFeedbackStatus(feedback.id, {
    responseContent: cleanedBody.substring(0, 1000),
  })

  // Add comment to GitHub issue
  await octokit.issues.createComment({
    owner: project.owner,
    repo: project.repo,
    issue_number: issue.number,
    body: `📋 **Clarification Requested**: The submitter reported the fix didn't work. Sent follow-up questions to gather more details.\n\n**Initial Feedback**:\n> ${cleanedBody.substring(0, 200)}${cleanedBody.length > 200 ? '...' : ''}\n\n**Questions Sent**:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
  })

  results.clarificationSent++
  console.log(`[Email Monitor] Clarification email sent for issue #${issue.number}`)
}

/**
 * Handle response to clarification questions
 */
async function handleClarificationResponse(
  email: GraphEmailMessage,
  feedback: FeedbackRecord,
  issue: { number: number; title: string; body?: string | null; html_url: string; labels: unknown[] },
  project: { owner: string; repo: string },
  octokit: Octokit,
  results: {
    processed: number
    clarificationReceived: number
    changesRequested: number
    errors: string[]
  }
): Promise<void> {
  results.processed++

  // Parse the clarification response
  const { fullResponse } = parseClarificationResponse(email.body)

  // Get stored context and questions
  const implementationContext = feedback.clarificationContext
    ? JSON.parse(feedback.clarificationContext)
    : { originalIssueNumber: issue.number, originalTitle: issue.title, filesModified: [] }
  const clarificationQuestions = feedback.clarificationQuestions
    ? JSON.parse(feedback.clarificationQuestions)
    : []

  // Generate enriched follow-up issue
  const issueType = (issue.labels as Array<{ name: string }>).some(l => l.name === 'bug') ? 'bug' : 'feature'
  const enrichedIssue = await generateEnrichedFollowUpIssue({
    originalIssue: {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      url: issue.html_url,
      type: issueType as 'bug' | 'feature',
    },
    implementationContext,
    initialUserFeedback: feedback.responseContent || '',
    clarificationQuestions,
    clarificationAnswers: fullResponse,
  })

  // Extract submitter info
  const submitterEmail = issue.body ? extractSubmitterEmail(issue.body) : email.from

  // Create follow-up GitHub issue
  const { data: followUpIssue } = await octokit.issues.create({
    owner: project.owner,
    repo: project.repo,
    title: enrichedIssue.title,
    body: `## Submitter Information
**Project**: ${feedback.projectId}
**Submitted by**: ${submitterEmail?.split('@')[0] || 'User'} (${submitterEmail})
**Submitted at**: ${new Date().toISOString()}

---

${enrichedIssue.body}`,
    labels: [issueType, 'follow-up'],
  })

  // Complete clarification
  await completeClarification(feedback.id, {
    clarificationAnswers: fullResponse.substring(0, 2000),
    responseReceivedAt: new Date(email.receivedAt),
    responseEmailId: email.id,
    followUpIssueNumber: followUpIssue.number,
    followUpIssueUrl: followUpIssue.html_url,
  })

  // Add comment to original issue
  await octokit.issues.createComment({
    owner: project.owner,
    repo: project.repo,
    issue_number: issue.number,
    body: `🔄 **Follow-up Created**: Received clarification from submitter and created enriched follow-up issue.\n\n**Follow-up Issue**: #${followUpIssue.number}\n\n**Analysis**:\n- **Likely Issue**: ${enrichedIssue.analysis.likelyRemainingIssue}\n- **Areas to Investigate**: ${enrichedIssue.analysis.areasToInvestigate.join(', ')}\n- **Possible Regression**: ${enrichedIssue.analysis.isRegressionLikely ? 'Yes' : 'No'}`,
  })

  results.clarificationReceived++
  results.changesRequested++
  console.log(`[Email Monitor] Created enriched follow-up issue #${followUpIssue.number} for issue #${issue.number}`)
}

/**
 * Create immediate follow-up issue (fallback when clarification email fails)
 */
async function createImmediateFollowUp(
  email: GraphEmailMessage,
  feedback: FeedbackRecord,
  issue: { number: number; title: string; body?: string | null; html_url: string; labels: unknown[] },
  project: { owner: string; repo: string },
  octokit: Octokit,
  cleanedBody: string,
  results: { changesRequested: number }
): Promise<void> {
  const issueType = (issue.labels as Array<{ name: string }>).some(l => l.name === 'bug') ? 'bug' : 'enhancement'
  const submitterEmail = issue.body ? extractSubmitterEmail(issue.body) : email.from

  const { data: followUpIssue } = await octokit.issues.create({
    owner: project.owner,
    repo: project.repo,
    title: `[Follow-up] Re: #${issue.number} - ${issue.title}`,
    body: `## Submitter Information
**Project**: ${feedback.projectId}
**Submitted by**: ${submitterEmail?.split('@')[0] || 'User'} (${submitterEmail})
**Submitted at**: ${new Date().toISOString()}

---

## Follow-up to Issue #${issue.number}

**Original Issue**: ${issue.html_url}
**Original Title**: ${issue.title}

### User Feedback
The submitter reports the fix did not fully resolve their issue:

> ${cleanedBody}

### Context
This follow-up was automatically created when the user replied to the resolution notification indicating additional changes are needed.

*Note: Clarification questions could not be sent - creating follow-up with available information.*

## Next Steps
- Review user feedback above
- Investigate what was missed in the original fix
- Implement additional changes as needed`,
    labels: [issueType, 'follow-up'],
  })

  await updateFeedbackStatus(feedback.id, {
    status: 'changes_requested',
    responseReceivedAt: new Date(email.receivedAt),
    responseEmailId: email.id,
    responseContent: cleanedBody.substring(0, 1000),
    followUpIssueNumber: followUpIssue.number,
    followUpIssueUrl: followUpIssue.html_url,
  })

  await octokit.issues.createComment({
    owner: project.owner,
    repo: project.repo,
    issue_number: issue.number,
    body: `🔄 **Changes Requested**: The submitter reported the fix didn't fully resolve their issue.\n\nFollow-up issue created: #${followUpIssue.number}\n\n> ${cleanedBody.substring(0, 200)}${cleanedBody.length > 200 ? '...' : ''}`,
  })

  results.changesRequested++
  console.log(`[Email Monitor] Created immediate follow-up issue #${followUpIssue.number} for issue #${issue.number}`)
}

/**
 * Handle clarifications that have timed out (no response in 48 hours)
 */
async function handleTimedOutClarifications(
  octokit: Octokit,
  results: { timedOut: number; errors: string[] }
): Promise<void> {
  const timedOutFeedbacks = await getTimedOutClarifications(48)

  if (timedOutFeedbacks.length === 0) {
    return
  }

  console.log(`[Email Monitor] Found ${timedOutFeedbacks.length} timed-out clarification(s)`)

  for (const feedback of timedOutFeedbacks) {
    try {
      const projectId = feedback.projectId ?? DEFAULT_PROJECT_ID
      const project = getProjectConfig(projectId)

      // Get implementation context if available
      const implementationContext = feedback.clarificationContext
        ? JSON.parse(feedback.clarificationContext)
        : { originalIssueNumber: feedback.githubIssueNumber, originalTitle: 'Issue', filesModified: [] }

      // Fetch original issue for labels
      let issueType = 'bug'
      try {
        const response = await octokit.issues.get({
          owner: project.owner,
          repo: project.repo,
          issue_number: feedback.githubIssueNumber,
        })
        issueType = (response.data.labels as Array<{ name: string }>).some(l => l.name === 'enhancement') ? 'enhancement' : 'bug'
      } catch {
        // Use default bug type
      }

      // Build timeout follow-up issue body
      const clarificationQuestions = feedback.clarificationQuestions
        ? JSON.parse(feedback.clarificationQuestions)
        : []

      const { data: followUpIssue } = await octokit.issues.create({
        owner: project.owner,
        repo: project.repo,
        title: `[Follow-up] Re: #${feedback.githubIssueNumber} - Timeout`,
        body: `## Follow-up to Issue #${feedback.githubIssueNumber}

**Original Issue**: ${feedback.githubIssueUrl}

---

### User Feedback (Initial)
The submitter reported the fix did not fully resolve their issue:

> ${feedback.responseContent || 'No initial feedback recorded'}

### Clarification Status
**Status**: TIMEOUT - No response received within 48 hours

**Questions Asked**:
${clarificationQuestions.length > 0 ? clarificationQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n') : 'No questions recorded'}

### Implementation Context
${implementationContext.filesModified?.length > 0
    ? `**Files Modified**:\n${implementationContext.filesModified.map((f: { path: string }) => `- \`${f.path}\``).join('\n')}`
    : 'No implementation context available'
  }

${implementationContext.rootCauseIdentified ? `**Root Cause Identified**: ${implementationContext.rootCauseIdentified}` : ''}

## Next Steps
- Review the initial feedback
- Investigate based on available context
- Consider reaching out to submitter directly if clarification is needed`,
        labels: [issueType, 'follow-up'],
      })

      await timeoutClarification(feedback.id, {
        followUpIssueNumber: followUpIssue.number,
        followUpIssueUrl: followUpIssue.html_url,
      })

      // Add comment to original issue
      await octokit.issues.createComment({
        owner: project.owner,
        repo: project.repo,
        issue_number: feedback.githubIssueNumber,
        body: `⏰ **Clarification Timeout**: No response received to clarification questions within 48 hours.\n\nFollow-up issue created with available information: #${followUpIssue.number}`,
      })

      results.timedOut++
      console.log(`[Email Monitor] Created timeout follow-up issue #${followUpIssue.number} for issue #${feedback.githubIssueNumber}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Email Monitor] Error handling timeout for issue #${feedback.githubIssueNumber}: ${errorMessage}`)
      results.errors.push(`Timeout handling error for #${feedback.githubIssueNumber}: ${errorMessage}`)
    }
  }
}

/**
 * POST /api/cron/email-monitor - Manually trigger email check
 *
 * For testing/debugging. Accepts optional "since" parameter.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))

    if (body.since) {
      const customSince = new Date(body.since)
      await updateLastCheckTime(customSince)
      console.log(`[Email Monitor] Manual trigger with custom since: ${customSince.toISOString()}`)
    }

    return GET(request)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return Response.json(
      {
        status: 'error',
        message: errorMessage,
      },
      { status: 500 }
    )
  }
}
