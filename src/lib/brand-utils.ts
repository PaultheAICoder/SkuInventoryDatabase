/**
 * Brand utility functions for frontend use
 */

/**
 * Fetch the default location ID for a given brand
 * @param brandId - The brand ID to fetch default location for
 * @returns The default location ID, or null if none set or on error
 */
export async function fetchBrandDefaultLocation(brandId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/brands/${brandId}`)
    if (!res.ok) return null
    const data = await res.json()
    return data?.data?.defaultLocationId ?? null
  } catch {
    return null
  }
}
