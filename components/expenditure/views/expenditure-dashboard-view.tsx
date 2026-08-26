import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Banknote, Clock, FileCheck2, Wallet } from "lucide-react"

import { getExpenditureOverview } from "@/app/actions/expenditure"
import { ExpenseStatusBadge } from "@/components/expenditure/expense-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

/**
 * Rendered under two URL trees: /dashboard/admin/expenditure for admins and
 * /dashboard/accountant/expenditure for the assigned officer. `basePath` keeps every link
 * inside whichever tree the viewer is allowed into.
 */
export async function ExpenditureDashboardView({
  basePath,
  canManage,
}: {
  basePath: string
  canManage: boolean
}) {
  const overview = await getExpenditureOverview()

  if (!overview.success) {
    return <p className="text-destructive">{overview.error}</p>
  }

  const { data } = overview
  const { statuses } = data

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenditure</h1>
          <p className="text-muted-foreground">
            {data.currentTerm?.name ?? data.currentSession?.name ?? "Current"} spending, approvals, and account
            balances.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" asChild>
              <Link href={`${basePath}/accounts`}>Payment Chart</Link>
            </Button>
          )}
          <Button asChild>
            <Link href={`${basePath}/new`}>Record Expenditure</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile label="Spent this term" value={data.termTotal} icon={Banknote} />
        <Tile label="Spent this session" value={data.sessionTotal} icon={Wallet} />
        <Tile label="Awaiting approval" value={statuses.pending.amount} icon={Clock} note={`${statuses.pending.count} to review`} />
        <Tile label="Approved, not yet paid" value={statuses.approved.amount} icon={FileCheck2} note={`${statuses.approved.count} ready to pay`} />
      </div>

      {data.incomeVsExpenditure && (
        <Card>
          <CardHeader>
            <CardTitle>Income against Expenditure</CardTitle>
            <CardDescription>
              {data.currentSession?.name ?? "This session"} — fees actually collected, less money actually paid out.
              Taken from the finance accumulated fund, so the two modules cannot disagree.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                Income collected
              </div>
              <p className="mt-1 text-2xl font-bold">{formatNaira(data.incomeVsExpenditure.income, { kobo: false })}</p>
            </div>
            <div className="rounded-md border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowDownRight className="h-4 w-4 text-destructive" />
                Expenditure paid
              </div>
              <p className="mt-1 text-2xl font-bold">
                {formatNaira(data.incomeVsExpenditure.expenditure, { kobo: false })}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Balance forward</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  Number(data.incomeVsExpenditure.balance) < 0 ? "text-destructive" : ""
                }`}
              >
                {formatNaira(data.incomeVsExpenditure.balance, { kobo: false })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Spending by Category"
          description="Where the money went this session. Paid expenditure only."
          rows={data.byCategory}
        />
        <Breakdown
          title="Spending by Account"
          description="Which cash source or account it left from."
          rows={data.byAccount}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Approval Position</CardTitle>
            <CardDescription>Every expense this session, by where it has reached.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <StatusTile label="Draft" amount={statuses.draft.amount} count={statuses.draft.count} />
            <StatusTile label="Awaiting approval" amount={statuses.pending.amount} count={statuses.pending.count} />
            <StatusTile label="Approved" amount={statuses.approved.amount} count={statuses.approved.count} />
            <StatusTile label="Paid" amount={statuses.paid.amount} count={statuses.paid.count} />
            <StatusTile label="Rejected" amount={statuses.rejected.amount} count={statuses.rejected.count} />
            <StatusTile label="Cancelled" amount={statuses.cancelled.amount} count={statuses.cancelled.count} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>The last few vouchers raised.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}/transactions`}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recent.length > 0 ? (
              data.recent.map((expense) => (
                <Link
                  key={expense.id}
                  href={`${basePath}/transactions/${expense.id}`}
                  className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0 hover:opacity-80"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{expense.payeeName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {expense.voucherNo} · {expense.categoryName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium">{formatNaira(expense.amount)}</p>
                    <ExpenseStatusBadge status={expense.status} />
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nothing has been recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
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
        <div className="text-2xl font-bold">{formatNaira(value, { kobo: false })}</div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

function StatusTile({ label, amount, count }: { label: string; amount: string; count: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{formatNaira(amount, { kobo: false })}</p>
      <p className="text-sm text-muted-foreground">{count} {count === 1 ? "voucher" : "vouchers"}</p>
    </div>
  )
}

/** The biggest first, with a bar showing each one's share of the total. */
function Breakdown({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: Array<{ id: string; name: string; amount: string; count: number }>
}) {
  const largest = rows.reduce((max, row) => Math.max(max, Number(row.amount)), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{row.name}</span>
                <span className="shrink-0">{formatNaira(row.amount)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: largest > 0 ? `${Math.max((Number(row.amount) / largest) * 100, 2)}%` : "0%" }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Nothing paid out yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
