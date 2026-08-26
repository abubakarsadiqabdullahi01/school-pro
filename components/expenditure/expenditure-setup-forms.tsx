"use client"

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
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Budget Limit</th>
                <th className="py-2 pr-4 font-medium">Expenses</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{category.name}</div>
                    {category.description && <div className="text-muted-foreground">{category.description}</div>}
                  </td>
                  <td className="py-3 pr-4">{category.budgetLimit ? formatNaira(category.budgetLimit) : "—"}</td>
                  <td className="py-3 pr-4">{category.expenseCount}</td>
                  <td className="py-3 pr-4">{category.isActive ? "Active" : "Retired"}</td>
                  <td className="py-3 pr-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => toggle(category.id, !category.isActive)}
                    >
                      {category.isActive ? "Retire" : "Reactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No categories yet. Add one before recording expenditure.
            </p>
          )}
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
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Opening</th>
                <th className="py-2 pr-4 font-medium">Balance</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{account.name}</div>
                    {(account.bankName || account.accountNumber) && (
                      <div className="text-muted-foreground">
                        {[account.bankName, account.accountNumber].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">{account.type}</td>
                  <td className="py-3 pr-4">{formatNaira(account.openingBalance)}</td>
                  <td className={`py-3 pr-4 font-semibold ${Number(account.balance) < 0 ? "text-destructive" : ""}`}>
                    {formatNaira(account.balance)}
                  </td>
                  <td className="py-3 pr-4">{account.isActive ? "Active" : "Closed"}</td>
                  <td className="py-3 pr-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => toggle(account.id, !account.isActive)}
                    >
                      {account.isActive ? "Close" : "Reopen"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {accounts.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payment accounts yet. Add one before recording expenditure.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
