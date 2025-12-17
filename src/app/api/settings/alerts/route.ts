import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import {
  success,
  unauthorized,
  forbidden,
  serverError,
  validationError,
} from '@/lib/api-response'
import {
  getAlertConfig,
  upsertAlertConfig,
} from '@/services/lowstock-alert'
import { updateAlertConfigSchema } from '@/types/lowstock-alert'

/**
 * GET /api/settings/alerts - Get alert config (admin only)
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return forbidden()
    }

    const config = await getAlertConfig(session.user.selectedCompanyId)

    // Mask webhook URL for security (show only last 8 chars)
    const maskedConfig = config
      ? {
          ...config,
          slackWebhookUrl: config.slackWebhookUrl
            ? `****${config.slackWebhookUrl.slice(-8)}`
            : null,
          hasWebhook: !!config.slackWebhookUrl,
        }
      : null

    return success({ config: maskedConfig })
  } catch (error) {
    console.error('Error fetching alert config:', error)
    return serverError()
  }
}

/**
 * PATCH /api/settings/alerts - Update alert config (admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return forbidden()
    }

    const body = await request.json()
    const validation = updateAlertConfigSchema.safeParse(body)

    if (!validation.success) {
      return validationError(validation.error)
    }

    const config = await upsertAlertConfig(
      session.user.selectedCompanyId,
      validation.data
    )

    // Mask webhook URL in response
    const maskedConfig = {
      ...config,
      slackWebhookUrl: config.slackWebhookUrl
        ? `****${config.slackWebhookUrl.slice(-8)}`
        : null,
      hasWebhook: !!config.slackWebhookUrl,
    }

    return success({ config: maskedConfig, message: 'Alert settings updated' })
  } catch (error) {
    console.error('Error updating alert config:', error)
    return serverError()
  }
}
