'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, Download, FileSpreadsheet, Loader2 } from 'lucide-react'

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

interface ImportFormProps {
  /**
   * Type of import (components or skus)
   */
  importType: 'components' | 'skus'
  /**
   * Title for the import card
   */
  title: string
  /**
   * Description for the import card
   */
  description: string
  /**
   * Callback when import completes
   */
  onImportComplete: (result: ImportResult) => void
}

export function ImportForm({
  importType,
  title,
  description,
  onImportComplete,
}: ImportFormProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    setUploadError(null)
  }

  const handleDownloadTemplate = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch(`/api/import/template/${importType}`)
      if (!response.ok) {
        throw new Error('Failed to download template')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${importType}-import-template.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
      setUploadError('Failed to download template. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setUploadError('Please select a file first')
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Please select a CSV file')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/import/${importType}`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message || 'Import failed')
      }

      const result = await response.json()
      onImportComplete(result.data)

      // Reset form
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError(error instanceof Error ? error.message : 'Import failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Download Template Section */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Download Template</p>
            <p className="text-xs text-muted-foreground">
              Get a CSV template with the correct column headers
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Template
          </Button>
        </div>

        {/* File Upload Section */}
        <div className="space-y-2">
          <Label htmlFor={`file-${importType}`}>Upload CSV File</Label>
          <div className="flex gap-2">
            <Input
              id={`file-${importType}`}
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="flex-1"
            />
          </div>
          {file && (
            <p className="text-xs text-muted-foreground">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {/* Error Message */}
        {uploadError && (
          <p className="text-sm text-destructive">{uploadError}</p>
        )}

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Import {title}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
