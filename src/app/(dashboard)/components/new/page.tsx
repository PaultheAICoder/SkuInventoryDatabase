import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ComponentForm } from '@/components/features/ComponentForm'

export default async function NewComponentPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  // Check role - Viewer cannot create components
  if (session.user.role === 'viewer') {
    redirect('/components')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Component</h1>
        <p className="text-muted-foreground">Add a new component to your inventory</p>
      </div>
      <ComponentForm />
    </div>
  )
}
