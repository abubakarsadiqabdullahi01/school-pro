"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createSalaryScale,
  deleteSalaryScale,
  updateSalaryScale,
  type SalaryScaleDetail,
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
import { Textarea } from "@/components/ui/textarea"
import { formatDocumentDate } from "@/lib/format"
import {
  baseSalaryChangeNote,
  canDeleteSalaryScale,
  canUseComponentName,
  retireComponentNote,
} from "@/lib/hr/pay-component-rules"
import { formatNaira } from "@/lib/money"

/**
 * A salary scale, created or managed on its own screen.
 *
 * There was no way to correct a scale at all before — a name or a figure typed wrong stayed
 * wrong for the life of the school, and Retire was the only button. This screen renames it,
 * corrects its grade and step, moves its base salary, retires it, or deletes it when nobody
 * has ever been put on it.
 *
 * The base salary is the part worth being careful with, and the careful behaviour is the
 * surprising one: a scale is *copied* onto a staff record when it is assigned, not linked to
 * it, so changing the figure moves nobody's pay. The screen says that out loud rather than
 * leaving somebody to wonder why the payroll did not change.
 */
export function SalaryScaleForm({
  basePath,
  scale,
  takenNames = [],
}: {
  basePath: string
  /** Absent when creating. */
  scale?: SalaryScaleDetail
  /** Every scale name in the school. Supplied on create; the detail carries its own. */
  takenNames?: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [name, setName] = useState(scale?.name ?? "")
  const [baseSalary, setBaseSalary] = useState(scale?.baseSalary ?? "")
  const [isActive, setIsActive] = useState(scale?.isActive ?? true)

  const listPath = `${basePath}/salary-scales`
  const names = scale?.takenNames ?? takenNames
  const nameVerdict = canUseComponentName(name, names, "salary scale", scale?.id)
  const nameError = name.trim().length > 0 && !nameVerdict.allowed ? nameVerdict.reason : null

  const removal = scale
    ? canDeleteSalaryScale({ staffCount: scale.staffCount })
    : { allowed: true as const }
  const retiring = scale ? retireComponentNote({ assignedCount: scale.staffCount }, "salary scale") : null
  const salaryNote = scale
    ? baseSalaryChangeNote(scale.baseSalary, baseSalary, { staffCount: scale.staffCount })
    : null

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const payload = {
        name,
        gradeLevel: String(formData.get("gradeLevel") ?? "") || undefined,
        step: String(formData.get("step") ?? "") || undefined,
        baseSalary,
        description: String(formData.get("description") ?? "") || undefined,
      }
      const result = scale
        ? await updateSalaryScale({ ...payload, id: scale.id, isActive })
        : await createSalaryScale(payload)

      if (!result.success) {
        toast.error(scale ? "Scale not updated" : "Scale not created", { description: result.error })
        return
      }

      toast.success(`${name.trim()} ${scale ? "updated" : "created"}`, {
        description: scale ? undefined : "It can now be chosen when assigning a salary.",
      })
      router.push(listPath)
      router.refresh()
    })
  }

  const remove = () => {
    if (!scale) return
    startTransition(async () => {
      const result = await deleteSalaryScale({ id: scale.id })
      setConfirmingDelete(false)

      if (!result.success) {
        toast.error("Scale not deleted", { description: result.error })
        return
      }

      toast.success(`${scale.name} deleted`)
      router.push(listPath)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Scale details</CardTitle>
            <CardDescription>
              A standard level — Grade Level 1, Senior Teacher, Principal. Nothing is paid by creating one; it
              becomes a choice when a salary is assigned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="scale-name">Name</Label>
                  <Input
                    id="scale-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Senior Teacher"
                    required
                    maxLength={100}
                    aria-invalid={Boolean(nameError)}
                  />
                  <p className={nameError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {nameError ?? "What this level is called on a staff record and in the salary structure."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gradeLevel">Grade / level</Label>
                  <Input
                    id="gradeLevel"
                    name="gradeLevel"
                    defaultValue={scale?.gradeLevel ?? ""}
                    maxLength={60}
                    placeholder="GL 08"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="step">Step</Label>
                  <Input
                    id="step"
                    name="step"
                    defaultValue={scale?.step ?? ""}
                    maxLength={60}
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="baseSalary">Base salary</Label>
                  <Input
                    id="baseSalary"
                    type="number"
                    min="1"
                    step="100"
                    value={baseSalary}
                    onChange={(event) => setBaseSalary(event.target.value)}
                    required
                  />
                  <p
                    className={
                      salaryNote ? "text-xs text-amber-600 dark:text-amber-500" : "text-xs text-muted-foreground"
                    }
                  >
                    {salaryNote ??
                      "Monthly, before allowances and deductions. Copied onto a staff record when the scale is assigned."}
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="scale-description">Description</Label>
                  <Textarea
                    id="scale-description"
                    name="description"
                    rows={2}
                    maxLength={300}
                    defaultValue={scale?.description ?? ""}
                    placeholder="Optional. Who belongs on this level."
                  />
                </div>
              </div>

              {scale && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    Active — can be chosen when assigning a salary
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {!isActive && retiring
                      ? retiring
                      : "Retiring a scale takes it off the assignment form and leaves everybody already on it exactly as they are."}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending || Boolean(nameError)}>
                  {pending ? (scale ? "Saving…" : "Creating…") : scale ? "Save changes" : "Add scale"}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(listPath)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {scale && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Delete this scale</CardTitle>
              <CardDescription>
                {removal.allowed
                  ? "Nobody has ever been put on this scale, so it can be removed for good."
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
                Delete scale
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {scale && (
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Who is on it</CardTitle>
            <CardDescription>
              {scale.staffCount === 0
                ? `Nobody is on this scale. Added ${formatDocumentDate(scale.createdAt)}.`
                : `${scale.staffCount} ${
                    scale.staffCount === 1 ? "member of staff" : "members of staff"
                  }, costing ${formatNaira(
                    String(Number(scale.baseSalary) * scale.staffCount),
                  )} a month in base pay.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scale.staff.length === 0 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${basePath}/staff`}>Assign it to somebody</Link>
              </Button>
            ) : (
              scale.staff.map((person) => (
                <Link
                  key={person.id}
                  href={`${basePath}/staff/${person.id}`}
                  className="block rounded-md border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{person.name}</span>
                    <span className="tabular-nums">{formatNaira(person.baseSalary)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {person.staffNo}
                    {person.department ? ` · ${person.department}` : ""}
                    {Number(person.baseSalary) !== Number(scale.baseSalary) ? " · differs from the scale" : ""}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {scale?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the scale for good. Nobody has ever been put on it, so no staff record and no
              payslip changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting…" : "Delete scale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
