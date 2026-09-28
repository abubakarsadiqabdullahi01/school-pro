import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherEditForm } from "@/components/teacher-management/teacher-edit-form"
import { getTeacher } from "@/app/actions/teacher-management"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminEditTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSchool("teachers.manage")
  const { id } = await params

  const teacherResult = await getTeacher(id)

  if (!teacherResult.success || !teacherResult.data) {
    notFound()
  }

  const teacherData = teacherResult.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Edit Teacher</h2>
            <InfoGuide guideKey="admin.teachers" />
          </div>
          <p className="text-muted-foreground">
            Update teacher information for {teacherData.school.name} ({teacherData.school.code})
          </p>
        </div>

        <TeacherEditForm teacherData={teacherData} />
      </div>
    </PageTransition>
  )
}
