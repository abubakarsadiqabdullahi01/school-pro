import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherAttendanceView } from "@/components/teacher/teacher-attendance-view"

export default async function TeacherAttendancePage() {
  const session = await auth()

  // Check if user is teacher
  if (!session?.user || session.user.role !== "TEACHER") {
    redirect("/dashboard")
  }

  // Get the teacher's information
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
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
