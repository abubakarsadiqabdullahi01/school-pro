import Link from "next/link"
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, ExternalLink, ShieldAlert } from "lucide-react"

import { getGatewayTransactionDetail } from "@/app/actions/gateway-operations"
import { ReprocessEventButton } from "@/components/payments/reprocess-event-button"
import { CheckRefundButton, RefundBankDetailsForm } from "@/components/payments/dedicated-account-controls"
import { RefundDecisionButtons } from "@/components/payments/refund-decision-buttons"
import { RequestRefundButton } from "@/components/payments/request-refund-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"
import { formatNaira } from "@/lib/money"
import { GATEWAY_STATUS_LABELS, gatewayEventTone, gatewayStatusTone } from "@/lib/payments/gateway-display"

export async function GatewayTransactionDetail({ basePath, id }: { basePath: string; id: string }) {
  const [result, permissions] = await Promise.all([
    getGatewayTransactionDetail(id),
    getEffectivePermissionsForCurrentUser(),
  ])
  if (!result.success) return <p className="text-destructive" role="alert">{result.error}</p>
  const data = result.data
  const canReprocess = permissions.includes("finance.manage_gateway")
  const canApproveRefunds = permissions.includes("finance.approve_refunds")
  // A rejected request can be raised again; anything else already speaks for this payment.
  const refundable = canReprocess && data.status === "SUCCEEDED" && data.payment?.status === "COMPLETED"
    && data.refunds.every((refund) => refund.status === "REJECTED")
  const snapshot = data.configurationSnapshot && typeof data.configurationSnapshot === "object" && !Array.isArray(data.configurationSnapshot)
    ? data.configurationSnapshot as Record<string, unknown>
    : {}

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" className="-ml-3"><Link href={`${basePath}/online-payments`}><ArrowLeft className="mr-2 h-4 w-4" />Online payments</Link></Button>
          <h1 className="break-all text-2xl font-bold tracking-tight sm:text-3xl">{data.reference}</h1>
          <p className="text-muted-foreground">{data.studentName} · {data.student.admissionNo}</p>
        </div>
        <Badge variant="outline" className={`text-sm ${gatewayStatusTone(data.status)}`}>{GATEWAY_STATUS_LABELS[data.status]}</Badge>
      </div>

      {["FAILED", "REQUIRES_REVIEW", "INITIALIZATION_UNKNOWN"].includes(data.status) && (
        <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Finance attention required</AlertTitle><AlertDescription>{data.failureMessage ?? "This attempt needs investigation before any manual financial action."}</AlertDescription></Alert>
      )}
      {["CREATED", "INITIALIZED", "PENDING", "PROCESSING"].includes(data.status) && (
        <Alert><Clock3 className="h-4 w-4" /><AlertTitle>Payment is not yet in the ledger</AlertTitle><AlertDescription>Do not issue a manual receipt for this reference. Wait for a signed event or use Paystack’s event replay if delivery was missed.</AlertDescription></Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Payment facts</CardTitle><CardDescription>Immutable checkout values beside provider-confirmed values.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <Fact label="School fees" value={formatNaira(data.amountExpected)} />
          <Fact label="Requested from payer" value={data.amountRequested ? formatNaira(data.amountRequested) : "—"} />
          <Fact label="Provider charged" value={data.amountCharged ? formatNaira(data.amountCharged) : "—"} />
          <Fact label="Paystack fee" value={data.providerFee ? formatNaira(data.providerFee) : "—"} />
          <Fact label="Channel" value={data.channel?.replaceAll("_", " ") ?? "—"} />
          <Fact label="Environment" value={data.environment} />
          <Fact label="Payer email" value={data.payerEmail ?? "—"} />
          <Fact label="Provider transaction ID" value={data.providerTransactionId ?? "—"} mono />
          <Fact label="Session / term" value={`${data.term.session.name} · ${data.term.name}`} />
          <Fact label="Account mode" value={typeof snapshot.accountMode === "string" ? snapshot.accountMode.replaceAll("_", " ") : "—"} />
          <Fact label="Fee policy" value={typeof snapshot.feePolicy === "string" ? snapshot.feePolicy.replaceAll("_", " ") : "—"} />
          <Fact label="Last verified" value={data.verifiedAt ? new Date(data.verifiedAt).toLocaleString() : "Never"} />
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Ledger result</CardTitle></CardHeader><CardContent className="space-y-4">
          {data.payment ? <><div className="flex items-center gap-2 text-green-700"><CheckCircle2 className="h-5 w-5" /><span className="font-medium">Posted once</span></div><Fact label="Receipt" value={data.payment.receiptNo} /><Fact label="Ledger amount" value={formatNaira(data.payment.amount)} /><Fact label="Ledger status" value={data.payment.status} /><Button asChild className="w-full"><Link href={`${basePath}/receipts/${data.payment.id}`}>Open receipt <ExternalLink className="ml-2 h-4 w-4" /></Link></Button></> : <div className="flex items-start gap-2 text-amber-700"><AlertTriangle className="mt-0.5 h-5 w-5" /><p className="text-sm">No finance payment or receipt is linked to this attempt.</p></div>}
        </CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Intended fee allocation</CardTitle><CardDescription>Captured before checkout; balances shown are current.</CardDescription></CardHeader><CardContent className="space-y-3">
        {data.allocations.map((allocation) => <div key={allocation.id} className="flex flex-col justify-between gap-1 rounded-md border p-3 sm:flex-row sm:items-center"><div><p className="font-medium">{allocation.charge.feeSchedule.name}</p><p className="text-xs text-muted-foreground">Charge {allocation.charge.id} · {allocation.charge.status} · current balance {formatNaira(allocation.charge.balance)}</p></div><p className="font-semibold">{formatNaira(allocation.amount)}</p></div>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Refund control</CardTitle><CardDescription>Provider refunds are asynchronous and remain separate from ordinary manual receipt corrections.</CardDescription></CardHeader><CardContent className="space-y-4">
        {data.refunds.length > 0 ? data.refunds.map((refund) => <div key={refund.id} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{formatNaira(refund.amount)} · {refund.status.replaceAll("_", " ").toLowerCase()}</p><Badge variant="outline">{refund.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{refund.reason}</p>{refund.providerMessage && <p className="mt-2 text-sm text-destructive">{refund.providerMessage}</p>}{refund.status === "REJECTED" && refund.rejectionReason && <p className="mt-2 text-sm text-destructive">Rejected: {refund.rejectionReason}</p>}{refund.status === "NEEDS_ATTENTION" && !refund.providerRefundId && canApproveRefunds && <div className="mt-2"><CheckRefundButton refundId={refund.id} /></div>}{refund.status === "NEEDS_ATTENTION" && refund.providerRefundId && canApproveRefunds && <div className="mt-3"><RefundBankDetailsForm refundId={refund.id} environment={refund.environment} payout={refund.payout} /></div>}{refund.status === "REQUESTED" ? (canApproveRefunds ? <div className="mt-3"><RefundDecisionButtons refundId={refund.id} /></div> : <p className="mt-2 text-sm text-muted-foreground">Waiting for a second person to approve.</p>) : <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{refund.providerRefundId ?? (refund.status === "REJECTED" ? "Not submitted" : "Provider id pending")}</p>}</div>) : null}{refundable ? <RequestRefundButton transactionId={data.id} /> : data.refunds.length === 0 && <p className="text-sm text-muted-foreground">No provider refund is available for this payment state.</p>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Webhook event history</CardTitle><CardDescription>Signed deliveries, processing attempts and recoverable failures.</CardDescription></CardHeader><CardContent className="space-y-3">
        {data.events.length === 0 ? <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No signed webhook event has been received. Use Paystack’s Webhook Events replay after checking the configured URL.</div> : data.events.map((event) => (
          <div key={event.id} className="grid gap-3 rounded-md border p-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{event.eventType}</span><Badge variant="outline" className={gatewayEventTone(event.status)}>{event.status.toLowerCase()}</Badge></div><p className="break-all font-mono text-xs text-muted-foreground">{event.providerEventId ?? event.id}</p><p className="text-xs text-muted-foreground">Received {new Date(event.receivedAt).toLocaleString()} · {event.attempts} processing attempt{event.attempts === 1 ? "" : "s"}</p>{event.lastError && <p className="mt-2 rounded bg-destructive/5 p-2 text-sm text-destructive">{event.lastError}</p>}</div>
            {canReprocess && (event.status === "FAILED" || event.status === "PENDING") && <ReprocessEventButton transactionId={data.id} eventId={event.id} />}
          </div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Operational timeline</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Fact label="Created" value={new Date(data.createdAt).toLocaleString()} /><Fact label="Initialized" value={data.initializedAt ? new Date(data.initializedAt).toLocaleString() : "—"} /><Fact label="Paid at provider" value={data.paidAt ? new Date(data.paidAt).toLocaleString() : "—"} /><Fact label="Last updated" value={new Date(data.updatedAt).toLocaleString()} /></CardContent></Card>
    </div>
  )
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={`break-words text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p></div>
}
