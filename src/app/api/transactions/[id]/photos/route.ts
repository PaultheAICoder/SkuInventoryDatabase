import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error, unauthorized, notFound, created, success } from '@/lib/api-response'
import {
  validateImageFile,
  processImage,
  uploadToS3,
  generateS3Key,
  getSignedPhotoUrl,
  isS3Configured,
} from '@/services/photo-storage'
import { DEFAULT_PHOTO_CONFIG } from '@/types/photo'

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/transactions/[id]/photos - Upload photo(s) to transaction
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return unauthorized()
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Viewers cannot upload photos')
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected', 400)
    }

    // Check S3 configuration
    if (!isS3Configured()) {
      return error(
        'Photo storage is not configured. Please contact your administrator to set up AWS S3.',
        503
      )
    }

    const { id: transactionId } = await params

    // Verify transaction exists and belongs to company
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        companyId: selectedCompanyId,
        deletedAt: null,
      },
    })

    if (!transaction) {
      return notFound('Transaction')
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const caption = formData.get('caption') as string | null

    if (!file) {
      return error('No file provided', 400)
    }

    // Validate file
    const validation = validateImageFile({
      size: file.size,
      type: file.type,
      name: file.name,
    })

    if (!validation.valid) {
      return error(validation.error!, 400)
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Process image (compress, create thumbnail)
    const processed = await processImage(buffer, DEFAULT_PHOTO_CONFIG)

    // Generate S3 keys
    const mainKey = generateS3Key(selectedCompanyId, transactionId, file.name, 'main')
    const thumbKey = generateS3Key(selectedCompanyId, transactionId, file.name, 'thumbnail')

    // Upload to S3
    await Promise.all([
      uploadToS3(processed.main, mainKey, processed.mimeType),
      uploadToS3(processed.thumbnail, thumbKey, processed.mimeType),
    ])

    // Get current max sort order
    const maxOrder = await prisma.transactionPhoto.aggregate({
      where: { transactionId },
      _max: { sortOrder: true },
    })

    // Create database record
    const photo = await prisma.transactionPhoto.create({
      data: {
        transactionId,
        s3Key: mainKey,
        s3Bucket: process.env.PHOTO_S3_BUCKET!,
        filename: file.name,
        mimeType: processed.mimeType,
        fileSize: processed.main.length,
        caption: caption || null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        uploadedById: session.user.id,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    })

    // Generate signed URLs
    const [url, thumbnailUrl] = await Promise.all([
      getSignedPhotoUrl(mainKey),
      getSignedPhotoUrl(thumbKey),
    ])

    return created({
      data: {
        id: photo.id,
        transactionId: photo.transactionId,
        filename: photo.filename,
        mimeType: photo.mimeType,
        fileSize: photo.fileSize,
        caption: photo.caption,
        sortOrder: photo.sortOrder,
        uploadedAt: photo.uploadedAt.toISOString(),
        uploadedBy: photo.uploadedBy,
        url,
        thumbnailUrl,
      },
    })
  } catch (err) {
    console.error('Photo upload error:', err)
    return error('Failed to upload photo', 500)
  }
}

// GET /api/transactions/[id]/photos - List photos for transaction
export async function GET(request: NextRequest, { params }: RouteParams) {
  // Mark request as used to avoid unused parameter warning
  void request

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return unauthorized()
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected', 400)
    }

    const { id: transactionId } = await params

    // Verify transaction exists and belongs to company
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        companyId: selectedCompanyId,
        deletedAt: null,
      },
    })

    if (!transaction) {
      return notFound('Transaction')
    }

    const photos = await prisma.transactionPhoto.findMany({
      where: { transactionId },
      orderBy: { sortOrder: 'asc' },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    })

    // Generate signed URLs for all photos (if S3 configured)
    if (!isS3Configured()) {
      // Return photos without URLs if S3 not configured
      return success({
        data: photos.map((photo) => ({
          id: photo.id,
          transactionId: photo.transactionId,
          filename: photo.filename,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
          caption: photo.caption,
          sortOrder: photo.sortOrder,
          uploadedAt: photo.uploadedAt.toISOString(),
          uploadedBy: photo.uploadedBy,
          url: '',
          thumbnailUrl: '',
        })),
      })
    }

    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        const thumbKey = photo.s3Key.replace(/\/(\d+_)/, '/thumb_$1')
        const [url, thumbnailUrl] = await Promise.all([
          getSignedPhotoUrl(photo.s3Key),
          getSignedPhotoUrl(thumbKey),
        ])
        return {
          id: photo.id,
          transactionId: photo.transactionId,
          filename: photo.filename,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
          caption: photo.caption,
          sortOrder: photo.sortOrder,
          uploadedAt: photo.uploadedAt.toISOString(),
          uploadedBy: photo.uploadedBy,
          url,
          thumbnailUrl,
        }
      })
    )

    return success({ data: photosWithUrls })
  } catch (err) {
    console.error('Photo list error:', err)
    return error('Failed to list photos', 500)
  }
}
