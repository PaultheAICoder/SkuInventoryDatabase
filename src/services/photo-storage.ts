import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'
import { DEFAULT_PHOTO_CONFIG, type PhotoUploadConfig } from '@/types/photo'

// Storage directory - relative to project root, served by Next.js from public/
const PHOTO_STORAGE_DIR = process.env.PHOTO_STORAGE_PATH || 'public/uploads/photos'

export interface UploadResult {
  filePath: string
  storageType: string
  fileSize: number
  mimeType: string
}

/**
 * Check if local storage is available (always true for local filesystem)
 */
export function isStorageConfigured(): boolean {
  return true
}

// Backward compatible alias
export { isStorageConfigured as isS3Configured }

/**
 * Validates image file
 */
export function validateImageFile(
  file: { size: number; type: string; name: string },
  config: PhotoUploadConfig = DEFAULT_PHOTO_CONFIG
): { valid: boolean; error?: string } {
  if (file.size > config.maxSizeBytes) {
    return {
      valid: false,
      error: `File too large. Maximum ${config.maxSizeBytes / 1024 / 1024}MB allowed.`,
    }
  }
  if (!config.allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${config.allowedTypes.join(', ')}`,
    }
  }
  return { valid: true }
}

/**
 * Compress and resize image using sharp
 */
export async function processImage(
  buffer: Buffer,
  config: PhotoUploadConfig = DEFAULT_PHOTO_CONFIG
): Promise<{ main: Buffer; thumbnail: Buffer; mimeType: string }> {
  const image = sharp(buffer)
  const metadata = await image.metadata()

  // Resize main image if too large
  let mainImage = image.clone()
  if (metadata.width && metadata.width > config.maxDimension) {
    mainImage = mainImage.resize(config.maxDimension, undefined, {
      withoutEnlargement: true,
    })
  }
  if (metadata.height && metadata.height > config.maxDimension) {
    mainImage = mainImage.resize(undefined, config.maxDimension, {
      withoutEnlargement: true,
    })
  }

  // Convert to webp for efficiency, maintain quality
  const main = await mainImage.webp({ quality: 85 }).toBuffer()

  // Create thumbnail
  const thumbnail = await sharp(buffer)
    .resize(config.thumbnailSize, config.thumbnailSize, { fit: 'cover' })
    .webp({ quality: 75 })
    .toBuffer()

  return { main, thumbnail, mimeType: 'image/webp' }
}

/**
 * Save image to local filesystem
 */
export async function saveToLocal(
  buffer: Buffer,
  filePath: string
): Promise<void> {
  const fullPath = path.join(process.cwd(), PHOTO_STORAGE_DIR, filePath)
  const dir = path.dirname(fullPath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(fullPath, buffer)
}

// Backward compatible alias - API routes call uploadToS3
export { saveToLocal as uploadToS3 }

/**
 * Generate static URL for local photo
 * Returns a path that Next.js can serve from public/
 */
export function getPhotoUrl(filePath: string): string {
  // The filePath is relative to PHOTO_STORAGE_DIR (public/uploads/photos)
  // We need to return a URL path starting with /uploads/photos
  return `/uploads/photos/${filePath}`
}

// Backward compatible alias - API routes call getSignedPhotoUrl
export { getPhotoUrl as getSignedPhotoUrl }

/**
 * Delete photo from local filesystem
 */
export async function deleteLocal(filePath: string): Promise<void> {
  try {
    const fullPath = path.join(process.cwd(), PHOTO_STORAGE_DIR, filePath)
    await fs.unlink(fullPath)
  } catch (err) {
    // Ignore errors if file doesn't exist (ENOENT)
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }
}

// Backward compatible alias - API routes call deleteFromS3
export { deleteLocal as deleteFromS3 }

/**
 * Generate file path for transaction photo
 */
export function generateFilePath(
  companyId: string,
  transactionId: string,
  filename: string,
  type: 'main' | 'thumbnail' = 'main'
): string {
  const timestamp = Date.now()
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  const baseName = sanitizedFilename.replace(/\.[^.]+$/, '')

  if (type === 'thumbnail') {
    return `${companyId}/${transactionId}/thumb_${timestamp}_${baseName}.webp`
  }
  return `${companyId}/${transactionId}/${timestamp}_${baseName}.webp`
}

// Backward compatible alias - API routes call generateS3Key
export { generateFilePath as generateS3Key }
