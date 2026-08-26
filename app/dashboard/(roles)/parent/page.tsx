import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { Calendar, CheckCircle, DollarSign, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatsCard } from "@/components/dashboard/stats-card"
import { formatDate } from "@/lib/format"
import { formatNaira, sumAmounts } from "@/lib/money"

export default async function ParentDashboardPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "PARENT") {
    redirect("/dashboard")
  }

  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { firstName: true, lastName: true } },
      school: { select: { name: true, code: true } },
      students: {
        include: {
          student: {
            include: {
              user: { select: { firstName: true, lastName: true, avatarUrl: true } },
              classTerms: {
                orderBy: { createdAt: "desc" },
                include: {
                  classTerm: {
                    include: {
                      class: { select: { name: true, level: true } },
                      term: { include: { session: { select: { name: true } } } },
                    },
                  },
                },
              },
              assessments: {
                include: {
                  term: { select: { isCurrent: true } },
                  subject: { select: { name: true } },
                },
              },
              attendances: { orderBy: { date: "desc" }, take: 5 },
              payments: {
                include: {
                  feeStructure: { select: { name: true, amount: true } },
                  // Payment carries its own term now, so "what is owed this term" no
                  // longer has to be answered by joining out through the fee structure.
                  term: { select: { name: true, isCurrent: true } },
                },
                orderBy: { paymentDate: "desc" },
              },
            },
          },
        },
      },
    },
  })

  if (!parent) {
    redirect("/dashboard/access-error")
  }

  const children = parent.students.map((link) => link.student)
  const currentPayments = children.flatMap((child) =>
    child.payments.filter((payment) => payment.term.isCurrent),
  )
  // Summed as Decimal, not with `+` — see lib/money.ts.
  const paidAmount = sumAmounts(
    currentPayments.filter((payment) => payment.status === "COMPLETED").map((p) => p.amount),
  )
  const pendingAmount = sumAmounts(
    currentPayments.filter((payment) => payment.status === "PENDING").map((p) => p.amount),
  )
  const attendanceRecords = children.flatMap((child) => child.attendances)
  const presentCount = attendanceRecords.filter((attendance) => attendance.status === "PRESENT").length
  const attendanceRate =
    attendanceRecords.length > 0 ? Math.round((presentCount / attendanceRecords.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome, {parent.user.firstName} {parent.user.lastName}
        </h2>
        <p className="text-muted-foreground">
          {parent.school.name} ({parent.school.code}) parent portal
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Children" value={String(children.length)} icon={Users} />
        <StatsCard title="Attendance" value={attendanceRecords.length ? `${attendanceRate}%` : "No records"} icon={CheckCircle} />
        <StatsCard title="Paid This Term" value={formatNaira(paidAmount, { kobo: false })} icon={DollarSign} />
        <StatsCard title="Pending Fees" value={formatNaira(pendingAmount, { kobo: false })} icon={Calendar} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {children.length > 0 ? (
          children.map((child) => {
            const enrollment =
              child.classTerms.find((entry) => entry.classTerm.term.isCurrent) ?? child.classTerms[0]
            const currentAssessments = child.assessments.filter((assessment) => assessment.term.isCurrent)
            const scoreTotals = currentAssessments
              .map((assessment) => (assessment.ca1 ?? 0) + (assessment.ca2 ?? 0) + (assessment.ca3 ?? 0) + (assessment.exam ?? 0))
              .filter((score) => score > 0)
            const averageScore =
              scoreTotals.length > 0
                ? Math.round(scoreTotals.reduce((sum, score) => sum + score, 0) / scoreTotals.length)
                : null

            return (
              <Card key={child.id}>
                <CardHeader>
                  <CardTitle>
                    {child.user.firstName} {child.user.lastName}
                  </CardTitle>
                  <CardDescription>
                    {child.admissionNo} · {enrollment?.classTerm.class.name ?? "No class assigned"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Current Term</div>
                      <div className="font-medium">{enrollment?.classTerm.term.name ?? "Not set"}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Average</div>
                      <div className="font-medium">{averageScore === null ? "Pending" : `${averageScore}%`}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Fee Records</div>
                      <div className="font-medium">{child.payments.length}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-medium">Latest Attendance</h3>
                    <div className="space-y-2">
                      {child.attendances.length > 0 ? (
                        child.attendances.map((attendance) => (
                          <div key={attendance.id} className="flex items-center justify-between text-sm">
                            <span>{formatDate(attendance.date)}</span>
                            <Badge variant={attendance.status === "PRESENT" ? "default" : "secondary"}>{attendance.status}</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No attendance records yet.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-medium">Recent Payments</h3>
                    <div className="space-y-2">
                      {child.payments.slice(0, 3).map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between text-sm">
                          <span>{payment.feeStructure?.name ?? "Fee payment"}</span>
                          <span>{formatNaira(payment.amount)} · {payment.status}</span>
                        </div>
                      ))}
                      {child.payments.length === 0 && (
                        <p className="text-sm text-muted-foreground">No payment records yet. The finance module will expand this area.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>No linked children</CardTitle>
              <CardDescription>This parent account is not linked to any student records yet.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}
