"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, Loader2, Receipt, RotateCw, XCircle } from "lucide-react"
import { toast } from "sonner"

import {
  abandonOnlinePayment,
  getOnlinePaymentStatus,
  refreshOnlinePaymentStatus,
} from "@/app/actions/online-payment"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type StatusData = {
  reference: string
  status: string
  amountExpected: string
  amountRequested: string | null
  authorizationUrl: string | null
  allocations: Array<{ name: string; amount: string }>
  receipt: { id: string; receiptNo: string } | null
}

const TERMINAL = ["SUCCEEDED", "FAILED", "ABANDONED", "REFUNDED", "DISPUTED", "REQUIRES_REVIEW"]

/** How often this screen re-reads our own record. A database read, not a Paystack call. */
const POLL_MS = 2_500

/**
 * How long to wait for the signed webhook before asking Paystack ourselves.
 *
 * The webhook normally lands within a second or two, so almost every payment confirms
 * without costing a verify call at all. Only a late one pays for the fallback.
 */
const VERIFY_AFTER_MS = 15_000

/** Cadence of the fallback verify once the grace period has passed. */
const VERIFY_EVERY_MS = 30_000

/** When to stop checking unprompted, so a tab left open cannot poll for ever. */
const GIVE_UP_MS = 5 * 60_000

const money = (value: string) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", minimumFractionDigits: 2,
}).format(Number(value))

export function OnlinePaymentStatus({ studentId, initial }: { studentId: string; initial: StatusData }) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [pending, startTransition] = useTransition()
  /** The grace period has passed, so the parent gets a button of their own. */
  const [webhookLate, setWebhookLate] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)

  const status = data.status
  const terminal = TERMINAL.includes(status)
  const successful = status === "SUCCEEDED"
  const processing = ["INITIALIZED", "INITIALIZATION_UNKNOWN", "PENDING", "PROCESSING"].includes(status)
  const canAbandon = ["CREATED", "INITIALIZED", "INITIALIZATION_UNKNOWN", "PENDING"].includes(status)
  const feesHref = `/dashboard/parent/children/${studentId}/fees`

  const openedAt = useRef(Date.now())
  const lastVerifyAt = useRef(0)
  const refreshedOnce = useRef(false)

  useEffect(() => {
    if (terminal) {
      // Let the server component behind this screen catch up once, so reloading the
      // page by hand shows the same thing the polling already put on screen.
      if (!refreshedOnce.current) {
        refreshedOnce.current = true
        router.refresh()
      }
      return
    }

    let cancelled = false
    const timer = setInterval(async () => {
      const waited = Date.now() - openedAt.current
      if (waited > GIVE_UP_MS) {
        setGaveUp(true)
        clearInterval(timer)
        return
      }
      if (waited > VERIFY_AFTER_MS) setWebhookLate(true)

      // Past the grace period the webhook is late, so ask Paystack directly — but
      // rarely, because each call is a live request that can itself post the ledger.
      if (waited > VERIFY_AFTER_MS && Date.now() - lastVerifyAt.current > VERIFY_EVERY_MS) {
        lastVerifyAt.current = Date.now()
        await refreshOnlinePaymentStatus({ studentId, reference: data.reference }).catch(() => undefined)
        if (cancelled) return
      }

      const result = await getOnlinePaymentStatus(studentId, data.reference)
      if (cancelled || !result.success) return
      setData(result.data)
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [terminal, studentId, data.reference, router])

  function checkNow() {
    startTransition(async () => {
      lastVerifyAt.current = Date.now()
      const verified = await refreshOnlinePaymentStatus({ studentId, reference: data.reference })
      if (!verified.success) {
        toast.error(verified.error)
        return
      }
      const result = await getOnlinePaymentStatus(studentId, data.reference)
      if (result.success) setData(result.data)
      setGaveUp(false)
      openedAt.current = Date.now() - VERIFY_AFTER_MS
    })
  }

  function abandon() {
    startTransition(async () => {
      const result = await abandonOnlinePayment({ studentId, reference: data.reference })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setData((current) => ({ ...current, status: "ABANDONED" }))
      toast.success("Payment attempt closed")
      router.refresh()
    })
  }

  const watching = !terminal && !gaveUp

  return (
    <div className="space-y-6">
      <Alert variant={terminal && !successful ? "destructive" : "default"}>
        {successful ? <CheckCircle2 className="h-4 w-4" /> : processing ? <Clock3 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        <AlertTitle>{successful ? "Payment confirmed" : processing ? "Payment confirmation pending" : "Payment not completed"}</AlertTitle>
        <AlertDescription>
          {successful
            ? data.receipt
              ? `Posted to the school ledger. Receipt ${data.receipt.receiptNo} is ready.`
              : "Paystack confirmation has been posted to the school ledger."
            : processing
              ? gaveUp
                ? "This is taking longer than usual. Do not pay again — use Check status, or contact the school with the reference below."
                : "Do not pay again, and do not close this page. We are checking Paystack before the school records any money or issues a receipt."
              : status === "ABANDONED"
                ? "This attempt is closed locally. Its Paystack link is not cancelled, so a replacement for the same fees remains blocked until the attempt expires."
                : "No successful receipt has been created for this attempt."}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div><CardTitle>Payment details</CardTitle><CardDescription className="font-mono">{data.reference}</CardDescription></div>
            <Badge variant={successful ? "default" : "secondary"}>{status.replaceAll("_", " ")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.allocations.map((allocation) => (
            <div key={allocation.name} className="flex items-center justify-between gap-4 text-sm">
              <span>{allocation.name}</span><span className="tabular-nums">{money(allocation.amount)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3 font-semibold">
            <span>Total sent to checkout</span><span className="tabular-nums">{money(data.amountRequested ?? data.amountExpected)}</span>
          </div>

          {successful ? (
            <div className="flex flex-wrap gap-2">
              {data.receipt ? (
                <Button asChild>
                  <Link href={`${feesHref}/${data.receipt.id}`}>
                    <Receipt className="mr-2 h-4 w-4" />
                    View receipt {data.receipt.receiptNo}
                  </Link>
                </Button>
              ) : (
                <Button disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing receipt
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={feesHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to fees and receipts
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {!terminal && data.authorizationUrl && status === "INITIALIZED" && (
                <Button asChild><a href={data.authorizationUrl}>Return to Paystack</a></Button>
              )}
              {/* The button only appears once waiting has actually failed to pay off.
                  Before that it would invite a click that changes nothing, on a screen
                  whose whole message is "do not do anything twice". */}
              {(webhookLate || gaveUp) && !["FAILED", "ABANDONED"].includes(status) && (
                <Button type="button" variant="outline" onClick={checkNow} disabled={pending}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
                  Check status
                </Button>
              )}
              {canAbandon && (
                <Button type="button" variant="ghost" onClick={abandon} disabled={pending}>
                  <XCircle className="mr-2 h-4 w-4" />Close this attempt
                </Button>
              )}
              {watching && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking automatically
                </span>
              )}
            </div>
          )}

          {status === "PROCESSING" && (
            <p className="text-xs text-muted-foreground">Paystack reports success, but the signed webhook has not yet completed the ledger posting. This page intentionally remains pending.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
