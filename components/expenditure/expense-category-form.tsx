"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createExpenseCategory,
  deleteExpenseCategory,
  updateExpenseCategory,
  type ExpenseCategoryDetail,
} from "@/app/actions/expenditure"
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
import { Textarea } from "@/components/ui/textarea"
import { budgetUsedPercent } from "@/lib/expenditure/expense-category-filters"
import {
  budgetLimitWarning,
  canDeleteExpenseCategory,
  canUseExpenseCategoryName,
  retireNote,
} from "@/lib/expenditure/expense-category-rules"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  PAID: "Paid",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

/**
 * An expense category, created or managed on its own screen.
 *
 * Creating used to mean a form stacked above the list, and there was no way to correct a
 * category at all — a name typed wrong stayed wrong, and a budget set in the first term could
 * never be moved. This screen does one category: rename it, move its ceiling, retire it, or
 * delete it when nothing has ever been charged to it.
 *
 * The ceiling is the part worth being careful with. It is reported against and never
 * enforced, so lowering it below what the term has already spent is allowed — and said out
 * loud before saving, because the category reports as over budget the moment it lands.
 */
export function ExpenseCategoryForm({
  basePath,
  category,
  takenNames = [],
}: {
  basePath: string
  /** Absent when creating. */
  category?: ExpenseCategoryDetail
  /** Every category name in the school. Supplied on create; the detail carries its own. */
  takenNames?: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [name, setName] = useState(category?.name ?? "")
  const [budgetLimit, setBudgetLimit] = useState(category?.budgetLimit ?? "")
  const [isActive, setIsActive] = useState(category?.isActive ?? true)

  const listPath = `${basePath}/categories`
  const names = category?.takenNames ?? takenNames
  const nameVerdict = canUseExpenseCategoryName(name, names, category?.id)
  const nameError = name.trim().length > 0 && !nameVerdict.allowed ? nameVerdict.reason : null

  const removal = category
    ? canDeleteExpenseCategory({ expenseCount: category.expenseCount })
    : { allowed: true as const }
  const retiring = category ? retireNote({ unpaidExpenseCount: category.unpaidExpenseCount }) : null
  const limitWarning = category ? budgetLimitWarning(budgetLimit, category.termSpend) : null
  const usedPercent = category ? budgetUsedPercent(category.budgetLimit, category.termSpend) : null

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const payload = {
        name,
        description: String(formData.get("description") ?? "") || undefined,
        budgetLimit: budgetLimit || undefined,
      }
      const result = category
        ? await updateExpenseCategory({ ...payload, id: category.id, isActive })
        : await createExpenseCategory(payload)

      if (!result.success) {
        toast.error(category ? "Category not updated" : "Category not created", { description: result.error })
        return
      }

      toast.success(`${name.trim()} ${category ? "updated" : "created"}`, {
        description: category ? undefined : "It can now be chosen when recording an expense.",
      })
      router.push(listPath)
      router.refresh()
    })
  }

  const remove = () => {
    if (!category) return
    startTransition(async () => {
      const result = await deleteExpenseCategory({ id: category.id })
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
              What the school spends money on — salaries, repairs, utilities, feeding, examinations. Nothing
              is spent by creating one; it becomes a heading on the expenditure form and in every report.
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
                  placeholder="Repairs and Maintenance"
                  required
                  maxLength={100}
                  aria-invalid={Boolean(nameError)}
                />
                <p className={nameError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {nameError ?? "The heading this spending appears under on vouchers and reports."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="budgetLimit">Termly budget limit</Label>
                <Input
                  id="budgetLimit"
                  name="budgetLimit"
                  type="number"
                  min="0"
                  step="100"
                  value={budgetLimit}
                  onChange={(event) => setBudgetLimit(event.target.value)}
                  placeholder="Optional"
                />
                <p
                  className={
                    limitWarning ? "text-xs text-amber-600 dark:text-amber-500" : "text-xs text-muted-foreground"
                  }
                >
                  {limitWarning ??
                    "Optional, and per term rather than per session. It is reported against, never enforced — a burst pipe should not be blocked by a stationery budget."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-description">Description</Label>
                <Textarea
                  id="category-description"
                  name="description"
                  rows={3}
                  maxLength={300}
                  defaultValue={category?.description ?? ""}
                  placeholder="Optional. What belongs under this heading, for whoever records the next voucher."
                />
              </div>

              {category && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    Active — can be chosen when recording an expense
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {!isActive && retiring
                      ? retiring
                      : "Retiring a category takes it off the expenditure form and leaves every past voucher reading exactly as it did."}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending || Boolean(nameError)}>
                  {pending
                    ? category
                      ? "Saving…"
                      : "Creating…"
                    : category
                      ? "Save changes"
                      : "Add category"}
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
                  ? "Nothing has ever been charged to this category, so it can be removed for good."
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
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Where it stands</CardTitle>
              <CardDescription>
                {category.termName
                  ? `Spending in ${category.termName}, against the ceiling set above.`
                  : "Spending recorded under this heading."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {category.termName ? category.termName : "This term"}
                </span>
                <span
                  className={`tabular-nums ${
                    usedPercent !== null && usedPercent > 100 ? "font-semibold text-destructive" : ""
                  }`}
                >
                  {formatNaira(category.termSpend)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Termly limit</span>
                <span className="tabular-nums">
                  {category.budgetLimit ? formatNaira(category.budgetLimit) : "None set"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-medium">Paid all time</span>
                <span className="font-semibold tabular-nums">{formatNaira(category.totalSpent)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {usedPercent === null
                  ? `No ceiling is set, so nothing reports as over budget. Added ${formatDocumentDate(
                      category.createdAt,
                    )}.`
                  : usedPercent > 100
                    ? `${usedPercent}% of the limit — over by ${formatNaira(
                        Number(category.termSpend) - Number(category.budgetLimit ?? 0),
                      )}.`
                    : `${usedPercent}% of the limit used.`}
              </p>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">What was charged to it</CardTitle>
              <CardDescription>
                {category.expenseCount === 0
                  ? "No voucher reports under this category yet."
                  : `${category.expenseCount} voucher${category.expenseCount === 1 ? "" : "s"}${
                      category.unpaidExpenseCount > 0
                        ? `, ${category.unpaidExpenseCount} still to be paid`
                        : ""
                    }.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {category.recentExpenses.length === 0 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${basePath}/new`}>Record an expense</Link>
                </Button>
              ) : (
                <>
                  {category.recentExpenses.map((expense) => (
                    <Link
                      key={expense.id}
                      href={`${basePath}/transactions/${expense.id}`}
                      className="block rounded-md border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{expense.payeeName}</span>
                        <span className="tabular-nums">{formatNaira(expense.amount)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {expense.voucherNo} · {expense.accountName} ·{" "}
                          {formatDocumentDate(expense.expenseDate)}
                        </span>
                        {expense.status !== "PAID" && (
                          <Badge variant="secondary">{STATUS_LABEL[expense.status] ?? expense.status}</Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                  {category.expenseCount > category.recentExpenses.length && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`${basePath}/transactions`}>See all vouchers</Link>
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {category?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the category for good. Nothing has ever been charged to it, so no voucher and no
              report changes.
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
