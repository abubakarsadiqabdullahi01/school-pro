import Link from "next/link"
import { Clock3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

type Pending = { reference: string; status: string; amount: string; createdAt: string }

/** Payments a parent made that are still being confirmed, shown above the fee list. */
export function PendingOnlinePayments({ studentId, payments }: { studentId: string; payments: Pending[] }) {
  if (payments.length === 0) return null
  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Clock3 className="h-5 w-5 text-amber-600" aria-hidden />Payment being confirmed</CardTitle>
        <CardDescription>
          The fees below update as soon as Paystack confirms. You do not need to pay again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {payments.map((payment) => (
          <div key={payment.reference} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
            <div>
              <p className="font-medium">{formatNaira(payment.amount)}</p>
              <p className="text-xs text-muted-foreground">
                {payment.status === "REQUIRES_REVIEW" ? "Being checked by the school" : "Waiting for Paystack confirmation"} ·{" "}
                {new Date(payment.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} · {payment.reference}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/parent/children/${studentId}/fees/online/${encodeURIComponent(payment.reference)}`}>Check status</Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
