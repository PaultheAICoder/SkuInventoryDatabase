import { redirect } from 'next/navigation'

/**
 * Settings Integrations Page
 * Redirects to the main /integrations page which contains the
 * fully functional integration management interface.
 */
export default function SettingsIntegrationsPage() {
  redirect('/integrations')
}
