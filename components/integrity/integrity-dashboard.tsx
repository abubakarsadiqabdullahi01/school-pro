"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { runSchoolIntegrityCheck } from "@/app/actions/integrity"
import type { IntegrityIssue } from "@/lib/integrity-checks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatDocumentDateTime } from "@/lib/format"

type Check = {
  id: string
  status: string
  issuesFound: number
  results: unknown
  createdAt: Date
  completedAt: Date | null
  runByUser: { firstName: string; lastName: string }
}

function issuesFrom(value: unknown): IntegrityIssue[] {
  return Array.isArray(value) ? value.filter((item): item is IntegrityIssue => Boolean(item && typeof item === "object" && "code" in item)) : []
}

export function IntegrityDashboard({ checks }: { checks: Check[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const latest = checks[0]
  const issues = issuesFrom(latest?.results)

  function run() {
    startTransition(async () => {
      const result = await runSchoolIntegrityCheck()
      if (!result.success) {
        toast.error("Integrity check failed", { description: result.error })
        return
      }
      toast.success(
        result.data.issues.length === 0 ? "All checks passed" : `${result.data.issues.length} issue(s) found`,
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-7 w-7" />
            <h1 className="text-3xl font-bold tracking-tight">System Integrity</h1>
            <InfoGuide guideKey="admin.integrity" />
          </div>
          <p className="text-muted-foreground">Reconcile academic and financial records before gaps become reports.</p>
        </div>
        <Button onClick={run} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Run full check
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest result</CardTitle>
          <CardDescription>
            {latest
              ? `Run ${formatDocumentDateTime(latest.createdAt)} by ${latest.runByUser.firstName} ${latest.runByUser.lastName}`
              : "No integrity check has been run yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!latest ? null : issues.length === 0 && latest.status === "COMPLETED" ? (
            <div className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/10 p-4 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" /> All academic and financial checks passed.
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue, index) => (
                <div key={`${issue.code}-${issue.entityId}-${index}`} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <Badge variant={issue.severity === "ERROR" ? "destructive" : "secondary"}>{issue.severity}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{issue.code}</span>
                  </div>
                  <p className="mt-2 text-sm">{issue.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{issue.entityType}{issue.entityId ? ` · ${issue.entityId}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {checks.map((check) => (
            <div key={check.id} className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
              <span className="text-sm">{formatDocumentDateTime(check.createdAt)}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{check.status}</Badge>
                <span className="text-sm text-muted-foreground">{check.issuesFound} issue(s)</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
