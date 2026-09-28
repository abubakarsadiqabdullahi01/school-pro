"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { createFeeSchedule, deleteFeeSchedule, updateFeeSchedule } from "@/app/actions/finance"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FEE_AUDIENCES, FEE_SCOPES } from "@/lib/finance/fee-setup-filters"
import { canDeleteFeeSchedule, canRepointFeeSchedule, describeFeeScheduleDeletion } from "@/lib/finance/fee-setup-rules"

type Setup = {
  categories: Array<{ id: string; name: string; type: string; isActive: boolean }>
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  terms: Array<{ id: string; name: string; sessionId: string; isCurrent: boolean }>
  classTerms: Array<{ id: string; className: string; termName: string; termId: string }>
}

export type FeeScheduleDetail = {
  id: string
  name: string
  description: string | null
  amount: string
  appliesTo: string
  isMandatory: boolean
  isActive: boolean
  dueDate: string | null
  categoryId: string
  sessionId: string
  termId: string | null
  classTermId: string | null
  scope: string
  scopeLabel: string
  chargeCount: number
  settledCharges: number
  adjustedCharges: number
  repriceableCharges: number
}

const SCOPE_NOTE: Record<string, string> = {
  CLASS: "Only the students enrolled in the class you choose.",
  TERM: "Every student enrolled in any class in the term you choose.",
  SESSION: "Every active student in the school for the whole session.",
}

/**
 * A fee schedule, created or edited on its own screen.
 *
 * Creating one bills people, which is why it is no longer a column beside the category form:
 * the two were different jobs on one page, and the page said nothing about which to do
 * first. Scope is asked for explicitly here — the old form always set a class, so the
 * term-wide and session-wide schedules the server has always supported could not be made
 * through the UI at all.
 *
 * Editing is narrower than creating, and deliberately so. Once a schedule has raised a bill,
 * who it bills is settled; what can still change is what the bill says and what it costs,
 * and a new amount reaches only the charges nobody has paid or adjusted.
 */
