import { PageTransition } from "@/components/dashboard/page-transition"
import { TeachersTable } from "@/components/teacher-management/teachers-table"
import { getTeachers } from "@/app/actions/teacher-management"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminTeachersPage() {
  const { school } = await requireAdminSchool()

  const teachersResult = await getTeachers()
  const teachers = teachersResult.success && teachersResult.data ? teachersResult.data : []

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Teacher Management</h2>
          <p className="text-muted-foreground">
            Manage teachers for {school.name} ({school.code})
          </p>
        </div>

        <TeachersTable teachers={teachers} />
      </div>
    </PageTransition>
  )
}
