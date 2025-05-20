"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Loader2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface LoginAttempt {
  id: string
  attemptTime: string
  createdAt?: string
  ipAddress: string
  userAgent: string | null
  status: string
}

export function LoginHistoryTable({ userId }: { userId: string }) {
  const [loginHistory, setLoginHistory] = useState<LoginAttempt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLoginHistory() {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch(`/api/users/${userId}/login-history`)

        if (!response.ok) {
          throw new Error(`Failed to fetch login history: ${response.status}`)
        }

        const data = await response.json()

        // Ensure loginHistory is always an array
        setLoginHistory(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error("Failed to fetch login history:", error)
        setError(error instanceof Error ? error.message : "Failed to load login history")
        setLoginHistory([]) // Set to empty array to avoid map errors
      } finally {
        setIsLoading(false)
      }
    }

    fetchLoginHistory()
  }, [userId])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-50">
            Successful
          </Badge>
        )
      case "FAILED_CREDENTIAL":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-50">
            Invalid Credential
          </Badge>
        )
      case "FAILED_PASSWORD":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-50">
            Invalid Password
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login History</CardTitle>
        <CardDescription>Recent login attempts to your account</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-destructive">{error}</p>
          </div>
        ) : loginHistory.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-muted-foreground">No login history available</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loginHistory.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell>
                    {format(new Date(attempt.attemptTime || attempt.createdAt || new Date()), "MMM d, yyyy h:mm a")}
                  </TableCell>
                  <TableCell>{attempt.ipAddress}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{attempt.userAgent || "Unknown"}</TableCell>
                  <TableCell>{getStatusBadge(attempt.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
