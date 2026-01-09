'use client'

import { useState } from 'react'
import { X, Trash2, ZoomIn, Loader2, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { TransactionPhotoResponse } from '@/types/transaction'

interface TransactionPhotoGalleryProps {
  photos: TransactionPhotoResponse[]
  canDelete?: boolean
  onDelete?: (photoId: string) => void
  loading?: boolean
}

export function TransactionPhotoGallery({
  photos,
  canDelete = false,
  onDelete,
  loading = false,
}: TransactionPhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<TransactionPhotoResponse | null>(null)
  const [deletePhoto, setDeletePhoto] = useState<TransactionPhotoResponse | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deletePhoto || !onDelete) return

    setDeleting(true)
    try {
      await onDelete(deletePhoto.id)
      setDeletePhoto(null)
    } finally {
      setDeleting(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <ImageOff className="h-12 w-12 mb-2" />
        <p className="text-sm">No photos attached to this transaction</p>
      </div>
    )
  }

  return (
    <>
      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
          >
            {photo.thumbnailUrl ? (
              <img
                src={photo.thumbnailUrl}
                alt={photo.caption || photo.filename}
                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                onClick={() => setSelectedPhoto(photo)}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center cursor-pointer"
                onClick={() => setSelectedPhoto(photo)}
              >
                <ImageOff className="h-8 w-8 text-muted-foreground" />
              </div>
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none" />

            {/* Action Buttons */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7"
                onClick={() => setSelectedPhoto(photo)}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={() => setDeletePhoto(photo)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Caption */}
            {photo.caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                <p className="text-xs text-white truncate">{photo.caption}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
        <DialogContent className="max-w-4xl p-0">
          <DialogTitle className="sr-only">
            {selectedPhoto?.caption || selectedPhoto?.filename || 'Photo'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            View full-size photo
          </DialogDescription>
          {selectedPhoto && (
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => setSelectedPhoto(null)}
              >
                <X className="h-5 w-5" />
              </Button>

              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.caption || selectedPhoto.filename}
                className="w-full h-auto max-h-[80vh] object-contain"
              />

              <div className="p-4 bg-background">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{selectedPhoto.filename}</h3>
                    {selectedPhoto.caption && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedPhoto.caption}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{formatFileSize(selectedPhoto.fileSize)}</p>
                    <p suppressHydrationWarning>
                      {new Date(selectedPhoto.uploadedAt).toLocaleDateString()}
                    </p>
                    <p>by {selectedPhoto.uploadedBy.name}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletePhoto} onOpenChange={(open) => !open && setDeletePhoto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletePhoto?.filename}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
