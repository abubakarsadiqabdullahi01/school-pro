import { redirect } from "next/navigation"

import { getMyOverview } from "@/app/actions/student-portal"
import { AttendancePanel } from "@/components/portal/portal-panels"
import { PageTransition } from "@/components/dashboard/page-transition"
import { InfoGuide } from "@/components/ui/info-guide"

export const metadata = { title: "My attendance" }

export default async function StudentAttendancePage() {
  const result = await getMyOverview()
  if (!result.success) redirect("/dashboard/access-error")

  const { attendance } = result.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">My Attendance</h1>
            <InfoGuide guideKey="student.dashboard" />
          </div>
          <p className="text-muted-foreground">
            {attendance.rate === null
              ? "Nothing marked yet."
              : `${attendance.rate}% present across your last ${attendance.total} marked days.`}
          </p>
        </div>

        <AttendancePanel attendance={attendance} who="Your" />
      </div>
    </PageTransition>
  )
}
