import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherCompilerInterface } from "@/components/teacher-compiler/TeacherCompilerInterface"

interface School {
  id: string
  name: string
  code: string
  logoUrl: string | null
}

interface Teacher {
  id: string
  staffId: string
  department: string | null
  qualification: string | null
  user: {
    firstName: string
    lastName: string
  }
  school: School
}

async function fetchTeacherData(userId: string): Promise<Teacher | null> {
  try {
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            code: true,
            logoUrl: true,
          },
        },
      },
    })

    return teacher
  } catch (error) {
    console.error("Failed to fetch teacher data:", error)
    return null
  }
}

export default async function TeacherCompilerPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "TEACHER") {
    redirect("/dashboard?error=unauthorized")
  }

  const teacher = await fetchTeacherData(session.user.id)

  if (!teacher) {
    redirect("/dashboard?error=teacher-profile-not-found")
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assessment Compiler</h2>
          <p className="text-muted-foreground">
            Enter and manage assessment scores for your assigned classes and subjects
          </p>
          <div className="mt-2 text-sm text-gray-600">
            {teacher.school.name} ({teacher.school.code}) • {teacher.user.firstName} {teacher.user.lastName}
            {teacher.department && ` • ${teacher.department}`}
          </div>
        </div>

        <TeacherCompilerInterface
          teacherId={teacher.id}
          schoolId={teacher.school.id}
          schoolName={teacher.school.name}
          schoolCode={teacher.school.code}
          schoolLogo={teacher.school.logoUrl}
          teacherName={`${teacher.user.firstName} ${teacher.user.lastName}`}
          department={teacher.department}
        />
      </div>
    </PageTransition>
  )
}