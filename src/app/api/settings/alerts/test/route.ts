import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import {
  success,
  unauthorized,
  forbidden,
  serverError,
  error,
} from '@/lib/api-response'
import { getAlertConfig } from '@/services/lowstock-alert'
import {
  sendSlackMessage,
  formatTestMessage,
  isValidSlackWebhookUrl,
  SlackWebhookError,
} from '@/lib/slack'
import {
  sendEmail,
  formatTestEmail,
  isEmailConfigured,
  isValidEmail,
  EmailDeliveryError,
} from '@/lib/email'

/**
 * POST /api/settings/alerts/test - Test Slack webhook or email (admin only)
 * Body: { type: 'slack' | 'email', webhookUrl?: string, email?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    // Check selectedCompanyId BEFORE role check to return proper 400 error
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return forbidden()
    }

    const body = await request.json().catch(() => ({}))
    const testType = body.type || 'slack' // Default to slack for backward compatibility

    if (testType === 'email') {
      // Email test
      const testEmail = body.email as string | undefined

      if (!testEmail) {
        return success({
          success: false,
          error: 'No email address provided for test',
        })
      }

      if (!isValidEmail(testEmail)) {
        return success({
          success: false,
          error: 'Invalid email address format',
        })
      }

      if (!isEmailConfigured()) {
        return success({
          success: false,
          error: 'Email provider not configured. Set RESEND_API_KEY environment variable.',
        })
      }

      try {
        const message = formatTestEmail()
        message.to = [testEmail]
        await sendEmail(message)
        return success({
          success: true,
          message: `Test email sent to ${testEmail}`,
        })
      } catch (error) {
        const message =
          error instanceof EmailDeliveryError
            ? error.message
            : 'Failed to send test email'
        return success({
          success: false,
          error: message,
        })
      }
    } else {
      // Slack test (existing logic)
      let webhookUrl: string | null = null

      if (body.webhookUrl) {
        webhookUrl = body.webhookUrl
      } else {
        const config = await getAlertConfig(selectedCompanyId)
        webhookUrl = config?.slackWebhookUrl ?? null
      }

      if (!webhookUrl) {
        return success({
          success: false,
          error: 'No webhook URL configured',
        })
      }

      if (!isValidSlackWebhookUrl(webhookUrl)) {
        return success({
          success: false,
          error: 'Invalid Slack webhook URL format. URL must start with https://hooks.slack.com/services/',
        })
      }

      try {
        await sendSlackMessage(webhookUrl, formatTestMessage())
        return success({
          success: true,
          message: 'Test message sent successfully',
        })
      } catch (error) {
        const message =
          error instanceof SlackWebhookError
            ? error.message
            : 'Failed to send test message'
        return success({
          success: false,
          error: message,
        })
      }
    }
  } catch (error) {
    console.error('Error testing alert channel:', error)
    return serverError()
  }
}
