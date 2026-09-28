"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  deleteFinanceOfficer,
  resetFinanceOfficerPassword,
  setFinanceOfficerActive,
  updateFinanceOfficer,
} from "@/app/actions/finance"
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
import {
  canDeleteFinanceOfficer,
  canUseOfficerEmail,
  describeFinanceOfficerDeletion,
} from "@/lib/finance/finance-staff-rules"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

export type FinanceOfficerDetail = {
  userId: string
  name: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  paymentsRecorded: number
  totalCollected: string
  lastPaymentDate: string | null
  adjustmentsApproved: number
  /** Expenditure and payroll records naming them. */
  spendingHandled: number
  takenEmails: Array<{ userId: string; email: string }>
}

/**
 * One finance officer: their details, their access, and what they have handled.
 *
 * Everything destructive is decided by what the account has actually done. An officer who
 * has issued receipts cannot be deleted — their name is on those receipts — so the screen
 * greys it out and says so, and points at revoking access, which changes nothing historical.
 */
export function FinanceStaffDetailForm({
  basePath,
  officer,
}: {
  basePath: string
  officer: FinanceOfficerDetail
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)

  const [email, setEmail] = useState(officer.email ?? "")
  const listPath = `${basePath}/staff`

  const emailVerdict = canUseOfficerEmail(email, officer.takenEmails, officer.userId)
  const emailError = email.trim().length > 0 && !emailVerdict.allowed ? emailVerdict.reason : null

  const removal = canDeleteFinanceOfficer({
    paymentsRecorded: officer.paymentsRecorded,
    adjustmentsApproved: officer.adjustmentsApproved,
    spendingHandled: officer.spendingHandled,
  })

  const save = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateFinanceOfficer({
        userId: officer.userId,
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        email,
        phone: String(formData.get("phone") ?? ""),
      })

      if (!result.success) {
        toast.error("Not updated", { description: result.error })
        return
      }

      toast.success("Finance officer updated")
      router.push(listPath)
      router.refresh()
    })
  }

  const toggleAccess = () => {
    startTransition(async () => {
      const result = await setFinanceOfficerActive({ userId: officer.userId, isActive: !officer.isActive })
      if (!result.success) {
        toast.error("Access not changed", { description: result.error })
        return
      }

      toast.success(officer.isActive ? "Access revoked" : "Access restored", {
        description: officer.isActive
          ? "They can no longer sign in. Their receipts and approvals are untouched."
          : `${officer.name} can sign in again.`,
      })
      router.refresh()
    })
  }

  const resetPassword = () => {
    startTransition(async () => {
      const result = await resetFinanceOfficerPassword({ userId: officer.userId })
      if (!result.success) {
        toast.error("Password not reset", { description: result.error })
        return
      }

      setIssued(result.data.defaultPassword)
      toast.success("A new password has been issued")
    })
  }

  const remove = () => {
    startTransition(async () => {
      const result = await deleteFinanceOfficer({ userId: officer.userId })
      setConfirmingDelete(false)

      if (!result.success) {
        toast.error("Not deleted", { description: result.error })
        return
      }

      toast.success(`${officer.name} removed`, {
        description: result.data.hrRecordKept
          ? "Their HR staff record was kept. Record their exit under HR if they have left."
          : undefined,
      })
      router.push(listPath)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Officer details</CardTitle>
            <CardDescription>
              The email is the account — changing it changes what they sign in with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={save} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" name="firstName" defaultValue={officer.firstName} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" name="lastName" defaultValue={officer.lastName} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  aria-invalid={Boolean(emailError)}
                />
                {emailError && <p className="text-xs text-destructive">{emailError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" defaultValue={officer.phone ?? ""} placeholder="Optional" />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={pending || Boolean(emailError)}>
                  {pending ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(listPath)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access and sign-in</CardTitle>
            <CardDescription>
              {officer.isActive
                ? "This officer can sign in and take payments."
                : "Access is revoked. They cannot sign in; everything they recorded stays as it is."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={pending} onClick={toggleAccess}>
                {officer.isActive ? "Revoke access" : "Restore access"}
              </Button>
              <Button variant="outline" disabled={pending} onClick={resetPassword}>
                Reset password
              </Button>
            </div>
            {issued && (
              <div className="rounded-md border border-dashed p-3">
                <p className="text-sm text-muted-foreground">Temporary password</p>
                <p className="font-mono text-lg">{issued}</p>
                <p className="text-xs text-muted-foreground">
                  Shown once. Pass it on directly and have them change it at sign-in.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Delete this account</CardTitle>
            <CardDescription>
              {removal.allowed ? describeFinanceOfficerDeletion(officer.name) : removal.reason}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending || !removal.allowed}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete account
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">What they have handled</CardTitle>
          <CardDescription>The record their name is on — and what the rules above are decided by.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Receipts issued</p>
            <p className="text-2xl font-bold tabular-nums">{officer.paymentsRecorded}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-2xl font-bold tabular-nums">{formatNaira(officer.totalCollected)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Approvals granted</p>
            <p className="text-2xl font-bold tabular-nums">{officer.adjustmentsApproved}</p>
            <p className="text-xs text-muted-foreground">discounts and exemptions</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Added {formatDocumentDate(officer.createdAt)} ·{" "}
            {officer.lastPaymentDate
              ? `last receipt ${formatDocumentDate(officer.lastPaymentDate)}`
              : "no receipt issued yet"}
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {officer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account and its sign-in are removed for good. This cannot be undone.
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
