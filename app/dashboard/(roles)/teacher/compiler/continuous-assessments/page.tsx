import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherCASheetComponent } from "@/components/teacher-compiler/teacher-ca-sheet"
import type { ClassLevel } from "@prisma/client"

export default async function TeacherCASheetPage() {
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
          address: true,
          phone: true,
          email: true,
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

  // Get all terms for the school
  const terms = await prisma.term.findMany({
    where: {
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
    orderBy: [{ isCurrent: "desc" }, { session: { startDate: "desc" } }, { startDate: "desc" }],
  })

  const classLevels: ClassLevel[] = ["PRIMARY", "JSS", "SSS"]

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Continuous Assessment Sheet</h2>
          <p className="text-muted-foreground">
            Generate CA sheets for your assigned subjects at {teacher.school.name} ({teacher.school.code})
          </p>
        </div>

        <TeacherCASheetComponent
          teacherId={teacher.id}
          schoolId={teacher.schoolId}
          schoolName={teacher.school.name}
          schoolCode={teacher.school.code}
          schoolLogo={teacher.school.logoUrl}
          schoolAddress={teacher.school.address}
          schoolPhone={teacher.school.phone}
          schoolEmail={teacher.school.email}
          terms={terms}
          currentTermId={currentTerm?.id}
          classLevels={classLevels}
        />
      </div>
    </PageTransition>
  )
}
