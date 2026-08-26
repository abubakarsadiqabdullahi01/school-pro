"use client"

import type React from "react"

import { useEffect, useState } from "react"
import type { Role } from "@prisma/client"
import { getUserRole } from "@/lib/client-utils"
import { DashboardLayoutClient } from "@/components/dashboard/dashboard-layout-client"

interface DashboardLayoutProps {
  children: React.ReactNode
  userRole?: Role
}

export function DashboardLayout({ children, userRole: propUserRole }: DashboardLayoutProps) {
  const [userRole, setUserRole] = useState<Role>(propUserRole ?? "ADMIN")

  useEffect(() => {
    const role = getUserRole()
    if (isRole(role)) {
      setUserRole(role)
    } else if (propUserRole) {
      setUserRole(propUserRole)
    }
  }, [propUserRole])

  return (
    <DashboardLayoutClient userRole={userRole} userName="User" schoolInfo={null}>
      {children}
    </DashboardLayoutClient>
  )
}

function isRole(value: string | null): value is Role {
  return value === "SUPER_ADMIN" || value === "ADMIN" || value === "TEACHER" || value === "STUDENT" || value === "PARENT"
}
