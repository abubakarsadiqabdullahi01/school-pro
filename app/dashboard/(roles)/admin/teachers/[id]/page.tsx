import { notFound } from "next/navigation"
import Link from "next/link"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherDetails } from "@/components/teacher-management/teacher-details"
import { getTeacher } from "@/app/actions/teacher-management"
import { Button } from "@/components/ui/button"
import { MoveLeft as MoveLeftIcon } from "lucide-react"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"
import { TEACHER_ASSIGNMENT_PERMISSIONS } from "@/lib/permissions"

export default async function AdminTeacherDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSchool([...TEACHER_ASSIGNMENT_PERMISSIONS])
  const canManageTeachers = (await getEffectivePermissionsForCurrentUser()).includes("teachers.manage")
  const { id } = await params

  const teacherResult = await getTeacher(id)

  if (!teacherResult.success || !teacherResult.data) {
    notFound()
  }

  const teacherData = teacherResult.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-row justify-between">
         
           <Button variant="outline" asChild>
            <Link href={`/dashboard/admin/teachers`}>
              <MoveLeftIcon className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        <TeacherDetails teacher={teacherData} canManageTeachers={canManageTeachers} />
      </div>
    </PageTransition>
  )
}
