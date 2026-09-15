"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { applyFeeScheduleToNewStudents } from "@/app/actions/finance"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const AUDIENCE_LABEL: Record<string, string> = {
  ALL_STUDENTS: "All students",
  NEW_STUDENTS: "New students only",
  RETURNING_STUDENTS: "Returning students only",
}

interface FeeScheduleListProps {
  schedules: Array<{
    id: string
    name: string
    categoryName: string
    sessionName: string
    scope: string
    amount: string
    appliesTo: string
    isActive: boolean
    chargeCount: number
  }>
}

/**
 * Existing fee schedules, and the catch-up button for students the original run
 * missed. Students admitted after a schedule was created are billed on enrolment
 * now; this is for the ones admitted before that behaviour existed.
 */
export function FeeScheduleList({ schedules }: FeeScheduleListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  function billNewStudents(scheduleId: string, name: string) {
    setBusyId(scheduleId)
    startTransition(async () => {
      const result = await applyFeeScheduleToNewStudents({ scheduleId })
      setBusyId(null)

      if (!result.success) {
        toast.error("Nobody was billed", { description: result.error })
        return
      }

      const { chargesCreated, studentsConsidered } = result.data
      toast.success(
        chargesCreated > 0
          ? `${chargesCreated} student${chargesCreated === 1 ? "" : "s"} billed for ${name}`
          : `Everyone was already billed for ${name}`,
        { description: `${studentsConsidered} student${studentsConsidered === 1 ? "" : "s"} in scope.` },
      )
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee Schedules</CardTitle>
        <CardDescription>
          Students are billed when they join a class. Use <strong>Bill new students</strong> for anyone admitted
          before a schedule existed — it only adds what is missing, so it is safe to press twice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fee schedules yet. Create one to start billing.
          </p>
        ) : (
          schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex flex-col gap-3 border-b pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{schedule.name}</p>
                  <Badge variant={schedule.isActive ? "default" : "secondary"}>
                    {schedule.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {schedule.categoryName} · {schedule.scope} · {schedule.sessionName} ·{" "}
                  {AUDIENCE_LABEL[schedule.appliesTo] ?? schedule.appliesTo}
                </p>
                <p className="text-sm tabular-nums">
                  {schedule.amount} ·{" "}
                  <span className="text-muted-foreground">
                    {schedule.chargeCount} student{schedule.chargeCount === 1 ? "" : "s"} billed
                  </span>
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || !schedule.isActive}
                onClick={() => billNewStudents(schedule.id, schedule.name)}
              >
                {busyId === schedule.id ? "Billing…" : "Bill new students"}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
