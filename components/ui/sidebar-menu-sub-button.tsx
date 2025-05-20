"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { useLoading } from "@/contexts/loading-context"
import { SidebarMenuSubButton as OriginalSidebarMenuSubButton } from "@/components/ui/sidebar"

// Create a wrapper component for SidebarMenuSubButton that handles loading state
export function SidebarMenuSubButton({
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
      <OriginalSidebarMenuSubButton {...props} onClick={handleClick}>
        {children}
      </OriginalSidebarMenuSubButton>
    )
  }

  // Otherwise, render the original button
  return <OriginalSidebarMenuSubButton {...props}>{children}</OriginalSidebarMenuSubButton>
}
