"use client"

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  createExpenseCategory,
  createPaymentAccount,
  setExpenseCategoryActive,
  setPaymentAccountActive,
} from "@/app/actions/expenditure"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatNaira } from "@/lib/money"

type Category = {
  id: string
  name: string
  description: string | null
  budgetLimit: string | null
  isActive: boolean
  expenseCount: number
}

type Account = {
  id: string
  name: string
  type: string
  bankName: string | null
  accountNumber: string | null
  openingBalance: string
  balance: string
  isActive: boolean
}

const ACCOUNT_TYPES = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank account" },
  { value: "POS", label: "POS" },
  { value: "WALLET", label: "Wallet" },
  { value: "OTHER", label: "Other" },
]

export function ExpenseCategoriesForm({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function create(formData: FormData) {
    startTransition(async () => {
      const result = await createExpenseCategory({
        name: formData.get("name"),
        description: formData.get("description") || undefined,
        budgetLimit: formData.get("budgetLimit") || undefined,
      })
      if (!result.success) {
        toast.error("Could not create the category", { description: result.error })
        return
      }
      toast.success("Category created")
      router.refresh()
    })
  }

  function toggle(categoryId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setExpenseCategoryActive({ categoryId, isActive })
      if (!result.success) {
        toast.error("Could not update the category", { description: result.error })
        return
      }
      toast.success(isActive ? "Category reactivated" : "Category retired")
      router.refresh()
    })
  }

  const categoryColumns: DataTableColumn[] = [
    { label: "Category" },
    { label: "Budget Limit", align: "right" },
    { label: "Expenses", align: "right" },
    { label: "Status" },
    { label: "Action" },
  ]

  const categoryRows: DataTableRow[] = categories.map((category) => ({
    id: category.id,
    search: `${category.name} ${category.description ?? ""} ${category.isActive ? "active" : "retired"}`,
    cells: [
      <>
        <div className="font-medium">{category.name}</div>
        {category.description && <div className="text-muted-foreground">{category.description}</div>}
      </>,
      category.budgetLimit ? formatNaira(category.budgetLimit) : "—",
      category.expenseCount,
      category.isActive ? "Active" : "Retired",
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggle(category.id, !category.isActive)}>
        {category.isActive ? "Retire" : "Reactivate"}
      </Button>,
    ],
  }))
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New Category</CardTitle>
          <CardDescription>
            What the school spends money on — salaries, repairs, utilities, feeding, examinations. A budget limit is
            optional; it is reported against, never enforced.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Repairs and Maintenance" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetLimit">Termly budget limit</Label>
              <Input id="budgetLimit" name="budgetLimit" type="number" min="0" step="100" placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" placeholder="Optional" />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={isPending}>Add Category</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            A category in use is retired rather than deleted, so past vouchers keep their labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={categoryColumns}
            rows={categoryRows}
            pageSize={10}
            unit="categories"
            searchPlaceholder="Search by category name"
            emptyMessage="No expense categories yet. Create the first one above."
          />
        </CardContent>
      </Card>
    </div>
  )
}

export function PaymentAccountsForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function create(formData: FormData) {
    startTransition(async () => {
      const result = await createPaymentAccount({
        name: formData.get("name"),
        type: formData.get("type"),
        bankName: formData.get("bankName") || undefined,
        accountNumber: formData.get("accountNumber") || undefined,
        openingBalance: formData.get("openingBalance") || 0,
      })
      if (!result.success) {
        toast.error("Could not create the account", { description: result.error })
        return
      }
      toast.success("Payment account created")
      router.refresh()
    })
  }

  function toggle(accountId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setPaymentAccountActive({ accountId, isActive })
      if (!result.success) {
        toast.error("Could not update the account", { description: result.error })
        return
      }
      toast.success(isActive ? "Account reactivated" : "Account closed")
      router.refresh()
    })
  }

  const accountColumns: DataTableColumn[] = [
    { label: "Account" },
    { label: "Type" },
    { label: "Opening", align: "right" },
    { label: "Balance", align: "right" },
    { label: "Status" },
    { label: "Action" },
  ]

  const accountRows: DataTableRow[] = accounts.map((account) => ({
    id: account.id,
    search: [account.name, account.type, account.bankName ?? "", account.accountNumber ?? ""].join(" "),
    cells: [
      <>
        <div className="font-medium">{account.name}</div>
        {(account.bankName || account.accountNumber) && (
          <div className="text-muted-foreground">
            {[account.bankName, account.accountNumber].filter(Boolean).join(" · ")}
          </div>
        )}
      </>,
      account.type,
      formatNaira(account.openingBalance),
      <span className={`font-semibold ${Number(account.balance) < 0 ? "text-destructive" : ""}`}>
        {formatNaira(account.balance)}
      </span>,
      account.isActive ? "Active" : "Closed",
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggle(account.id, !account.isActive)}>
        {account.isActive ? "Close" : "Reopen"}
      </Button>,
    ],
  }))
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New Payment Account</CardTitle>
          <CardDescription>
            Where money is paid from — the cash office, the main bank account, the PTA account, petty cash. The
            opening balance is what the account held when it was first entered here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-name">Account name</Label>
              <Input id="account-name" name="name" required placeholder="Main Bank Account" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select name="type" defaultValue="CASH">
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank name</Label>
              <Input id="bankName" name="bankName" placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account number</Label>
              <Input id="accountNumber" name="accountNumber" placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openingBalance">Opening balance</Label>
              <Input id="openingBalance" name="openingBalance" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending}>Add Account</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Chart</CardTitle>
          <CardDescription>
            Balance is the opening figure less everything paid out of the account. It is computed on read, so a
            cancelled payment corrects it immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={accountColumns}
            rows={accountRows}
            pageSize={10}
            unit="accounts"
            searchPlaceholder="Search account, bank or number"
            emptyMessage="No payment accounts yet. Create the first one above."
          />
        </CardContent>
      </Card>
    </div>
  )
}
