/**
 * Microsoft Graph Email Service
 *
 * Provides email reading capabilities via Microsoft Graph API.
 * Used for monitoring feedback reply emails.
 *
 * IMPORTANT: This service is currently STUBBED because Azure AD
 * configuration is pending. All functions gracefully degrade when
 * the service is not configured.
 *
 * Configuration Required:
 * - AZURE_TENANT_ID
 * - AZURE_CLIENT_ID
 * - AZURE_CLIENT_SECRET
 * - FEEDBACK_EMAIL (ai-coder@vital-enterprises.com)
 */

import { Client } from '@microsoft/microsoft-graph-client'
import { ClientSecretCredential } from '@azure/identity'
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'

// Configuration from environment
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET
const FEEDBACK_EMAIL = process.env.FEEDBACK_EMAIL // ai-coder@vital-enterprises.com

/**
 * Email message from Microsoft Graph
 */
export interface GraphEmailMessage {
  id: string
  from: string
  subject: string
  body: string
  receivedAt: string
  inReplyTo: string | null
  references: string | null
}

/**
 * Internet message header from Graph API
 */
interface InternetMessageHeader {
  name: string
  value: string
}

/**
 * Check if Graph Email service is configured
 */
export function isGraphEmailConfigured(): boolean {
  return !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && FEEDBACK_EMAIL)
}

/**
 * Get Microsoft Graph client
 *
 * Returns null if not configured, allowing graceful degradation.
 */
function getGraphClient(): Client | null {
  if (!isGraphEmailConfigured()) {
    console.warn('[Graph Email] Microsoft Graph email not configured')
    return null
  }

  const credential = new ClientSecretCredential(
    AZURE_TENANT_ID!,
    AZURE_CLIENT_ID!,
    AZURE_CLIENT_SECRET!
  )

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  })

  return Client.initWithMiddleware({ authProvider })
}

/**
 * Fetch new email replies since the given date
 *
 * Only returns emails that are replies (have In-Reply-To or References headers).
 *
 * @param sinceDate - Only fetch emails received after this date
 * @returns Array of email messages, empty if service not configured
 */
export async function fetchNewReplies(sinceDate: Date): Promise<GraphEmailMessage[]> {
  const client = getGraphClient()
  if (!client) {
    console.log('[Graph Email] Service not configured, returning empty array')
    return []
  }

  try {
    const filterDate = sinceDate.toISOString()

    console.log(`[Graph Email] Fetching emails since ${filterDate} for ${FEEDBACK_EMAIL}`)

    const result = await client
      .api(`/users/${FEEDBACK_EMAIL}/messages`)
      .filter(`receivedDateTime ge ${filterDate}`)
      .select('id,from,subject,body,receivedDateTime,internetMessageHeaders')
      .orderby('receivedDateTime')
      .get()

    const emails: GraphEmailMessage[] = []

    for (const message of result.value || []) {
      // Check if this is a reply by looking for In-Reply-To header
      const headers: InternetMessageHeader[] = message.internetMessageHeaders || []
      const inReplyTo = headers.find(
        (h: InternetMessageHeader) => h.name.toLowerCase() === 'in-reply-to'
      )?.value
      const references = headers.find(
        (h: InternetMessageHeader) => h.name.toLowerCase() === 'references'
      )?.value

      // Skip if not a reply
      if (!inReplyTo && !references) {
        continue
      }

      emails.push({
        id: message.id,
        from: message.from?.emailAddress?.address || '',
        subject: message.subject || '',
        body: message.body?.content || '',
        receivedAt: message.receivedDateTime,
        inReplyTo: inReplyTo || null,
        references: references || null,
      })
    }

    console.log(`[Graph Email] Found ${emails.length} reply emails`)
    return emails
  } catch (error) {
    console.error('[Graph Email] Failed to fetch emails via Graph API:', error)
    return []
  }
}

/**
 * Test Graph API connection
 *
 * @returns true if connection successful, false otherwise
 */
export async function testGraphConnection(): Promise<boolean> {
  const client = getGraphClient()
  if (!client) {
    console.log('[Graph Email] Service not configured')
    return false
  }

  try {
    await client.api(`/users/${FEEDBACK_EMAIL}/messages`).top(1).select('id').get()
    console.log('[Graph Email] Connection test successful')
    return true
  } catch (error) {
    console.error('[Graph Email] Connection test failed:', error)
    return false
  }
}

/**
 * Send an email via Microsoft Graph API
 *
 * @param to - Recipient email address(es)
 * @param subject - Email subject
 * @param body - HTML body content
 * @returns true if sent successfully, false otherwise
 */
