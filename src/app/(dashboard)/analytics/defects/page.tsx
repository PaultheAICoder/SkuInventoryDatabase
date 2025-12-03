import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
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

  return <DefectAnalyticsDashboard userRole={session.user.role} />
}
