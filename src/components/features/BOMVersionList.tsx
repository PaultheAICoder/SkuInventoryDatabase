'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, CheckCircle, ChevronDown, ChevronRight, Edit } from 'lucide-react'
import type { BOMVersionResponse } from '@/types/bom'

interface BOMVersionListProps {
  versions: BOMVersionResponse[]
  skuId: string
  onRefresh: () => void
}

export function BOMVersionList({ versions, skuId, onRefresh }: BOMVersionListProps) {
  const router = useRouter()
  const [expandedVersion, setExpandedVersion] = useState<string | null>(
    versions.find((v) => v.isActive)?.id ?? null
  )
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [cloneVersionId, setCloneVersionId] = useState<string | null>(null)
  const [cloneVersionName, setCloneVersionName] = useState('')
  const [isCloning, setIsCloning] = useState(false)
  const [isActivating, setIsActivating] = useState<string | null>(null)

  const toggleExpand = (versionId: string) => {
    setExpandedVersion((prev) => (prev === versionId ? null : versionId))
  }

  const openCloneDialog = (versionId: string, currentName: string) => {
    setCloneVersionId(versionId)
    setCloneVersionName(`${currentName}-copy`)
    setCloneDialogOpen(true)
  }

  const handleClone = async () => {
    if (!cloneVersionId || !cloneVersionName) return

    setIsCloning(true)
    try {
      const res = await fetch(`/api/bom-versions/${cloneVersionId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionName: cloneVersionName }),
      })

      if (res.ok) {
        setCloneDialogOpen(false)
        onRefresh()
      }
    } catch (err) {
      console.error('Failed to clone BOM version:', err)
    } finally {
      setIsCloning(false)
    }
  }

  const handleActivate = async (versionId: string) => {
    setIsActivating(versionId)
    try {
      const res = await fetch(`/api/bom-versions/${versionId}/activate`, {
        method: 'POST',
      })

      if (res.ok) {
        onRefresh()
      }
    } catch (err) {
      console.error('Failed to activate BOM version:', err)
    } finally {
      setIsActivating(null)
    }
  }

  if (versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>BOM Versions</CardTitle>
          <CardDescription>No BOM versions created yet</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push(`/skus/${skuId}/bom/new`)}>
            Create First BOM Version
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>BOM Versions</CardTitle>
            <CardDescription>
              {versions.length} version{versions.length !== 1 ? 's' : ''}
            </CardDescription>
          </div>
          <Button onClick={() => router.push(`/skus/${skuId}/bom/new`)}>
            New Version
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {versions.map((version) => (
            <div key={version.id} className="border rounded-lg">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                onClick={() => toggleExpand(version.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedVersion === version.id ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{version.versionName}</span>
                      {version.isActive && (
                        <Badge variant="success">Active</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Effective: {version.effectiveStartDate}
                      {version.effectiveEndDate && ` - ${version.effectiveEndDate}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono">${parseFloat(version.unitCost).toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">
                      {version.lines.length} component{version.lines.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/skus/${skuId}/bom/${version.id}/edit`)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCloneDialog(version.id, version.versionName)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {!version.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleActivate(version.id)}
                        disabled={isActivating === version.id}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {isActivating === version.id ? 'Activating...' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {expandedVersion === version.id && (
                <div className="border-t p-4">
                  {version.notes && (
                    <p className="text-sm text-muted-foreground mb-4">{version.notes}</p>
                  )}
                  {version.defectNotes && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm font-medium text-yellow-800">Defect Notes</p>
                      <p className="text-sm text-yellow-700">{version.defectNotes}</p>
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead className="text-right">Qty/Unit</TableHead>
                        <TableHead className="text-right">Cost/Unit</TableHead>
                        <TableHead className="text-right">Line Cost</TableHead>
                        <TableHead className="text-right">On Hand</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {version.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div className="font-medium">{line.component.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {line.component.skuCode}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono" suppressHydrationWarning>
                            {parseFloat(line.quantityPerUnit).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${parseFloat(line.component.costPerUnit).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${parseFloat(line.lineCost).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono" suppressHydrationWarning>
                            {line.component.quantityOnHand?.toLocaleString() ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={3} className="text-right font-medium">
                          Total Unit Cost:
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ${parseFloat(version.unitCost).toFixed(4)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Clone Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone BOM Version</DialogTitle>
            <DialogDescription>
              Create a copy of this BOM version with a new name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cloneName">New Version Name</Label>
              <Input
                id="cloneName"
                value={cloneVersionName}
                onChange={(e) => setCloneVersionName(e.target.value)}
                placeholder="e.g., v2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClone} disabled={isCloning || !cloneVersionName}>
              {isCloning ? 'Cloning...' : 'Clone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
