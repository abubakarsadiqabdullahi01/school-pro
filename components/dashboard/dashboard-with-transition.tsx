"use client"

import { PageTransition } from "@/components/dashboard/page-transition"
import type { ReactNode } from "react"

interface DashboardWithTransitionProps {
  children: ReactNode
}

export function DashboardWithTransition({ children }: DashboardWithTransitionProps) {
  return <PageTransition>{children}</PageTransition>
}
