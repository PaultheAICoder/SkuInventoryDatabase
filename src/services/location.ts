import { prisma } from '@/lib/db'

/**
 * Ensure a company has at least one default location.
 * If no locations exist, create "Main Warehouse" as default.
 * If locations exist but none is default, make the first one default.
 */
export async function ensureDefaultLocation(companyId: string): Promise<void> {
  const existingLocations = await prisma.location.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
  })

  if (existingLocations.length === 0) {
    // Create default warehouse
    await prisma.location.create({
      data: {
        companyId,
        name: 'Main Warehouse',
        type: 'warehouse',
        isDefault: true,
        isActive: true,
      },
    })
  } else {
    // Check if any location is default
    const hasDefault = existingLocations.some((loc) => loc.isDefault)
    if (!hasDefault) {
      // Make the first location the default
      await prisma.location.update({
        where: { id: existingLocations[0].id },
        data: { isDefault: true },
      })
    }
  }
}

/**
 * When setting a location as default, unset any other defaults for the company
 */
export async function setDefaultLocation(
  companyId: string,
  locationId: string
): Promise<void> {
  await prisma.$transaction([
    // Unset all defaults for this company
    prisma.location.updateMany({
      where: { companyId, isDefault: true },
      data: { isDefault: false },
    }),
    // Set the new default
    prisma.location.update({
      where: { id: locationId },
      data: { isDefault: true },
    }),
  ])
}

/**
 * Check if a location can be deactivated
 * (cannot deactivate if it's the default location)
 */
export async function canDeactivateLocation(
  companyId: string,
  locationId: string
): Promise<{ canDeactivate: boolean; reason?: string }> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
  })

  if (location?.isDefault) {
    return {
      canDeactivate: false,
      reason: 'Cannot deactivate the default location',
    }
  }

  return { canDeactivate: true }
}

/**
 * Check if a location can be deleted
 * Future: will check for inventory at this location
 */
export async function canDeleteLocation(
  locationId: string
): Promise<{ canDelete: boolean; reason?: string }> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
  })

  if (location?.isDefault) {
    return {
      canDelete: false,
      reason: 'Cannot delete the default location',
    }
  }

  // For Phase 1, locations can be deleted (soft delete via isActive)
  // Future phases will check for inventory at this location
  return { canDelete: true }
}

/**
 * Get the default location for a company
 */
export async function getDefaultLocation(companyId: string) {
  return prisma.location.findFirst({
    where: {
      companyId,
      isDefault: true,
      isActive: true,
    },
  })
}

/**
 * Get the default location ID for a company
 * Returns null if no default location exists
 */
export async function getDefaultLocationId(companyId: string): Promise<string | null> {
  const location = await getDefaultLocation(companyId)
  return location?.id ?? null
}
