"use client"

import { useState } from "react"
import { GraduationCap, Lock, Printer, TrendingUp } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatDocumentDate } from "@/lib/format"
import { SessionReportButton } from "@/components/portal/session-report-button"
import { sessionTermLabel } from "@/lib/results/session-labels"
import type {
  AcademicHistory,
  HistorySession,
  HistoryTerm,
  HistoryTransition,
} from "@/lib/results/academic-history.server"
import type { SessionReportForStudent } from "@/lib/results/session-report.server"

type SessionReportResult =
  | { success: true; data: SessionReportForStudent & { scoreHeaders: [string, string, string, string, string] } }
  | { success: false; error: string }

type TermReportResult =
  | { success: true; data: SessionReportForStudent & { scoreHeaders: null } }
  | { success: false; error: string }

/**
 * A learner's record across every session, shared by the parent and student portals.
 *
 * One component rather than two, because the two portals answering the same question
 * differently is precisely the failure this replaces: before it, each had its own copy of a
 * single-term query and neither could show a session at all.
 *
 * The only difference between the two callers is whose name is at the top, so that is the
 * only thing passed in.
 */

interface AcademicHistoryViewProps {
  history: AcademicHistory
  /** Whose record this is. Omitted in the student portal, where it is always "yours". */
  personName?: string
  admissionNo?: string
  /** The portal's own sessional-report action, passed through to the download button. */
  loadSessionReport: (sessionId: string) => Promise<SessionReportResult>
  /** The portal's own termly-report action, for each term's own card. */
  loadTermReport: (termId: string) => Promise<TermReportResult>
}

export function AcademicHistoryView({
  history,
  personName,
  admissionNo,
  loadSessionReport,
  loadTermReport,
}: AcademicHistoryViewProps) {
  const { sessions, transitions } = history
  const [activeSession, setActiveSession] = useState(sessions[0]?.sessionId ?? "")
  const [tab, setTab] = useState("overview")

  const session = sessions.find((row) => row.sessionId === activeSession) ?? sessions[0]

  /**
   * Changing session resets to Overview.
   *
   * Terms are the tabs, and one session's terms are not another's — staying on "Third Term"
   * after switching to a session that has only one would leave the page blank with a tab
   * highlighted, which reads as broken rather than as empty.
   */
  function chooseSession(next: string) {
    setActiveSession(next)
    setTab("overview")
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Academic record</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Results appear once the school has released them.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6" data-print-document="academic-history">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-2xl font-bold tracking-tight">Academic record</h2>
            <InfoGuide guideKey="portal.academicRecord" />
          </div>
          <p className="text-sm text-muted-foreground">
            {personName ? `${personName}${admissionNo ? ` · ${admissionNo}` : ""} · ` : ""}
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {/* The session is a dropdown because a learner in their fifth year has five of them
          and a tab strip would wrap. Within a session the terms are tabs, because there are
          three of them and a reader moves between them constantly. */}
      <div className="flex items-center gap-3 print:hidden">
        <Label htmlFor="session" className="shrink-0 text-sm font-medium">
          Session
        </Label>
        <Select value={activeSession} onValueChange={chooseSession}>
          <SelectTrigger id="session" className="w-full sm:w-64">
            <SelectValue placeholder="Select a session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((row) => (
              <SelectItem key={row.sessionId} value={row.sessionId}>
                {row.sessionName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {session ? (
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex-wrap print:hidden">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {session.terms.map((term) => (
              <TabsTrigger key={term.termId} value={term.termId}>
                {term.termName}
              </TabsTrigger>
            ))}
            <TabsTrigger value="session">Session summary</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewPanel session={session} transitions={transitions} />
          </TabsContent>

          {session.terms.map((term) => (
            <TabsContent key={term.termId} value={term.termId}>
              <TermCard term={term} loadTermReport={loadTermReport} />
            </TabsContent>
          ))}

          <TabsContent value="session">
            <SessionSummaryCard session={session} loadSessionReport={loadSessionReport} />
          </TabsContent>
        </Tabs>
      ) : null}

    </div>
  )
}

/**
 * What the session amounted to, before any of the detail.
 *
 * Headline figures and the class movements, because "was my child promoted" is the question
 * people open this page with and it used to be answerable only by scrolling past three
 * terms of marks.
 */
