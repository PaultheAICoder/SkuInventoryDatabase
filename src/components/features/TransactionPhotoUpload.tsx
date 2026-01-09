'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TransactionPhotoResponse } from '@/types/transaction'

interface TransactionPhotoUploadProps {
  transactionId: string
  onUploadComplete?: (photo: TransactionPhotoResponse) => void
  onError?: (error: string) => void
  disabled?: boolean
}

interface FilePreview {
  file: File
  preview: string
  caption: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export function TransactionPhotoUpload({
  transactionId,
  onUploadComplete,
  onError,
  disabled = false,
}: TransactionPhotoUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<FilePreview[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" is too large. Maximum size is 10MB.`
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `File "${file.name}" has an invalid type. Allowed: JPEG, PNG, WebP, HEIC.`
    }
    return null
  }

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const validFiles: FilePreview[] = []

      for (const file of fileArray) {
        const error = validateFile(file)
        if (error) {
          onError?.(error)
          continue
        }

        // Create preview URL
        const preview = URL.createObjectURL(file)
        validFiles.push({ file, preview, caption: '' })
      }

      setSelectedFiles((prev) => [...prev, ...validFiles])
    },
    [onError]
  )

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files)
      }
    },
    [handleFiles]
  )

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => {
      const updated = [...prev]
      URL.revokeObjectURL(updated[index].preview)
      updated.splice(index, 1)
      return updated
    })
  }, [])

  const updateCaption = useCallback((index: number, caption: string) => {
    setSelectedFiles((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], caption }
      return updated
    })
  }, [])

  const uploadFiles = async () => {
    if (selectedFiles.length === 0 || uploading) return

    setUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const { file, caption } = selectedFiles[i]

        const formData = new FormData()
        formData.append('file', file)
        if (caption) {
          formData.append('caption', caption)
        }

        const response = await fetch(`/api/transactions/${transactionId}/photos`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.message || `Failed to upload ${file.name}`)
        }

        const result = await response.json()
        onUploadComplete?.(result.data)

        // Update progress
        setUploadProgress(((i + 1) / selectedFiles.length) * 100)
      }

      // Clear selected files after successful upload
      selectedFiles.forEach((f) => URL.revokeObjectURL(f.preview))
      setSelectedFiles([])
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to upload photos')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={disabled ? undefined : openFileDialog}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
        />

        <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">
          {dragActive ? 'Drop photos here' : 'Click or drag photos to upload'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPEG, PNG, WebP, or HEIC. Max 10MB per file.
        </p>
      </div>

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <Label>Selected Photos ({selectedFiles.length})</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {selectedFiles.map((item, index) => (
              <div key={index} className="relative group">
                <img
                  src={item.preview}
                  alt={`Preview ${index + 1}`}
                  className="w-full aspect-square object-cover rounded-lg border"
                />
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </button>
                <Input
                  placeholder="Caption (optional)"
                  value={item.caption}
                  onChange={(e) => updateCaption(index, e.target.value)}
                  disabled={uploading}
                  className="mt-2 text-xs"
                />
              </div>
            ))}
          </div>

          {/* Upload Button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={uploadFiles}
              disabled={uploading || disabled || selectedFiles.length === 0}
              className="flex-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading... {Math.round(uploadProgress)}%
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {selectedFiles.length} Photo{selectedFiles.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                selectedFiles.forEach((f) => URL.revokeObjectURL(f.preview))
                setSelectedFiles([])
              }}
              disabled={uploading}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
