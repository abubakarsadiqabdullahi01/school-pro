"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { applyFeeScheduleToNewStudents } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"

/**
 * The catch-up for students a schedule never billed.
 *
 * Students are billed when they join a class, so this is for anyone admitted before the
 * schedule existed. It only adds what is missing — the unique index on (student, schedule)
 * means a second press cannot double-bill — which is why it can sit on every row.
 */
export function BillNewStudentsButton({
  scheduleId,
  scheduleName,
  disabled,
}: {
  scheduleId: string
  scheduleName: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const bill = () => {
    startTransition(async () => {
      const result = await applyFeeScheduleToNewStudents({ scheduleId })

      if (!result.success) {
        toast.error("Nobody was billed", { description: result.error })
        return
      }

      const { chargesCreated, studentsConsidered } = result.data
      toast.success(
        chargesCreated > 0
          ? `${chargesCreated} student${chargesCreated === 1 ? "" : "s"} billed for ${scheduleName}`
          : `Everyone was already billed for ${scheduleName}`,
        { description: `${studentsConsidered} student${studentsConsidered === 1 ? "" : "s"} in scope.` },
      )
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 whitespace-nowrap px-2 text-xs"
      disabled={pending || disabled}
      onClick={bill}
    >
      {pending ? "Billing…" : "Bill new students"}
    </Button>
  )
}
