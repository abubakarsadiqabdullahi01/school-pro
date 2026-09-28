import { prisma } from "@/lib/db"
import { AllClassesTable } from "@/components/class-management/admin-all-classes"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminClassesPage() {
  const { school, schoolId } = await requireAdminSchool("academics.manage")

  const classes = await prisma.class.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      level: true,
      classTerms: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  })

  // The roll and the subject list, gathered for every class at once rather than per row.
  // The roll is what decides whether a class can be deleted, so the table can grey the
  // action out instead of offering it and failing.
  const classTermIds = classes.flatMap((cls) => cls.classTerms.map((classTerm) => classTerm.id))
  const classIdByClassTerm = new Map(
    classes.flatMap((cls) => cls.classTerms.map((classTerm) => [classTerm.id, cls.id] as const)),
  )

  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true, session: { schoolId } },
    select: { id: true },
  })

  const [enrolments, currentRolls, subjectLinks] = await Promise.all([
    classTermIds.length > 0
      ? prisma.studentClassTerm.groupBy({
          by: ["classTermId"],
          where: { classTermId: { in: classTermIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    // This term's roll, which is what a school means by "how many students are in JSS 1A".
    classTermIds.length > 0 && currentTerm
      ? prisma.studentClassTerm.groupBy({
          by: ["classTermId"],
          where: {
            classTermId: { in: classTermIds },
            termId: currentTerm.id,
            status: { in: ["ACTIVE", "COMPLETED"] },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.classSubject.findMany({
      where: { class: { schoolId } },
      select: { classId: true, subjectId: true },
    }),
  ])

  const sumByClass = (rows: { classTermId: string; _count: { _all: number } }[]) => {
    const totals = new Map<string, number>()
    for (const row of rows) {
      const classId = classIdByClassTerm.get(row.classTermId)
      if (!classId) continue
      totals.set(classId, (totals.get(classId) ?? 0) + row._count._all)
    }
    return totals
  }

  const enrolmentsByClass = sumByClass(enrolments)
  const rollByClass = sumByClass(currentRolls)

  // Distinct subjects, not one per term. The old count summed every ClassSubject row across
  // every term, so a class taking 8 subjects over 3 terms read as "24 subject(s)".
  const subjectsByClass = new Map<string, Set<string>>()
  for (const link of subjectLinks) {
    const set = subjectsByClass.get(link.classId) ?? new Set<string>()
    set.add(link.subjectId)
    subjectsByClass.set(link.classId, set)
  }

  const formattedClasses = classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    level: cls.level,
    schoolName: school.name,
    schoolCode: school.code,
    subjectsCount: subjectsByClass.get(cls.id)?.size ?? 0,
    termsCount: cls.classTerms.length,
    enrolments: enrolmentsByClass.get(cls.id) ?? 0,
    currentRoll: rollByClass.get(cls.id) ?? 0,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Classes</h2>
            <InfoGuide guideKey="admin.classes" />
          </div>
          <p className="text-muted-foreground">
            Manage classes for {school.name} ({school.code})
          </p>
        </div>

        <AllClassesTable classes={formattedClasses} />
      </div>
    </PageTransition>
  )
}
