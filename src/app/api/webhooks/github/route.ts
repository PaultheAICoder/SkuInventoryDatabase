/**
 * GitHub Webhook Handler
 *
 * Handles GitHub webhook events for user notification:
 * - Issue closed: Parses submitter from issue body, sends notification email
 *
 * Architecture: Uses GitHub issue body as source of truth - no database dependency.
 * Webhook signature verification is enforced in production.
 */

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { Octokit } from '@octokit/rest'
import { sendGraphEmail, isGraphEmailConfigured } from '@/lib/graph-email'

const GITHUB_OWNER = 'PaultheAICoder'
const GITHUB_REPO = 'SkuInventoryDatabase'

/**
 * Extract submitter info from issue body
 */
function extractSubmitterFromBody(body: string): { name: string; email: string } | null {
  const match = body.match(/\*\*Submitted by\*\*:\s*([^(]+)\s*\(([^)]+)\)/)
  if (match) {
    return {
      name: match[1].trim(),
      email: match[2].trim(),
    }
  }
  return null
}

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
 * - issues (closed event): Notifies submitter via email
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
      const issue = body.issue
      const issueNumber = issue?.number

      console.log(`[Webhook] Received issue event: action=${action}, issue=#${issueNumber}`)

      if (action === 'closed' && issue) {
        // Extract submitter from issue body
        const submitter = issue.body ? extractSubmitterFromBody(issue.body) : null

        if (!submitter) {
          console.log(`[Webhook] No submitter info in issue #${issueNumber} body - skipping`)
          return new Response('OK', { status: 200 })
        }

        if (!submitter.email || submitter.email === 'no email') {
          console.log(`[Webhook] Submitter has no email - skipping`)
          return new Response('OK', { status: 200 })
        }

        console.log(`[Webhook] Found submitter: ${submitter.name} (${submitter.email})`)

        // Check if email is configured
        if (!isGraphEmailConfigured()) {
          console.log('[Webhook] Email not configured - skipping notification')
          return new Response('OK', { status: 200 })
        }

        // Determine issue type from labels
        const issueType = (issue.labels as Array<{ name: string }>)?.some(
          (l) => l.name === 'bug'
        )
          ? 'bug'
          : 'feature'

        // Send notification email
        const subject = `Your ${issueType} report has been resolved - Issue #${issueNumber}`
        const emailBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Your ${issueType === 'bug' ? 'Bug Report' : 'Feature Request'} Has Been Resolved</h2>

            <p>Hi ${submitter.name || 'there'},</p>

            <p>We've resolved the ${issueType} you reported:</p>

            <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: #71717a; font-size: 14px;">Issue #${issueNumber}</p>
              <p style="margin: 8px 0 0 0; font-weight: 500;">${issue.title}</p>
            </div>

            <p><a href="${issue.html_url}" style="color: #2563eb;">View the issue on GitHub</a></p>

            <h3 style="color: #374151;">Please Verify</h3>
            <p>Could you please verify that this resolves your issue? Simply reply to this email with:</p>
            <ul>
              <li><strong>"Verified"</strong> or <strong>"Looks good"</strong> - if the fix works for you</li>
              <li><strong>"Not fixed"</strong> or describe what's still wrong - if you need further changes</li>
            </ul>

            <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
              Thank you for helping us improve!<br>
              - The Development Team
            </p>
          </div>
        `

        const success = await sendGraphEmail(submitter.email, subject, emailBody)

        if (success) {
          console.log(`[Webhook] Notification email sent to ${submitter.email}`)

          // Add comment to issue noting notification was sent
          const githubToken = process.env.GITHUB_API_TOKEN
          if (githubToken) {
            try {
              const octokit = new Octokit({ auth: githubToken })
              await octokit.issues.createComment({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                issue_number: issueNumber,
                body: `📧 Notification sent to submitter (${submitter.email}) requesting verification.`,
              })
            } catch (commentError) {
              console.error('[Webhook] Failed to add comment:', commentError)
            }
          }
        } else {
          console.error('[Webhook] Failed to send notification email')
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
  const hasEmail = isGraphEmailConfigured()

  return Response.json({
    status: 'ok',
    configured: hasSecret,
    emailConfigured: hasEmail,
    message: hasSecret
      ? 'GitHub webhook endpoint is configured'
      : 'GITHUB_WEBHOOK_SECRET not set - signature verification disabled',
  })
}
