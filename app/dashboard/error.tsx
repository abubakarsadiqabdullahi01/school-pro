"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Error boundary for the whole dashboard subtree. Without this, a server action that
 * throws renders an empty frame with no explanation and no way back.
 *
 * The message is deliberately non-technical — the people who hit this are school
 * administrators and teachers, not developers. The digest is shown because it is the one
 * thing that lets support correlate a report with a server log line.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
          </div>
          <CardTitle className="text-2xl">This page didn&apos;t load</CardTitle>
          <CardDescription>Something went wrong while fetching your data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            Nothing you entered has been lost. Try again — if it keeps happening, send the
            reference below to your system administrator.
          </p>
          {error.digest ? (
            <p className="text-center text-xs font-mono text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
