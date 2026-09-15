import { BackButton } from "@/components/back-button"
import Link from "next/link"

import { getFeeSchedules, getFinanceSetupData } from "@/app/actions/finance"
import { FeeScheduleList } from "@/components/finance/fee-schedule-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function FinanceFeesPage() {
  const [setup, schedules] = await Promise.all([getFinanceSetupData(), getFeeSchedules()])

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BackButton fallbackHref="/dashboard/admin/finance" />
          <h1 className="text-3xl font-bold tracking-tight">Fee Setup</h1>
          <p className="text-muted-foreground">Create fee categories and schedules before recording payments.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/admin/finance/fees/create">Create Fee</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fee Categories</CardTitle>
          <CardDescription>Categories control how schedules, discounts, and exemptions are grouped.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {setup.data.categories.length > 0 ? (
            setup.data.categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-sm text-muted-foreground">{category.type}</p>
                </div>
                <Badge variant={category.isActive ? "default" : "secondary"}>{category.isActive ? "Active" : "Inactive"}</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No fee categories yet. Create the first one to start billing.</p>
          )}
        </CardContent>
      </Card>

      {schedules.success ? (
        <FeeScheduleList schedules={schedules.data} />
      ) : (
        <p className="text-destructive">{schedules.error}</p>
      )}
    </div>
  )
}
