import { notFound } from "next/navigation"

import { getChildOverview } from "@/app/actions/parent-portal"
import { BackButton } from "@/components/back-button"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface ChildPageProps {
  params: Promise<{ studentId: string }>
}

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  UNPAID: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
}

export default async function ParentChildPage({ params }: ChildPageProps) {
  const { studentId } = await params

  // The action carries the authorization: it answers only for a child linked to the
  // signed-in parent, so there is no second check to keep in step here.
  const result = await getChildOverview(studentId)
  if (!result.success) notFound()

  const { student, enrolment, subjects, results, fees } = result.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <BackButton fallbackHref="/dashboard/parent/children" />
          <h1 className="text-3xl font-bold tracking-tight">{student.name}</h1>
          <p className="text-muted-foreground tabular-nums">
            {student.admissionNo}
            {enrolment
              ? ` · ${enrolment.className} · ${enrolment.termName} · ${enrolment.sessionName}`
              : " · not in a class this term"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Class" value={enrolment?.className ?? "Not assigned"} />
          <SummaryTile label="Term" value={enrolment ? `${enrolment.termName}` : "—"} note={enrolment?.sessionName} />
          <SummaryTile label="Subjects" value={String(subjects.length)} note="Offered this term" />
          <SummaryTile label="Outstanding" value={fees.balance} note={`${fees.paid} paid of ${fees.billed}`} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Results</CardTitle>
                  <CardDescription>
                    {results.released
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
              {!results.released ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Results appear here once the school publishes them for the term. Marks a teacher
                  is still entering are not shown.
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
              <CardTitle>Subjects</CardTitle>
              <CardDescription>What {student.name.split(" ")[0]} offers this term.</CardDescription>
            </CardHeader>
            <CardContent>
              {subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subjects attached to this class yet.</p>
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

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Fees</CardTitle>
              <CardDescription>What the school has billed, and what is left to pay.</CardDescription>
            </CardHeader>
            <CardContent>
              {fees.charges.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing billed yet.</p>
              ) : (
                <div className="space-y-2">
                  {fees.charges.map((charge) => (
                    <div
                      key={charge.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{charge.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {charge.paid} paid of {charge.due}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">{charge.balance}</span>
                        <Badge variant="outline" className={STATUS_TONE[charge.status] ?? ""}>
                          {charge.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
              <CardDescription>Every payment the school has recorded, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {fees.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments recorded yet. A receipt appears here as soon as the school records one.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Receipt</th>
                        <th className="py-2 px-3 font-medium">Date</th>
                        <th className="py-2 px-3 font-medium">Method</th>
                        <th className="py-2 pl-3 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fees.payments.map((payment) => (
                        <tr key={payment.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium tabular-nums">{payment.receiptNo}</td>
                          <td className="py-2 px-3 tabular-nums">{payment.paidOn}</td>
                          <td className="py-2 px-3">{payment.method}</td>
                          <td className="py-2 pl-3 text-right tabular-nums">
                            {payment.amount}
                            {payment.status !== "COMPLETED" && (
                              <Badge variant="outline" className={`ml-2 ${STATUS_TONE[payment.status] ?? ""}`}>
                                {payment.status}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}

function SummaryTile({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}