function OverviewPanel({
  session,
  transitions,
}: {
  session: HistorySession
  transitions: HistoryTransition[]
}) {
  const summary = session.summary
  const released = session.terms.filter((term) => term.results.length > 0).length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{session.sessionName}</CardTitle>
          <CardDescription>
            {session.terms.length} term{session.terms.length === 1 ? "" : "s"} on record,{" "}
            {released} with results released.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary && summary.access.allowed && summary.subjects.length > 0 ? (
            <div className="flex flex-wrap gap-6">
              <Figure label="Session average" value={`${summary.totalAverage}%`} />
              <Figure
                label="Subjects passed"
                value={`${summary.subjectsPassed} of ${summary.subjectsCounted}`}
              />
              <Figure label="Terms covered" value={String(session.terms.length)} />
            </div>
          ) : summary && !summary.access.allowed ? (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>{summary.access.reason}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              No results released for this session yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Class movements</CardTitle>
          </div>
          <CardDescription>
            Promotions, repeats and transfers across the whole record, most recent first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No class movement recorded yet. One appears here at the end of a session.
            </p>
          ) : (
            transitions.map((move) => (
              <div key={move.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{move.type.replaceAll("_", " ").toLowerCase()}</Badge>
                <span className="tabular-nums text-muted-foreground">
                  {/* Not `toLocaleDateString`: the server renders in the host's locale and
                      the browser in the reader's, so the same date came out "03/08/2026" on
                      one side and "8/3/2026" on the other and React discarded the tree. */}
                  {formatDocumentDate(move.date)}
                </span>
                <span>
                  {move.from} <span className="text-muted-foreground">→</span> {move.to}
                </span>
                {move.notes ? <span className="text-muted-foreground">· {move.notes}</span> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** The whole-session picture: each subject averaged across the terms it was sat in. */
function SessionSummaryCard({
  session,
  loadSessionReport,
}: {
  session: HistorySession
  loadSessionReport: (sessionId: string) => Promise<SessionReportResult>
}) {
  const summary = session.summary
  if (!summary) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{session.sessionName} — session summary</CardTitle>
        </div>
        <CardDescription>
          Each subject averaged across the terms it was sat in, then those averages averaged.
          This is the same calculation the school&apos;s promotion decision uses.
        </CardDescription>
        {summary.access.allowed && summary.subjects.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2 print:hidden">
            <SessionReportButton
              periodId={session.sessionId}
              periodName={sessionTermLabel(session.terms.map((term) => ({ name: term.termName })))}
              load={loadSessionReport}
              label="Preview"
              variant="outline"
              action="preview"
            />
            <SessionReportButton
              periodId={session.sessionId}
              periodName={sessionTermLabel(session.terms.map((term) => ({ name: term.termName })))}
              load={loadSessionReport}
              label="Session report (PDF)"
            />
            <SessionReportButton
              periodId={session.sessionId}
              periodName={sessionTermLabel(session.terms.map((term) => ({ name: term.termName })))}
              load={loadSessionReport}
              label="Share"
              variant="outline"
              action="share"
            />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {!summary.access.allowed ? (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>{summary.access.reason}</AlertDescription>
          </Alert>
        ) : summary.subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No released results in this session yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <Figure label="Session average" value={`${summary.totalAverage}%`} />
              <Figure
                label="Subjects passed"
                value={`${summary.subjectsPassed} of ${summary.subjectsCounted}`}
              />
              <Figure label="Terms covered" value={String(session.terms.length)} />
            </div>

            <Separator />

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Subject</TableHead>
                    <TableHead className="text-right">Terms</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.subjects.map((row) => (
                    <TableRow key={row.subject}>
                      <TableCell className="font-medium">{row.subject}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.termsCounted}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.average}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={row.passed ? "default" : "destructive"}>
                          {row.passed ? "Pass" : "Fail"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {summary.incompleteSubjects.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Not counted, because no mark has been released in any term:{" "}
                {summary.incompleteSubjects.join(", ")}.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TermCard({
  term,
  loadTermReport,
}: {
  term: HistoryTerm
  loadTermReport: (termId: string) => Promise<TermReportResult>
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{term.termName}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {term.className ? <Badge variant="outline">{term.className}</Badge> : null}
            {term.average !== null && term.access.allowed ? (
              <Badge variant="secondary" className="tabular-nums">
                Average {term.average}%
              </Badge>
            ) : null}
            {term.access.allowed && term.results.length > 0 ? (
              <>
                <SessionReportButton
                  periodId={term.termId}
                  periodName={term.termName}
                  load={loadTermReport}
                  label="Preview"
                  variant="outline"
                  action="preview"
                />
                <SessionReportButton
                  periodId={term.termId}
                  periodName={term.termName}
                  load={loadTermReport}
                  label="Report card (PDF)"
                  variant="outline"
                />
                <SessionReportButton
                  periodId={term.termId}
                  periodName={term.termName}
                  load={loadTermReport}
                  label="Share"
                  variant="outline"
                  action="share"
                />
              </>
            ) : null}
          </div>
        </div>
        <CardDescription>
          {term.subjectsOffered.length} subject{term.subjectsOffered.length === 1 ? "" : "s"} offered
          {" · "}
          Fees outstanding: <span className="tabular-nums">{term.balance}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!term.access.allowed ? (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>{term.access.reason}</AlertDescription>
          </Alert>
        ) : term.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No results released for this term.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Subject</TableHead>
                  <TableHead className="text-right">CA</TableHead>
                  <TableHead className="text-right">Exam</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {term.results.map((row) => (
                  <TableRow key={`${term.termId}-${row.code}-${row.subject}`}>
                    <TableCell className="font-medium">{row.subject}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.ca ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.exam ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.total ?? "—"}</TableCell>
                    <TableCell className="text-right">{row.grade ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {term.subjectsOffered.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Subjects offered</p>
            <div className="flex flex-wrap gap-1.5">
              {term.subjectsOffered.map((subject) => (
                <Badge key={`${term.termId}-${subject.code}`} variant="outline" className="font-normal">
                  {subject.name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
