"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { FilterSelect, type FilterOption } from "@/components/reports/filter-select"
import { Card, CardContent } from "@/components/ui/card"
import { hrReportTabHref, type HrReportTab } from "@/lib/hr/hr-report-tabs"
import { cn } from "@/lib/utils"

/**
 * Which payroll run the report pack is read over.
 *
 * One control for every tab, because all five reports answer the same question about the
 * same month — and it keeps the tab you are on, so changing the period does not throw you
 * back to the overview.
 */
export function HrReportPeriodBar({
  basePath,
  tab,
  runId,
  runs,
}: {
  basePath: string
  tab: HrReportTab
  runId?: string
  runs: Array<{ id: string; period: string; status: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const options: FilterOption[] = runs.map((run) => ({
    value: run.id,
    label: `${run.period} · ${run.status.toLowerCase().replace(/_/g, " ")}`,
  }))

  return (
    <Card className={cn("print:hidden", pending && "opacity-70 transition-opacity")}>
      <CardContent className="p-4">
        <div className="grid gap-3 sm:max-w-md">
          <FilterSelect
            id="report-run"
            label="Payroll run"
            value={runId}
            placeholder="Latest run"
            options={options}
            onChange={(value) =>
              startTransition(() => router.push(hrReportTabHref(basePath, tab, value)))
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}
