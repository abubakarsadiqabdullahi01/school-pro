"use client"

import type React from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { NavigationProgress } from "@/components/navigation-progress"
import { LoadingOverlay } from "@/components/dashboard/loading-overlay"
import { useLoading } from "@/contexts/loading-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Create a QueryClient instance
const queryClient = new QueryClient()

interface SchoolInfo {
  name: string
  code: string
  logoUrl?: string | null
}

interface DashboardLayoutClientProps {
  children: React.ReactNode
  userRole: string
  userName: string
  userAvatar?: string | null
  schoolInfo?: SchoolInfo | null
}

export function DashboardLayoutClient({
  children,
  userRole,
  userName,
  userAvatar,
  schoolInfo,
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
        <AppSidebar userRole={userRole} schoolInfo={schoolInfo} />
        <SidebarInset>
          <div className="flex flex-col min-h-screen">
            <DashboardHeader userRole={userRole} userName={userName} userAvatar={userAvatar} />
            <main className="flex-1 p-5 md:p-6 overflow-auto">
              <div className="mx-auto max-w-8xl">{children}</div>
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </QueryClientProvider>
  )
}
