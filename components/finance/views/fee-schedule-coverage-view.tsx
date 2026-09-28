import Link from "next/link"

import { getFeeScheduleCoverage } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { BillNewStudentsButton } from "@/components/finance/bill-new-students-button"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FEE_AUDIENCES } from "@/lib/finance/fee-setup-filters"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

const classColumns: DataTableColumn[] = [
  { label: "Class", width: "46%" },
  { label: "In scope", align: "right", width: "18%" },
  { label: "Billed", align: "right", width: "18%" },
  { label: "Not billed", align: "right", width: "18%" },
]

const studentColumns: DataTableColumn[] = [
  { label: "Student", width: "45%" },
  { label: "Admission No", width: "30%" },
  { label: "Class", width: "25%" },
]

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === "warning"
            ? "text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-500"
            : "text-2xl font-bold tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  )
}

/**
 * Who a schedule has billed, and who it has missed.
 *
 * A charge count on its own is not a fact anybody can act on — 60 billed is right for a
 * class of 60 and a hole for a class of 62. Students admitted after a schedule ran are the
 * hole: they owe nothing on paper, so the class summary balances, the debtors report is
 * quiet, and nobody finds out until the fees are counted at the end of term. This screen
 * names them, class by class, and the catch-up button fixes it.
 */
export async function FeeScheduleCoverageView({
  basePath,
  scheduleId,
}: {
  basePath: string
  scheduleId: string
}) {
  const coverage = await getFeeScheduleCoverage(scheduleId)
  if (!coverage.success) {
    return <p className="text-destructive">{coverage.error}</p>
  }

  const { schedule, inScope, billed, unbilled, byClass, unbilledStudents, unbilledShown } = coverage.data
  const audience = FEE_AUDIENCES.find((option) => option.value === schedule.appliesTo)?.label ?? schedule.appliesTo

  const classRows: DataTableRow[] = byClass.map((row) => ({
    id: row.className,
    search: row.className,
    cells: [
      <span key="class" className="font-medium">
        {row.className}
      </span>,
      <span key="scope" className="tabular-nums">
        {row.inScope}
      </span>,
      <span key="billed" className="tabular-nums">
        {row.billed}
      </span>,
      row.unbilled > 0 ? (
        <span key="unbilled" className="font-semibold tabular-nums text-amber-600 dark:text-amber-500">
          {row.unbilled}
        </span>
      ) : (
        <span key="unbilled" className="tabular-nums text-muted-foreground">
          0
        </span>
      ),
    ],
  }))

  const studentRows: DataTableRow[] = unbilledStudents.map((student) => ({
    id: student.id,
    href: `${basePath}/students/${student.id}/statement`,
    search: `${student.name} ${student.admissionNo} ${student.className}`,
    cells: [
      <span key="name" className="font-medium">
        {student.name}
      </span>,
      <span key="admission" className="whitespace-nowrap text-muted-foreground">
        {student.admissionNo}
      </span>,
      <span key="class" className="whitespace-nowrap">
        {student.className}
      </span>,
    ],
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={`${basePath}/fees`} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <h1 className="text-3xl font-bold tracking-tight">{schedule.name}</h1>
              <InfoGuide guideKey="finance.feeScheduleCoverage" />
            </div>
            {!schedule.isActive && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <p className="text-muted-foreground">
            {schedule.categoryName} · {schedule.scopeLabel} · {schedule.sessionName} · {audience} ·{" "}
            {formatNaira(schedule.amount)} each
            {schedule.dueDate ? ` · due ${formatDocumentDate(schedule.dueDate)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <BillNewStudentsButton
            scheduleId={schedule.id}
            scheduleName={schedule.name}
            disabled={!schedule.isActive || unbilled === 0}
          />
          <Button variant="outline" size="sm" asChild>
            <Link href={`${basePath}/fees/schedules/${schedule.id}/edit`}>Edit schedule</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
          <CardDescription>
            {inScope === 0
              ? "Nobody is enrolled where this schedule bills today — usually a term that has ended. The charges it raised at the time are unaffected."
              : unbilled === 0
                ? "Everyone this schedule covers has been billed."
                : `${unbilled} student${unbilled === 1 ? " is" : "s are"} in scope with no charge — admitted after this schedule ran${
                    schedule.isActive
                      ? ". Bill new students raises the missing charges."
                      : ", and the schedule is inactive so nothing new is billed."
                  }`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Tile label="In scope now" value={String(inScope)} />
          <Tile label="Billed" value={String(billed)} />
          <Tile label="Not billed" value={String(unbilled)} tone={unbilled > 0 ? "warning" : undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By class</CardTitle>
          <CardDescription>
            The roll each class holds today against the charges this schedule has raised there.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={classColumns}
            rows={classRows}
            unit="classes"
            searchable={false}
            pageSize={20}
            emptyMessage="No class is in this schedule's scope today. Nobody is enrolled where it bills — usually a term that has ended."
          />
        </CardContent>
      </Card>

      {unbilledStudents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Not billed</CardTitle>
            <CardDescription>
              {unbilledShown === unbilled
                ? "Every student in scope without a charge for this fee."
                : `The first ${unbilledShown} of ${unbilled} students in scope without a charge.`}{" "}
              Open one to see their statement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={studentColumns}
              rows={studentRows}
              unit="students"
              searchPlaceholder="Search name, admission number or class"
              emptyMessage="Nobody is missing a charge."
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
