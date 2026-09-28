import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherCreateForm } from "@/components/teacher-management/teacher-create-form"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminCreateTeacherPage() {
  const { school, schoolId } = await requireAdminSchool("teachers.manage")

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Create New Teacher</h2>
            <InfoGuide guideKey="admin.teacherCreate" />
          </div>
          <p className="text-muted-foreground">
            Add a new teacher to {school.name} ({school.code})
          </p>
        </div>

        <TeacherCreateForm schoolId={schoolId} schoolName={school.name} />
      </div>
    </PageTransition>
  )
}
