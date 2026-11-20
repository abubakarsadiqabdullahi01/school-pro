"use client"

import { useMemo, useState } from "react"
import { Download, Eye, FileText, Loader2, Printer, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ClassResultsTable } from "./ClassResultsTable"
import { getClassSessionResults, type ClassSessionResults } from "@/app/actions/session-results"
import { sessionTermLabel } from "@/lib/results/session-labels"
import { exportClassResultsPDF } from "@/lib/pdf/class-results-termly"
import { exportStudentReportPDF } from "@/lib/pdf/student-report-card-generator"

/**
 * A class's results across a whole session.
 *
 * Laid out to match the termly Class Results screen, and rendering the very same
 * `ClassResultsTable` — so a bursar or head teacher reading a sessional broadsheet is
 * reading the sheet they already know, with the columns carrying a year instead of a term.
 * The PDFs come out of the same two generators for the same reason.
 *
 * Section then class, in that order, because that is the order the termly screen asks in
 * and a school with three sections does not want one list of thirty classes.
 */

type ClassRow = { id: string; name: string; level: string }

const SECTION_LABEL: Record<string, string> = {
  PRIMARY: "Primary",
  JSS: "Junior Secondary",
  SSS: "Senior Secondary",
}

export function SessionResultsView({
  sessions,
  classes,
}: {
  sessions: Array<{ id: string; name: string }>
  classes: ClassRow[]
}) {
  const [sessionId, setSessionId] = useState("")
  const [level, setLevel] = useState("")
  const [classId, setClassId] = useState("")
  const [showPositions, setShowPositions] = useState(true)
  const [data, setData] = useState<ClassSessionResults | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [busy, setBusy] = useState<"broadsheet" | "cards" | "print" | "share" | "cards-share" | null>(null)
  const [busyStudent, setBusyStudent] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const sections = useMemo(
    () => [...new Set(classes.map((row) => row.level))].sort(),
    [classes],
  )
  const classesInSection = useMemo(
    () => classes.filter((row) => row.level === level),
    [classes, level],
  )

  async function load(nextSessionId: string, nextClassId: string) {
    if (!nextSessionId || !nextClassId) {
      setData(null)
      return
    }
    setIsLoading(true)
    setData(null)
    try {
      const result = await getClassSessionResults(nextClassId, nextSessionId)
      if (result.success) setData(result.data)
      else toast.error("Nothing to show", { description: result.error })
    } finally {
      setIsLoading(false)
    }
  }

  /** Every subject the class offered, so the broadsheet never reads a missing cell. */
  function broadsheetRows(source: ClassSessionResults) {
    return source.report.students.map((student) => ({
      studentId: student.studentId,
      studentName: student.studentName,
      admissionNo: student.admissionNo,
      gender: student.gender,
      subjects: Object.fromEntries(
        source.report.subjects.map((subject) => [
          subject.id,
          {
            score: student.subjects[subject.id]?.score ?? null,
            grade: student.subjects[subject.id]?.grade ?? null,
          },
        ]),
      ),
      totalScore: student.totalScore,
      averageScore: student.averageScore,
      grade: student.grade ?? "-",
      position: student.position,
    }))
  }

  function classInfo(source: ClassSessionResults) {
    return {
      className: source.report.className,
      termName: sessionTermLabel(source.report.terms),
      sessionName: source.report.session.name,
      teacherName: source.report.teacherName,
    }
  }

  async function downloadBroadsheet(action: "save" | "preview" | "share") {
    if (!data) return
    setBusy(action === "save" ? "broadsheet" : action === "share" ? "share" : "print")
    try {
      await exportClassResultsPDF({
        results: broadsheetRows(data),
        schoolInfo: data.school,
        classInfo: classInfo(data),
        subjects: data.report.subjects,
        action,
        showPositions,
      })
    } catch (error) {
      console.error("Broadsheet failed:", error)
      toast.error("Could not build the broadsheet", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setBusy(null)
    }
  }

  async function downloadCards(mode: "save" | "share" = "save") {
    if (!data) return
    setBusy(mode === "share" ? "cards-share" : "cards")
    try {
      const students = data.report.students.map((student) => ({
        studentId: student.studentId,
        studentName: student.studentName,
        admissionNo: student.admissionNo,
        gender: student.gender,
        passportUrl: student.passportUrl,
        subjects: student.subjects,
        totalScore: student.totalScore,
        averageScore: student.averageScore,
        grade: student.grade,
        remark: student.remark,
        position: student.position,
        annualDecision: student.annualDecision,
        principalComment: student.principalComment,
        gradingSystem: data.report.gradingSystem,
      }))

      await exportStudentReportPDF({
        student: students[0]!,
        allStudents: students,
        schoolInfo: data.school,
        classInfo: {
          ...classInfo(data),
          termEndDate: data.report.session.endDate,
          nextTermStartDate: data.report.session.nextStartDate,
        },
        subjects: data.report.subjects,
        classStatistics: data.report.statistics,
        gradingSystem: data.report.gradingSystem,
        action: mode === "share" ? "merge-share" : "merge-save",
        includePosition: showPositions,
        config: { scoreHeaders: data.scoreHeaders },
      })
      if (mode === "save") toast.success("Downloaded", { description: `${students.length} sessional report cards.` })
    } catch (error) {
      console.error("Report cards failed:", error)
      toast.error("Could not build the cards", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * One learner's sessional card.
   *
   * Same generator, same class statistics and same positions as the merged run — the only
   * difference is that `allStudents` is not passed, so it prints one card instead of the
   * set. A card printed on its own must not disagree with the same card printed in a batch.
   */
  async function oneCard(studentId: string, action: "preview" | "save" | "share") {
    if (!data) return
    const student = data.report.students.find((row) => row.studentId === studentId)
    if (!student) return

    // Opened before any await: a window opened after one is unsolicited and gets blocked.
    const previewWindow = action === "preview" ? window.open("", "_blank") : null

    setBusyStudent(`${studentId}:${action}`)
    try {
      await exportStudentReportPDF({
        student: {
          studentId: student.studentId,
          studentName: student.studentName,
          admissionNo: student.admissionNo,
          gender: student.gender,
          passportUrl: student.passportUrl,
          subjects: student.subjects,
          totalScore: student.totalScore,
          averageScore: student.averageScore,
          grade: student.grade,
          remark: student.remark,
          position: student.position,
          // Only ever an APPROVED decision - the session report filters on that - so a
          // card can never print an outcome the principal has not signed off.
          annualDecision: student.annualDecision,
          principalComment: student.principalComment,
          gradingSystem: data.report.gradingSystem,
        },
        schoolInfo: data.school,
        classInfo: {
          ...classInfo(data),
          termEndDate: data.report.session.endDate,
          nextTermStartDate: data.report.session.nextStartDate,
        },
        subjects: data.report.subjects,
        classStatistics: data.report.statistics,
        gradingSystem: data.report.gradingSystem,
        action,
        previewWindow,
        includePosition: showPositions,
        config: { scoreHeaders: data.scoreHeaders },
      })
    } catch (error) {
      previewWindow?.close()
      console.error("Report card failed:", error)
      toast.error("Could not build the card", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setBusyStudent(null)
    }
  }

  const rows = data ? broadsheetRows(data) : []
  const searched = data
    ? data.report.students.filter((student) => {
        const needle = search.trim().toLowerCase()
        if (!needle) return true
        return (
          student.studentName.toLowerCase().includes(needle) ||
          student.admissionNo.toLowerCase().includes(needle)
        )
      })
    : []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sessional Results</CardTitle>
          <CardDescription>
            Each subject is averaged across the terms it was sat in, and positions are worked
            out over the whole session rather than taken from the last term.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="session">Academic Session</Label>
              <Select
                value={sessionId}
                onValueChange={(value) => {
                  setSessionId(value)
                  void load(value, classId)
                }}
              >
                <SelectTrigger id="session">
                  <SelectValue placeholder="Select a session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="section">Class Section</Label>
              <Select
                value={level}
                onValueChange={(value) => {
                  setLevel(value)
                  setClassId("")
                  setData(null)
                }}
                disabled={!sessionId}
              >
                <SelectTrigger id="section">
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((section) => (
                    <SelectItem key={section} value={section}>
                      {SECTION_LABEL[section] ?? section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class">Class</Label>
              <Select
                value={classId}
                onValueChange={(value) => {
                  setClassId(value)
                  void load(sessionId, value)
                }}
                disabled={!level}
              >
                <SelectTrigger id="class">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classesInSection.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="positions" className="text-base">
                Show position on report cards
              </Label>
              <p className="text-sm text-muted-foreground">
                Subject positions and the position in class will be printed.
              </p>
            </div>
            <Switch id="positions" checked={showPositions} onCheckedChange={setShowPositions} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building the session figures
        </div>
      ) : null}

      {data ? (
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl font-bold">Sessional Results</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBroadsheet("save")}
                disabled={busy !== null || rows.length === 0}
              >
                {busy === "broadsheet" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBroadsheet("preview")}
                disabled={busy !== null || rows.length === 0}
              >
                {busy === "print" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-2 h-4 w-4" />
                )}
                Preview
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBroadsheet("share")}
                disabled={busy !== null || rows.length === 0}
              >
                {busy === "share" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="mr-2 h-4 w-4" />
                )}
                Share
              </Button>
              <Button size="sm" onClick={() => downloadCards()} disabled={busy !== null || rows.length === 0}>
                {busy === "cards" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                All report cards
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCards("share")}
                disabled={busy !== null || rows.length === 0}
              >
                {busy === "cards-share" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="mr-2 h-4 w-4" />
                )}
                Share all cards
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* The same letterhead the termly sheet carries, so the two read as one family
                of documents rather than two products. */}
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-foreground">
                {data.school.schoolName.toUpperCase()}
              </h1>
              <p className="text-base text-muted-foreground">{data.school.schoolAddress}</p>
              <p className="text-base text-muted-foreground">
                GSM: {data.school.schoolPhone} | Email: {data.school.schoolEmail}
              </p>
              <h2 className="text-xl font-semibold text-foreground">
                Students Sessional Result Summary Sheet
              </h2>
              <hr className="border-t border-border my-2 w-3/4 mx-auto" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between rounded bg-muted px-4 py-2 text-lg font-medium text-foreground">
                <span>Class: {data.report.className}</span>
                <span>Terms: {data.report.terms.map((term) => term.name).join(", ")}</span>
                <span>Session: {data.report.session.name}</span>
              </div>
              <div className="flex justify-between rounded bg-muted px-4 py-2 text-lg font-medium text-foreground">
                <span>Subjects: {data.report.subjects.length}</span>
                <span>Total Students: {rows.length}</span>
                <span>Class Average: {Math.round(data.report.statistics.classAverage)}%</span>
              </div>
            </div>

            <ClassResultsTable
              results={rows}
              subjects={data.report.subjects}
              showPositions={showPositions}
              onSort={() => {}}
              sortBy="position"
              sortDirection="asc"
              isLoading={false}
            />
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <Card className="border shadow-md">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl font-bold">Individual Report Cards</CardTitle>
                <CardDescription>
                  One learner&apos;s session on one card, in the same format as the termly card.
                </CardDescription>
              </div>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search students..."
                className="w-full sm:w-64"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">S/N</TableHead>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead className="text-center">Position</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searched.map((student, index) => {
                  const hasResults = Object.keys(student.subjects).length > 0
                  return (
                    <TableRow key={student.studentId}>
                      <TableCell className="tabular-nums">{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{student.admissionNo}</TableCell>
                      <TableCell className="font-medium">{student.studentName}</TableCell>
                      <TableCell className="text-center">
                        {hasResults ? (
                          <Badge variant="outline">{student.position}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasResults ? `${student.averageScore}%` : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasResults ? (
                          <Badge variant="secondary">{student.grade ?? "-"}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasResults ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="destructive">No Results</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Preview"
                            disabled={!hasResults || busyStudent !== null}
                            onClick={() => oneCard(student.studentId, "preview")}
                          >
                            {busyStudent === `${student.studentId}:preview` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Download"
                            disabled={!hasResults || busyStudent !== null}
                            onClick={() => oneCard(student.studentId, "save")}
                          >
                            {busyStudent === `${student.studentId}:save` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Share"
                            aria-label="Share report card"
                            disabled={!hasResults || busyStudent !== null}
                            onClick={() => oneCard(student.studentId, "share")}
                          >
                            {busyStudent === `${student.studentId}:share` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Share2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {searched.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No learners match that search.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
