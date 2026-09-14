import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherAttendanceView } from "@/components/teacher/teacher-attendance-view"
import { requireTeacher } from "@/lib/authz"

export default async function TeacherAttendancePage() {
  const actor = await requireTeacher().catch(() => null)
  if (!actor) redirect("/dashboard")

  // Get the teacher's information
  const teacher = await prisma.teacher.findUnique({
    where: { userId: actor.userId },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  if (!teacher || !teacher.school) {
    redirect("/dashboard/access-error")
  }

  // Get current term
  const currentTerm = await prisma.term.findFirst({
    where: {
      isCurrent: true,
      session: {
        schoolId: teacher.schoolId,
      },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Attendance Management</h2>
          <p className="text-muted-foreground">
            Mark and manage student attendance for{" "}
            {currentTerm ? `${currentTerm.name} (${currentTerm.session.name})` : "No current term"}
          </p>
        </div>

        <TeacherAttendanceView teacherId={teacher.id} currentTerm={currentTerm} />
      </div>
    </PageTransition>
  )
}