export async function sendGraphEmail(
  to: string | string[],
  subject: string,
  body: string
): Promise<boolean> {
  const client = getGraphClient()
  if (!client) {
    console.error('[Graph Email] Service not configured, cannot send email')
    return false
  }

  const recipients = Array.isArray(to) ? to : [to]

  try {
    await client.api(`/users/${FEEDBACK_EMAIL}/sendMail`).post({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: body,
        },
        toRecipients: recipients.map((email) => ({
          emailAddress: { address: email },
        })),
      },
      saveToSentItems: true,
    })

    console.log(`[Graph Email] Email sent to ${recipients.join(', ')}`)
    return true
  } catch (error) {
    console.error('[Graph Email] Failed to send email:', error)
    return false
  }
}

/**
 * Get configuration status for debugging
 */
export function getGraphEmailStatus(): {
  configured: boolean
  tenantId: boolean
  clientId: boolean
  clientSecret: boolean
  feedbackEmail: string | null
} {
  return {
    configured: isGraphEmailConfigured(),
    tenantId: !!AZURE_TENANT_ID,
    clientId: !!AZURE_CLIENT_ID,
    clientSecret: !!AZURE_CLIENT_SECRET,
    feedbackEmail: FEEDBACK_EMAIL || null,
  }
}

/**
 * Parameters for sending a reply email (threaded)
 */
export interface ReplyEmailParams {
  to: string
  subject: string
  body: string
  conversationId?: string  // Graph conversation ID for threading
  inReplyTo?: string       // Message-ID of the email being replied to (for email threading headers)
}

/**
 * Result from sending a reply email
 */
export interface ReplyEmailResult {
  success: boolean
  messageId?: string  // The sent message's ID for tracking
  error?: string
}

/**
 * Send an email as a reply to maintain email thread
 *
 * Uses Microsoft Graph API to send a reply email that will be threaded
 * with the original conversation in the recipient's email client.
 *
 * @param params - Reply email parameters
 * @returns Result with success status and message ID
 */
export async function sendGraphReplyEmail(params: ReplyEmailParams): Promise<ReplyEmailResult> {
  const { to, subject, body, conversationId, inReplyTo } = params

  const client = getGraphClient()
  if (!client) {
    console.error('[Graph Email] Service not configured, cannot send reply email')
    return { success: false, error: 'Graph email service not configured' }
  }

  try {
    // Build the message object
    const message: {
      subject: string
      body: { contentType: string; content: string }
      toRecipients: Array<{ emailAddress: { address: string } }>
      conversationId?: string
      internetMessageHeaders?: Array<{ name: string; value: string }>
    } = {
      subject,
      body: {
        contentType: 'HTML',
        content: body,
      },
      toRecipients: [{ emailAddress: { address: to } }],
    }

    // Add conversation ID if provided (helps Graph maintain thread)
    if (conversationId) {
      message.conversationId = conversationId
    }

    // Add In-Reply-To header if provided (helps email clients thread)
    if (inReplyTo) {
      message.internetMessageHeaders = [
        { name: 'In-Reply-To', value: inReplyTo },
      ]
    }

    // Create the message as a draft first, then send it
    // This allows us to get the message ID back
    const draftResponse = await client
      .api(`/users/${FEEDBACK_EMAIL}/messages`)
      .post(message)

    const messageId = draftResponse.id

    // Send the draft
    await client
      .api(`/users/${FEEDBACK_EMAIL}/messages/${messageId}/send`)
      .post({})

    console.log(`[Graph Email] Reply email sent to ${to}, messageId: ${messageId}`)

    return {
      success: true,
      messageId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Graph Email] Failed to send reply email:', errorMessage)
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Format a clarification email for a failed fix report
 *
 * @param recipientName - Name of the recipient
 * @param issueNumber - Original issue number
 * @param issueTitle - Original issue title
 * @param contextSummary - Summary of what was fixed
 * @param questions - Array of 3 clarification questions
 * @returns Formatted HTML email body
 */
export function formatClarificationEmail(
  recipientName: string,
  issueNumber: number,
  issueTitle: string,
  contextSummary: string,
  questions: string[]
): string {
  const questionsHtml = questions
    .map((q, i) => `<p><strong>${i + 1}.</strong> ${q}</p>`)
    .join('\n')

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #0066cc; padding-bottom: 10px; margin-bottom: 20px; }
    .context { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; }
    .questions { background: #fff8e6; padding: 15px; border-radius: 5px; border-left: 4px solid #ffcc00; margin: 15px 0; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 0.9em; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Re: Issue #${issueNumber} - Need More Information</h2>
    </div>

    <p>Hi ${recipientName},</p>

    <p>Thank you for letting us know the fix for <strong>"${issueTitle}"</strong> didn't fully resolve your issue.</p>

    <div class="context">
      <strong>What We Changed:</strong><br>
      ${contextSummary.replace(/\n/g, '<br>')}
    </div>

    <p>To help us understand what's still not working, could you please answer these questions:</p>

    <div class="questions">
      ${questionsHtml}
    </div>

    <p>Just reply to this email with your answers, and we'll create a follow-up to address the remaining issue.</p>

    <div class="footer">
      <p>Thanks,<br>AI Coder</p>
      <p><em>This is an automated message from the feedback tracking system.</em></p>
    </div>
  </div>
</body>
</html>`
}
