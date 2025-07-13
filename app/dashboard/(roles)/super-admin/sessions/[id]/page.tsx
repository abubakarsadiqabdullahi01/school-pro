import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getSessions } from "@/app/actions/session-management"
import { SessionsTable } from "@/components/session-management/sessions-table"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function SessionsPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const sessionsResult = await getSessions()

  if (!sessionsResult.success) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-destructive">Error Loading Sessions</h3>
            <p className="text-muted-foreground">{sessionsResult.error || "Failed to load sessions"}</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <SessionsTable sessions={sessionsResult.data} />
    </PageTransition>
  )
}
