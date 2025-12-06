'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Building2, Tag, Check, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function CompanyBrandSelector() {
  const { data: session, update: updateSession } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)

  // Don't render if no session or companiesWithBrands
  if (!session?.user?.companiesWithBrands) {
    return null
  }

  const companiesWithBrands = session.user.companiesWithBrands

  // Don't render if user has only one company with zero or one brand
  if (companiesWithBrands.length === 0) {
    return null
  }
  if (companiesWithBrands.length === 1) {
    const singleCompany = companiesWithBrands[0]
    if (singleCompany.brands.length <= 1) {
      return null
    }
  }

  const handleBrandSelect = async (companyId: string, brandId: string, brandName: string) => {
    const isCompanySwitch = companyId !== session.user.selectedCompanyId
    const isBrandSwitch = brandId !== session.user.selectedBrandId

    // Skip if selecting the exact same selection
    if (!isCompanySwitch && !isBrandSwitch) {
      setOpen(false)
      return
    }

    setIsLoading(true)

    try {
      if (isCompanySwitch) {
        // Switching company - use company switch API which auto-selects first brand
        const companyRes = await fetch('/api/companies/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId }),
        })

        if (!companyRes.ok) {
          const data = await companyRes.json().catch(() => ({}))
          throw new Error(data?.error || 'Failed to switch company')
        }

        const companyData = await companyRes.json()

        // Update session with company change
        await updateSession({
          selectedCompanyId: companyData.data.selectedCompanyId,
          selectedCompanyName: companyData.data.selectedCompanyName,
          brands: companyData.data.brands,
          selectedBrandId: companyData.data.selectedBrandId,
          selectedBrandName: companyData.data.selectedBrandName,
        })

        // If user selected a specific brand different from the auto-selected first brand,
        // we need to switch to that brand
        if (brandId !== companyData.data.selectedBrandId) {
          const brandRes = await fetch('/api/brands/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId }),
          })

          if (!brandRes.ok) {
            const data = await brandRes.json().catch(() => ({}))
            throw new Error(data?.error || 'Failed to switch brand')
          }

          const brandData = await brandRes.json()

          await updateSession({
            selectedBrandId: brandData.data.selectedBrandId,
            selectedBrandName: brandData.data.selectedBrandName,
          })

          toast.success('Switched company and brand', {
            description: `${companyData.data.selectedCompanyName} / ${brandData.data.selectedBrandName}`,
          })
        } else {
          // Company switch only, with first brand auto-selected
          toast.success('Switched company', {
            description: `${companyData.data.selectedCompanyName} / ${companyData.data.selectedBrandName}`,
          })
        }

        // Refresh page to update server-rendered components
        router.refresh()
      } else {
        // Same company, just brand switch
        const res = await fetch('/api/brands/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || 'Failed to switch brand')
        }

        const data = await res.json()

        await updateSession({
          selectedBrandId: data.data.selectedBrandId,
          selectedBrandName: data.data.selectedBrandName,
        })

        toast.success('Switched brand', {
          description: brandName,
        })

        // Refresh page to update server-rendered components
        router.refresh()
      }
    } catch (error) {
      console.error('Error switching company/brand:', error)
      toast.error('Failed to switch', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setIsLoading(false)
      setOpen(false)
    }
  }

  const currentDisplay = `${session.user.selectedCompanyName} / ${session.user.selectedBrandName || 'No Brand'}`

  return (
    <div className="px-4 py-2 border-b">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between"
            disabled={isLoading}
          >
            <span className="flex items-center gap-2 truncate">
              {isLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Building2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate text-left">
                {currentDisplay}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          {companiesWithBrands.map((company) => (
            <DropdownMenuSub key={company.id}>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Building2 className="mr-2 h-4 w-4" />
                <span className="flex-1 truncate">{company.name}</span>
                {company.id === session.user.selectedCompanyId && (
                  <Check className="ml-2 h-4 w-4 shrink-0" />
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[180px]">
                {company.brands.map((brand) => (
                  <DropdownMenuItem
                    key={brand.id}
                    className="cursor-pointer"
                    onClick={() => handleBrandSelect(company.id, brand.id, brand.name)}
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    <span className="flex-1 truncate">{brand.name}</span>
                    {brand.id === session.user.selectedBrandId && (
                      <Check className="ml-2 h-4 w-4 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
