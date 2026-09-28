import { BackButton } from "@/components/back-button"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getExpenditureSetupData, getExpense } from "@/app/actions/expenditure"
import { ExpenseForm } from "@/components/expenditure/expense-form"
import { Button } from "@/components/ui/button"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * The record/edit screen.
 *
 * Only active categories and accounts are offered: a retired category still labels old
 * vouchers, but nothing new should be filed under it.
 */
export async function ExpenseFormView({
  basePath,
  expenseId,
}: {
  basePath: string
  /** Present when editing an existing draft or pending expense. */
  expenseId?: string
}) {
  const setup = await getExpenditureSetupData()
  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  const categories = setup.data.categories.filter((category) => category.isActive)
  const accounts = setup.data.accounts.filter((account) => account.isActive)

  if (categories.length === 0 || accounts.length === 0) {
    return (
      <div className="space-y-4">
        <BackButton fallbackHref={`${basePath}/transactions`} />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Record Expenditure</h1>
          <InfoGuide guideKey="expenditure.new" />
        </div>
        <div className="rounded-md border border-dashed p-6">
          <p className="font-medium">Expenditure needs a category and an account first.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {categories.length === 0 && accounts.length === 0
              ? "No expense categories or payment accounts have been set up yet."
              : categories.length === 0
                ? "No active expense categories yet."
                : "No active payment accounts yet."}{" "}
            An admin sets these up before anything can be recorded.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`${basePath}/categories`}>Categories</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`${basePath}/accounts`}>Payment Chart</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  let expense
  if (expenseId) {
    const existing = await getExpense(expenseId)
    if (!existing.success) notFound()
    // Editing is refused after approval on the server too; this keeps the user from typing
    // into a form whose save will be rejected.
    if (existing.data.status !== "DRAFT" && existing.data.status !== "PENDING_APPROVAL") {
      return (
        <div className="space-y-4">
          <BackButton fallbackHref={`${basePath}/transactions`} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">{existing.data.voucherNo}</h1>
            <InfoGuide guideKey="expenditure.detail" />
          </div>
          <div className="rounded-md border border-dashed p-6">
            <p className="font-medium">This expense can no longer be edited.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It has been {existing.data.status.toLowerCase().replace("_", " ")}. Correct it by cancelling with a
              reason, which keeps both the original and the correction on the record.
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <Link href={`${basePath}/transactions/${existing.data.id}`}>Back to the expense</Link>
            </Button>
          </div>
        </div>
      )
    }

    expense = {
      id: existing.data.id,
      termId: existing.data.termId,
      categoryId: existing.data.categoryId,
      accountId: existing.data.accountId,
      payeeName: existing.data.payeeName,
      payeeType: existing.data.payeeType,
      description: existing.data.description,
      amount: existing.data.amount,
      paymentMethod: existing.data.paymentMethod,
      referenceNo: existing.data.referenceNo,
      expenseDate: existing.data.expenseDate,
      notes: existing.data.notes,
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref={`${basePath}/transactions`} />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">
            {expenseId ? "Edit Expenditure" : "Record Expenditure"}
          </h1>
          <InfoGuide guideKey="expenditure.new" />
        </div>
        <p className="text-muted-foreground">
          Who was paid, what for, from which account — and whether it is ready for approval.
        </p>
      </div>
      <ExpenseForm
        basePath={basePath}
        categories={categories}
        accounts={accounts}
        terms={setup.data.terms}
        expense={expense}
      />
    </div>
  )
}
