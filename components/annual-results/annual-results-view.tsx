"use client"

import { useMemo, useState, useTransition } from "react"
import { CheckCircle2, Loader2, RotateCcw, Save, Search, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import {
  approveAnnualDecisions,
  computeAnnualDecisions,
  saveAnnualDecisions,
  setAnnualDecision,
  withdrawAnnualApproval,
  type AnnualDecisionRow,
} from "@/app/actions/annual-results"
import { PrintHeader } from "@/components/reports/print-header"
import { ReportExport } from "@/components/reports/report-export"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SchoolBranding } from "@/lib/school-branding.server"

/**
 * End-of-session decisions for one class.
 *
 * The screen is shaped around the two acts the module keeps separate: an exams officer
 * **compiles** — which writes nothing until they say so — and a principal **approves**,
 * which is what lets the outcome reach a report card. A single "done" button would have
 * collapsed a real approval into a side-effect of pressing compile.
 *
 * Reasons are always shown, never summarised away. When the rules hold a child back, the
 * person looking at this screen is the one who will have to explain it to a parent.
 */

type ClassOption = { id: string; name: string }
type SessionOption = { id: string; name: string }

const DECISIONS = ["PROMOTED", "REPEATED", "GRADUATED", "PENDING"] as const

/**
 * Why a row reads the way it does, in one cell.
 *
 * An override replaces the reasons rather than joining them: once a person has set the
 * outcome by hand, what the rules would have said is no longer why it says that.
 */
function overrideNote(row: AnnualDecisionRow): string {
  if (row.isOverride) {
    return row.overrideReason ? `Overridden: ${row.overrideReason}` : "Overridden"
  }
  return row.reasons.join("; ")
}

/** "PROMOTED" -> "promoted", for use inside a sentence. */
function decisionWord(decision: string): string {
  return decision.toLowerCase()
}

/**
 * The two actions that ask for a reason before they run.
 *
 * Modelled as one piece of state rather than two booleans so the dialog cannot be open for
 * both at once, and so the reason typed for one can never be submitted to the other.
 */
type ReasonPrompt =
  | {
      kind: "withdraw"
      title: string
      description: string
      confirmLabel: string
    }
  | {
      kind: "decision"
      row: AnnualDecisionRow
      decision: string
      title: string
      description: string
      confirmLabel: string
    }

