import { format } from "date-fns"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  CalendarRange,
  ClipboardList,
  Edit,
  Users,
  Wallet,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { prisma } from "@/lib/db"
import { formatNaira } from "@/lib/money"
import { termTimeline } from "@/lib/term-timeline"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * What a term actually amounts to: who is on roll, how far the results have got, and what
 * the term has billed and collected.
 *
 * The page this replaces listed a count of classes, a count of assessments and a count of
 * `FeeStructure` rows — a legacy table the app no longer writes to, so it always read
 * "0 fee structure(s)" no matter how much a school had billed. Money here comes from
 * `StudentCharge`, which is what the finance module actually raises.
 *
 * A server component so it can do its own queries, shared by the school and platform
 * screens because they are the same page with different links. Both showing the same thing
 * is the point — an admin and a super admin looking at one term should not be reading two
 * different reports.
 */

export interface TermOverviewRoutes {
  /** The list to go back to. */
  terms: string
  /** The parent session's page. */
  session: (sessionId: string) => string
  /** Where fees for the term are set up. Omitted on screens that have no finance area. */
  fees?: string
  /** Shown only when the viewer may edit the term. */
  edit?: string
}

const formatDate = (date: Date) => format(new Date(date), "d MMM yyyy")

/**
 * How a class term's results are described.
 *
 * The workflow row only exists once somebody has touched the results, so its absence is a
 * state of its own rather than a missing value.
 */
const RESULT_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-foreground" },
  REVIEWED: { label: "In review", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  PUBLISHED: { label: "Published", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
  LOCKED: { label: "Locked", className: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
}

const NOT_STARTED = { label: "Not started", className: "bg-muted text-muted-foreground" }

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: typeof Users
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="p-3 pt-1">
        <div className="text-xl font-bold leading-tight">{value}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

/** One label/value pair in the side cards. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

/**
 * Loads the term, or returns null when it does not exist or is outside the caller's school.
 *
 * Kept separate so a page can call `notFound()` itself — a component cannot, without
 * swallowing the distinction between "no such term" and "not yours".
 */
export async function loadTermOverview(termId: string, schoolId?: string) {
  return prisma.term.findFirst({
    where: {
      id: termId,
      ...(schoolId ? { session: { schoolId } } : {}),
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
          school: { select: { name: true, code: true } },
        },
      },
      classTerms: {
        select: {
          id: true,
          class: { select: { id: true, name: true } },
          resultWorkflow: { select: { status: true } },
          _count: { select: { classSubjects: true, teachers: true } },
        },
      },
    },
  })
}

export type TermOverviewData = NonNullable<Awaited<ReturnType<typeof loadTermOverview>>>

