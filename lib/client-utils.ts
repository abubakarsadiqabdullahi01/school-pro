"use client"

import type { Role } from "@prisma/client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"

// Get user role from session
export function useUserRole(): Role | null {
  const { data: session, status } = useSession()
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role) {
      setRole(session.user.role as Role)
    }
  }, [session, status])

  return role
}

// Get user role from cookie (for client-side redirects)
export function getUserRole(): string | null {
  // Try to parse the role from the session cookie
  try {
    const cookies = document.cookie.split(";")
    const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith("next-auth.session-token="))

    if (!sessionCookie) return null

    // In a real implementation, you would need to decode the JWT
    // This is a simplified version that assumes the role is stored in the session
    // For security reasons, the actual implementation would be more complex

    // For now, we'll use localStorage as a temporary solution
    // In production, you should NOT store sensitive data in localStorage
    return localStorage.getItem("userRole") || null
  } catch (error) {
    console.error("Error getting user role:", error)
    return null
  }
}

// Set user role in localStorage (temporary solution)
export function setUserRole(role: Role): void {
  localStorage.setItem("userRole", role)
}

