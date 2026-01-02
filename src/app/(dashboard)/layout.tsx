'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BuildFooter } from '@/components/ui/BuildFooter'
import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  Upload,
  BarChart3,
  Settings,
  Users,
  MapPin,
  LogOut,
  Menu,
  X,
  Layers,
  Building2,
  TrendingDown,
  Tag,
  FolderTree,
  Plug,
  Activity,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Store,
  Link2,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { FeedbackButton } from '@/components/features/FeedbackButton'
import { FeedbackDialog } from '@/components/features/FeedbackDialog'
import { ChatbotButton } from '@/components/features/ChatbotButton'
import { ChatbotPanel } from '@/components/features/ChatbotPanel'
import { CompanyBrandSelector } from '@/components/features/CompanyBrandSelector'
import { NotificationBanner } from '@/components/notifications/notification-banner'

// Main navigation items
const mainNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Components', href: '/components', icon: Package },
  { name: 'SKUs', href: '/skus', icon: Boxes },
  { name: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { name: 'Lots', href: '/lots', icon: Layers },
  { name: 'Analytics', href: '/analytics/defects', icon: BarChart3 },
  { name: 'Forecasts', href: '/forecasts', icon: TrendingDown },
  { name: 'Shopify', href: '/shopify/orders', icon: ShoppingCart, adminOnly: true },
  { name: 'SKU Mappings', href: '/shopify/mappings', icon: Link2, adminOnly: true },
  { name: 'Amazon', href: '/amazon', icon: Store, adminOnly: true },
]

// Settings sub-navigation items
const settingsNavigation = [
  { name: 'General', href: '/settings', icon: Settings },
  { name: 'Import', href: '/import', icon: Upload },
  { name: 'Users', href: '/settings/users', icon: Users },
  { name: 'Locations', href: '/settings/locations', icon: MapPin },
  { name: 'Brands', href: '/settings/brands', icon: Tag },
  { name: 'Categories', href: '/settings/categories', icon: FolderTree },
  { name: 'Companies', href: '/settings/companies', icon: Building2 },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Docker Health', href: '/admin/docker-health', icon: Activity },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [chatbotOpen, setChatbotOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Settings menu should be visible if user is admin in ANY company (cross-company feature)
  const isAdminInAnyCompany = session?.user?.companies?.some(c => c.role === 'admin') ?? false

  // Auto-expand settings if current path is in settings
  useEffect(() => {
    const isSettingsPath = settingsNavigation.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    )
    if (isSettingsPath) {
      setSettingsOpen(true)
    }
  }, [pathname])

  // Show minimal layout while session is loading
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  const filteredMainNavigation = mainNavigation.filter(
    (item) => !item.adminOnly || isAdminInAnyCompany
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-card border-r transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Link href="/" className="text-lg font-semibold">
            Inventory Tracker
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <CompanyBrandSelector />

        <nav className="flex flex-col gap-1 p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {/* Main navigation items */}
          {filteredMainNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}

          {/* Settings section (admin only) */}
          {isAdminInAnyCompany && (
            <>
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full text-left',
                  settingsOpen
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5" />
                  Settings
                </div>
                {settingsOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {settingsOpen && (
                <div className="ml-4 flex flex-col gap-1 border-l pl-2">
                  {settingsNavigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t p-4">
          <div className="mb-2 text-sm">
            <p className="font-medium">{session?.user?.name}</p>
            <p className="text-muted-foreground capitalize">{session?.user?.role}</p>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header - visible on all devices */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold lg:hidden">Inventory Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBanner />
            <ChatbotButton onClick={() => setChatbotOpen(true)} />
            <FeedbackButton onClick={() => setFeedbackOpen(true)} />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
        <BuildFooter />
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <ChatbotPanel open={chatbotOpen} onOpenChange={setChatbotOpen} />
    </div>
  )
}
