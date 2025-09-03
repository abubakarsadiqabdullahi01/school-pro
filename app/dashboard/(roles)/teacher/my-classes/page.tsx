import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherClassesView } from "@/components/teacher/teacher-classes-view"

export default async function TeacherMyClassesPage() {
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

  // Get teacher's assigned classes with detailed information
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
                select: {
                  id: true,
                  admissionNo: true,
                  userId: true,
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      avatarUrl: true,
                      gender: true,
                    },
                  },
                },
              },
            },
          },
          classSubjects: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Classes</h2>
          <p className="text-muted-foreground">
            Manage your assigned classes for{" "}
            {currentTerm ? `${currentTerm.name} (${currentTerm.session.name})` : "No current term"}
          </p>
        </div>

        <TeacherClassesView assignedClasses={assignedClasses} currentTerm={currentTerm} teacherId={teacher.id} />
      </div>
    </PageTransition>
  )
}
