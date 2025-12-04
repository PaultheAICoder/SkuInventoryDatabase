/**
 * Email Monitoring Cron Endpoint
 *
 * Polls the feedback email inbox for reply emails and processes them
 * to determine if users have verified fixes or requested changes.
 *
 * This endpoint should be called by a cron job every 5 minutes.
 * Protected by CRON_SECRET header authentication.
 *
 * IMPORTANT: Email monitoring is STUBBED until Azure AD is configured.
 * The endpoint will return a "skipped" status when email is not configured.
 */

import { NextRequest } from 'next/server'
import { fetchNewReplies, isGraphEmailConfigured } from '@/lib/graph-email'
import { getFeedbackByIssueNumber, processEmailReply } from '@/services/feedback'
import { extractIssueNumber } from '@/services/email-parsing'

// Cache for last check time (in production, use Redis or database)
let lastCheckTime = new Date(Date.now() - 15 * 60 * 1000) // Default: 15 minutes ago

/**
 * GET /api/cron/email-monitor - Poll for email replies
 *
 * Should be called by a cron job every 5 minutes.
 * Protected by CRON_SECRET.
 *
 * Response:
 * - status: 'success' | 'skipped' | 'error'
 * - emailsChecked: number of emails found
 * - processed: number of emails successfully processed
 * - verified: number of feedback items marked as verified
 * - changesRequested: number of follow-up issues created
 * - errors: array of error messages
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

  try {
    console.log(`[Email Monitor] Starting email check since ${lastCheckTime.toISOString()}`)

    const emails = await fetchNewReplies(lastCheckTime)
    const previousCheckTime = lastCheckTime
    lastCheckTime = new Date()

    const results = {
      processed: 0,
      verified: 0,
      changesRequested: 0,
      errors: [] as string[],
    }

    if (emails.length === 0) {
      console.log('[Email Monitor] No new reply emails found')
      return Response.json({
        status: 'success',
        emailsChecked: 0,
        ...results,
        timestamp: new Date().toISOString(),
        checkWindow: {
          from: previousCheckTime.toISOString(),
          to: lastCheckTime.toISOString(),
        },
      })
    }

    console.log(`[Email Monitor] Found ${emails.length} new reply emails`)

    for (const email of emails) {
      try {
        // Extract issue number from subject (format: "Re: [Resolved] Your Bug Report #123")
        const issueNumber = extractIssueNumber(email.subject)
        if (!issueNumber) {
          console.log(`[Email Monitor] Could not extract issue number from subject: ${email.subject}`)
          continue
        }

        const feedback = await getFeedbackByIssueNumber(issueNumber)

        if (!feedback) {
          console.log(`[Email Monitor] No feedback found for issue #${issueNumber}`)
          continue
        }

        // Only process resolved feedback awaiting verification
        if (feedback.status !== 'resolved') {
          console.log(`[Email Monitor] Feedback for issue #${issueNumber} is not in resolved status (current: ${feedback.status})`)
          continue
        }

        // Verify sender matches the original submitter
        if (feedback.userEmail?.toLowerCase() !== email.from.toLowerCase()) {
          console.warn(
            `[Email Monitor] Email from ${email.from} doesn't match feedback submitter ${feedback.userEmail}`
          )
          continue
        }

        console.log(`[Email Monitor] Processing reply for issue #${issueNumber}`)

        const result = await processEmailReply(feedback, email.body, email.id)
        results.processed++

        if (result.action === 'verified') {
          results.verified++
          console.log(`[Email Monitor] Issue #${issueNumber} marked as verified`)
        }
        if (result.action === 'changes_requested') {
          results.changesRequested++
          console.log(
            `[Email Monitor] Issue #${issueNumber} - follow-up created: #${result.followUpIssue?.number}`
          )
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Email Monitor] Error processing email: ${errorMessage}`)
        results.errors.push(errorMessage)
      }
    }

    console.log(
      `[Email Monitor] Complete: ${results.processed} processed, ${results.verified} verified, ${results.changesRequested} changes requested`
    )

    return Response.json({
      status: 'success',
      emailsChecked: emails.length,
      ...results,
      timestamp: new Date().toISOString(),
      checkWindow: {
        from: previousCheckTime.toISOString(),
        to: lastCheckTime.toISOString(),
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
      lastCheckTime = new Date(body.since)
      console.log(`[Email Monitor] Manual trigger with custom since: ${lastCheckTime.toISOString()}`)
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
