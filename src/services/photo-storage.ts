import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import { DEFAULT_PHOTO_CONFIG, type PhotoUploadConfig } from '@/types/photo'

// Lazy initialization for S3 client to avoid errors when env vars are not set
let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: process.env.PHOTO_S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    })
  }
  return _s3Client
}

const getBucket = () => process.env.PHOTO_S3_BUCKET || 'trevor-inventory-photos'

export interface UploadResult {
  s3Key: string
  s3Bucket: string
  fileSize: number
  mimeType: string
}

/**
 * Check if S3 is properly configured
 */
export function isS3Configured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.PHOTO_S3_BUCKET
  )
}

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
 * Upload image to S3
 */
export async function uploadToS3(
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<void> {
  const s3Client = getS3Client()
  await s3Client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  )
}

/**
 * Generate signed URL for private S3 object
 */
export async function getSignedPhotoUrl(
  s3Key: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const s3Client = getS3Client()
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: s3Key,
  })
  return getSignedUrl(s3Client, command, { expiresIn })
}

/**
 * Delete photo from S3
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  const s3Client = getS3Client()
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: s3Key,
    })
  )
}

/**
 * Generate S3 key path for transaction photo
 */
export function generateS3Key(
  companyId: string,
  transactionId: string,
  filename: string,
  type: 'main' | 'thumbnail' = 'main'
): string {
  const timestamp = Date.now()
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  const baseName = sanitizedFilename.replace(/\.[^.]+$/, '')

  if (type === 'thumbnail') {
    return `photos/${companyId}/${transactionId}/thumb_${timestamp}_${baseName}.webp`
  }
  return `photos/${companyId}/${transactionId}/${timestamp}_${baseName}.webp`
}
