"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { useLoading } from "@/contexts/loading-context"
import { SidebarMenuButton as OriginalSidebarMenuButton } from "@/components/ui/sidebar"

// Create a wrapper component for SidebarMenuButton that handles loading state
export function SidebarMenuButton({
  href,
  children,
  ...props
}: {
  href?: string
  children: React.ReactNode
  [key: string]: any
}) {
  const router = useRouter()
  const { setLoading } = useLoading()

  const handleClick = (e: React.MouseEvent) => {
    if (href) {
      e.preventDefault()
      // Set loading state to true before navigation
      setLoading(true)
      // Navigate to the specified path
      router.push(href)
    }

    // Call the original onClick handler if provided
    if (props.onClick) {
      props.onClick(e)
    }
  }

  // If href is provided, handle navigation with loading state
  if (href) {
    return (
      <OriginalSidebarMenuButton {...props} onClick={handleClick}>
        {children}
      </OriginalSidebarMenuButton>
    )
  }

  // Otherwise, render the original button
  return <OriginalSidebarMenuButton {...props}>{children}</OriginalSidebarMenuButton>
}
