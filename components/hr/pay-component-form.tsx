"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createAllowanceType,
  createDeductionType,
  deletePayComponent,
  updateAllowanceType,
  updateDeductionType,
  type PayComponentDetail,
} from "@/app/actions/hr"
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
import { formatDocumentDate } from "@/lib/format"
import { COMPONENT_KINDS, DEDUCTION_TIMINGS, componentKindLabel } from "@/lib/hr/pay-component-filters"
import {
  canDeletePayComponent,
  canUseComponentName,
  retireComponentNote,
} from "@/lib/hr/pay-component-rules"
import { formatNaira } from "@/lib/money"

type Kind = "allowance" | "deduction"

/**
 * An allowance or a deduction, created or managed on its own screen.
 *
 * One form for both: the only difference is that a deduction says whether it comes off
 * before or after tax, and an allowance says whether it is taxable. Neither could be edited
 * at all before — a percentage typed as 80 instead of 8 was permanent, and Retire was the
 * only button.
 *
 * Changing a value here changes what future payroll works out. Payslips already issued keep
 * the figures frozen onto them at generation, which is why the name can never simply be
 * deleted once it has been used.
 */
export function PayComponentForm({
  basePath,
  kind,
  component,
  takenNames = [],
}: {
  basePath: string
  kind: Kind
  /** Absent when creating. */
  component?: PayComponentDetail
  /** Every name of this type in the school. Supplied on create; the detail carries its own. */
  takenNames?: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [name, setName] = useState(component?.name ?? "")
  const [componentKind, setComponentKind] = useState(component?.kind ?? "FIXED")
  const [value, setValue] = useState(component?.value ?? "")
  const [timing, setTiming] = useState(component?.timing ?? "POST_TAX")
  const [isTaxable, setIsTaxable] = useState(component?.isTaxable ?? true)
  const [isRecurring, setIsRecurring] = useState(component?.isRecurring ?? true)
  const [isActive, setIsActive] = useState(component?.isActive ?? true)

  const plural = kind === "allowance" ? "allowances" : "deductions"
  const listPath = `${basePath}/${plural}`
  const names = component?.takenNames ?? takenNames
  const nameVerdict = canUseComponentName(name, names, kind, component?.id)
  const nameError = name.trim().length > 0 && !nameVerdict.allowed ? nameVerdict.reason : null

  const removal = component
    ? canDeletePayComponent({ assignedCount: component.assignedCount }, kind)
    : { allowed: true as const }
  const retiring = component
    ? retireComponentNote({ assignedCount: component.assignedCount }, kind)
    : null

  const valueChanged = component ? Number(component.value) !== Number(value) : false

  const submit = () => {
    startTransition(async () => {
      const shared = { name, kind: componentKind, value, isRecurring }

      const result = component
        ? kind === "allowance"
          ? await updateAllowanceType({ ...shared, isTaxable, id: component.id, isActive })
          : await updateDeductionType({ ...shared, timing, id: component.id, isActive })
        : kind === "allowance"
          ? await createAllowanceType({ ...shared, isTaxable })
          : await createDeductionType({ ...shared, timing })

      if (!result.success) {
        toast.error(component ? "Not updated" : "Not created", { description: result.error })
        return
      }

      toast.success(`${name.trim()} ${component ? "updated" : "created"}`, {
        description: component ? undefined : "It can now be assigned to a member of staff.",
      })
      router.push(listPath)
      router.refresh()
    })
  }

  const remove = () => {
    if (!component) return
    startTransition(async () => {
      const result = await deletePayComponent({ id: component.id, kind })
      setConfirmingDelete(false)

      if (!result.success) {
        toast.error("Not deleted", { description: result.error })
        return
      }

      toast.success(`${component.name} deleted`)
      router.push(listPath)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{kind === "allowance" ? "Allowance" : "Deduction"} details</CardTitle>
            <CardDescription>
              {kind === "allowance"
                ? "Added to gross pay. A percentage is taken from base salary, so it scales with a part month."
                : "Taken off gross pay. Before-tax ones reduce the figure a percentage tax is then worked out on."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={submit}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="component-name">Name</Label>
                  <Input
                    id="component-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={kind === "allowance" ? "Transport allowance" : "PAYE tax"}
                    required
                    maxLength={100}
                    aria-invalid={Boolean(nameError)}
                  />
                  <p className={nameError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {nameError ?? "The name that appears on every payslip this is worked into."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="component-kind">Type</Label>
                  <Select value={componentKind} onValueChange={setComponentKind}>
                    <SelectTrigger id="component-kind" className="w-full">
                      <SelectValue>{componentKindLabel(componentKind)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {COMPONENT_KINDS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {componentKind === "PERCENTAGE"
                      ? "A share of base salary, worked out per person."
                      : "The same naira figure for everybody on it."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="component-value">
                    {componentKind === "PERCENTAGE" ? "Percent of base salary" : "Amount"}
                  </Label>
                  <Input
                    id="component-value"
                    type="number"
                    min="0"
                    step={componentKind === "PERCENTAGE" ? "0.1" : "100"}
                    max={componentKind === "PERCENTAGE" ? "100" : undefined}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    required
                  />
                  <p
                    className={
                      valueChanged
                        ? "text-xs text-amber-600 dark:text-amber-500"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {valueChanged
                      ? "Future payroll uses the new figure. Payslips already issued keep the figures frozen onto them."
                      : componentKind === "PERCENTAGE"
                        ? "Entered as a number: 8 means 8%."
                        : "A flat monthly figure."}
                  </p>
                </div>

                {kind === "deduction" && (
                  <div className="space-y-2">
                    <Label htmlFor="component-timing">Applies</Label>
                    <Select value={timing} onValueChange={setTiming}>
                      <SelectTrigger id="component-timing" className="w-full">
                        <SelectValue>
                          {DEDUCTION_TIMINGS.find((option) => option.value === timing)?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {DEDUCTION_TIMINGS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {timing === "PRE_TAX"
                        ? "Comes off first, so a percentage tax is worked out on the smaller figure. Pension is the usual example."
                        : "Comes off after tax has been worked out."}
                    </p>
                  </div>
                )}

                {kind === "allowance" && (
                  <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={isTaxable}
                        onChange={(event) => setIsTaxable(event.target.checked)}
                      />
                      Taxable — counts towards the figure tax is worked out on
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Switch this off for an allowance that is paid but not taxed.
                    </p>
                  </div>
                )}

                <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={isRecurring}
                      onChange={(event) => setIsRecurring(event.target.checked)}
                    />
                    Recurring by default — applies every month it is assigned
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Off means a one-off: it applies to a single month and is set per assignment.
                  </p>
                </div>
              </div>

              {component && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    Active — can be assigned to somebody new
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {!isActive && retiring
                      ? retiring
                      : `Retiring takes it off the assignment form and leaves every issued payslip reading exactly as it did.`}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending || Boolean(nameError)}>
                  {pending
                    ? component
                      ? "Saving…"
                      : "Creating…"
                    : component
                      ? "Save changes"
                      : `Add ${kind}`}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(listPath)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {component && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Delete this {kind}</CardTitle>
              <CardDescription>
                {removal.allowed
                  ? `This ${kind} has never been assigned, so it can be removed for good.`
                  : removal.reason}
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
                Delete {kind}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {component && (
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Who is on it</CardTitle>
            <CardDescription>
              {component.assignedCount === 0
                ? `Nobody is on this ${kind}. Added ${formatDocumentDate(component.createdAt)}.`
                : `${component.assignedCount} ${
                    component.assignedCount === 1 ? "member of staff" : "members of staff"
                  }. A value shown against a name is an override for that person.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {component.staff.length === 0 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${basePath}/staff`}>Assign it to somebody</Link>
              </Button>
            ) : (
              component.staff.map((person) => (
                <Link
                  key={person.id}
                  href={`${basePath}/staff/${person.id}`}
                  className="block rounded-md border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{person.name}</span>
                    <span className="tabular-nums">
                      {componentKind === "PERCENTAGE" && Number(person.value) === Number(component.value)
                        ? `${Number(person.value)}%`
                        : formatNaira(person.value)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{person.staffNo}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {component?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {kind} for good. It has never been assigned, so no staff record and no payslip
              changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting…" : `Delete ${kind}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
