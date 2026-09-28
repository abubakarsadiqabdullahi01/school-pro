import { PageTransition } from "@/components/dashboard/page-transition"
import { TeachersTable } from "@/components/teacher-management/teachers-table"
import { getTeachers } from "@/app/actions/teacher-management"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"
import { TEACHER_ASSIGNMENT_PERMISSIONS } from "@/lib/permissions"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminTeachersPage() {
  // The Exams Officer reaches this list to assign subjects; only HR hires or removes.
  const { school } = await requireAdminSchool([...TEACHER_ASSIGNMENT_PERMISSIONS])
  const canManageTeachers = (await getEffectivePermissionsForCurrentUser()).includes("teachers.manage")

  const teachersResult = await getTeachers()
  const teachers = teachersResult.success && teachersResult.data ? teachersResult.data : []

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Teacher Management</h2>
            <InfoGuide guideKey="admin.teachers" />
          </div>
          <p className="text-muted-foreground">
            Manage teachers for {school.name} ({school.code})
          </p>
        </div>

        <TeachersTable teachers={teachers} canManageTeachers={canManageTeachers} />
      </div>
    </PageTransition>
  )
}
