"use client"

import { PageTransition } from "@/components/dashboard/page-transition"
import type { ReactNode } from "react"

interface PageWithTransitionProps {
  children: ReactNode
}

export function PageWithTransition({ children }: PageWithTransitionProps) {
  return <PageTransition>{children}</PageTransition>
}
