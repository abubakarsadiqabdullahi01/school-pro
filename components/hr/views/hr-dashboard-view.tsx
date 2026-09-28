import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { getHrOverview } from "@/app/actions/hr"
import { SpendBarChart } from "@/components/reports/spend-bar-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatDocumentDate } from "@/lib/format"
import { employmentTypeLabel } from "@/lib/hr/staff-filters"
import { formatNaira } from "@/lib/money"

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  PAID: "Paid",
  CANCELLED: "Cancelled",
}

/**
 * The HR module's front page.
 *
 * It used to open on four headcount tiles. Headcount is the least urgent thing anybody comes
 * to this screen for — it changes a few times a year, and it is on the staff list anyway.
 * What a head teacher needs first is money and blockage: what is owed to staff right now,
 * what is stuck with the approver, what payroll is costing against everything else the school
 * spends, and whether anybody cannot be paid at all. Headcount follows underneath.
 *
 * The trend is a chart because "is the payroll climbing" is a shape, and twelve rows of naira
 * is not a shape. Departments are a chart because that is a ranking.
 */
export async function HrDashboardView({ basePath, canManage }: { basePath: string; canManage: boolean }) {
  const overview = await getHrOverview()

  if (!overview.success) {
    return <p className="text-destructive">{overview.error}</p>
  }

  const { data } = overview
  const owed = Number(data.owed.amount) > 0
  const pending = data.awaitingApproval.runs > 0
  const headcount = data.staff.suspended + data.staff.exited

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">HR &amp; Payroll</h1>
            <InfoGuide guideKey="hr.dashboard" />
          </div>
          <p className="text-muted-foreground">
            Who works here, what they are owed, and whether it has been paid.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button variant="outline" asChild>
              <Link href={`${basePath}/staff/new`}>Add Staff</Link>
            </Button>
          )}
          <Button asChild>
            <Link href={`${basePath}/payroll/new`}>Generate Payroll</Link>
          </Button>
        </div>
      </div>

      {data.withoutSalary > 0 && (
        <div className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">
              {data.withoutSalary} active {data.withoutSalary === 1 ? "person has" : "people have"} no salary
              on record
            </p>
            <p className="text-sm text-muted-foreground">
              Payroll skips them and says so, but they will not be paid until a salary is assigned.{" "}
              <Link
                href={`${basePath}/staff?salary=NO_SALARY`}
                className="underline underline-offset-4"
              >
                See who
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {/* Money and blockage first. These four are the reason somebody opens this screen. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Owed to staff</p>
          <p className={`text-2xl font-bold tabular-nums ${owed ? "text-destructive" : ""}`}>
            {formatNaira(data.owed.amount, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">
            {owed
              ? `${data.owed.people} ${data.owed.people === 1 ? "payslip" : "payslips"} approved, not paid`
              : "every approved payslip is paid"}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Awaiting approval</p>
          <p
            className={`text-2xl font-bold tabular-nums ${pending ? "text-amber-600 dark:text-amber-500" : ""}`}
          >
            {formatNaira(data.awaitingApproval.amount, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">
            {pending
              ? `${data.awaitingApproval.runs} ${data.awaitingApproval.runs === 1 ? "run" : "runs"} with the approver`
              : "nothing waiting"}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            Salaries {data.session.name ? `in ${data.session.name}` : "this session"}
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {formatNaira(data.session.salaries, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">
            {Number(data.session.expenditure) > 0
              ? `${data.session.share}% of all money paid out`
              : "no expenditure recorded yet"}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">On the books</p>
          <p className="text-2xl font-bold tabular-nums">{data.staff.active}</p>
          <p className="text-xs text-muted-foreground">
            {data.staff.teaching} teaching · {data.staff.nonTeaching} not
            {headcount > 0 ? ` · ${headcount} suspended or gone` : ""}
          </p>
        </div>
      </div>

      {data.latestRun ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Latest Payroll — {data.latestRun.period}</CardTitle>
              <CardDescription>
                <Badge variant="outline" className="mr-2">
                  {STATUS_LABEL[data.latestRun.status] ?? data.latestRun.status}
                </Badge>
                {data.latestRun.paidCount} paid · {data.latestRun.unpaidCount} unpaid
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}/payroll/${data.latestRun.id}`}>Open</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Figure label="Gross" value={data.latestRun.gross} />
            <Figure label="Deductions" value={data.latestRun.deductions} />
            <Figure label="Net payroll" value={data.latestRun.net} strong />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No payroll yet</CardTitle>
            <CardDescription>
              Add staff, assign salaries, then generate the first month. Allowances and deductions are
              optional.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Net payroll, month by month</CardTitle>
          <CardDescription>
            {data.payrollTrend.length === 0
              ? "No runs yet."
              : `The last ${data.payrollTrend.length} ${
                  data.payrollTrend.length === 1 ? "run" : "runs"
                }, oldest first. What staff actually take home, after deductions.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.payrollTrend.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Generate a payroll run and the trend starts here.
            </p>
          ) : (
            <SpendBarChart
              rows={data.payrollTrend.map((run) => ({
                name: run.period,
                amount: run.net,
                budgetLimit: null,
                overBy: null,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Staff by Department</CardTitle>
            <CardDescription>Active staff only, largest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.byDepartment.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No staff yet.</p>
            ) : (
              <SpendBarChart
                rows={data.byDepartment.map((row) => ({
                  name: row.department,
                  amount: String(row.count),
                  budgetLimit: null,
                  overBy: null,
                }))}
                valueLabel="People"
                plain
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment Type</CardTitle>
            <CardDescription>How the active staff are engaged.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.byEmploymentType.length > 0 ? (
              data.byEmploymentType.map((row) => (
                <div
                  key={row.employmentType}
                  className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                >
                  <span>{employmentTypeLabel(row.employmentType)}</span>
                  <span className="font-medium tabular-nums">{row.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No staff yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Recent Salary Payments</CardTitle>
            <CardDescription>Each one is also an expenditure record.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`${basePath}/payroll`}>All payroll</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.recentPayments.length > 0 ? (
            data.recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">{payment.period}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDocumentDate(payment.paidAt)}
                    {payment.accountName ? ` · ${payment.accountName}` : ""}
                  </p>
                </div>
                <p className="whitespace-nowrap font-medium tabular-nums">{formatNaira(payment.amount)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No salaries paid yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-2xl font-bold" : "text-xl font-semibold"}`}>
        {formatNaira(value, { kobo: false })}
      </p>
    </div>
  )
}
