import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle } from "lucide-react"

import { getExpense } from "@/app/actions/expenditure"
import { ExpenseStatusBadge } from "@/components/expenditure/expense-status-badge"
import { ExpenseWorkflowActions } from "@/components/expenditure/expense-workflow-actions"
import { ReceiptAttachments } from "@/components/expenditure/receipt-attachments"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

/**
 * One expense, with its approval trail.
 *
 * The trail is shown as three separate acts — recorded, approved, paid — rather than a
 * single "last updated by", because who did which is the whole point of the workflow.
 */
export async function ExpenseDetailView({
  basePath,
  expenseId,
  canManage,
}: {
  basePath: string
  expenseId: string
  canManage: boolean
}) {
  const result = await getExpense(expenseId)
  if (!result.success) notFound()

  const expense = result.data
  const editable = expense.status === "DRAFT" || expense.status === "PENDING_APPROVAL"
  const formatDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{expense.voucherNo}</h1>
            <ExpenseStatusBadge status={expense.status} />
          </div>
          <p className="text-muted-foreground">
            {formatNaira(expense.amount)} to {expense.payeeName} · {expense.categoryName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {editable && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}/transactions/${expense.id}/edit`}>Edit</Link>
            </Button>
          )}
          {expense.status === "PAID" && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}/vouchers/${expense.id}`}>Voucher</Link>
            </Button>
          )}
          <ExpenseWorkflowActions
            expenseId={expense.id}
            status={expense.status}
            canManage={canManage}
            accountName={expense.accountName}
          />
        </div>
      </div>

      {expense.decisionReason && expense.status !== "APPROVED" && (
        <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">
              {expense.status === "REJECTED" ? "Rejected" : expense.status === "CANCELLED" ? "Cancelled" : "Note"}
            </p>
            <p className="text-sm text-muted-foreground">{expense.decisionReason}</p>
          </div>
        </div>
      )}

      {expense.budget && Number(expense.budget.overBy) > 0 && (
        <div className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">{expense.categoryName} is over its termly budget</p>
            <p className="text-sm text-muted-foreground">
              Limit {formatNaira(expense.budget.limit)}, committed {formatNaira(expense.budget.committed)} — over by{" "}
              {formatNaira(expense.budget.overBy)}.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>{expense.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label="Amount" value={formatNaira(expense.amount)} />
            <Info label="Expense date" value={new Date(expense.expenseDate).toLocaleDateString()} />
            <Info label="Category" value={expense.categoryName} />
            <Info label="Paid from" value={`${expense.accountName} (${expense.accountType})`} />
            <Info label="Payee" value={`${expense.payeeName} (${expense.payeeType.toLowerCase()})`} />
            <Info label="Payment method" value={expense.paymentMethod.replace("_", " ")} />
            <Info label="Reference" value={expense.referenceNo ?? "—"} />
            <Info label="Session / Term" value={`${expense.sessionName} · ${expense.termName}`} />
            {expense.notes && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p>{expense.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval Trail</CardTitle>
            <CardDescription>Who wrote it up, who allowed it, who released the money.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Step label="Recorded" who={expense.recordedByName} when={null} done />
            <Step
              label={expense.status === "REJECTED" ? "Rejected" : "Approved"}
              who={expense.approvedByName}
              when={formatDateTime(expense.approvedAt)}
              done={Boolean(expense.approvedByName)}
            />
            <Step label="Paid" who={expense.paidByName} when={formatDateTime(expense.paidAt)} done={Boolean(expense.paidByName)} />
          </CardContent>
        </Card>
      </div>

      <ReceiptAttachments
        expenseId={expense.id}
        attachments={expense.attachments}
        canUpload={expense.status !== "CANCELLED" && expense.status !== "REJECTED"}
        canRemove={canManage}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function Step({
  label,
  who,
  when,
  done,
}: {
  label: string
  who: string | null
  when: string | null
  done: boolean
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`mt-1 h-3 w-3 shrink-0 rounded-full ${done ? "bg-primary" : "border-2 border-muted-foreground/40"}`}
      />
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{who ?? "Not yet"}{when ? ` · ${when}` : ""}</p>
      </div>
    </div>
  )
}
