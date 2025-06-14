import { Suspense } from "react"
import { CalendarOverview } from "@/components/school-calendar/CalendarOverview"
import { getSchoolCalendarData } from "@/app/actions/school-calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays } from "lucide-react"

function CalendarLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">School Calendar</h1>
          <p className="text-muted-foreground">Loading calendar data...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loading Calendar</CardTitle>
          <CardDescription>Please wait while we load your calendar data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted rounded animate-pulse"></div>
        </CardContent>
      </Card>
    </div>
  )
}

export default async function AdminCalendarPage() {
  try {
    const calendarData = await getSchoolCalendarData()

    return (
      <Suspense fallback={<CalendarLoading />}>
        <CalendarOverview initialData={calendarData} />
      </Suspense>
    )
  } catch (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">School Calendar</h1>
            <p className="text-muted-foreground md:text-red-600">Failed to load calendar data</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Error Loading Calendar</CardTitle>
            <CardDescription>
              There was an error loading your calendar data. Please try refreshing the page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If this problem persists, please contact your system administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }
}
