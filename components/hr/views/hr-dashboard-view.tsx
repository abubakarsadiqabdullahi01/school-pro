import Link from "next/link"
import { AlertTriangle, Banknote, GraduationCap, UserCheck, Users } from "lucide-react"

import { getHrOverview } from "@/app/actions/hr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  PAID: "Paid",
  CANCELLED: "Cancelled",
}

export async function HrDashboardView({ basePath, canManage }: { basePath: string; canManage: boolean }) {
  const overview = await getHrOverview()

  if (!overview.success) {
    return <p className="text-destructive">{overview.error}</p>
  }

  const { data } = overview

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">HR &amp; Payroll</h1>
          <p className="text-muted-foreground">Who works here, what they are owed, and whether it has been paid.</p>
        </div>
        <div className="flex gap-2">
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
              {data.withoutSalary} active {data.withoutSalary === 1 ? "person has" : "people have"} no salary on record
            </p>
            <p className="text-sm text-muted-foreground">
              Payroll skips them and says so, but they will not be paid until a salary is assigned.{" "}
              <Link href={`${basePath}/staff`} className="underline underline-offset-4">Review the staff list</Link>.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile label="Total staff" value={String(data.staff.total)} icon={Users} note={`${data.staff.active} active`} />
        <Tile label="Teaching" value={String(data.staff.teaching)} icon={GraduationCap} />
        <Tile label="Non-teaching" value={String(data.staff.nonTeaching)} icon={UserCheck} />
        <Tile
          label="Suspended or exited"
          value={String(data.staff.suspended + data.staff.exited)}
          icon={AlertTriangle}
          note={`${data.staff.suspended} suspended · ${data.staff.exited} left`}
        />
      </div>

      {data.latestRun ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Latest Payroll — {data.latestRun.period}</CardTitle>
              <CardDescription>
                <Badge variant="outline" className="mr-2">{STATUS_LABEL[data.latestRun.status] ?? data.latestRun.status}</Badge>
                {data.latestRun.paidCount} paid · {data.latestRun.unpaidCount} unpaid
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}/payroll/${data.latestRun.id}`}>Open</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
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
              Add staff, assign salaries, then generate the first month. Allowances and deductions are optional.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Staff by Department</CardTitle>
            <CardDescription>Active staff only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.byDepartment.length > 0 ? (
              data.byDepartment.map((row) => (
                <div key={row.department} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <span>{row.department}</span>
                  <span className="font-medium">{row.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No staff yet.</p>
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
                <div key={row.employmentType} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <span>{row.employmentType.toLowerCase().replace("_", " ")}</span>
                  <span className="font-medium">{row.count}</span>
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
              <div key={payment.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{payment.period}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(payment.paidAt).toLocaleDateString()}
                    {payment.accountName ? ` · ${payment.accountName}` : ""}
                  </p>
                </div>
                <p className="font-medium">{formatNaira(payment.amount)}</p>
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

function Tile({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  note?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={strong ? "mt-1 text-2xl font-bold" : "mt-1 text-xl font-semibold"}>
        {formatNaira(value, { kobo: false })}
      </p>
    </div>
  )
}
