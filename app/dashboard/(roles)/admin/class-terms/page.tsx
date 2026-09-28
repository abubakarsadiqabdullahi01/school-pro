import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ClassTermsTable } from "@/components/class-term-management/class-terms-table"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminClassTermsPage() {
  const { schoolId } = await requireAdminSchool("academics.manage")

  // Get current terms for the school
  const currentTerms = await prisma.term.findMany({
    where: {
      isCurrent: true,
      session: {
        schoolId,
      },
    },
    include: {
      session: true,
    },
    orderBy: {
      startDate: "desc",
    },
    take: 1,
  })

  const currentTerm = currentTerms.length > 0 ? currentTerms[0] : null

  // Get all classes for the school
  const classes = await prisma.class.findMany({
    where: {
      schoolId,
    },
    orderBy: {
      name: "asc",
    },
    include: {
      classTerms: {
        where: {
          termId: currentTerm?.id,
        },
        include: {
          term: true,
        },
      },
    },
  })

  // The roll per class, so the table can say what removing a class would cost instead of
  // offering the button and refusing afterwards.
  const classTermIds = classes.flatMap((cls) => cls.classTerms.map((classTerm) => classTerm.id))
  const rolls =
    classTermIds.length > 0
      ? await prisma.studentClassTerm.groupBy({
          by: ["classTermId"],
          where: { classTermId: { in: classTermIds } },
          _count: { _all: true },
        })
      : []
  const rollByClassTerm = new Map(rolls.map((row) => [row.classTermId, row._count._all]))

  // Format classes for the table
  const formattedClasses = classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    level: cls.level,
    isAssignedToCurrentTerm: cls.classTerms.length > 0,
    classTermId: cls.classTerms[0]?.id || null,
    enrolledStudents: cls.classTerms[0] ? (rollByClassTerm.get(cls.classTerms[0].id) ?? 0) : 0,
  }))

  // After fetching currentTerm
  const sessionDetails = currentTerm ? await prisma.session.findUnique({
    where: { id: currentTerm.sessionId },
  }) : null;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Class Term Management</h2>
            <InfoGuide guideKey="admin.classTerms" />
          </div>
          <p className="text-muted-foreground">
            Manage classes for {currentTerm ? `${currentTerm.name} (${sessionDetails ? sessionDetails.name : "No session"})` : "No current term"}
          </p>
        </div>
        {currentTerm ? (
          <ClassTermsTable
            classes={formattedClasses}
            currentTerm={{
              id: currentTerm.id,
              name: currentTerm.name,
              sessionName: sessionDetails ? sessionDetails.name : "No session",
            }}
          />
        ) : (
          // Was a hand-rolled box in fixed yellow-50/yellow-800, which turned into a
          // bright panel with unreadable text in dark mode.
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No current term</AlertTitle>
            <AlertDescription>
              There is no current term set for your school. A super admin has to make a term current before
              classes can be managed for it.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </PageTransition>
  )
}
