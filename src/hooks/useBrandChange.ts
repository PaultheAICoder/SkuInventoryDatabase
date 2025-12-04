'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook to detect brand changes and trigger a callback
 * Use this in client components that need to refetch data when brand changes
 */
export function useBrandChange(onBrandChange: () => void) {
  const { data: session } = useSession()
  const prevBrandId = useRef<string | null | undefined>(undefined)
  const stableCallback = useCallback(onBrandChange, [onBrandChange])

  useEffect(() => {
    const currentBrandId = session?.user?.selectedBrandId

    // Skip on initial mount
    if (prevBrandId.current === undefined) {
      prevBrandId.current = currentBrandId
      return
    }

    // Detect change
    if (currentBrandId !== prevBrandId.current) {
      prevBrandId.current = currentBrandId
      stableCallback()
    }
  }, [session?.user?.selectedBrandId, stableCallback])
}

/**
 * Hook to get the current selected brand ID
 * Returns undefined if session is not loaded, null if no brand selected
 */
export function useSelectedBrandId(): string | null | undefined {
  const { data: session } = useSession()
  return session?.user?.selectedBrandId
}
