'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface CompanySelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompanySelected: (companyId: string) => void
  title?: string
  description?: string
}

export function CompanySelectionDialog({
  open,
  onOpenChange,
  onCompanySelected,
  title = 'Company Required',
  description = 'Please select a company to continue with the import.',
}: CompanySelectionDialogProps) {
  const { data: session, update: updateSession } = useSession()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const companies = session?.user?.companies || []

  const handleClose = () => {
    setSelectedCompanyId('')
    setError(null)
    onOpenChange(false)
  }

  const handleConfirm = async () => {
    if (!selectedCompanyId) {
      setError('Please select a company')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/companies/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to set company')
      }

      const data = await res.json()

      // Update session with new company
      await updateSession({
        selectedCompanyId: data.data.selectedCompanyId,
        selectedCompanyName: data.data.selectedCompanyName,
      })

      toast.success(`Company set to ${data.data.selectedCompanyName}`)

      // Notify parent and close
      onCompanySelected(selectedCompanyId)
      handleClose()
    } catch (err) {
      console.error('Error setting company:', err)
      setError(err instanceof Error ? err.message : 'Failed to set company. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle case where user has no companies
  if (companies.length === 0) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              No Companies Available
            </DialogTitle>
            <DialogDescription>
              No companies are configured for your account. Please contact an administrator to create a company or grant you access to one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="company-select" className="text-right">
              Company
            </Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger id="company-select" className="col-span-3">
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || !selectedCompanyId}>
            {isLoading ? 'Setting...' : 'Continue with Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
