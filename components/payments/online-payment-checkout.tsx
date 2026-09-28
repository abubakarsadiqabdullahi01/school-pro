"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { getOnlinePaymentQuote, initializeOnlinePayment } from "@/app/actions/online-payment"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Charge = {
  id: string
  termId: string | null
  name: string
  balance: string
  balanceKobo: number
  status: string
}

type Quote = {
  schoolFeesKobo: number
  processingFeeKobo: number
  parentChargeKobo: number
  feePolicy: "SCHOOL_PAYS" | "PARENT_PAYS_GROSS_UP"
  environment: "TEST" | "LIVE"
}

const naira = (kobo: number) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
}).format(kobo / 100)

function inputToKobo(value: string): number | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,2}))?$/)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? "").padEnd(2, "0"))
  const kobo = whole * 100 + fraction
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null
}

export function OnlinePaymentCheckout({ studentId, enabled, allowPartialPayments, charges }: {
  studentId: string
  enabled: boolean
  allowPartialPayments: boolean
  charges: Charge[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [quote, setQuote] = useState<Quote | null>(null)
  const [pending, startTransition] = useTransition()
  const payable = charges.filter((charge) => !["PAID", "WAIVED", "CANCELLED"].includes(charge.status))

  function toggle(chargeId: string, checked: boolean) {
    setQuote(null)
    setSelected((current) => checked ? [...new Set([...current, chargeId])] : current.filter((id) => id !== chargeId))
    if (checked) {
      const charge = payable.find((candidate) => candidate.id === chargeId)
      if (charge) setAmounts((current) => ({ ...current, [chargeId]: (charge.balanceKobo / 100).toFixed(2) }))
    }
  }

  function selectionInput() {
    const allocations = selected.map((chargeId) => ({
      chargeId,
      amountKobo: inputToKobo(amounts[chargeId] ?? ""),
    }))
    if (allocations.some((allocation) => allocation.amountKobo === null)) {
      toast.error("Enter a valid amount with no more than two decimal places")
      return null
    }
    return {
      studentId,
      chargeIds: selected,
      allocations: allocations.map((allocation) => ({
        chargeId: allocation.chargeId,
        amountKobo: allocation.amountKobo!,
      })),
    }
  }

  function review() {
    startTransition(async () => {
      const input = selectionInput()
      if (!input) return
      const result = await getOnlinePaymentQuote(input)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setQuote(result.data)
    })
  }

  function pay() {
    startTransition(async () => {
      const input = selectionInput()
      if (!input) return
      const result = await initializeOnlinePayment(input)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.data.authorizationUrl) {
        window.location.assign(result.data.authorizationUrl)
        return
      }
      router.push(result.data.statusUrl)
    })
  }

  if (!enabled || payable.length === 0) return null

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Pay online</CardTitle>
        <CardDescription>Select outstanding fees. The server checks every balance again before opening Paystack.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          {payable.map((charge) => (
            <div key={charge.id} className="space-y-3 rounded-lg border p-3">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="flex items-center gap-3">
                  <Checkbox checked={selected.includes(charge.id)} onCheckedChange={(value) => toggle(charge.id, value === true)} />
                  <span className="font-medium">{charge.name}</span>
                </span>
                <span className="tabular-nums">{charge.balance}</span>
              </label>
              {allowPartialPayments && selected.includes(charge.id) ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_12rem] sm:items-center">
                  <Label htmlFor={`payment-amount-${charge.id}`}>Amount to pay (NGN)</Label>
                  <Input
                    id={`payment-amount-${charge.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max={(charge.balanceKobo / 100).toFixed(2)}
                    step="0.01"
                    value={amounts[charge.id] ?? ""}
                    onChange={(event) => {
                      setQuote(null)
                      setAmounts((current) => ({ ...current, [charge.id]: event.target.value }))
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {allowPartialPayments ? (
          <p className="text-xs text-muted-foreground">Part payment is enabled. Enter an amount up to each selected outstanding balance; the server verifies it again before checkout.</p>
        ) : null}

        {!quote ? (
          <Button type="button" onClick={review} disabled={pending || selected.length === 0}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Review payment
          </Button>
        ) : (
          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between text-sm"><span>School fees</span><span className="tabular-nums">{naira(quote.schoolFeesKobo)}</span></div>
            <div className="flex items-center justify-between text-sm"><span>Processing fee</span><span className="tabular-nums">{naira(quote.processingFeeKobo)}</span></div>
            <div className="flex items-center justify-between border-t pt-3 font-semibold"><span>Total to pay</span><span className="tabular-nums">{naira(quote.parentChargeKobo)}</span></div>
            {quote.environment === "TEST" && <Badge variant="outline">Test mode — no real money</Badge>}
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Safe confirmation</AlertTitle>
              <AlertDescription>A receipt is issued only after Paystack independently confirms the payment. Returning from checkout alone does not mark fees as paid.</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={pay} disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue to Paystack
              </Button>
              <Button type="button" variant="outline" onClick={() => setQuote(null)} disabled={pending}>Change selection</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
