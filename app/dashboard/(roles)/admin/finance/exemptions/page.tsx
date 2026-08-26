import { getFinanceAdjustments } from "@/app/actions/finance"
import { FinanceAdjustmentForm } from "@/components/finance/finance-adjustment-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

export default async function ExemptionsPage() {
  const adjustments = await getFinanceAdjustments()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fee Exemptions</h1>
        <p className="text-muted-foreground">Manage full and partial free-student approvals.</p>
      </div>
      <FinanceAdjustmentForm mode="exemption" />
      <Card>
        <CardHeader>
          <CardTitle>Recent Exemptions</CardTitle>
          <CardDescription>Approved exemptions that already reduced student charges.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {adjustments.success && adjustments.data.exemptions.length > 0 ? (
            adjustments.data.exemptions.map((exemption) => (
              <div key={exemption.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{exemption.studentName}</p>
                  <p className="text-sm text-muted-foreground">{exemption.feeName} · {exemption.reason}</p>
                </div>
                <p className="font-semibold">{formatNaira(exemption.amount)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No exemptions recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
