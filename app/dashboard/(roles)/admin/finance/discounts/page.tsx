import { getFinanceAdjustments } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FinanceAdjustmentForm } from "@/components/finance/finance-adjustment-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

export default async function DiscountsPage() {
  const adjustments = await getFinanceAdjustments()

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance" />
        <h1 className="text-3xl font-bold tracking-tight">Discounts</h1>
        <p className="text-muted-foreground">
          Search a student, choose the unpaid charge, then record the approved discount with a reason.
        </p>
      </div>
      <FinanceAdjustmentForm mode="discount" />
      <Card>
        <CardHeader>
          <CardTitle>Recent Discounts</CardTitle>
          <CardDescription>Approved discounts that already reduced student charges.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {adjustments.success && adjustments.data.discounts.length > 0 ? (
            adjustments.data.discounts.map((discount) => (
              <div key={discount.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{discount.studentName}</p>
                  <p className="text-sm text-muted-foreground">{discount.feeName} · {discount.reason}</p>
                </div>
                <p className="font-semibold">{formatNaira(discount.amount)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No discounts recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
