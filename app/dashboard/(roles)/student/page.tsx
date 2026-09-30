import { redirect } from "next/navigation"

import { getMyOverview } from "@/app/actions/student-portal"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SummaryTile } from "@/components/portal/portal-panels"
import Link from "next/link"
import { CalendarCheck, GraduationCap, Receipt } from "lucide-react"
import { InfoGuide } from "@/components/ui/info-guide"


export default async function StudentDashboardPage() {
  // The action carries the authorization: it answers only for the student row belonging
  // to the signed-in user, so there is no student id to check against here.
  const result = await getMyOverview()
  if (!result.success) redirect("/dashboard/access-error")

  const { student, school, enrolment, subjects, results, attendance, fees } = result.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Welcome, {student.name}</h1>
            <InfoGuide guideKey="student.dashboard" />
          </div>
          <p className="text-muted-foreground tabular-nums">
            {school.name} ({school.code}) · {student.admissionNo}
            {enrolment
              ? ` · ${enrolment.className} · ${enrolment.termName} · ${enrolment.sessionName}`
              : " · not in a class this term"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Class" value={enrolment?.className ?? "Not assigned"} />
          <SummaryTile
            label="Average"
            value={results.withheldReason ? "Withheld" : results.average === null ? "Not released" : `${results.average}%`}
            note={results.withheldReason ? "Until the term's fees are settled" : results.released ? results.termName : "Awaiting release"}
          />
          <SummaryTile
            label="Attendance"
            value={attendance.rate === null ? "No records" : `${attendance.rate}%`}
            note={attendance.total > 0 ? `${attendance.present} present of ${attendance.total}` : undefined}
          />
          <SummaryTile label="Outstanding" value={fees.balance} note={`${fees.paid} paid of ${fees.billed}`} />
        </div>

        {/* Attendance, fees and receipts each have their own screen now. This page was a
            screen and a half of scrolling, and a learner checking a balance passed their
            own marks to get to it. */}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/student/records">
              <GraduationCap className="mr-2 h-4 w-4" />
              My full record
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/student/attendance">
              <CalendarCheck className="mr-2 h-4 w-4" />
              Attendance
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/student/fees">
              <Receipt className="mr-2 h-4 w-4" />
              Fees and receipts
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>My Results</CardTitle>
                  <CardDescription>
                    {results.withheldReason
                      ? `${results.termName ?? "This term"} — held until the term's fees are settled.`
                      : results.released
                        ? `${results.termName ?? "This term"} — released by the school.`
                        : "Nothing released yet."}
                  </CardDescription>
                </div>
                {results.released && results.average !== null && (
                  <Badge variant="secondary" className="tabular-nums">Average {results.average}%</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {results.withheldReason ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{results.withheldReason}</p>
              ) : !results.released ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Your results appear here once the school publishes them for the term. Marks a
                  teacher is still entering are not shown.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Subject</th>
                        <th className="py-2 px-3 text-right font-medium">CA</th>
                        <th className="py-2 px-3 text-right font-medium">Exam</th>
                        <th className="py-2 px-3 text-right font-medium">Total</th>
                        <th className="py-2 pl-3 text-right font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.subjects.map((row) => (
                        <tr key={row.subject} className="border-b last:border-0">
                          <td className="py-2 pr-3">{row.subject}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{row.ca ?? "–"}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{row.exam ?? "–"}</td>
                          <td className="py-2 px-3 text-right font-medium tabular-nums">{row.total ?? "–"}</td>
                          <td className="py-2 pl-3 text-right">{row.grade ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Subjects</CardTitle>
              <CardDescription>What you offer this term.</CardDescription>
            </CardHeader>
            <CardContent>
              {subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subjects attached to your class yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {subjects.map((subject) => (
                    <Badge key={subject.code} variant="outline">
                      {subject.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </PageTransition>
  )
}
