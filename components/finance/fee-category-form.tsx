"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createFeeCategory, deleteFeeCategory, updateFeeCategory } from "@/app/actions/finance"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FEE_TYPES } from "@/lib/finance/fee-setup-filters"
import { formatNaira } from "@/lib/money"
import {
  canDeactivateFeeCategory,
  canDeleteFeeCategory,
  canUseFeeCategoryName,
} from "@/lib/finance/fee-setup-rules"

export type FeeCategoryDetail = {
  id: string
  name: string
  description: string | null
  type: string
  isActive: boolean
  scheduleCount: number
  activeScheduleCount: number
  discountCount: number
  exemptionCount: number
  takenNames: Array<{ id: string; name: string }>
  schedules: Array<{
    id: string
    name: string
    scopeLabel: string
    sessionName: string
    amount: string
    isActive: boolean
    chargeCount: number
  }>
}

/** What each type is for, in the words a bursar would use. */
const TYPE_NOTE: Record<string, string> = {
  MANDATORY: "Everyone in scope is billed. Tuition, development levy, examination fees.",
  OPTIONAL: "Billed only where it is taken up. Transport, boarding, clubs.",
  REGISTRATION: "Charged once on admission rather than every term.",
  SERVICE: "Something the school provides and charges for separately.",
}

/**
 * A fee category, created or edited on its own screen.
 *
 * It used to share a page with the schedule form, side by side, which read as one task in
 * two columns — and a category has to exist before a schedule can name it, so the order was
 * never obvious from the layout. This screen does one thing and then takes you to the list.
 *
 * Editing carries the same rules the server enforces: a name is checked against the ones
 * already taken as it is typed, and deactivating or deleting is greyed out with the reason
 * whenever something still depends on the category — with that something listed beside it.
 */
export function FeeCategoryForm({
  basePath,
  category,
  takenNames = [],
}: {
  basePath: string
  /** Absent when creating. */
  category?: FeeCategoryDetail
  /** Every category name in the school. Supplied on create; the detail carries its own. */
  takenNames?: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [name, setName] = useState(category?.name ?? "")
  const [type, setType] = useState(category?.type ?? "MANDATORY")
  const [isActive, setIsActive] = useState(category?.isActive ?? true)

  const listPath = `${basePath}/fees/categories`
  const names = category?.takenNames ?? takenNames
  const nameVerdict = canUseFeeCategoryName(name, names, category?.id)
  const nameError = name.trim().length > 0 && !nameVerdict.allowed ? nameVerdict.reason : null

  const deactivate = category
    ? canDeactivateFeeCategory({ activeScheduleCount: category.activeScheduleCount })
    : { allowed: true as const }
  const removal = category
    ? canDeleteFeeCategory({
        scheduleCount: category.scheduleCount,
        discountCount: category.discountCount,
        exemptionCount: category.exemptionCount,
      })
    : { allowed: true as const }

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const description = String(formData.get("description") ?? "")
      const result = category
        ? await updateFeeCategory({ id: category.id, name, description, type, isActive })
        : await createFeeCategory({ name, description, type })

      if (!result.success) {
        toast.error(category ? "Category not updated" : "Category not created", { description: result.error })
        return
      }

      toast.success(`${name.trim()} ${category ? "updated" : "created"}`, {
        description: category ? undefined : "It can now be named by a fee schedule.",
      })
      router.push(listPath)
      router.refresh()
    })
  }

  const remove = () => {
    if (!category) return
    startTransition(async () => {
      const result = await deleteFeeCategory({ id: category.id })
      setConfirmingDelete(false)

      if (!result.success) {
        toast.error("Category not deleted", { description: result.error })
        return
      }

      toast.success(`${category.name} deleted`)
      router.push(listPath)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Category details</CardTitle>
            <CardDescription>
              A category groups fees for reporting, discounts and exemptions. Nothing is billed by
              creating one — that is what a fee schedule does.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Name</Label>
                <Input
                  id="category-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tuition"
                  required
                  maxLength={100}
                  aria-invalid={Boolean(nameError)}
                />
                <p className={nameError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {nameError ?? "The heading this appears under on receipts, statements and reports."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-type">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="category-type">
                    <SelectValue>{FEE_TYPES.find((option) => option.value === type)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{TYPE_NOTE[type]}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-description">Description</Label>
                <Textarea
                  id="category-description"
                  name="description"
                  rows={3}
                  maxLength={300}
                  defaultValue={category?.description ?? ""}
                  placeholder="Optional. What this category covers, for whoever sets up fees next year."
                />
              </div>

              {category && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={isActive}
                      disabled={isActive && !deactivate.allowed}
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    Active — can be chosen for a new fee schedule
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {isActive && !deactivate.allowed
                      ? deactivate.reason
                      : "Switching a category off leaves existing schedules and charges exactly as they are."}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={pending || Boolean(nameError)}>
                  {pending
                    ? category
                      ? "Saving…"
                      : "Creating…"
                    : category
                      ? "Save changes"
                      : "Create category"}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(listPath)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {category && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Delete this category</CardTitle>
              <CardDescription>
                {removal.allowed
                  ? "Nothing points at this category, so it can be removed for good."
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
                Delete category
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {category && (
        // "1 fee schedule reports under this category" is a fact nobody can act on without
        // knowing which one. This is which one — and it is what the delete and deactivate
        // rules are refusing on, so the refusal and its cause sit side by side.
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">What reports under this</CardTitle>
              <CardDescription>
                {category.schedules.length === 0
                  ? "No fee schedule uses this category yet."
                  : `${category.schedules.length} fee schedule${
                      category.schedules.length === 1 ? "" : "s"
                    }, ${category.activeScheduleCount} of them active.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {category.schedules.length === 0 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${basePath}/fees/schedules/new`}>New fee schedule</Link>
                </Button>
              ) : (
                category.schedules.map((schedule) => (
                  <Link
                    key={schedule.id}
                    href={`${basePath}/fees/schedules/${schedule.id}`}
                    className="block rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{schedule.name}</span>
                      {!schedule.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {schedule.scopeLabel} · {schedule.sessionName}
                    </p>
                    <p className="text-sm tabular-nums">
                      {formatNaira(schedule.amount)} ·{" "}
                      <span className="text-muted-foreground">
                        {schedule.chargeCount} student{schedule.chargeCount === 1 ? "" : "s"} billed
                      </span>
                    </p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {(category.discountCount > 0 || category.exemptionCount > 0) && (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">Adjustments granted</CardTitle>
                <CardDescription>
                  Decisions recorded against this category. They are why it cannot simply be deleted.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  {category.discountCount} discount{category.discountCount === 1 ? "" : "s"} ·{" "}
                  {category.exemptionCount} exemption{category.exemptionCount === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {category?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the category for good. Nothing bills against it, so no student charge and no
              receipt changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting…" : "Delete category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
