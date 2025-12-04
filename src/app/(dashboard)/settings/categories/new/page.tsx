'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { CategoryForm } from '@/components/features/CategoryForm'

export default function NewCategoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/categories">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Categories
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Create Category</h1>
      </div>

      <div className="max-w-2xl">
        <CategoryForm />
      </div>
    </div>
  )
}
