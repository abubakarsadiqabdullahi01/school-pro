"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { DashboardOverview } from "@/components/admin-dashboard/DashboardOverview"
import { SystemHealth } from "@/components/admin-dashboard/SystemHealth"
import { getDashboardData, getSystemHealth } from "@/app/actions/admin-dashboard"
import { toast } from "sonner"

export function AdminDashboardClient() {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [systemHealthData, setSystemHealthData] = useState<any>(null)

  const fetchData = async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) setIsRefreshing(true)

      const [dashboardResult, healthResult] = await Promise.all([getDashboardData(), getSystemHealth()])

      if (dashboardResult.success) {
        setDashboardData(dashboardResult.data)
      } else {
        toast.error("Error", {
          description: dashboardResult.error || "Failed to load dashboard data",
        })
      }

      if (healthResult.success) {
        setSystemHealthData(healthResult.data)
      } else {
        console.error("Failed to load system health data:", healthResult.error)
      }
    } catch (error) {
      console.error("Dashboard data fetch error:", error)
      toast.error("Error", {
        description: "Failed to load dashboard data",
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleRefresh = () => {
    fetchData(true)
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading admin dashboard..." />
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Failed to load dashboard data</p>
          <Button onClick={() => fetchData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col justify-between gap-4 md:flex-row md:items-center"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome back! Here's what's happening at {dashboardData.school?.name || "your school"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="grid w-full grid-cols-2 lg:w-[240px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <DashboardOverview data={dashboardData} />
        </TabsContent>

        <TabsContent value="system" className="space-y-5">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {systemHealthData ? (
              <SystemHealth data={systemHealthData} />
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">System health data not available</p>
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
