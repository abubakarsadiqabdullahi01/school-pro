import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherDashboardOverview } from "@/components/teacher/teacher-dashboard-overview"

export default async function TeacherDashboardPage() {
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
          logoUrl: true,
        },
      },
      user: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
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

  // Get teacher's assigned classes (form teacher role)
  const assignedClasses = await prisma.teacherClassTerm.findMany({
    where: {
      teacherId: teacher.id,
      classTerm: {
        termId: currentTerm?.id,
      },
    },
    include: {
      classTerm: {
        include: {
          class: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
          term: {
            select: {
              id: true,
              name: true,
            },
          },
          students: {
            include: {
              student: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  // Get teacher's subjects
  const teacherSubjects = await prisma.teacherSubject.findMany({
    where: {
      teacherId: teacher.id,
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Welcome, {teacher.user.firstName} {teacher.user.lastName}
          </h2>
          <p className="text-muted-foreground">
            {teacher.school.name} ({teacher.school.code}) -{" "}
            {currentTerm ? `${currentTerm.name} (${currentTerm.session.name})` : "No current term"}
          </p>
        </div>

        <TeacherDashboardOverview
          teacher={teacher}
          currentTerm={currentTerm}
          assignedClasses={assignedClasses}
          teacherSubjects={teacherSubjects}
        />
      </div>
    </PageTransition>
  )
}