export function AnnualResultsView({
  classes,
  sessions,
  school,
}: {
  classes: ClassOption[]
  sessions: SessionOption[]
  /** The letterhead for the printed sheet and the PDF. Null still prints a titled page. */
  school: SchoolBranding | null
}) {
  const [classId, setClassId] = useState("")
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "")
  const [rows, setRows] = useState<AnnualDecisionRow[] | null>(null)
  const [policySummary, setPolicySummary] = useState("")
  const [comments, setComments] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null)
  const [reasonText, setReasonText] = useState("")
  const [search, setSearch] = useState("")

  const approvedCount = rows?.filter((row) => row.approvedAt).length ?? 0
  const savedCount = rows?.filter((row) => row.savedAt).length ?? 0
  const canApprove = rows !== null && savedCount > 0 && approvedCount < savedCount

  const className = classes.find((option) => option.id === classId)?.name ?? ""
  const sessionName = sessions.find((option) => option.id === sessionId)?.name ?? ""

  // Narrows what is on screen, never what is saved. `comments` is keyed by learner and
  // `save` sends the whole map, so typing a comment and then searching for somebody else
  // cannot quietly drop it.
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!rows) return []
    if (!needle) return rows
    return rows.filter(
      (row) =>
        row.studentName.toLowerCase().includes(needle) ||
        row.admissionNo.toLowerCase().includes(needle),
    )
  }, [rows, search])

  /**
   * The sheet as it stands, for print, PDF and spreadsheet.
   *
   * Carries the comment currently in the box rather than the stored one, because the
   * export is of what is on screen - and the Status column says whether that has been
   * recorded yet, so a preview printed by mistake cannot pass for an approved list.
   */
  const exportTable = useMemo(
    () => ({
      columns: [
        "Learner",
        "Admission No",
        "Average",
        "Terms",
        "Passes",
        "Credits",
        "Outcome",
        "Status",
        "Why",
        "Principal's comment",
      ],
      rows: visibleRows.map((row) => [
        row.studentName,
        row.admissionNo,
        `${row.sessionAverage.toFixed(1)}%`,
        String(row.termsCounted),
        `${row.subjectsPassed}/${row.subjectsOffered}`,
        String(row.creditsEarned),
        row.decision.charAt(0) + row.decision.slice(1).toLowerCase(),
        row.approvedAt ? "Approved" : row.savedAt ? "Saved" : "Preview",
        overrideNote(row),
        comments[row.studentId] ?? "",
      ]),
      // A bare number in the spreadsheet, so a column of averages can be sorted and summed.
      csvRows: visibleRows.map((row) => [
        row.studentName,
        row.admissionNo,
        row.sessionAverage.toFixed(1),
        String(row.termsCounted),
        `${row.subjectsPassed}/${row.subjectsOffered}`,
        String(row.creditsEarned),
        row.decision,
        row.approvedAt ? "Approved" : row.savedAt ? "Saved" : "Preview",
        overrideNote(row),
        comments[row.studentId] ?? "",
      ]),
    }),
    [visibleRows, comments],
  )

  function load() {
    if (!classId || !sessionId) {
      toast.error("Choose a class and a session first")
      return
    }
    setBusy("compute")
    startTransition(async () => {
      const result = await computeAnnualDecisions(classId, sessionId)
      setBusy(null)
      if (!result.success) {
        setRows(null)
        toast.error("Nothing to show", { description: result.error })
        return
      }
      setRows(result.data.rows)
      setPolicySummary(result.data.policySummary)
      // A search left over from the last class would hide most of this one.
      setSearch("")
      setComments(
        Object.fromEntries(
          result.data.rows.map((row) => [row.studentId, row.principalComment || row.suggestedComment]),
        ),
      )
    })
  }

  function save() {
    setBusy("save")
    startTransition(async () => {
      const result = await saveAnnualDecisions({
        classId,
        sessionId,
        comments: Object.entries(comments).map(([studentId, principalComment]) => ({
          studentId,
          principalComment,
        })),
      })
      setBusy(null)
      if (!result.success) {
        toast.error("Could not save", { description: result.error })
        return
      }
      toast.success(`Recorded ${result.data.saved} decision(s)`, {
        description: result.data.skippedApproved
          ? `${result.data.skippedApproved} already approved and left untouched.`
          : undefined,
      })
      load()
    })
  }

  function approve() {
    setBusy("approve")
    startTransition(async () => {
      const result = await approveAnnualDecisions(classId, sessionId)
      setBusy(null)
      if (!result.success) {
        toast.error("Could not approve", { description: result.error })
        return
      }
      toast.success(`Approved ${result.data.approved} decision(s)`, {
        description: "These now print on the annual report cards.",
      })
      load()
    })
  }

  function withdraw() {
    setReasonPrompt({
      kind: "withdraw",
      title: "Withdraw the approval",
      description:
        "These outcomes will stop printing on report cards until they are approved again. Say why, for the record.",
      confirmLabel: "Withdraw approval",
    })
  }

  function changeDecision(row: AnnualDecisionRow, decision: string) {
    setReasonPrompt({
      kind: "decision",
      row,
      decision,
      title: `Set ${row.studentName} to ${decisionWord(decision)}`,
      description:
        `The rules currently give ${decisionWord(row.decision)}. If you are choosing something ` +
        "different, say why — the reason is stored with the decision. Leave it blank if this is " +
        "what the rules already say.",
      confirmLabel: "Save decision",
    })
  }

  /** Runs whichever action the open dialog belongs to, with the reason typed into it. */
  function submitReason() {
    const prompt = reasonPrompt
    if (!prompt) return
    const reason = reasonText.trim()

    if (prompt.kind === "withdraw") {
      if (reason.length < 3) return
      setBusy("withdraw")
      startTransition(async () => {
        const result = await withdrawAnnualApproval(classId, sessionId, reason)
        setBusy(null)
        closeReason()
        if (!result.success) {
          toast.error("Could not withdraw", { description: result.error })
          return
        }
        toast.success(`Withdrew ${result.data.withdrawn} approval(s)`)
        load()
      })
      return
    }

    // The server decides whether this contradicts the rules and therefore needs a reason;
    // judging that here as well would mean two places that know what an override is, and
    // they would eventually disagree.
    setBusy(prompt.row.studentId)
    startTransition(async () => {
      const result = await setAnnualDecision({
        studentId: prompt.row.studentId,
        sessionId,
        decision: prompt.decision,
        principalComment: comments[prompt.row.studentId] ?? "",
        overrideReason: reason || null,
      })
      setBusy(null)
      if (!result.success) {
        // Deliberately leaves the dialog open: the usual failure is "give a reason", and
        // closing it would throw away what they had already typed.
        toast.error("Could not change that decision", { description: result.error })
        return
      }
      closeReason()
      toast.success(`${prompt.row.studentName} set to ${decisionWord(prompt.decision)}`)
      load()
    })
  }

  function closeReason() {
    setReasonPrompt(null)
    setReasonText("")
  }

  return (
    <div className="space-y-6" data-print-document data-print-report>
      {/* On paper the app's own heading is no use; this is the school's masthead, the same
          one a report card and a receipt carry. */}
      <PrintHeader
        school={school}
        title="Annual Results and Promotion"
        reference={[className, sessionName].filter(Boolean).join(" · ") || null}
      />

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Choose a class and session</CardTitle>
          <CardDescription>
            Compiling works out what the rules say. Nothing is recorded until you save, and
            nothing reaches a report card until it is approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="annual-class">Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger id="annual-class">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="annual-session">Session</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger id="annual-session">
                  <SelectValue placeholder="Select a session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={load} disabled={pending}>
                {busy === "compute" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Compile
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {rows !== null && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>
                  {search.trim() && visibleRows.length !== rows.length
                    ? `${visibleRows.length} of ${rows.length} learner(s)`
                    : `${rows.length} learner(s)`}
                </CardTitle>
                <CardDescription>{policySummary}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button variant="outline" onClick={save} disabled={pending || rows.length === 0}>
                  {busy === "save" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save decisions
                </Button>
                {approvedCount > 0 && approvedCount === savedCount ? (
                  <Button variant="outline" onClick={withdraw} disabled={pending}>
                    {busy === "withdraw" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Withdraw approval
                  </Button>
                ) : (
                  <Button onClick={approve} disabled={pending || !canApprove}>
                    {busy === "approve" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4" />
                    )}
                    Approve as principal
                  </Button>
                )}
                {/* Print, PDF and CSV of exactly the rows on screen. The decision of who
                    goes up and who repeats is the one list a school is asked for on paper. */}
                <ReportExport
                  title={`Annual Results${className ? ` · ${className}` : ""}`}
                  subtitle={[className, sessionName].filter(Boolean).join(" · ") || undefined}
                  table={exportTable}
                  school={school}
                  orientation="landscape"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedCount === 0 && (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                This is a preview. Nothing has been recorded yet — press <strong>Save
                decisions</strong> when the outcomes below look right.
              </p>
            )}

            {rows.length > 0 && (
              <div className="relative w-full print:hidden sm:max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  className="pl-8"
                  placeholder="Search by name or admission number"
                  aria-label="Search learners"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Passes</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="min-w-[260px]">Principal&apos;s comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>
                        <div className="font-medium">{row.studentName}</div>
                        <div className="text-xs text-muted-foreground">{row.admissionNo}</div>
                        {row.reasons.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {row.reasons.map((reason) => (
                              <li key={reason} className="text-xs text-destructive">
                                {reason}
                              </li>
                            ))}
                          </ul>
                        )}
                        {row.isOverride && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                            Overridden{row.overrideReason ? `: ${row.overrideReason}` : ""}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.sessionAverage.toFixed(1)}%
                        <div className="text-xs text-muted-foreground">
                          {row.termsCounted} term{row.termsCounted === 1 ? "" : "s"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.subjectsPassed}/{row.subjectsOffered}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.creditsEarned}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Select
                            value={row.decision}
                            onValueChange={(value) => changeDecision(row, value)}
                            disabled={pending || Boolean(row.approvedAt)}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DECISIONS.map((decision) => (
                                <SelectItem key={decision} value={decision}>
                                  {decision.charAt(0) + decision.slice(1).toLowerCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {row.approvedAt ? (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </Badge>
                          ) : row.savedAt ? (
                            <Badge variant="secondary">Saved</Badge>
                          ) : (
                            <Badge variant="outline">Preview</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={comments[row.studentId] ?? ""}
                          disabled={Boolean(row.approvedAt)}
                          onChange={(event) =>
                            setComments((current) => ({
                              ...current,
                              [row.studentId]: event.target.value,
                            }))
                          }
                          placeholder="The principal's own words"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No released results for this class in that session yet.
              </p>
            )}

            {rows.length > 0 && visibleRows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nobody in this class matches &ldquo;{search.trim()}&rdquo;.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={reasonPrompt !== null}
        onOpenChange={(open) => {
          if (!open) closeReason()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{reasonPrompt?.title}</DialogTitle>
            <DialogDescription>{reasonPrompt?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="override-reason">
              Reason{reasonPrompt?.kind === "withdraw" ? "" : " (optional)"}
            </Label>
            <Textarea
              id="override-reason"
              rows={3}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              placeholder={
                reasonPrompt?.kind === "withdraw"
                  ? "e.g. Third term marks were re-checked"
                  : "e.g. Sat the exams under investigation"
              }
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={closeReason} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={submitReason}
              disabled={
                pending || (reasonPrompt?.kind === "withdraw" && reasonText.trim().length < 3)
              }
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {reasonPrompt?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
