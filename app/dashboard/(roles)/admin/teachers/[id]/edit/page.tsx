import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherEditForm } from "@/components/teacher-management/teacher-edit-form"
import { getTeacher } from "@/app/actions/teacher-management"

export default async function AdminEditTeacherPage({ params }: { params: { id: string } }) {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    select: { schoolId: true },
  })

  if (!admin) {
    redirect("/dashboard/access-error")
  }

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the teacher to edit, ensuring it belongs to the admin's school
  const teacherResult = await getTeacher(id)

  if (!teacherResult.success || !teacherResult.data) {
    notFound()
  }

  const teacherData = teacherResult.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Edit Teacher</h2>
          <p className="text-muted-foreground">
            Update teacher information for {teacherData.school.name} ({teacherData.school.code})
          </p>
        </div>

        <TeacherEditForm teacherData={teacherData} />
      </div>
    </PageTransition>
  )
}
