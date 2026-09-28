import Link from "next/link"
import { CreditCard, FileText, Percent, Receipt, Wallet } from "lucide-react"

import { getFinanceOverview } from "@/app/actions/finance"
import { FinanceDashboardCharts } from "@/components/finance/views/finance-dashboard-charts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * Rendered under two URL trees: /dashboard/admin/finance for admins, and
 * /dashboard/accountant for the assigned finance officer. `basePath` keeps the links
 * inside whichever tree the viewer is allowed into — an accountant sent to an
 * /dashboard/admin/* link is bounced by the admin layout.
 */
export async function FinanceDashboardView({
  basePath,
  canManageFees,
}: {
  basePath: string
  canManageFees: boolean
}) {
  const overview = await getFinanceOverview()

  if (!overview.success) {
    return <p className="text-destructive">{overview.error}</p>
  }

  const { data } = overview
  const cards = [
    { label: "Expected Fees", value: data.totals.expected, icon: Wallet },
    { label: "Paid", value: data.totals.paid, icon: CreditCard },
    { label: "Outstanding", value: data.totals.outstanding, icon: FileText },
    { label: "Discounts", value: data.totals.discounts, icon: Percent },
    { label: "Exemptions", value: data.totals.exemptions, icon: Receipt },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
            <InfoGuide guideKey="finance.dashboard" />
          </div>
          <p className="font-medium">{data.school.name} ({data.school.code})</p>
          <p className="text-muted-foreground">
            {data.currentTerm?.name ?? data.currentSession?.name ?? "Current"} fee collection, balances, and payment activity.
          </p>
        </div>
        <div className="flex gap-2">
          {canManageFees && (
            <Button variant="outline" asChild>
              <Link href={`${basePath}/fees`}>Fee Setup</Link>
            </Button>
          )}
          <Button asChild>
            <Link href={`${basePath}/student-payments`}>Record Payment</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNaira(card.value, { kobo: false })}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <FinanceDashboardCharts totals={data.totals} counts={data.counts} />

      <div className="grid gap-4 md:grid-cols-4">
        <StatusTile label="Paid charges" value={data.counts.paid} />
        <StatusTile label="Partial charges" value={data.counts.partial} />
        <StatusTile label="Unpaid charges" value={data.counts.unpaid} />
        <StatusTile label="Waived charges" value={data.counts.waived} />
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Recent Payments</CardTitle>
              <CardDescription>Latest receipt rows for this school. Click any row to reprint the receipt.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}/receipts`}>All receipts</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentPayments.length > 0 ? (
              // Each row is a link to its receipt: this list is the most common place
              // somebody realises they need to reprint one.
              data.recentPayments.map((payment) => (
                <Link
                  key={payment.id}
                  href={`${basePath}/receipts/${payment.id}`}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 hover:opacity-80"
                >
                  <div>
                    <p className="font-medium">{payment.studentName}</p>
                    <p className="text-sm text-muted-foreground">{payment.admissionNo} · {payment.receiptNo}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatNaira(payment.amount)}</p>
                    <p className="text-sm text-muted-foreground">{payment.status}</p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No payments have been recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatusTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}
