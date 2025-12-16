'use client'

/**
 * Spreadsheet Upload Component
 *
 * Drag-and-drop file upload for keyword/search term CSV and XLSX files.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Upload, FileText, CheckCircle, XCircle, Loader2, Info } from 'lucide-react'

// Sentinel value for "no selection" in Select components
const EMPTY_VALUE = '__none__'

interface CsvSource {
  id: string
  name: string
  description: string
  requiredColumns: string[]
  optionalColumns: string[]
}

interface UploadResult {
  success: boolean
  syncLogId?: string
  totalRows: number
  recordsCreated: number
  recordsUpdated: number
  recordsFailed: number
  errors: Array<{ row: number; message: string }>
  hasMoreErrors?: boolean
}

interface PreviewResult {
  preview: boolean
  headers: string[]
  data: Record<string, string>[]
  totalRows: number
}

interface Brand {
  id: string
  name: string
}

interface CsvUploadProps {
  brands?: Brand[]
}

export function CsvUpload({ brands = [] }: CsvUploadProps) {
  const [sources, setSources] = useState<CsvSource[]>([])
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSources, setIsLoadingSources] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch supported sources on mount
  const fetchSources = useCallback(async () => {
    if (sources.length > 0) return

    setIsLoadingSources(true)
    try {
      const res = await fetch('/api/csv/upload')
      if (!res.ok) throw new Error('Failed to fetch sources')
      const data = await res.json()
      setSources(data.supportedSources || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load upload options')
    } finally {
      setIsLoadingSources(false)
    }
  }, [sources.length])

  // Fetch sources when component mounts
  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const isValidFileType = (filename: string): boolean => {
    const ext = filename.toLowerCase().split('.').pop()
    return ext === 'csv' || ext === 'xlsx' || ext === 'xls'
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && isValidFileType(droppedFile.name)) {
      setFile(droppedFile)
      setPreview(null)
      setResult(null)
      setError(null)
    } else {
      setError('Please upload a CSV or XLSX file')
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreview(null)
      setResult(null)
      setError(null)
    }
  }, [])

  const handlePreview = async () => {
    if (!file || !selectedSource) return

    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('source', selectedSource)
      formData.append('preview', 'true')

      const res = await fetch('/api/csv/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Preview failed')
      }

      setPreview(data as PreviewResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = async () => {
    if (!file || !selectedSource) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('source', selectedSource)
      if (selectedBrand) formData.append('brandId', selectedBrand)
      if (startDate) formData.append('startDate', startDate)
      if (endDate) formData.append('endDate', endDate)

      const res = await fetch('/api/csv/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setResult(data as UploadResult)
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const selectedSourceInfo = sources.find(s => s.id === selectedSource)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          CSV Upload
        </CardTitle>
        <CardDescription>
          Upload keyword and search term data (CSV or XLSX) from Amazon Ads, ZonGuru, or Helium10
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Selection */}
        <div className="space-y-2">
          <Label htmlFor="source">Data Source</Label>
          <Select
            value={selectedSource}
            onValueChange={(value) => {
              setSelectedSource(value)
              setPreview(null)
              setError(null)
            }}
            disabled={isLoadingSources}
          >
            <SelectTrigger id="source">
              <SelectValue placeholder="Select source type..." />
            </SelectTrigger>
            <SelectContent>
              {sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSourceInfo && (
            <p className="text-sm text-muted-foreground">
              {selectedSourceInfo.description}
            </p>
          )}
        </div>

        {/* Column Info */}
        {selectedSourceInfo && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Expected Columns</AlertTitle>
            <AlertDescription>
              <p className="text-sm">
                <strong>Required:</strong> {selectedSourceInfo.requiredColumns.join(', ')}
              </p>
              {selectedSourceInfo.optionalColumns.length > 0 && (
                <p className="text-sm mt-1">
                  <strong>Optional:</strong> {selectedSourceInfo.optionalColumns.join(', ')}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Optional: Brand and Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {brands.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="brand">Brand (Optional)</Label>
              <Select
                value={selectedBrand || EMPTY_VALUE}
                onValueChange={(value) => setSelectedBrand(value === EMPTY_VALUE ? '' : value)}
              >
                <SelectTrigger id="brand">
                  <SelectValue placeholder="Select brand..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_VALUE}>No brand</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date (Optional)</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">End Date (Optional)</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Drop Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : file
              ? 'border-green-500 bg-green-50 dark:bg-green-950'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-10 w-10 text-green-600" />
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <Button variant="outline" size="sm" onClick={resetForm}>
                Choose Different File
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Drag and drop your CSV or XLSX file here</p>
              <p className="text-sm text-muted-foreground">or</p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-2">
            <h4 className="font-medium">Preview ({preview.totalRows} total rows)</h4>
            <div className="border rounded-lg overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.data.map((row, i) => (
                    <tr key={i} className="border-t">
                      {preview.headers.map((header) => (
                        <td key={header} className="px-3 py-2 truncate max-w-xs">
                          {row[header] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <Alert variant={result.success ? 'default' : 'destructive'}>
            {result.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertTitle>
              {result.success ? 'Upload Complete' : 'Upload Completed with Errors'}
            </AlertTitle>
            <AlertDescription>
              <div className="space-y-1">
                <p>Total rows: {result.totalRows}</p>
                <p>Created: {result.recordsCreated}</p>
                <p>Updated: {result.recordsUpdated}</p>
                {result.recordsFailed > 0 && (
                  <p className="text-red-600">Failed: {result.recordsFailed}</p>
                )}
                {result.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium">Errors:</p>
                    <ul className="list-disc list-inside text-sm">
                      {result.errors.map((err, i) => (
                        <li key={i}>Row {err.row}: {err.message}</li>
                      ))}
                    </ul>
                    {result.hasMoreErrors && (
                      <p className="text-sm text-muted-foreground mt-1">
                        And more errors... Check sync logs for full details.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!file || !selectedSource || isLoading}
          >
            {isLoading && !result ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Preview
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || !selectedSource || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload & Process
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
