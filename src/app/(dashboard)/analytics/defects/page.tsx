import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { DefectAnalyticsDashboard } from '@/components/features/DefectAnalyticsDashboard'

export const metadata = {
  title: 'Defect Analytics | Inventory Tracker',
  description: 'Analyze defect rates and quality trends across builds',
}

export default async function DefectAnalyticsPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  // Use company-specific role if available, fall back to legacy role
  const companyRole = getSelectedCompanyRole(session) ?? session.user.role
  return <DefectAnalyticsDashboard userRole={companyRole} />
}