export async function TermOverview({
  term,
  routes,
}: {
  term: TermOverviewData
  routes: TermOverviewRoutes
}) {
  const [enrolments, scores, publishedScores, feeScheduleCount, charges] = await Promise.all([
    // TRANSFERRED and DROPPED students are not on this term's roll; COMPLETED ones are,
    // which is the same pair the compiler and the report cards count.
    prisma.studentClassTerm.groupBy({
      by: ["classTermId"],
      where: { termId: term.id, status: { in: ["ACTIVE", "COMPLETED"] } },
      _count: { _all: true },
    }),
    prisma.assessment.count({ where: { termId: term.id } }),
    prisma.assessment.count({ where: { termId: term.id, isPublished: true } }),
    prisma.feeSchedule.count({ where: { termId: term.id } }),
    // Money comes from the charges actually raised against students, not from the fee
    // schedules that define them — a schedule nobody has been billed for owes nothing.
    prisma.studentCharge.aggregate({
      where: { termId: term.id },
      _sum: { finalAmountDue: true, amountPaid: true, balance: true },
    }),
  ])

  const rollByClassTerm = new Map(enrolments.map((row) => [row.classTermId, row._count._all]))
  const classRows = term.classTerms
    .map((classTerm) => ({
      ...classTerm,
      roll: rollByClassTerm.get(classTerm.id) ?? 0,
      status: classTerm.resultWorkflow
        ? (RESULT_STATUS[classTerm.resultWorkflow.status] ?? NOT_STARTED)
        : NOT_STARTED,
    }))
    .sort((a, b) => a.class.name.localeCompare(b.class.name))

  const totalRoll = classRows.reduce((sum, row) => sum + row.roll, 0)
  const publishedClasses = classRows.filter(
    (row) => row.resultWorkflow?.status === "PUBLISHED" || row.resultWorkflow?.status === "LOCKED",
  ).length

  const billed = charges._sum.finalAmountDue ?? 0
  const collected = charges._sum.amountPaid ?? 0
  const outstanding = charges._sum.balance ?? 0

  const timeline = termTimeline(term)
  const phaseBadge = term.isCurrent
    ? { label: "Current term", className: "bg-green-500/10 text-green-700 dark:text-green-400" }
    : timeline.phase === "upcoming"
      ? { label: "Upcoming", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" }
      : timeline.phase === "running"
        ? { label: "Open", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" }
        : { label: "Completed", className: "bg-muted text-foreground" }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <h2 className="text-3xl font-bold tracking-tight">{term.name}</h2>
              <InfoGuide guideKey="admin.terms" />
            </div>
            <Badge className={phaseBadge.className}>{phaseBadge.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {term.session.name} · {term.session.school.name} ({term.session.school.code})
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDate(term.startDate)} – {formatDate(term.endDate)} · {timeline.weeks} weeks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={routes.terms}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              All terms
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={routes.session(term.sessionId)}>
              <CalendarRange className="mr-2 h-4 w-4" />
              {term.session.name} session
            </Link>
          </Button>
          {routes.edit && (
            <Button variant="outline" size="sm" asChild>
              <Link href={routes.edit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit term
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Classes"
          value={String(classRows.length)}
          hint={`${publishedClasses} with results published`}
          icon={BookOpen}
        />
        <StatCard
          label="Students on roll"
          value={totalRoll.toLocaleString("en-NG")}
          hint={classRows.length > 0 ? `across ${classRows.length} classes` : "no classes opened yet"}
          icon={Users}
        />
        <StatCard
          label="Score records"
          value={scores.toLocaleString("en-NG")}
          hint={`${publishedScores.toLocaleString("en-NG")} released to students`}
          icon={ClipboardList}
        />
        <StatCard
          label="Outstanding fees"
          value={formatNaira(outstanding, { kobo: false })}
          hint={`${formatNaira(collected, { kobo: false })} of ${formatNaira(billed, { kobo: false })} collected`}
          icon={Wallet}
        />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Term progress</CardTitle>
            <span className="text-sm text-muted-foreground">{timeline.summary}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-2">
          <Progress value={timeline.percent} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatDate(term.startDate)}</span>
            <span>{formatDate(term.endDate)}</span>
          </div>
        </CardContent>
      </Card>

      {/* items-start so the classes card stops stretching to match the taller column. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Classes running this term</CardTitle>
            <CardDescription>Roll, subjects and where each class has reached with results</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {classRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No classes have been opened for this term yet.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right">Students</TableHead>
                      <TableHead className="text-right">Subjects</TableHead>
                      <TableHead className="text-right">Teachers</TableHead>
                      <TableHead className="text-right">Results</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.class.name}</TableCell>
                        <TableCell className="text-right">{row.roll}</TableCell>
                        <TableCell className="text-right">{row._count.classSubjects}</TableCell>
                        <TableCell className="text-right">{row._count.teachers}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={row.status.className}>{row.status.label}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-1">
              <CardTitle className="text-base">Term details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <dl className="divide-y">
                <Detail label="Session">{term.session.name}</Detail>
                <Detail label="School">
                  {term.session.school.name} ({term.session.school.code})
                </Detail>
                <Detail label="Starts">{formatDate(term.startDate)}</Detail>
                <Detail label="Ends">{formatDate(term.endDate)}</Detail>
                <Detail label="Length">
                  {timeline.days} days ({timeline.weeks} weeks)
                </Detail>
                <Detail label="Created">{formatDate(term.createdAt)}</Detail>
              </dl>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-1">
              <CardTitle className="text-base">Fees this term</CardTitle>
              <CardDescription>
                {feeScheduleCount} fee {feeScheduleCount === 1 ? "schedule" : "schedules"} set for this term
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <dl className="divide-y">
                <Detail label="Billed">{formatNaira(billed)}</Detail>
                <Detail label="Collected">{formatNaira(collected)}</Detail>
                <Detail label="Outstanding">
                  <span className={Number(outstanding) > 0 ? "text-destructive" : undefined}>
                    {formatNaira(outstanding)}
                  </span>
                </Detail>
              </dl>
              {routes.fees && (
                <>
                  <Separator className="my-3" />
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link href={routes.fees}>Manage fees</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
