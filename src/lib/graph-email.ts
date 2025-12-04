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
