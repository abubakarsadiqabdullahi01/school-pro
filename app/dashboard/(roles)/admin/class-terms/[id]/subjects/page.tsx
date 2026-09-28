import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ClassTermSubjectsForm } from "@/components/class-term-management/class-term-subjects-form"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminClassTermSubjectsPage({ params }: { params: Promise<{ id: string }> }) {
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

  // How many scores each subject already carries for this class this term. Unticking such
  // a subject takes it off the class, which hides those scores from the entry sheet and the
  // report card — so the form shows the count and locks the tick rather than letting an
  // admin find out from an error toast.
  const marked = await prisma.assessment.groupBy({
    by: ["subjectId"],
    where: { studentClassTerm: { classTermId: classTerm.id } },
    _count: { _all: true },
  })
  const scoresBySubject = Object.fromEntries(marked.map((row) => [row.subjectId, row._count._all]))

  return (
    <PageTransition>
      <div className="space-y-6">
        <ClassTermSubjectsForm
          classTermId={classTerm.id}
          className={classTerm.class.name}
          termName={`${classTerm.term.name} (${classTerm.term.session.name})`}
          subjects={subjects}
          assignedSubjectIds={assignedSubjectIds}
          scoresBySubject={scoresBySubject}
        />
      </div>
    </PageTransition>
  )
}
