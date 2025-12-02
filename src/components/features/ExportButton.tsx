'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ExportButtonProps {
  /**
   * The type of data to export
   */
  exportType: 'components' | 'skus' | 'transactions'
  /**
   * Optional query parameters to pass to the export endpoint
   */
  queryParams?: Record<string, string>
  /**
   * Button variant
   */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  /**
   * Button size
   */
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /**
   * Custom button text (defaults to "Export CSV")
   */
  label?: string
  /**
   * Additional class names
   */
  className?: string
}

export function ExportButton({
  exportType,
  queryParams,
  variant = 'outline',
  size = 'default',
  label = 'Export CSV',
  className,
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)

    try {
      // Build URL with query params
      const url = new URL(`/api/export/${exportType}`, window.location.origin)
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value) {
            url.searchParams.set(key, value)
          }
        })
      }

      const response = await fetch(url.toString())

      if (!response.ok) {
        throw new Error('Export failed')
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `${exportType}-export.csv`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) {
          filename = match[1]
        }
      }

      // Create blob and download
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
      toast.success('Export complete', {
        description: `Your ${exportType} data has been downloaded.`,
      })
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Export failed', {
        description: 'Please try again.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={isExporting}
      className={className}
    >
      {isExporting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  )
}
