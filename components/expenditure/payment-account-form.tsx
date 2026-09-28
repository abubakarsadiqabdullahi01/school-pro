"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createPaymentAccount,
  deletePaymentAccount,
  updatePaymentAccount,
  type PaymentAccountDetail,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PAYMENT_ACCOUNT_TYPES } from "@/lib/expenditure/payment-account-filters"
import {
  canClosePaymentAccount,
  canDeletePaymentAccount,
  canUsePaymentAccountName,
  openingBalanceShift,
} from "@/lib/expenditure/payment-account-rules"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

/** What each type is for, in the words a bursar would use. */
const TYPE_NOTE: Record<string, string> = {
  CASH: "Money kept on the premises. The cash office, petty cash, a departmental float.",
  BANK: "A named account at a bank. Give the bank and the number so a voucher can be traced.",
  POS: "A terminal that settles into a bank account. Useful when its takings are tracked apart.",
  WALLET: "A mobile or online wallet the school pays from.",
  OTHER: "Anything the other four do not describe.",
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  PAID: "Paid",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

/**
 * A payment account, created or managed on its own screen.
 *
 * Creating used to mean a form stacked above the chart, which read as one page doing two
 * jobs, and there was no way to correct an account at all — a mistyped account number stayed
 * mistyped for the life of the school. This screen does one account: rename it, correct it,
 * close it, or delete it when nothing has ever used it.
 *
 * The rules it greys controls out with are the same predicates the server refuses on, and
 * what they refuse over — the vouchers, the salary payments, the staff paid from here — is
 * listed beside them, because "it cannot be deleted" is not actionable without the reason.
 */
export function PaymentAccountForm({
  basePath,
  account,
  takenNames = [],
}: {
  basePath: string
  /** Absent when creating. */
  account?: PaymentAccountDetail
  /** Every account name in the school. Supplied on create; the detail carries its own. */
  takenNames?: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [name, setName] = useState(account?.name ?? "")
  const [type, setType] = useState(account?.type ?? "CASH")
  const [openingBalance, setOpeningBalance] = useState(account?.openingBalance ?? "0")
  const [isActive, setIsActive] = useState(account?.isActive ?? true)

  const listPath = `${basePath}/accounts`
  const names = account?.takenNames ?? takenNames
  const nameVerdict = canUsePaymentAccountName(name, names, account?.id)
  const nameError = name.trim().length > 0 && !nameVerdict.allowed ? nameVerdict.reason : null

  const closing = account
    ? canClosePaymentAccount({ unpaidExpenseCount: account.unpaidExpenseCount })
    : { allowed: true as const }
  const removal = account
    ? canDeletePaymentAccount({
        expenseCount: account.expenseCount,
        salaryPaymentCount: account.salaryPaymentCount,
        staffConfigCount: account.staffConfigCount,
      })
    : { allowed: true as const }

  // Every balance the module reports is derived from the opening figure, so a correction to
  // it moves them all. Said here rather than discovered on a report later.
  const shift = account ? openingBalanceShift(account.openingBalance, openingBalance) : null

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const payload = {
        name,
        type,
        bankName: String(formData.get("bankName") ?? "") || undefined,
        accountNumber: String(formData.get("accountNumber") ?? "") || undefined,
        openingBalance: openingBalance || 0,
      }
      const result = account
        ? await updatePaymentAccount({ ...payload, id: account.id, isActive })
        : await createPaymentAccount(payload)

      if (!result.success) {
        toast.error(account ? "Account not updated" : "Account not created", { description: result.error })
        return
      }

      toast.success(`${name.trim()} ${account ? "updated" : "created"}`, {
        description: account ? undefined : "It can now be chosen when recording an expense.",
      })
      router.push(listPath)
      router.refresh()
    })
  }

  const remove = () => {
    if (!account) return
    startTransition(async () => {
      const result = await deletePaymentAccount({ id: account.id })
      setConfirmingDelete(false)

      if (!result.success) {
        toast.error("Account not deleted", { description: result.error })
        return
      }

      toast.success(`${account.name} deleted`)
      router.push(listPath)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>
              Where money is paid from — the cash office, the main bank account, the PTA account, petty
              cash. Nothing is spent by creating one; it becomes a choice on the expenditure form.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="account-name">Account name</Label>
                  <Input
                    id="account-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Main Bank Account"
                    required
                    maxLength={100}
                    aria-invalid={Boolean(nameError)}
                  />
                  <p className={nameError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {nameError ?? "What it is called on a voucher and in every expenditure report."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account-type">Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger id="account-type" className="w-full">
                      <SelectValue>
                        {PAYMENT_ACCOUNT_TYPES.find((option) => option.value === type)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_ACCOUNT_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{TYPE_NOTE[type]}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openingBalance">Opening balance</Label>
                  <Input
                    id="openingBalance"
                    name="openingBalance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={(event) => setOpeningBalance(event.target.value)}
                  />
                  <p className={shift ? "text-xs text-amber-600 dark:text-amber-500" : "text-xs text-muted-foreground"}>
                    {shift
                      ? `Every balance reported for this account moves ${shift.direction} by ${formatNaira(
                          shift.delta,
                        )}.`
                      : "What the account held when it was first entered here."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank name</Label>
                  <Input
                    id="bankName"
                    name="bankName"
                    defaultValue={account?.bankName ?? ""}
                    maxLength={120}
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account number</Label>
                  <Input
                    id="accountNumber"
                    name="accountNumber"
                    defaultValue={account?.accountNumber ?? ""}
                    maxLength={40}
                    placeholder="Optional"
                  />
                </div>
              </div>

              {account && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={isActive}
                      disabled={isActive && !closing.allowed}
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    Open — can be chosen when recording an expense
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {isActive && !closing.allowed
                      ? closing.reason
                      : "Closing an account hides it from the expenditure form and leaves every voucher already paid from it exactly as it is."}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending || Boolean(nameError)}>
                  {pending
                    ? account
                      ? "Saving…"
                      : "Creating…"
                    : account
                      ? "Save changes"
                      : "Add account"}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(listPath)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {account && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Delete this account</CardTitle>
              <CardDescription>
                {removal.allowed
                  ? "Nothing has ever been paid from this account, so it can be removed for good."
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
                Delete account
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {account && (
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Where it stands</CardTitle>
              <CardDescription>
                Opening figure less everything paid out, computed on read.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Opening</span>
                <span className="tabular-nums">{formatNaira(account.openingBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Paid out</span>
                <span className="tabular-nums">{formatNaira(account.paidOut)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-medium">Balance</span>
                <span
                  className={`font-semibold tabular-nums ${
                    Number(account.balance) < 0 ? "text-destructive" : ""
                  }`}
                >
                  {formatNaira(account.balance)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {account.lastPaidAt
                  ? `Last payment ${formatDocumentDate(account.lastPaidAt)}. Added ${formatDocumentDate(
                      account.createdAt,
                    )}.`
                  : `Nothing has been paid from this account. Added ${formatDocumentDate(account.createdAt)}.`}
              </p>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">What has left it</CardTitle>
              <CardDescription>
                {account.expenseCount === 0
                  ? "No voucher has been raised against this account yet."
                  : `${account.expenseCount} voucher${account.expenseCount === 1 ? "" : "s"}${
                      account.unpaidExpenseCount > 0
                        ? `, ${account.unpaidExpenseCount} still to be paid`
                        : ""
                    }.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.recentExpenses.length === 0 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${basePath}/new`}>Record an expense</Link>
                </Button>
              ) : (
                <>
                  {account.recentExpenses.map((expense) => (
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
                          {expense.voucherNo} · {expense.categoryName} ·{" "}
                          {formatDocumentDate(expense.expenseDate)}
                        </span>
                        {expense.status !== "PAID" && (
                          <Badge variant="secondary">{STATUS_LABEL[expense.status] ?? expense.status}</Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                  {account.expenseCount > account.recentExpenses.length && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`${basePath}/transactions`}>See all vouchers</Link>
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {(account.salaryPaymentCount > 0 || account.staffConfigCount > 0) && (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">Payroll uses this too</CardTitle>
                <CardDescription>
                  Not only expenditure points here, which is part of why it cannot simply be deleted.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {account.salaryPaymentCount > 0 && (
                  <p>
                    {account.salaryPaymentCount} salary payment
                    {account.salaryPaymentCount === 1 ? "" : "s"} made from it
                  </p>
                )}
                {account.staffConfigCount > 0 && (
                  <p className="text-muted-foreground">
                    Salaries are paid from this account by default.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {account?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account for good. Nothing has ever been paid from it, so no voucher and no
              reported balance changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
