import Link from "next/link"

import { getFinanceAdjustments, getFinanceSetupData } from "@/app/actions/finance"
import { AdjustmentsNav } from "@/components/finance/adjustments-nav"
import { FinanceAdjustmentForm } from "@/components/finance/finance-adjustment-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, sumAmounts } from "@/lib/money"

/**
 * Granting a discount or an exemption.
 *
 * The record of everything already granted lives on its own screen; what stays here is the
 * handful most recently given, because the question a second approval raises is "has this
 * child had one already this week" — and that is answered by the last few, not by a table.
 */
export async function AdjustmentsView({
  basePath,
  mode,
}: {
  basePath: string
  mode: "discount" | "exemption"
}) {
  const [adjustments, setup] = await Promise.all([getFinanceAdjustments(), getFinanceSetupData()])

  // The classes of the term in progress: whoever is at the screen names a class far more
  // often than an admission number.
  const currentTermId = setup.success
    ? (setup.data.terms.find((term) => term.isCurrent)?.id ?? setup.data.terms[0]?.id)
    : undefined
  const classes = setup.success
    ? setup.data.classTerms.filter((classTerm) => classTerm.termId === currentTermId)
    : []

  const all = adjustments.success
    ? mode === "discount"
      ? adjustments.data.discounts
      : adjustments.data.exemptions
    : []
  const recent = all.slice(0, 5)
  const section = mode === "discount" ? "discounts" : "exemptions"

  return (
    <div className="space-y-6">
      <AdjustmentsNav basePath={basePath} mode={mode} active="apply" />

      <FinanceAdjustmentForm mode={mode} basePath={basePath} classes={classes} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Recently granted</CardTitle>
              <CardDescription>
                {all.length === 0
                  ? `No ${section} recorded yet.`
                  : `The last ${recent.length} of ${all.length} · ${formatNaira(
                      sumAmounts(all.map((row) => row.amount)),
                    )} taken off fees in total.`}
              </CardDescription>
            </div>
            {all.length > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${basePath}/${section}/records`}>See all {section}</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        {recent.length > 0 && (
          <CardContent className="space-y-3">
            {recent.map((row) => (
              <Link
                key={row.id}
                href={`${basePath}/students/${row.studentId}/statement`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {row.studentName}
                    <span className="text-muted-foreground"> · {row.className ?? "No class"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.feeName}
                    {row.termName ? ` · ${row.termName}` : ""} · {row.reason}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatNaira(row.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDocumentDate(row.createdAt)}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
