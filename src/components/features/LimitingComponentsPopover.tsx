'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import type { LimitingComponent } from '@/types/sku'

interface LimitingComponentsPopoverProps {
  skuId: string
  maxBuildableUnits: number
  children: React.ReactNode
  locationId?: string
}

export function LimitingComponentsPopover({
  skuId,
  maxBuildableUnits,
  children,
  locationId,
}: LimitingComponentsPopoverProps) {
  const [open, setOpen] = useState(false)
  const [limitingComponents, setLimitingComponents] = useState<LimitingComponent[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && !limitingComponents && !isLoading) {
      const fetchLimitingFactors = async () => {
        setIsLoading(true)
        setError(null)
        try {
          let url = `/api/skus/${skuId}/limiting-factors`
          if (locationId) {
            url += `?locationId=${locationId}`
          }
          const res = await fetch(url)
          if (!res.ok) {
            throw new Error('Failed to load limiting factors')
          }
          const data = await res.json()
          setLimitingComponents(data.data)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load')
        } finally {
          setIsLoading(false)
        }
      }
      fetchLimitingFactors()
    }
  }, [open, skuId, locationId, limitingComponents, isLoading])

  // Reset data when popover closes (for fresh data on reopen)
  useEffect(() => {
    if (!open) {
      setLimitingComponents(null)
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">Limiting Components</h4>
            <p className="text-xs text-muted-foreground">
              Top 3 components limiting max buildable ({maxBuildableUnits.toLocaleString()} units)
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : limitingComponents && limitingComponents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Component</TableHead>
                  <TableHead className="text-right text-xs">On Hand</TableHead>
                  <TableHead className="text-right text-xs">Per Unit</TableHead>
                  <TableHead className="text-right text-xs">Max Build</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {limitingComponents.map((component) => (
                  <TableRow key={component.componentId}>
                    <TableCell className="py-2">
                      <Link
                        href={`/components/${component.componentId}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {component.componentName}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">
                        {component.skuCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2" suppressHydrationWarning>
                      {component.quantityOnHand.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2" suppressHydrationWarning>
                      {component.quantityPerUnit.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <span
                        className={`font-mono text-sm ${
                          component.rank === 1 ? 'text-red-600 font-semibold' : ''
                        }`}
                        suppressHydrationWarning
                      >
                        {component.maxBuildable.toLocaleString()}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No BOM data available</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
