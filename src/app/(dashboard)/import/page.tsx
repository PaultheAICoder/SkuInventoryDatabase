'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { ImportForm, type ImportResult } from '@/components/features/ImportForm'
import { ImportResultDialog } from '@/components/features/ImportResultDialog'

export default function ImportPage() {
  const { data: session, status } = useSession()
  const [componentResult, setComponentResult] = useState<ImportResult | null>(null)
  const [skuResult, setSKUResult] = useState<ImportResult | null>(null)
  const [showComponentResult, setShowComponentResult] = useState(false)
  const [showSKUResult, setShowSKUResult] = useState(false)

  // Redirect if not authenticated or viewer role
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!session) {
    redirect('/login')
  }

  if (session.user.role === 'viewer') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Import Data</h1>
          <p className="text-muted-foreground">Import components and SKUs from CSV files</p>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
          You do not have permission to import data. Please contact an administrator.
        </div>
      </div>
    )
  }

  const handleComponentImport = (result: ImportResult) => {
    setComponentResult(result)
    setShowComponentResult(true)
  }

  const handleSKUImport = (result: ImportResult) => {
    setSKUResult(result)
    setShowSKUResult(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import Data</h1>
        <p className="text-muted-foreground">Import components and SKUs from CSV files</p>
      </div>

      {/* Instructions */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <h2 className="mb-2 font-medium">How to Import</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Download the template CSV file for the data type you want to import</li>
          <li>Fill in your data following the template format</li>
          <li>Upload the completed CSV file</li>
          <li>Review the import results and fix any errors</li>
        </ol>
      </div>

      {/* Import Forms */}
      <div className="grid gap-6 md:grid-cols-2">
        <ImportForm
          importType="components"
          title="Components"
          description="Import component inventory items with details like SKU code, cost, and reorder points"
          onImportComplete={handleComponentImport}
        />
        <ImportForm
          importType="skus"
          title="SKUs"
          description="Import sellable SKUs with sales channel information"
          onImportComplete={handleSKUImport}
        />
      </div>

      {/* Result Dialogs */}
      <ImportResultDialog
        open={showComponentResult}
        onClose={() => setShowComponentResult(false)}
        result={componentResult}
        importType="components"
      />
      <ImportResultDialog
        open={showSKUResult}
        onClose={() => setShowSKUResult(false)}
        result={skuResult}
        importType="skus"
      />
    </div>
  )
}
