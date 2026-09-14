import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ClassTermSubjectsForm } from "@/components/class-term-management/class-term-subjects-form"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminClassTermSubjectsPage({ params }: { params: { id: string } }) {
  const { schoolId } = await requireAdminSchool("academics.manage")

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the class term, ensuring it belongs to the admin's school
  const classTerm = await prisma.classTerm.findUnique({
    where: { id },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          level: true,
          schoolId: true,
        },
      },
      term: {
        select: {
          id: true,
          name: true,
          isCurrent: true,
          session: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      classSubjects: {
        select: {
          id: true,
          subjectId: true,
        },
      },
    },
  })

  if (!classTerm || classTerm.class.schoolId !== schoolId) {
    notFound()
  }

  // Get all subjects for the school
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId,
    },
    orderBy: { name: "asc" },
  })

  // Get the IDs of subjects already assigned to the class term
  const assignedSubjectIds = classTerm.classSubjects.map((cs) => cs.subjectId)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assign Subjects to Class Term</h2>
          <p className="text-muted-foreground">
            Manage subjects for {classTerm.class.name} - {classTerm.term.name} ({classTerm.term.session.name})
          </p>
        </div>

        <ClassTermSubjectsForm
          classTermId={classTerm.id}
          className={classTerm.class.name}
          termName={`${classTerm.term.name} (${classTerm.term.session.name})`}
          subjects={subjects}
          assignedSubjectIds={assignedSubjectIds}
        />
      </div>
    </PageTransition>
  )
}
