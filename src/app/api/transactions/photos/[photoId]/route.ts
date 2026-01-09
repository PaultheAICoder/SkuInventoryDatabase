import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error, unauthorized, notFound, success } from '@/lib/api-response'
import { deleteFromS3 } from '@/services/photo-storage'

interface RouteParams {
  params: Promise<{ photoId: string }>
}

// DELETE /api/transactions/photos/[photoId] - Delete a photo
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Mark request as used to avoid unused parameter warning
  void request

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return unauthorized()
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Viewers cannot delete photos')
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected', 400)
    }

    const { photoId } = await params

    // Find the photo and verify it belongs to a transaction in the user's company
    const photo = await prisma.transactionPhoto.findUnique({
      where: { id: photoId },
      include: {
        transaction: {
          select: { companyId: true },
        },
      },
    })

    if (!photo) {
      return notFound('Photo')
    }

    if (photo.transaction.companyId !== selectedCompanyId) {
      return notFound('Photo')
    }

    // Delete from local storage
    try {
      // Delete main image
      await deleteFromS3(photo.s3Key)
      // Delete thumbnail (derive key from main key)
      const thumbKey = photo.s3Key.replace(/\/(\d+_)/, '/thumb_$1')
      await deleteFromS3(thumbKey)
    } catch (storageError) {
      console.error('Storage delete error:', storageError)
      // Continue with database deletion even if storage delete fails
    }

    // Delete from database
    await prisma.transactionPhoto.delete({
      where: { id: photoId },
    })

    return success({ message: 'Photo deleted successfully' })
  } catch (err) {
    console.error('Photo delete error:', err)
    return error('Failed to delete photo', 500)
  }
}

// PATCH /api/transactions/photos/[photoId] - Update photo caption or sort order
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return unauthorized()
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Viewers cannot update photos')
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected', 400)
    }

    const { photoId } = await params
    const body = await request.json()

    // Find the photo and verify it belongs to a transaction in the user's company
    const photo = await prisma.transactionPhoto.findUnique({
      where: { id: photoId },
      include: {
        transaction: {
          select: { companyId: true },
        },
      },
    })

    if (!photo) {
      return notFound('Photo')
    }

    if (photo.transaction.companyId !== selectedCompanyId) {
      return notFound('Photo')
    }

    // Build update data
    const updateData: { caption?: string | null; sortOrder?: number } = {}

    if ('caption' in body) {
      updateData.caption = body.caption || null
    }

    if ('sortOrder' in body && typeof body.sortOrder === 'number') {
      updateData.sortOrder = body.sortOrder
    }

    if (Object.keys(updateData).length === 0) {
      return error('No valid fields to update', 400)
    }

    const updated = await prisma.transactionPhoto.update({
      where: { id: photoId },
      data: updateData,
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    })

    return success({
      data: {
        id: updated.id,
        transactionId: updated.transactionId,
        filename: updated.filename,
        mimeType: updated.mimeType,
        fileSize: updated.fileSize,
        caption: updated.caption,
        sortOrder: updated.sortOrder,
        uploadedAt: updated.uploadedAt.toISOString(),
        uploadedBy: updated.uploadedBy,
      },
    })
  } catch (err) {
    console.error('Photo update error:', err)
    return error('Failed to update photo', 500)
  }
}
