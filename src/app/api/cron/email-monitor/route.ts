/**
 * Email Monitoring Cron Endpoint
 *
 * Polls the feedback email inbox for reply emails and processes them
 * to determine if users have verified fixes or requested changes.
 *
 * This endpoint should be called by a cron job every 5 minutes.
 * Protected by CRON_SECRET header authentication.
 *
 * Architecture: Uses database-backed state for persistence.
 * - lastCheckTime persisted in EmailMonitorState table
 * - Feedback records updated on verification/changes_requested
 * - Issue number extracted from email subject
 * - Submitter email extracted from GitHub issue body
 * - Follow-up issues created and linked to original
 */

import { NextRequest } from 'next/server'
import { Octokit } from '@octokit/rest'
import { fetchNewReplies, isGraphEmailConfigured } from '@/lib/graph-email'
import { extractIssueNumber, parseReplyDecision } from '@/services/email-parsing'
import {
  getLastCheckTime,
  updateLastCheckTime,
  getFeedbackByIssueNumber,
  updateFeedbackStatus,
} from '@/services/feedback'

const GITHUB_OWNER = 'PaultheAICoder'
const GITHUB_REPO = 'SkuInventoryDatabase'

/**
 * Extract submitter email from issue body
 */
function extractSubmitterEmail(body: string): string | null {
  const match = body.match(/\*\*Submitted by\*\*:\s*[^(]+\s*\(([^)]+)\)/)
  return match ? match[1].trim() : null
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

  try {
    const previousCheckTime = await getLastCheckTime()
    console.log(`[Email Monitor] Starting email check since ${previousCheckTime.toISOString()}`)

    const emails = await fetchNewReplies(previousCheckTime)
    const newCheckTime = new Date()
    // Note: lastCheckTime is updated at the end only if processing succeeds

    const results = {
      processed: 0,
      verified: 0,
      changesRequested: 0,
      skipped: 0,
      skippedReasons: [] as string[],
      errors: [] as string[],
    }

    if (emails.length === 0) {
      console.log('[Email Monitor] No new reply emails found')
      // Update lastCheckTime even when no emails - successful check with nothing to process
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
        // Extract issue number from subject (format: "Re: Your bug report - Issue #123")
        const issueNumber = extractIssueNumber(email.subject)
        if (!issueNumber) {
          console.log(`[Email Monitor] Could not extract issue number from subject: ${email.subject}`)
          continue
        }

        // Fetch the original issue from GitHub
        let issue
        try {
          const response = await octokit.issues.get({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            issue_number: issueNumber,
          })
          issue = response.data
        } catch {
          console.log(`[Email Monitor] Issue #${issueNumber} not found on GitHub`)
          continue
        }

        // Only process closed issues (we only notify on close)
        if (issue.state !== 'closed') {
          console.log(`[Email Monitor] Issue #${issueNumber} is not closed (state: ${issue.state})`)
          continue
        }

        // Extract submitter email from issue body
        const submitterEmail = issue.body ? extractSubmitterEmail(issue.body) : null
        if (!submitterEmail) {
          console.log(`[Email Monitor] No submitter email in issue #${issueNumber} body`)
          continue
        }

        // Verify sender matches the original submitter
        if (submitterEmail.toLowerCase() !== email.from.toLowerCase()) {
          console.warn(
            `[Email Monitor] Email from ${email.from} doesn't match submitter ${submitterEmail}`
          )
          continue
        }

        console.log(`[Email Monitor] Processing reply for issue #${issueNumber} from ${email.from}`)

        // Fetch feedback record for idempotency and status checks
        const feedback = await getFeedbackByIssueNumber(issueNumber)
        if (!feedback) {
          const skipReason = `No feedback record for issue #${issueNumber}`
          console.log(`[Email Monitor] ${skipReason}, skipping`)
          results.skipped++
          results.skippedReasons.push(skipReason)
          continue
        }

        // Check if this email was already processed (idempotency)
        if (feedback.responseEmailId === email.id) {
          const skipReason = `Email ${email.id} already processed for issue #${issueNumber}`
          console.log(`[Email Monitor] ${skipReason}, skipping`)
          results.skipped++
          results.skippedReasons.push(skipReason)
          continue
        }

        // Only process replies for feedback in 'resolved' status
        if (feedback.status !== 'resolved') {
          const skipReason = `Feedback for issue #${issueNumber} not in resolved status (${feedback.status})`
          console.log(`[Email Monitor] ${skipReason}, skipping`)
          results.skipped++
          results.skippedReasons.push(skipReason)
          continue
        }

        // Parse the reply to determine user intent
        const { action, cleanedBody, confidence } = parseReplyDecision(email.body)
        console.log(`[Email Monitor] Parsed action: ${action}, confidence: ${confidence}`)

        if (!action) {
          const skipReason = `Could not determine action from reply for issue #${issueNumber}`
          console.log(`[Email Monitor] ${skipReason}`)
          results.skipped++
          results.skippedReasons.push(skipReason)
          continue
        }

        results.processed++

        if (action === 'verified') {
          // Update feedback record status (feedback already fetched and validated above)
          await updateFeedbackStatus(feedback.id, {
            status: 'verified',
            responseReceivedAt: new Date(email.receivedAt),
            responseEmailId: email.id,
            responseContent: cleanedBody.substring(0, 1000), // Truncate long responses
          })
          console.log(`[Email Monitor] Updated feedback #${feedback.id} to verified`)

          // Add comment to issue confirming verification
          await octokit.issues.createComment({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            issue_number: issueNumber,
            body: `✅ **User Verified**: The submitter confirmed the fix works.\n\n> ${cleanedBody.substring(0, 200)}${cleanedBody.length > 200 ? '...' : ''}`,
          })
          results.verified++
          console.log(`[Email Monitor] Issue #${issueNumber} verified by user`)
        }

        if (action === 'changes_requested') {
          // Create a new follow-up issue linked to the original
          const issueType = (issue.labels as Array<{ name: string }>).some(l => l.name === 'bug') ? 'bug' : 'enhancement'

          const { data: followUpIssue } = await octokit.issues.create({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            title: `[Follow-up] Re: #${issueNumber} - ${issue.title}`,
            body: `## Submitter Information
**Submitted by**: ${submitterEmail.split('@')[0]} (${submitterEmail})
**Submitted at**: ${new Date().toISOString()}

---

## Follow-up to Issue #${issueNumber}

**Original Issue**: ${issue.html_url}
**Original Title**: ${issue.title}

### User Feedback
The submitter reports the fix did not fully resolve their issue:

> ${cleanedBody}

### Context
This follow-up was automatically created when the user replied to the resolution notification indicating additional changes are needed.

## Next Steps
- Review user feedback above
- Investigate what was missed in the original fix
- Implement additional changes as needed`,
            labels: [issueType, 'follow-up'],
          })

          // Update feedback record status (feedback already fetched above)
          await updateFeedbackStatus(feedback.id, {
            status: 'changes_requested',
            responseReceivedAt: new Date(email.receivedAt),
            responseEmailId: email.id,
            responseContent: cleanedBody.substring(0, 1000),
            followUpIssueNumber: followUpIssue.number,
            followUpIssueUrl: followUpIssue.html_url,
          })
          console.log(`[Email Monitor] Updated feedback #${feedback.id} to changes_requested`)

          // Add comment to original issue linking to follow-up
          await octokit.issues.createComment({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            issue_number: issueNumber,
            body: `🔄 **Changes Requested**: The submitter reported the fix didn't fully resolve their issue.\n\nFollow-up issue created: #${followUpIssue.number}\n\n> ${cleanedBody.substring(0, 200)}${cleanedBody.length > 200 ? '...' : ''}`,
          })

          results.changesRequested++
          console.log(`[Email Monitor] Created follow-up issue #${followUpIssue.number} for issue #${issueNumber}`)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Email Monitor] Error processing email: ${errorMessage}`)
        results.errors.push(errorMessage)
      }
    }

    console.log(
      `[Email Monitor] Complete: ${results.processed} processed, ${results.verified} verified, ${results.changesRequested} changes requested, ${results.skipped} skipped`
    )

    // Only update lastCheckTime if processing was successful
    // This prevents losing emails if all processing fails
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
 * POST /api/cron/email-monitor - Manually trigger email check
 *
 * For testing/debugging. Accepts optional "since" parameter.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))

    // Optional: override check time for testing
    if (body.since) {
      const customSince = new Date(body.since)
      await updateLastCheckTime(customSince)
      console.log(`[Email Monitor] Manual trigger with custom since: ${customSince.toISOString()}`)
    }

    // Redirect to GET handler
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
