'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export interface ImportResult {
  total: number
  imported: number
  skipped: number
  errors: Array<{
    rowNumber: number
    name: string
    errors: string[]
  }>
}

interface ImportResultDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean
  /**
   * Callback when dialog is closed
   */
  onClose: () => void
  /**
   * Import result to display
   */
  result: ImportResult | null
  /**
   * Type of import for display purposes
   */
  importType: 'components' | 'skus' | 'initial-inventory'
}

export function ImportResultDialog({
  open,
  onClose,
  result,
  importType,
}: ImportResultDialogProps) {
  if (!result) return null

  const hasErrors = result.errors.length > 0
  const allSuccessful = result.imported === result.total
  const allFailed = result.imported === 0 && result.total > 0

  const getStatusIcon = () => {
    if (allSuccessful) return <CheckCircle className="h-6 w-6 text-green-500" />
    if (allFailed) return <XCircle className="h-6 w-6 text-red-500" />
    return <AlertTriangle className="h-6 w-6 text-yellow-500" />
  }

  const getStatusText = () => {
    if (allSuccessful) return 'Import Complete'
    if (allFailed) return 'Import Failed'
    return 'Import Partially Complete'
  }

  const getTypeLabels = () => {
    switch (importType) {
      case 'components':
        return { singular: 'component', plural: 'components' }
      case 'skus':
        return { singular: 'SKU', plural: 'SKUs' }
      case 'initial-inventory':
        return { singular: 'inventory record', plural: 'inventory records' }
    }
  }

  const { singular: typeLabel, plural: typeLabelPlural } = getTypeLabels()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            {getStatusText()}
          </DialogTitle>
          <DialogDescription>
            Results of your {typeLabelPlural} import
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{result.total}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.imported}</p>
              <p className="text-xs text-muted-foreground">Imported</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{result.skipped}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
          </div>

          {/* Error Details */}
          {hasErrors && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Errors</p>
                <Badge variant="destructive">{result.errors.length} issues</Badge>
              </div>
              <ScrollArea className="h-[200px] rounded-md border p-3">
                <div className="space-y-3">
                  {result.errors.map((error, idx) => (
                    <div key={idx} className="rounded-md bg-muted p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          Row {error.rowNumber}
                          {error.name && `: ${error.name}`}
                        </span>
                      </div>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {error.errors.map((err, errIdx) => (
                          <li key={errIdx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Success Message */}
          {allSuccessful && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
              <p className="text-sm text-green-800">
                All {result.imported} {result.imported === 1 ? typeLabel : typeLabelPlural} were
                successfully imported!
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
