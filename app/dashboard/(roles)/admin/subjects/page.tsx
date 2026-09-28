import { prisma } from "@/lib/db"
import { AllSubjectsTable } from "@/components/subject-management/admin-all-subjects"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminSubjectsPage() {
  const { school, schoolId } = await requireAdminSchool("academics.manage")

  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true, session: { schoolId } },
    select: { id: true, name: true, session: { select: { name: true } } },
  })

  const subjects = await prisma.subject.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      code: true,
      // Everything, for the delete rule — a subject dropped from every class this term is
      // still taught in the terms behind it.
      _count: { select: { classSubjects: true, assessments: true } },
      // This term only, for the columns. The counts used to span every term, so a subject
      // taught in 6 classes over 3 terms read as "18 classes".
      classSubjects: {
        where: currentTerm ? { classTerm: { termId: currentTerm.id } } : { id: "" },
        select: { classTerm: { select: { class: { select: { id: true, name: true, level: true } } } } },
      },
      teacherSubjects: {
        where: currentTerm ? { termId: currentTerm.id } : { id: "" },
        select: {
          teacher: {
            select: { id: true, user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  const formattedSubjects = subjects.map((subject) => {
    // Distinct, because a class can appear more than once through its class terms.
    const classes = new Map(
      subject.classSubjects.map((link) => [
        link.classTerm.class.id,
        { id: link.classTerm.class.id, name: link.classTerm.class.name, level: link.classTerm.class.level },
      ]),
    )
    const teachers = new Map(
      subject.teacherSubjects.map((link) => [
        link.teacher.id,
        { id: link.teacher.id, name: `${link.teacher.user.firstName} ${link.teacher.user.lastName}` },
      ]),
    )

    return {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      classes: [...classes.values()].sort((a, b) => a.name.localeCompare(b.name)),
      teachers: [...teachers.values()].sort((a, b) => a.name.localeCompare(b.name)),
      classAssignments: subject._count.classSubjects,
      recordedScores: subject._count.assessments,
    }
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Subjects</h2>
            <InfoGuide guideKey="admin.subjects" />
          </div>
          <p className="text-muted-foreground">
            {currentTerm
              ? `Classes and teachers shown for ${currentTerm.name} (${currentTerm.session.name})`
              : `Manage subjects for ${school.name} (${school.code})`}
          </p>
        </div>

        <AllSubjectsTable subjects={formattedSubjects} hasCurrentTerm={!!currentTerm} />
      </div>
    </PageTransition>
  )
}
