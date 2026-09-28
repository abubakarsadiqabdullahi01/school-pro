import Link from "next/link"
import { Eye } from "lucide-react"

// The column holds raw values like PAYSTACK_CARD. The receipt itself has always read
// them through this, so without it the same payment is spelled two different ways.
import { paymentMethodLabel } from "@/lib/finance/payment-method"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

/**
 * The panels a portal is built from, each covering one concern.
 *
 * They were sections of a single page that scrolled for a screen and a half — results,
 * subjects, attendance, fees and receipts stacked on top of one another, so a parent
 * checking a balance scrolled past their child's marks to reach it. Splitting them into
 * separate routes only helps if the panels themselves are shared, otherwise the student
 * portal and the parent portal grow two versions of each and they drift.
 */

export const STATUS_TONE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  UNPAID: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  PRESENT: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  ABSENT: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  LATE: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
}

export function SummaryTile({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string | null
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

export type AttendanceData = {
  total: number
  rate: number | null
  recent: Array<{ id: string; date: string; status: string }>
}

export function AttendancePanel({ attendance, who }: { attendance: AttendanceData; who: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
        <CardDescription>
          {attendance.total > 0
            ? `${who} last ${attendance.total} marked days.`
            : "Nothing marked yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {attendance.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Attendance appears here once the class teacher starts marking the register.
          </p>
        ) : (
          <>
            <Progress value={attendance.rate ?? 0} className="h-2" />
            <div className="space-y-2">
              {attendance.recent.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-sm">
                  <span className="tabular-nums">{entry.date}</span>
                  <Badge variant="outline" className={STATUS_TONE[entry.status] ?? ""}>
                    {entry.status}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export type ChargeRow = {
  id: string
  name: string
  due: string
  paid: string
  balance: string
  status: string
}

export function FeesPanel({ charges }: { charges: ChargeRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fees</CardTitle>
        <CardDescription>What the school has billed, and what is left to pay.</CardDescription>
      </CardHeader>
      <CardContent>
        {charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing billed yet.</p>
        ) : (
          <div className="space-y-2">
            {charges.map((charge) => (
              <div
                key={charge.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{charge.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {charge.paid} paid of {charge.due}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">{charge.balance}</span>
                  <Badge variant="outline" className={STATUS_TONE[charge.status] ?? ""}>
                    {charge.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export type PaymentRow = {
  id: string
  receiptNo: string
  amount: string
  paidOn: string
  method: string
  status: string
  termName: string
}

export function ReceiptsPanel({
  payments,
  receiptHrefBase,
}: {
  payments: PaymentRow[]
  /** Where a receipt lives, with the payment id appended. */
  receiptHrefBase: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipts</CardTitle>
        <CardDescription>Every payment the school has recorded, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments recorded yet. A receipt appears here as soon as the school records one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Receipt</th>
                  <th className="py-2 px-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Term</th>
                  <th className="py-2 px-3 font-medium">Method</th>
                  <th className="py-2 px-3 text-right font-medium">Amount</th>
                  <th className="py-2 pl-3 text-right font-medium sr-only">Open</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium tabular-nums">{payment.receiptNo}</td>
                    <td className="py-2 px-3 tabular-nums">{payment.paidOn}</td>
                    <td className="py-2 px-3">{payment.termName}</td>
                    <td className="py-2 px-3">{paymentMethodLabel(payment.method)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {payment.amount}
                      {payment.status !== "COMPLETED" && (
                        <Badge
                          variant="outline"
                          className={`ml-2 ${STATUS_TONE[payment.status] ?? ""}`}
                        >
                          {payment.status}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {/* The official receipt, the same document the accountant opens.
                          A fee marked PAID with no way to see the proof is exactly the
                          thing a parent rings the school about. */}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`${receiptHrefBase}/${payment.id}`}>
                          <Eye className="mr-1.5 h-4 w-4" />
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
