'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook to detect company changes and trigger a callback
 * Use this in client components that need to refetch data when company changes
 */
export function useCompanyChange(onCompanyChange: () => void) {
  const { data: session } = useSession()
  const prevCompanyId = useRef<string | undefined>(undefined)
  const stableCallback = useCallback(onCompanyChange, [onCompanyChange])

  useEffect(() => {
    const currentCompanyId = session?.user?.selectedCompanyId

    // Skip on initial mount
    if (prevCompanyId.current === undefined) {
      prevCompanyId.current = currentCompanyId
      return
    }

    // Detect change
    if (currentCompanyId !== prevCompanyId.current) {
      prevCompanyId.current = currentCompanyId
      stableCallback()
    }
  }, [session?.user?.selectedCompanyId, stableCallback])
}

/**
 * Hook to get the current selected company ID
 * Returns undefined if session is not loaded yet
 */
export function useSelectedCompanyId(): string | undefined {
  const { data: session } = useSession()
  return session?.user?.selectedCompanyId
}
