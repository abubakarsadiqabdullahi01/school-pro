import { AdminSessionForm } from "@/components/session-management/admin-session-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminCreateSessionPage() {
  const { school, schoolId } = await requireAdminSchool()

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Academic Session</h2>
          <p className="text-muted-foreground">
            Add a new academic session for {school.name} ({school.code})
          </p>
        </div>

        <AdminSessionForm schoolId={schoolId} schoolName={school.name} schoolCode={school.code} />
      </div>
    </PageTransition>
  )
}
