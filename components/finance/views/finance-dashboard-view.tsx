import Link from "next/link"
import { CreditCard, FileText, Percent, Receipt, Wallet } from "lucide-react"

import { getFinanceOverview } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

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
          <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
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

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
            <CardDescription>Student charge status for the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <StatusTile label="Paid" value={data.counts.paid} />
            <StatusTile label="Partial" value={data.counts.partial} />
            <StatusTile label="Unpaid" value={data.counts.unpaid} />
            <StatusTile label="Waived" value={data.counts.waived} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>Latest receipts recorded by finance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentPayments.length > 0 ? (
              data.recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{payment.studentName}</p>
                    <p className="text-sm text-muted-foreground">{payment.admissionNo} · {payment.receiptNo}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatNaira(payment.amount)}</p>
                    <p className="text-sm text-muted-foreground">{payment.status}</p>
                  </div>
                </div>
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
    <div className="rounded-md border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}
