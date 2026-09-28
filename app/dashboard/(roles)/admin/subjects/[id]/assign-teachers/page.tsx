import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, AlertTriangle } from "lucide-react"

import { PageTransition } from "@/components/dashboard/page-transition"
import { AssignTeachersForm } from "@/components/subject-management/assign-teachers-form"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminAssignTeachersPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")
  const id = (await params)?.id

  const subjectData = await prisma.subject.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      school: { select: { id: true, name: true, code: true } },
    },
  })

  if (!subjectData || subjectData.school.id !== schoolId) {
    notFound()
  }

  // A TeacherSubject row belongs to a term, so this screen edits one term's list. Reading
  // every term's rows was what let an unticked teacher be deleted out of past terms too.
  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true, session: { schoolId } },
    select: { id: true, name: true, session: { select: { name: true } } },
  })

  const backButton = (
    <Button variant="outline" size="sm" asChild className="w-fit">
      <Link href={`/dashboard/admin/subjects/${subjectData.id}`}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to {subjectData.name}
      </Link>
    </Button>
  )

  if (!currentTerm) {
    return (
      <PageTransition>
        <div className="space-y-6">
          {backButton}
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-3xl font-bold tracking-tight">Assign teachers</h2>
              <InfoGuide guideKey="admin.subjectTeachers" />
            </div>
            <p className="text-muted-foreground">{subjectData.name}</p>
          </div>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No current term</AlertTitle>
            <AlertDescription>
              Teachers are assigned to a subject for a particular term. A super admin has to make a term
              current before this can be set.
            </AlertDescription>
          </Alert>
        </div>
      </PageTransition>
    )
  }

  const [teachers, assigned, marked] = await Promise.all([
    prisma.teacher.findMany({
      where: { schoolId },
      select: {
        id: true,
        staffId: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
    }),
    prisma.teacherSubject.findMany({
      where: { subjectId: id, termId: currentTerm.id },
      select: { teacherId: true },
    }),
    // Who has already entered marks for this subject this term. Not a blocker — a teacher
    // handing over mid-term is ordinary — but removing someone who has been marking is
    // worth seeing before you do it.
    prisma.assessment.groupBy({
      by: ["teacherId"],
      where: { subjectId: id, termId: currentTerm.id, teacherId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const scoresByTeacher = Object.fromEntries(
    marked.filter((row) => row.teacherId).map((row) => [row.teacherId as string, row._count._all]),
  )

  return (
    <PageTransition>
      <div className="space-y-6">
        {backButton}

        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Assign teachers</h2>
            <InfoGuide guideKey="admin.subjectTeachers" />
          </div>
          <p className="text-muted-foreground">
            {subjectData.name} ({subjectData.code}) · {currentTerm.name} ({currentTerm.session.name})
          </p>
        </div>

        <AssignTeachersForm
          subjectId={subjectData.id}
          subjectName={subjectData.name}
          termLabel={`${currentTerm.name} (${currentTerm.session.name})`}
          teachers={teachers.map((teacher) => ({
            id: teacher.id,
            staffId: teacher.staffId,
            firstName: teacher.user.firstName,
            lastName: teacher.user.lastName,
            fullName: `${teacher.user.firstName} ${teacher.user.lastName}`,
          }))}
          assignedTeacherIds={assigned.map((row) => row.teacherId)}
          scoresByTeacher={scoresByTeacher}
        />
      </div>
    </PageTransition>
  )
}
