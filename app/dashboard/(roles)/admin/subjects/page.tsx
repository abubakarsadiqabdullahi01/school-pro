import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AllSubjectsTable } from "@/components/subject-management/admin-all-subjects"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function AdminSubjectsPage() {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
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

  if (!admin || !admin.school) {
    redirect("/dashboard/access-error")
  }

  // Fetch all subjects for the admin's school with detailed relations
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: admin.school.id,
    },
    include: {
      classSubjects: {
        include: {
          classTerm: {
            include: {
              class: {
                select: {
                  name: true,
                  level: true,
                },
              },
              term: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      teacherSubjects: {
        include: {
          teacher: {
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
    orderBy: { name: "asc" },
  })

  // Format subjects for the table with detailed information
  const formattedSubjects = subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    code: subject.code,
    schoolId: admin.school!.id,
    schoolName: admin.school!.name,
    schoolCode: admin.school!.code,
    classes: subject.classSubjects.map(cs => ({
      id: cs.id,
      className: cs.classTerm.class.name,
      classLevel: cs.classTerm.class.level,
      termName: cs.classTerm.term.name,
    })),
    teachers: subject.teacherSubjects.map(ts => ({
      id: ts.id,
      name: `${ts.teacher.user.firstName} ${ts.teacher.user.lastName}`,
      teacherId: ts.teacher.id,
    })),
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Subject Management</h2>
          <p className="text-muted-foreground">
            Manage all subjects for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <AllSubjectsTable subjects={formattedSubjects} />
      </div>
    </PageTransition>
  )
}