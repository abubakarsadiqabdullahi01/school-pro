"use client"

import type React from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { WelcomeTour } from "@/components/dashboard/welcome-tour"
import { DashboardHeader } from "@/components/dashboard-header"
import { NavigationProgress } from "@/components/navigation-progress"
import { LoadingOverlay } from "@/components/dashboard/loading-overlay"
import { useLoading } from "@/contexts/loading-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Role } from "@prisma/client"
import type { PermissionKey } from "@/lib/permissions"

// Create a QueryClient instance
const queryClient = new QueryClient()

interface SchoolInfo {
  name: string
  code: string
  logoUrl?: string | null
}

interface SchoolOption {
  id: string
  name: string
  code: string
}

interface DashboardLayoutClientProps {
  children: React.ReactNode
  /**
   * Keys the one-time welcome tour, so it is per person rather than per browser.
   * Optional only because `components/dashboard/layout.tsx` — a client-side shell
   * nothing currently imports — has no session to take it from; the tour is
   * skipped rather than shown to an unidentified user.
   */
  userId?: string
  userRole: Role
  userName: string
  userAvatar?: string | null
  schoolInfo?: SchoolInfo | null
  /** Super admin only — the schools available in the header switcher. */
  schoolOptions?: SchoolOption[]
  /** Super admin only — the school currently in focus, or null for all schools. */
  activeSchool?: SchoolOption | null
  permissions?: PermissionKey[]
}

export function DashboardLayoutClient({
  children,
  userId,
  userRole,
  userName,
  userAvatar,
  schoolInfo,
  schoolOptions = [],
  activeSchool = null,
  permissions = [],
}: DashboardLayoutClientProps) {
  const pathname = usePathname()
  const { setLoading } = useLoading()

  // Reset loading state when pathname changes (navigation completes)
  useEffect(() => {
    setLoading(false)
  }, [pathname, setLoading])

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <NavigationProgress />
        <LoadingOverlay />
        <WelcomeTour
          userId={userId}
          userRole={userRole}
          userName={userName}
          permissions={permissions}
        />
        <AppSidebar
          userRole={userRole}
          schoolInfo={schoolInfo}
          permissions={permissions}
          activeSchool={activeSchool}
        />
        {/* min-w-0: the inset is a flex child beside a 256px sidebar and carries
            w-full, so without this any wide child — a results table, a payroll
            run — sets the floor and pushes the whole page sideways instead of
            scrolling inside its own container. */}
        <SidebarInset className="min-w-0">
          <div className="flex min-h-screen min-w-0 flex-col">
            <DashboardHeader
              userRole={userRole}
              userName={userName}
              userAvatar={userAvatar}
              schoolOptions={schoolOptions}
              activeSchool={activeSchool}
            />
            <main className="flex-1 p-5 md:p-6 overflow-auto">
              <div className="mx-auto max-w-8xl">{children}</div>
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </QueryClientProvider>
  )
}
