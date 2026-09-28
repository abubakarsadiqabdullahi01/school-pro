"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  assignStaffAllowance,
  assignStaffDeduction,
  assignStaffSalary,
  createDisciplinaryRecord,
  setAssignmentActive,
  setStaffEmploymentStatus,
} from "@/app/actions/hr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { formatNaira } from "@/lib/money"
import { formatDocumentDate } from "@/lib/format"

const NONE = "NONE"
const today = () => new Date().toISOString().slice(0, 10)

type Salary = {
  id: string
  baseSalary: string
  effectiveFrom: string
  isActive: boolean
  scaleName: string | null
  createdByName: string
  approvedByName: string | null
  note: string | null
}

/**
 * Salary, and everything it was before.
 *
 * The history is the point: a raise never overwrites the previous figure, so the record of
 * what somebody was paid two years ago — and who approved it — is still answerable.
 */
export function SalaryPanel({
  staffId,
  current,
  history,
  scales,
  canManage,
}: {
  staffId: string
  current: { baseSalary: string; effectiveFrom: string; scaleName: string | null } | null
  history: Salary[]
  scales: Array<{ id: string; name: string; baseSalary: string; isActive: boolean }>
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [scaleId, setScaleId] = useState(NONE)
  const [baseSalary, setBaseSalary] = useState("")

  function chooseScale(value: string) {
    setScaleId(value)
    // Copy the scale's figure in as a starting point; it stays editable, and what is saved
    // is the number on the staff record, not a pointer to the scale.
    const scale = scales.find((entry) => entry.id === value)
    if (scale) setBaseSalary(scale.baseSalary)
  }

  function assign(formData: FormData) {
    startTransition(async () => {
      const result = await assignStaffSalary({
        staffId,
        scaleId: scaleId === NONE ? undefined : scaleId,
        baseSalary,
        effectiveFrom: formData.get("effectiveFrom"),
        note: formData.get("note") || undefined,
      })
      if (!result.success) {
        toast.error("Could not assign the salary", { description: result.error })
        return
      }
      toast.success("Salary assigned", { description: `Now ${formatNaira(result.data.baseSalary)}` })
      setOpen(false)
      setScaleId(NONE)
      setBaseSalary("")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Salary</CardTitle>
          <CardDescription>
            {current
              ? `${formatNaira(current.baseSalary)} from ${formatDocumentDate(current.effectiveFrom)}${
                  current.scaleName ? ` · ${current.scaleName}` : ""
                }`
              : "No salary assigned — payroll will skip this person."}
          </CardDescription>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">{current ? "Change salary" : "Assign salary"}</Button>
            </DialogTrigger>
            <DialogContent>
              <form action={assign}>
                <DialogHeader>
                  <DialogTitle>{current ? "Change salary" : "Assign salary"}</DialogTitle>
                  <DialogDescription>
                    The current figure is retired rather than overwritten, so the history survives.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="scaleId">Salary scale</Label>
                    <Select value={scaleId} onValueChange={chooseScale}>
                      <SelectTrigger id="scaleId"><SelectValue placeholder="No scale" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No scale</SelectItem>
                        {scales
                          .filter((scale) => scale.isActive)
                          .map((scale) => (
                            <SelectItem key={scale.id} value={scale.id}>
                              {scale.name} — {formatNaira(scale.baseSalary)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="baseSalary">Base salary</Label>
                    <Input
                      id="baseSalary"
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={baseSalary}
                      onChange={(event) => setBaseSalary(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effectiveFrom">Effective from</Label>
                    <Input id="effectiveFrom" name="effectiveFrom" type="date" required defaultValue={today()} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salary-note">Note</Label>
                    <Input id="salary-note" name="note" placeholder="e.g. annual review" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isPending || !baseSalary}>Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Effective From</th>
              <th className="py-2 pr-4 font-medium">Base Salary</th>
              <th className="py-2 pr-4 font-medium">Scale</th>
              <th className="py-2 pr-4 font-medium">Approved By</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((salary) => (
              <tr key={salary.id} className="border-b last:border-0">
                <td className="py-3 pr-4">{formatDocumentDate(salary.effectiveFrom)}</td>
                <td className="py-3 pr-4 font-medium">{formatNaira(salary.baseSalary)}</td>
                <td className="py-3 pr-4">{salary.scaleName ?? "—"}</td>
                <td className="py-3 pr-4">{salary.approvedByName ?? salary.createdByName}</td>
                <td className="py-3 pr-4">{salary.isActive ? "Current" : "Superseded"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No salary history yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

type Assignment = {
  id: string
  name: string
  kind: string
  value: string
  isRecurring: boolean
  periodLabel: string | null
  startDate: string
  endDate: string | null
  isActive: boolean
  timing?: string
  reason?: string | null
}

/**
 * Allowances or deductions attached to one person.
 *
 * One component for both: they differ only in which action they call and whether a reason
 * is worth asking for.
 */
export function AssignmentPanel({
  kind,
  staffId,
  assignments,
  types,
  canManage,
}: {
  kind: "ALLOWANCE" | "DEDUCTION"
  staffId: string
  assignments: Assignment[]
  types: Array<{ id: string; name: string; kind: string; value: string; isActive: boolean }>
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [typeId, setTypeId] = useState("")
  const [isRecurring, setIsRecurring] = useState(true)
  const isAllowance = kind === "ALLOWANCE"
  const noun = isAllowance ? "allowance" : "deduction"

  function assign(formData: FormData) {
    startTransition(async () => {
      const payload = {
        staffId,
        typeId,
        valueOverride: formData.get("valueOverride") || undefined,
        isRecurring,
        periodYear: isRecurring ? undefined : formData.get("periodYear"),
        periodMonth: isRecurring ? undefined : formData.get("periodMonth"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate") || undefined,
        reason: formData.get("reason") || undefined,
      }
      const result = isAllowance ? await assignStaffAllowance(payload) : await assignStaffDeduction(payload)
      if (!result.success) {
        toast.error(`Could not add the ${noun}`, { description: result.error })
        return
      }
      toast.success(`${isAllowance ? "Allowance" : "Deduction"} added`)
      setOpen(false)
      setTypeId("")
      router.refresh()
    })
  }

  function toggle(assignmentId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setAssignmentActive({ kind, assignmentId, isActive })
      if (!result.success) {
        toast.error("Could not update it", { description: result.error })
        return
      }
      router.refresh()
    })
  }

  const now = new Date()

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{isAllowance ? "Allowances" : "Deductions"}</CardTitle>
          <CardDescription>
            {isAllowance
              ? "Added to gross pay. A percentage is taken from base salary."
              : "Taken off gross. Before-tax ones reduce what a percentage tax is then worked out on."}
          </CardDescription>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Add</Button>
            </DialogTrigger>
            <DialogContent>
              <form action={assign}>
                <DialogHeader>
                  <DialogTitle>Add {noun}</DialogTitle>
                  <DialogDescription>
                    A one-off lands in exactly one payroll month. A recurring one applies every month between its dates.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${kind}-type`}>{isAllowance ? "Allowance" : "Deduction"}</Label>
                    <Select value={typeId} onValueChange={setTypeId}>
                      <SelectTrigger id={`${kind}-type`}><SelectValue placeholder={`Choose a ${noun}`} /></SelectTrigger>
                      <SelectContent>
                        {types
                          .filter((type) => type.isActive)
                          .map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name} — {type.kind === "PERCENTAGE" ? `${Number(type.value)}%` : formatNaira(type.value)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valueOverride">Override for this person</Label>
                    <Input id="valueOverride" name="valueOverride" type="number" min="0" step="0.01" placeholder="Leave blank to use the standard value" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch id={`${kind}-recurring`} checked={isRecurring} onCheckedChange={setIsRecurring} />
                    <Label htmlFor={`${kind}-recurring`}>Recurring every month</Label>
                  </div>
                  {!isRecurring && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="periodMonth">Month</Label>
                        <Input
                          id="periodMonth"
                          name="periodMonth"
                          type="number"
                          min="1"
                          max="12"
                          required
                          defaultValue={now.getMonth() + 1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="periodYear">Year</Label>
                        <Input
                          id="periodYear"
                          name="periodYear"
                          type="number"
                          min="2000"
                          max="2200"
                          required
                          defaultValue={now.getFullYear()}
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start date</Label>
                      <Input id="startDate" name="startDate" type="date" required defaultValue={today()} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End date</Label>
                      <Input id="endDate" name="endDate" type="date" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${kind}-reason`}>Reason</Label>
                    <Input id={`${kind}-reason`} name="reason" placeholder="Optional" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isPending || !typeId}>Add</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Value</th>
              <th className="py-2 pr-4 font-medium">Applies</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              {canManage && <th className="py-2 pr-4 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.id} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <div className="font-medium">{assignment.name}</div>
                  {assignment.reason && <div className="text-muted-foreground">{assignment.reason}</div>}
                </td>
                <td className="py-3 pr-4">
                  {assignment.kind === "PERCENTAGE" ? `${Number(assignment.value)}%` : formatNaira(assignment.value)}
                </td>
                <td className="py-3 pr-4">
                  {assignment.isRecurring ? "Every month" : `Only ${assignment.periodLabel ?? "—"}`}
                  {assignment.timing === "PRE_TAX" && " · before tax"}
                </td>
                <td className="py-3 pr-4">{assignment.isActive ? "Active" : "Stopped"}</td>
                {canManage && (
                  <td className="py-3 pr-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => toggle(assignment.id, !assignment.isActive)}
                    >
                      {assignment.isActive ? "Stop" : "Resume"}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {assignments.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No {noun}s for this person.</p>
        )}
      </CardContent>
    </Card>
  )
}

const DISCIPLINE_TYPES = [
  { value: "QUERY", label: "Query" },
  { value: "WARNING", label: "Warning" },
  { value: "SUSPENSION", label: "Suspension" },
  { value: "TERMINATION", label: "Termination" },
  { value: "RESIGNATION", label: "Resignation" },
]

const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended — keeps the record, stops the pay" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
]

/** Discipline and exit records, plus the employment status they usually accompany. */
export function DisciplinePanel({
  staffId,
  employmentStatus,
  records,
  canManage,
}: {
  staffId: string
  employmentStatus: string
  records: Array<{
    id: string
    type: string
    reason: string
    occurredOn: string
    actionTaken: string | null
    recordedByName: string
  }>
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState("QUERY")
  const [statusOpen, setStatusOpen] = useState(false)
  const [status, setStatus] = useState(employmentStatus)

  function record(formData: FormData) {
    startTransition(async () => {
      const result = await createDisciplinaryRecord({
        staffId,
        type,
        reason: formData.get("reason"),
        occurredOn: formData.get("occurredOn"),
        actionTaken: formData.get("actionTaken") || undefined,
      })
      if (!result.success) {
        toast.error("Could not record it", { description: result.error })
        return
      }
      toast.success("Record added")
      setOpen(false)
      router.refresh()
    })
  }

  function changeStatus(formData: FormData) {
    startTransition(async () => {
      const result = await setStaffEmploymentStatus({
        staffId,
        employmentStatus: status,
        effectiveOn: formData.get("effectiveOn") || undefined,
        reason: formData.get("statusReason") || undefined,
      })
      if (!result.success) {
        toast.error("Could not change the status", { description: result.error })
        return
      }
      toast.success("Employment status changed", {
        description:
          result.data.login === "DEACTIVATED"
            ? "Their login has been switched off and they have been signed out."
            : result.data.login === "REACTIVATED"
              ? "Their login has been switched back on."
              : undefined,
      })
      setStatusOpen(false)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Discipline &amp; Exit</CardTitle>
          <CardDescription>
            Queries, warnings, suspensions and exits. Marking somebody resigned or terminated stops payroll including
            them from that date.
          </CardDescription>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Change status</Button>
              </DialogTrigger>
              <DialogContent>
                <form action={changeStatus}>
                  <DialogHeader>
                    <DialogTitle>Employment status</DialogTitle>
                    <DialogDescription>
                      Currently {employmentStatus.toLowerCase()}. Suspending, resigning or
                      terminating a teacher or accountant also switches off their login and signs
                      them out; setting them active again switches it back on.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="employmentStatus">New status</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger id="employmentStatus"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="effectiveOn">Effective on</Label>
                      <Input id="effectiveOn" name="effectiveOn" type="date" defaultValue={today()} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="statusReason">Reason</Label>
                      <Input id="statusReason" name="statusReason" placeholder="Optional" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isPending}>Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Add record</Button>
              </DialogTrigger>
              <DialogContent>
                <form action={record}>
                  <DialogHeader>
                    <DialogTitle>Add a record</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="discipline-type">Type</Label>
                      <Select value={type} onValueChange={setType}>
                        <SelectTrigger id="discipline-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DISCIPLINE_TYPES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="occurredOn">Date</Label>
                      <Input id="occurredOn" name="occurredOn" type="date" required defaultValue={today()} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="discipline-reason">Reason</Label>
                      <Textarea id="discipline-reason" name="reason" rows={3} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="actionTaken">Action taken</Label>
                      <Textarea id="actionTaken" name="actionTaken" rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isPending}>Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {records.map((entry) => (
          <div key={entry.id} className="border-b pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{entry.type.toLowerCase()}</span>
              <span className="text-sm text-muted-foreground">
                {formatDocumentDate(entry.occurredOn)} · {entry.recordedByName}
              </span>
            </div>
            <p className="mt-1 text-sm">{entry.reason}</p>
            {entry.actionTaken && (
              <p className="mt-1 text-sm text-muted-foreground">Action: {entry.actionTaken}</p>
            )}
          </div>
        ))}
        {records.length === 0 && <p className="text-sm text-muted-foreground">Nothing on record.</p>}
      </CardContent>
    </Card>
  )
}
