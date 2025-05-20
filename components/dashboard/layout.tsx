"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { getUserRole } from "@/lib/client-utils"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { cn } from "@/lib/utils"

interface DashboardLayoutProps {
  children: React.ReactNode
  userRole?: "super-admin" | "admin" | "teacher" | "student" | "parent"
}

// Update the DashboardLayout component to get the user role from cookies
export function DashboardLayout({ children, userRole: propUserRole }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [userRole, setUserRole] = useState<DashboardLayoutProps["userRole"]>(propUserRole)
  const pathname = usePathname()

  // Get user role from cookie
  useEffect(() => {
    const role = getUserRole() as DashboardLayoutProps["userRole"]
    if (role) {
      setUserRole(role)
    } else if (propUserRole) {
      setUserRole(propUserRole)
    }
  }, [propUserRole])

  // Handle responsive layout
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      } else {
        setIsSidebarOpen(true)
      }
    }

    checkScreenSize()
    window.addEventListener("resize", checkScreenSize)
    return () => window.removeEventListener("resize", checkScreenSize)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DashboardSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} userRole={userRole} isMobile={isMobile} />

      <div className="flex flex-col flex-1 overflow-hidden">
        <DashboardHeader
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          userRole={userRole}
        />  

        <motion.main
          className={cn("flex-1 overflow-y-auto p-4 md:p-6", isMobile && isSidebarOpen ? "opacity-50" : "opacity-100")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mx-auto max-w-7xl">{children}</div>
        </motion.main>
      </div>
    </div>
  )
}

