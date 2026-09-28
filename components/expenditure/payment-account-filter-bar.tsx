"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"

import { FilterChips } from "@/components/reports/filter-chips"
import { FilterSelect } from "@/components/reports/filter-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  PAYMENT_ACCOUNT_ACTIVITY,
  PAYMENT_ACCOUNT_BALANCES,
  PAYMENT_ACCOUNT_STATUSES,
  PAYMENT_ACCOUNT_TYPES,
  countPaymentAccountFilters,
  paymentAccountChips,
  paymentAccountFilterHref,
  type PaymentAccountFilters,
} from "@/lib/expenditure/payment-account-filters"
import { cn } from "@/lib/utils"

/**
 * What the payment chart is showing.
 *
 * Same bar as every other filtered screen: a search that submits, selects that navigate on
 * change, and a chip per active filter that is its own undo. The state is the URL, so a
 * narrowed chart survives the back button and can be sent to whoever asked for it.
 */
export function PaymentAccountFilterBar({
  basePath,
  filters,
}: {
  basePath: string
  filters: PaymentAccountFilters
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Partial<Record<keyof PaymentAccountFilters, string | undefined>>) => {
    startTransition(() => router.push(paymentAccountFilterHref(basePath, filters, overrides)))
  }

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    go({ search: String(form.get("search") ?? "").trim() || undefined })
  }

  return (
    <Card className={cn("print:hidden", pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Account name, bank or number"
            className="sm:max-w-md"
            aria-label="Search payment accounts"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Search
            </Button>
            {countPaymentAccountFilters(filters) > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="account-type"
            label="Type"
            value={filters.type}
            placeholder="Any type"
            options={[...PAYMENT_ACCOUNT_TYPES]}
            onChange={(value) => go({ type: value })}
          />
          <FilterSelect
            id="account-status"
            label="Status"
            value={filters.status}
            placeholder="Open and closed"
            options={[...PAYMENT_ACCOUNT_STATUSES]}
            onChange={(value) => go({ status: value })}
          />
          <FilterSelect
            id="account-balance"
            label="Balance"
            value={filters.balance}
            placeholder="Any balance"
            options={[...PAYMENT_ACCOUNT_BALANCES]}
            onChange={(value) => go({ balance: value })}
          />
          <FilterSelect
            id="account-activity"
            label="Use"
            value={filters.activity}
            placeholder="Used or not"
            options={[...PAYMENT_ACCOUNT_ACTIVITY]}
            onChange={(value) => go({ activity: value })}
          />
        </div>

        <FilterChips
          chips={paymentAccountChips(filters)}
          onRemove={(key) => go({ [key as keyof PaymentAccountFilters]: undefined })}
        />
      </CardContent>
    </Card>
  )
}