export function FeeScheduleForm({
  basePath,
  setup,
  schedule,
}: {
  basePath: string
  setup: Setup
  /** Absent when creating. */
  schedule?: FeeScheduleDetail
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [scope, setScope] = useState(schedule?.scope ?? "CLASS")
  const [sessionId, setSessionId] = useState(
    schedule?.sessionId ?? setup.sessions.find((session) => session.isCurrent)?.id ?? setup.sessions[0]?.id ?? "",
  )
  const [termId, setTermId] = useState(
    schedule?.termId ?? setup.terms.find((term) => term.isCurrent)?.id ?? setup.terms[0]?.id ?? "",
  )
  const [classTermId, setClassTermId] = useState(schedule?.classTermId ?? "")
  const [categoryId, setCategoryId] = useState(
    schedule?.categoryId ?? setup.categories.find((category) => category.isActive)?.id ?? "",
  )
  const [audience, setAudience] = useState(schedule?.appliesTo ?? "ALL_STUDENTS")
  const [isActive, setIsActive] = useState(schedule?.isActive ?? true)
  const [amount, setAmount] = useState(schedule?.amount ?? "")

  const listPath = `${basePath}/fees`

  const terms = useMemo(
    () => setup.terms.filter((term) => term.sessionId === sessionId),
    [setup.terms, sessionId],
  )
  const classTerms = useMemo(
    () => setup.classTerms.filter((classTerm) => classTerm.termId === termId),
    [setup.classTerms, termId],
  )

  // The category a schedule already reports under stays on offer even if it has since been
  // switched off — otherwise editing the amount would silently move the schedule elsewhere.
  const categoryOptions = setup.categories.filter(
    (category) => category.isActive || category.id === schedule?.categoryId,
  )

  const repoint = schedule ? canRepointFeeSchedule({ chargeCount: schedule.chargeCount }) : { allowed: true as const }
  const locked = !repoint.allowed
  const removal = schedule
    ? canDeleteFeeSchedule({
        chargeCount: schedule.chargeCount,
        settledCharges: schedule.settledCharges,
        adjustedCharges: schedule.adjustedCharges,
      })
    : { allowed: true as const }

  // A session with no terms, or a term with no classes, cannot bill anybody — better to say
  // so on the field than to let the form be submitted into an empty result.
  const missingTerm = !locked && scope !== "SESSION" && terms.length === 0
  const missingClass = !locked && scope === "CLASS" && classTerms.length === 0

  const amountChanged = Boolean(schedule) && amount.trim() !== "" && Number(amount) !== Number(schedule?.amount)
  const untouchedCharges = schedule?.repriceableCharges ?? 0
  const keptCharges = (schedule?.chargeCount ?? 0) - untouchedCharges

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const name = String(formData.get("name") ?? "").trim()
      const shared = {
        name,
        description: String(formData.get("description") ?? ""),
        amount: Number(formData.get("amount") ?? 0),
        isMandatory: formData.get("isMandatory") === "on",
        dueDate: String(formData.get("dueDate") || "") || null,
      }

      const result = schedule
        ? await updateFeeSchedule({
            ...shared,
            id: schedule.id,
            isActive,
            // Sent only when the schedule may still move; the server ignores them otherwise.
            sessionId,
            termId: scope === "SESSION" ? null : termId,
            classTermId: scope === "CLASS" ? classTermId : null,
            categoryId,
            appliesTo: audience,
          })
        : await createFeeSchedule({
            ...shared,
            sessionId,
            termId: scope === "SESSION" ? null : termId,
            classTermId: scope === "CLASS" ? classTermId : null,
            categoryId,
            appliesTo: audience,
          })

      if (!result.success) {
        toast.error(schedule ? "Schedule not updated" : "Schedule not created", { description: result.error })
        return
      }

      if ("chargesRepriced" in result.data) {
        const { chargesRepriced, chargesLeftAlone, dueDatesUpdated } = result.data
        const notes = [
          chargesRepriced > 0 ? `${chargesRepriced} charge${chargesRepriced === 1 ? "" : "s"} re-priced` : null,
          chargesLeftAlone > 0
            ? `${chargesLeftAlone} left alone — paid or adjusted`
            : null,
          dueDatesUpdated > 0 ? `${dueDatesUpdated} due date${dueDatesUpdated === 1 ? "" : "s"} moved` : null,
        ].filter(Boolean)

        toast.success(`${name} updated`, { description: notes.join(" · ") || undefined })
      } else {
        toast.success(`${name} created`, {
          description:
            result.data.chargesCreated > 0
              ? `${result.data.chargesCreated} student charge${result.data.chargesCreated === 1 ? "" : "s"} raised.`
              : "No student was in scope, so nothing has been charged yet.",
        })
      }

      router.push(listPath)
      router.refresh()
    })
  }

  const remove = () => {
    if (!schedule) return
    startTransition(async () => {
      const result = await deleteFeeSchedule({ id: schedule.id })
      setConfirmingDelete(false)

      if (!result.success) {
        toast.error("Schedule not deleted", { description: result.error })
        return
      }

      toast.success(`${schedule.name} deleted`, {
        description:
          result.data.chargesDeleted > 0
            ? `${result.data.chargesDeleted} unpaid charge${result.data.chargesDeleted === 1 ? "" : "s"} went with it.`
            : undefined,
      })
      router.push(listPath)
      router.refresh()
    })
  }

  if (!schedule && categoryOptions.length === 0) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>A category comes first</CardTitle>
          <CardDescription>
            Every schedule is reported under a fee category, and this school has no active one yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`${basePath}/fees/categories/new`}>New fee category</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Schedule details</CardTitle>
            <CardDescription>
              {schedule
                ? `${schedule.chargeCount} charge${schedule.chargeCount === 1 ? "" : "s"} raised so far.`
                : "Creating this raises one charge for every active student in scope, straight away."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="schedule-scope">Who this bills</Label>
                <Select value={scope} onValueChange={setScope} disabled={locked}>
                  <SelectTrigger id="schedule-scope">
                    <SelectValue>{FEE_SCOPES.find((option) => option.value === scope)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_SCOPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={locked ? "text-xs text-amber-600 dark:text-amber-500" : "text-xs text-muted-foreground"}>
                  {locked ? repoint.reason : SCOPE_NOTE[scope]}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="schedule-session">Session</Label>
                  <Select
                    value={sessionId}
                    disabled={locked}
                    onValueChange={(value) => {
                      setSessionId(value)
                      // The term and class belonged to the old session; keeping them would bill
                      // last year's roll under this year's heading.
                      const first = setup.terms.find((term) => term.sessionId === value)
                      setTermId(first?.id ?? "")
                      setClassTermId("")
                    }}
                  >
                    <SelectTrigger id="schedule-session">
                      <SelectValue placeholder="Select session">
                        {setup.sessions.find((session) => session.id === sessionId)?.name ?? "Select session"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {setup.sessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.name}
                          {session.isCurrent ? " · current" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {scope !== "SESSION" && (
                  <div className="space-y-2">
                    <Label htmlFor="schedule-term">Term</Label>
                    <Select
                      value={termId}
                      disabled={locked}
                      onValueChange={(value) => {
                        setTermId(value)
                        setClassTermId("")
                      }}
                    >
                      <SelectTrigger id="schedule-term">
                        <SelectValue placeholder="Select term">
                          {terms.find((term) => term.id === termId)?.name ?? "Select term"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((term) => (
                          <SelectItem key={term.id} value={term.id}>
                            {term.name}
                            {term.isCurrent ? " · current" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {missingTerm && <p className="text-xs text-destructive">This session has no terms yet.</p>}
                  </div>
                )}
              </div>

              {scope === "CLASS" && (
                <div className="space-y-2">
                  <Label htmlFor="schedule-class">Class</Label>
                  <Select value={classTermId} onValueChange={setClassTermId} disabled={locked}>
                    <SelectTrigger id="schedule-class">
                      <SelectValue placeholder="Select class">
                        {locked
                          ? schedule?.scopeLabel
                          : classTerms.find((classTerm) => classTerm.id === classTermId)?.className}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {classTerms.map((classTerm) => (
                        <SelectItem key={classTerm.id} value={classTerm.id}>
                          {classTerm.className} · {classTerm.termName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {missingClass && <p className="text-xs text-destructive">This term has no classes set up yet.</p>}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="schedule-category">Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId} disabled={locked}>
                    <SelectTrigger id="schedule-category">
                      <SelectValue placeholder="Select category">
                        {categoryOptions.find((category) => category.id === categoryId)?.name ?? "Select category"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-name">Fee name</Label>
                  <Input
                    id="schedule-name"
                    name="name"
                    defaultValue={schedule?.name ?? ""}
                    placeholder="Third Term Tuition"
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="schedule-amount">Amount per student (₦)</Label>
                  <Input
                    id="schedule-amount"
                    name="amount"
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="45000"
                    required
                    className="tabular-nums"
                  />
                  {amountChanged && (
                    // The one edit that moves money. Saying what it will and will not reach
                    // before the click is the difference between an edit and a surprise.
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      {untouchedCharges} unpaid charge{untouchedCharges === 1 ? "" : "s"} will move to the new
                      amount
                      {keptCharges > 0
                        ? `; ${keptCharges} that ${keptCharges === 1 ? "has" : "have"} been paid or adjusted keep${
                            keptCharges === 1 ? "s" : ""
                          } the old one.`
                        : "."}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-due">Due date</Label>
                  <Input
                    id="schedule-due"
                    name="dueDate"
                    type="date"
                    defaultValue={schedule?.dueDate ? schedule.dueDate.slice(0, 10) : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. It is what the debtors report counts as overdue.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-audience">Applies to</Label>
                <Select value={audience} onValueChange={setAudience} disabled={locked}>
                  <SelectTrigger id="schedule-audience">
                    <SelectValue>{FEE_AUDIENCES.find((option) => option.value === audience)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_AUDIENCES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  New and returning are judged by whether the student was admitted in this session.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-description">Description</Label>
                <Textarea
                  id="schedule-description"
                  name="description"
                  rows={3}
                  maxLength={300}
                  defaultValue={schedule?.description ?? ""}
                  placeholder="Optional. Shown on the statement beside the charge."
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  name="isMandatory"
                  type="checkbox"
                  defaultChecked={schedule?.isMandatory ?? true}
                  className="size-4"
                />
                Mandatory — counts towards what a student owes
              </label>

              {schedule && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    Active — still bills students who join the class
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Switching it off stops it billing anyone new and refuses the catch-up. Charges already
                    raised stay exactly as they are.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={
                    pending || !categoryId || missingTerm || (!locked && scope === "CLASS" && !classTermId)
                  }
                >
                  {pending ? (schedule ? "Saving…" : "Creating…") : schedule ? "Save changes" : "Create schedule"}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(listPath)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{schedule ? "What editing changes" : "Before you create it"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {schedule ? (
              <>
                <p>
                  <strong className="text-foreground">A new amount reaches untouched charges only.</strong>{" "}
                  {untouchedCharges} of {schedule.chargeCount} can still move; the rest have a payment, a
                  discount or an exemption against them.
                </p>
                <p>
                  <strong className="text-foreground">A new due date reaches everything still owing.</strong>{" "}
                  Settled charges keep the date they were settled under.
                </p>
                <p>
                  <strong className="text-foreground">Who it bills is fixed.</strong> Scope, category and
                  audience were decided when the charges were raised — a different one of those is a different
                  schedule.
                </p>
              </>
            ) : (
              <>
                <p>
                  <strong className="text-foreground">Charges are raised immediately.</strong> Every active
                  student the scope covers gets one, at the amount above.
                </p>
                <p>
                  <strong className="text-foreground">
                    Students admitted later are billed on enrolment.
                  </strong>{" "}
                  Anyone admitted before this schedule exists is not — the schedules list has a{" "}
                  <em>Bill new students</em> button for them, and it only adds what is missing.
                </p>
                <p>
                  <strong className="text-foreground">A charge is not a payment.</strong> Nothing is collected
                  here; this is the bill. Payments are recorded under Student Payments.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {schedule && (
        <Card className="max-w-2xl border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Delete this schedule</CardTitle>
            <CardDescription>
              {removal.allowed ? describeFeeScheduleDeletion({ chargeCount: schedule.chargeCount }) : removal.reason}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending || !removal.allowed}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete schedule
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {schedule?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {schedule ? describeFeeScheduleDeletion({ chargeCount: schedule.chargeCount }) : ""} This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting…" : "Delete schedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
