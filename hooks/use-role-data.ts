"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

export function useRoleData() {
  const { data: session, status } = useSession()
  const [roleData, setRoleData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchRoleData() {
      if (status === "authenticated" && session?.user) {
        try {
          setIsLoading(true)
          const response = await fetch("/api/role-data")

          if (!response.ok) {
            throw new Error("Failed to fetch role data")
          }

          const result = await response.json()
          setRoleData(result.data)
        } catch (err) {
          setError(err instanceof Error ? err : new Error("Unknown error"))
        } finally {
          setIsLoading(false)
        }
      }
    }

    fetchRoleData()
  }, [session, status])

  return { roleData, isLoading, error }
}

