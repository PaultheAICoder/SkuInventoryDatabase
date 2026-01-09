// Photo upload configuration
export interface PhotoUploadConfig {
  maxSizeBytes: number // 10MB default
  allowedTypes: string[] // ['image/jpeg', 'image/png', 'image/webp']
  maxDimension: number // Max width/height for compression
  thumbnailSize: number // Thumbnail dimension
}

export const DEFAULT_PHOTO_CONFIG: PhotoUploadConfig = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  maxDimension: 2048,
  thumbnailSize: 300,
}
