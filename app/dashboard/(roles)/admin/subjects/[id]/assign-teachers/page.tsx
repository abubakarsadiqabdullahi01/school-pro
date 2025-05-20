import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { AssignTeachersForm } from "@/components/subject-management/assign-teachers-form"

export default async function AdminAssignTeachersPage({ params }: { params: { id: string } }) {
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

  // Fetch the subject, ensuring it belongs to the admin's school
  const subjectData = await prisma.subject.findUnique({
    where: { id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      teacherSubjects: {
        select: {
          teacherId: true,
        },
      },
    },
  })

  if (!subjectData || subjectData.school.id !== admin.schoolId) {
    notFound()
  }

  // Get all teachers for the school
  const teachers = await prisma.teacher.findMany({
    where: {
      schoolId: admin.schoolId,
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
  })

  // Format teachers for the form
  const formattedTeachers = teachers.map((teacher) => ({
    id: teacher.id,
    staffId: teacher.staffId,
    firstName: teacher.user.firstName,
    lastName: teacher.user.lastName,
    fullName: `${teacher.user.firstName} ${teacher.user.lastName}`,
  }))

  // Get the IDs of teachers already assigned to the subject
  const assignedTeacherIds = subjectData.teacherSubjects.map((ts) => ts.teacherId)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assign Teachers</h2>
          <p className="text-muted-foreground">
            Manage teachers for {subjectData.name} - {subjectData.school.name} ({subjectData.school.code})
          </p>
        </div>

        <AssignTeachersForm
          subjectId={subjectData.id}
          subjectName={subjectData.name}
          teachers={formattedTeachers}
          assignedTeacherIds={assignedTeacherIds}
        />
      </div>
    </PageTransition>
  )
}
