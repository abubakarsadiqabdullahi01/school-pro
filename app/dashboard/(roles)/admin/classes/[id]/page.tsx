import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, BookOpen, Edit } from "lucide-react"

import { PageTransition } from "@/components/dashboard/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ClassSubjectsTable, type ClassSubjectRow } from "@/components/class-management/class-subjects-table"
import { formatNaira } from "@/lib/money"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

const LEVEL_LABELS: Record<string, string> = {
  PRIMARY: "Primary",
  JSS: "Junior Secondary",
  SSS: "Senior Secondary",
}

/** One label/value pair in the details card. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

export default async function AdminClassDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")
  const id = (await params)?.id

  const classData = await prisma.class.findUnique({
    where: { id },
    include: {
      school: { select: { id: true, name: true, code: true } },
      classTerms: {
        select: {
          id: true,
          term: {
            select: {
              id: true,
              name: true,
              isCurrent: true,
              startDate: true,
              session: { select: { id: true, name: true } },
            },
          },
        },
      },
      subjects: {
        select: {
          classTermId: true,
          subject: { select: { id: true, name: true, code: true } },
        },
      },
    },
  })

  if (!classData || classData.school.id !== schoolId) {
    notFound()
  }

  const classTermIds = classData.classTerms.map((classTerm) => classTerm.id)

  const [currentRoll, charges] = await Promise.all([
    prisma.studentClassTerm.count({
      where: {
        classTerm: { classId: id, term: { isCurrent: true } },
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
    }),
    // Money comes from the charges raised against this class's students, not from the
    // legacy `FeeStructure` table the app no longer writes to — which is why this card used
    // to read "0 fee structure(s)" for every class in the school.
    prisma.studentCharge.aggregate({
      where: { classTermId: { in: classTermIds } },
      _sum: { finalAmountDue: true, amountPaid: true, balance: true },
    }),
  ])

  // Terms newest first, then grouped by session — "4 terms" reads as a mistake until you can
  // see it is three terms of one session plus one of the session before.
  const orderedClassTerms = [...classData.classTerms].sort(
    (a, b) => b.term.startDate.getTime() - a.term.startDate.getTime(),
  )

  const sessions: { id: string; name: string; terms: { id: string; name: string; isCurrent: boolean }[] }[] = []
  for (const classTerm of orderedClassTerms) {
    const session = classTerm.term.session
    let group = sessions.find((entry) => entry.id === session.id)
    if (!group) {
      group = { id: session.id, name: session.name, terms: [] }
      sessions.push(group)
    }
    group.terms.push({
      id: classTerm.term.id,
      name: classTerm.term.name,
      isCurrent: classTerm.term.isCurrent,
    })
  }

  // One row per subject, carrying the terms it is taught in.
  const termLabelByClassTerm = new Map(
    classData.classTerms.map((classTerm) => [
      classTerm.id,
      {
        id: classTerm.term.id,
        label: `${classTerm.term.name} (${classTerm.term.session.name})`,
        isCurrent: classTerm.term.isCurrent,
        startDate: classTerm.term.startDate,
      },
    ]),
  )

  const bySubject = new Map<string, ClassSubjectRow>()
  for (const link of classData.subjects) {
    const row = bySubject.get(link.subject.id) ?? {
      subjectId: link.subject.id,
      name: link.subject.name,
      code: link.subject.code,
      terms: [],
    }
    const term = termLabelByClassTerm.get(link.classTermId)
    if (term && !row.terms.some((existing) => existing.id === term.id)) {
      row.terms.push({ id: term.id, label: term.label, isCurrent: term.isCurrent })
    }
    bySubject.set(link.subject.id, row)
  }

  // Badges read First, Second, Third rather than in whatever order the join came back.
  const termOrder = new Map(
    [...classData.classTerms]
      .sort((a, b) => a.term.startDate.getTime() - b.term.startDate.getTime())
      .map((classTerm, index) => [classTerm.term.id, index] as const),
  )

  const subjectRows = [...bySubject.values()]
    .map((row) => ({
      ...row,
      terms: [...row.terms].sort(
        (a, b) => (termOrder.get(a.id) ?? 0) - (termOrder.get(b.id) ?? 0),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const termOptions = orderedClassTerms.map((classTerm) => ({
    id: classTerm.term.id,
    label: `${classTerm.term.name} (${classTerm.term.session.name})`,
  }))

  // Subjects belong to a class *term*, not to a class, so managing them means managing one
  // term's list. This page used to have its own "assign subjects" screen that wrote to the
  // current term while reading the class's subjects across every term — so a subject
  // already used in an earlier term could never be added back to the current one. It now
  // links to the per-class-term screen, which is the only place that does this.
  const currentClassTerm = classData.classTerms.find((classTerm) => classTerm.term.isCurrent)
  const subjectsHref = currentClassTerm
    ? `/dashboard/admin/class-terms/${currentClassTerm.id}/subjects`
    : null

  const billed = charges._sum.finalAmountDue ?? 0
  const collected = charges._sum.amountPaid ?? 0
  const outstanding = charges._sum.balance ?? 0

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <h2 className="text-3xl font-bold tracking-tight">{classData.name}</h2>
                <InfoGuide guideKey="admin.classes" />
              </div>
              <Badge variant="outline">{LEVEL_LABELS[classData.level] ?? classData.level}</Badge>
            </div>
            <p className="text-muted-foreground">
              {classData.school.name} ({classData.school.code})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/admin/classes">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All classes
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/admin/classes/edit/${classData.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit class
              </Link>
            </Button>
            {subjectsHref ? (
              <Button size="sm" asChild>
                <Link href={subjectsHref}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Manage subjects
                </Link>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/dashboard/admin/class-terms">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Open for this term
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Card className="shadow-sm lg:col-span-2">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Terms this class has run</CardTitle>
              <CardDescription>
                {orderedClassTerms.length} {orderedClassTerms.length === 1 ? "term" : "terms"} across{" "}
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2">
              {sessions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  This class has not been opened for any term yet.
                </p>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="space-y-1.5">
                    <p className="text-sm font-medium">{session.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {session.terms.map((term) => (
                        <Badge key={term.id} variant={term.isCurrent ? "default" : "outline"}>
                          {term.name}
                          {term.isCurrent && " · current"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-1">
              <CardTitle className="text-base">At a glance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <dl className="divide-y">
                <Detail label="Students this term">{currentRoll}</Detail>
                <Detail label="Subjects taught">{subjectRows.length}</Detail>
                <Detail label="Billed">{formatNaira(billed, { kobo: false })}</Detail>
                <Detail label="Collected">{formatNaira(collected, { kobo: false })}</Detail>
                <Detail label="Outstanding">
                  <span className={Number(outstanding) > 0 ? "text-destructive" : undefined}>
                    {formatNaira(outstanding, { kobo: false })}
                  </span>
                </Detail>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-semibold">Assigned subjects</h3>
              <p className="text-sm text-muted-foreground">
                One row per subject, with the terms it is taught in
              </p>
            </div>
            {subjectsHref ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={subjectsHref}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Manage this term's subjects
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not opened for the current term — assign it on{" "}
                <Link href="/dashboard/admin/class-terms" className="underline">
                  Class Terms
                </Link>{" "}
                first.
              </p>
            )}
          </div>
          <ClassSubjectsTable subjects={subjectRows} termOptions={termOptions} />
        </div>
      </div>
    </PageTransition>
  )
}
