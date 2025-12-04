/**
 * GitHub Webhook Handler
 *
 * Handles GitHub webhook events for feedback tracking:
 * - Issue closed: Updates feedback status and sends notification email
 *
 * Webhook signature verification is enforced in production.
 */

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { getFeedbackByIssueNumber, updateFeedbackStatus } from '@/services/feedback'
import { sendFeedbackResolutionEmail } from '@/lib/email'

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload: string, signature: string | null): boolean {
  if (!signature) return false

  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    console.error('[Webhook] GITHUB_WEBHOOK_SECRET not configured')
    return false
  }

  const hmac = crypto.createHmac('sha256', secret)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * POST /api/webhooks/github - Handle GitHub webhook events
 *
 * Handles:
 * - issues (closed event): Updates feedback status, sends notification email
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text()
    const signature = request.headers.get('x-hub-signature-256')
    const event = request.headers.get('x-github-event')

    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      if (!verifyGitHubSignature(payload, signature)) {
        console.error('[Webhook] Invalid GitHub webhook signature')
        return new Response('Invalid signature', { status: 401 })
      }
    }

    const body = JSON.parse(payload)

    // Handle issue events
    if (event === 'issues') {
      const action = body.action
      const issueNumber = body.issue?.number

      console.log(`[Webhook] Received issue event: action=${action}, issue=#${issueNumber}`)

      if (action === 'closed' && issueNumber) {
        // Find linked feedback
        const feedback = await getFeedbackByIssueNumber(issueNumber)

        if (!feedback) {
          console.log(`[Webhook] No feedback record found for issue #${issueNumber}`)
          return new Response('OK', { status: 200 })
        }

        // Only process if feedback is in pending or in_progress status
        if (feedback.status !== 'pending' && feedback.status !== 'in_progress') {
          console.log(
            `[Webhook] Feedback #${issueNumber} already processed (status: ${feedback.status})`
          )
          return new Response('OK', { status: 200 })
        }

        console.log(`[Webhook] Processing closed issue #${issueNumber} for feedback ${feedback.id}`)

        // Update status to resolved
        await updateFeedbackStatus(feedback.id, {
          status: 'resolved',
          resolvedAt: new Date(),
        })

        console.log(`[Webhook] Updated feedback ${feedback.id} status to resolved`)

        // Send notification email
        if (feedback.userEmail) {
          try {
            await sendFeedbackResolutionEmail({
              to: feedback.userEmail,
              userName: feedback.userName ?? 'User',
              feedbackType: feedback.type,
              issueNumber: feedback.githubIssueNumber,
              issueUrl: feedback.githubIssueUrl,
              description: feedback.description,
            })
            console.log(`[Webhook] Notification email sent to ${feedback.userEmail}`)
          } catch (emailError) {
            // Don't fail the webhook - email failure shouldn't block
            console.error('[Webhook] Failed to send notification email:', emailError)
          }
        } else {
          console.log(`[Webhook] No email address for feedback ${feedback.id}, skipping notification`)
        }
      }
    }

    // Handle ping event (sent when webhook is first configured)
    if (event === 'ping') {
      console.log('[Webhook] Received ping event from GitHub')
      return new Response('Pong', { status: 200 })
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('[Webhook] Error processing GitHub webhook:', error)
    return new Response('Internal error', { status: 500 })
  }
}

/**
 * GET /api/webhooks/github - Health check endpoint
 *
 * Returns configuration status for debugging
 */
export async function GET() {
  const hasSecret = !!process.env.GITHUB_WEBHOOK_SECRET

  return Response.json({
    status: 'ok',
    configured: hasSecret,
    message: hasSecret
      ? 'GitHub webhook endpoint is configured'
      : 'GITHUB_WEBHOOK_SECRET not set - signature verification disabled',
  })
}
