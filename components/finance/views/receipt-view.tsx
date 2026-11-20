import { notFound } from "next/navigation"

import { getReceipt, type ReceiptDocument } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { BrandedDocumentDownload, BrandedPrintHeader } from "@/components/reports/branded"
import { PrintButton } from "@/components/reports/print-button"
import type { PrintableDocument } from "@/components/reports/document-download"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { paymentMethodLabel } from "@/lib/finance/payment-method"
import { formatNaira, formatNairaPlain } from "@/lib/money"
import { amountInWords } from "@/lib/amount-in-words"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle2, ReceiptText } from "lucide-react"
import { InfoGuide } from "@/components/ui/info-guide"
import { PendingRefundDecision, RefundPaymentButton } from "@/components/finance/refund-payment-button"
import { getEffectivePermissionsForCurrentUser, requireActor } from "@/lib/authz"


/**
 * The official receipt.
 *
 * It fetched its own data through `getReceipt`, which requires a finance permission — fine
 * for the accountant's screens, and the reason a parent could see "PAID" against a fee with
 * no way to view the receipt proving it. It now accepts the data instead, so the portal can
 * hand it a receipt it fetched under its own authorization and the family reads exactly the
 * document the school issued rather than a second rendering of it.
 */
export async function ReceiptView({
  basePath,
  paymentId,
  data: provided,
  canRefund = true,
}: {
  basePath: string
  paymentId: string
  /** Already-authorized receipt data. When absent this fetches it as finance staff. */
  data?: ReceiptDocument
  /** Refunding is a finance action; the portal renders the same paper without it. */
  canRefund?: boolean
}) {
  let data = provided
  if (!data) {
    const receipt = await getReceipt(paymentId)
    if (!receipt.success) notFound()
    data = receipt.data
  }
  // Only the finance view offers refunds, so only it asks who is looking.
  const viewer = canRefund
    ? { actor: await requireActor(), permissions: await getEffectivePermissionsForCurrentUser() }
    : null
  const paymentDate = new Date(data.paymentDate).toLocaleDateString()
  const paymentMethod = paymentMethodLabel(data.paymentMethod)
  const fileName = `receipt ${data.school.code} ${data.student.admissionNo} ${data.receiptNo}`
  const words = amountInWords(data.amount)
  const generatedAt = new Date().toLocaleString()

  /**
   * An online payment has no cashier, so the "Received By" line had nothing to put in it and
   * printed a bare dash — which reads as missing data rather than as a fact about the
   * payment. Naming the gateway says what actually happened.
   */
  const receivedByLabel = data.receivedBy ?? (data.online ? "Online payment · Paystack" : "-")
  const signatureCaption = data.online
    ? `Confirmed by Paystack, not by a cashier. Issued electronically on ${generatedAt}. Valid without an ink signature.`
    : `Issued electronically on ${generatedAt}. Valid without an ink signature.`

  /**
   * What the status means for the person holding the paper.
   *
   * Only a COMPLETED payment has settled anything. A PENDING transfer allocates nothing and
   * moves no balance, which is why the fee items are empty and the balance below is
   * unchanged — but the document said "OFFICIAL RECEIPT · Amount Paid ₦20,000.00" and left
   * the reader to work that out, which is the one thing a receipt must not do.
   */
  const STATUS_NOTE: Record<
    string,
    { label: string; className: string; notice: string | null; stamp: string | null }
  > = {
    COMPLETED: {
      label: "Paid",
      className: "bg-green-500/10 text-green-700 dark:text-green-400",
      notice: null,
      stamp: null,
    },
    PENDING: {
      label: "Awaiting confirmation",
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      notice:
        "This payment has not been confirmed yet. Nothing has been applied to the student's fees and the balance below is unchanged. It is not proof of payment.",
      stamp: "Unconfirmed",
    },
    FAILED: {
      label: "Failed",
      className: "bg-destructive/10 text-destructive",
      notice: "This payment did not go through. No fee has been settled by it.",
      stamp: "Failed",
    },
    REFUNDED: {
      label: "Refunded",
      className: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
      notice: "This payment has been refunded. It no longer settles any fee.",
      stamp: "Refunded",
    },
  }

  const status = STATUS_NOTE[data.status] ?? {
    label: data.status,
    className: "bg-muted text-foreground",
    notice: null,
    stamp: null,
  }
  const printDensity = data.allocations.length > 14 ? "compact" : data.allocations.length > 7 ? "dense" : "normal"

  const document: PrintableDocument = {
    title: "Official Receipt",
    reference: data.receiptNo,
    fileName,
    schoolName: data.school.name,
    schoolCode: data.school.code,
    fields: [
      { label: "Student", value: `${data.student.name} (${data.student.admissionNo})` },
      { label: "Class / Section", value: data.student.currentClass ?? "-" },
      { label: "Session / Term", value: `${data.term.sessionName} - ${data.term.name}` },
      { label: "Payment Date", value: paymentDate },
      { label: "Payment Method", value: paymentMethod },
      { label: "Reference", value: data.referenceNo ?? "-" },
      ...(data.online?.payerEmail ? [{ label: "Paid By", value: data.online.payerEmail }] : []),
      ...(data.online?.providerReference
        ? [{ label: "Gateway Reference", value: data.online.providerReference }]
        : []),
      { label: "Received By", value: receivedByLabel },
      { label: "Status", value: status.label },
      { label: "Amount in Words", value: words },
    ],
    table: {
      caption: "Fee Items Paid",
      columns: ["Fee Item", "Amount"],
      rows:
        data.allocations.length > 0
          ? data.allocations.map((allocation) => [allocation.description, formatNairaPlain(allocation.amount)])
          : [[status.notice ? "Not applied to any fee item yet" : "No fee item recorded", "—"]],
    },
    totals: [
      { label: "Amount Paid", value: formatNairaPlain(data.amount) },
      // Under a gross-up the payer's statement shows more than the school credited. Saying
      // so here is the difference between a receipt and a dispute.
      ...(data.online?.feePaidByPayer
        ? [
            { label: "Online processing fee (paid by payer)", value: formatNairaPlain(data.online.feePaidByPayer) },
            { label: "Total charged to payer", value: formatNairaPlain(data.online.amountCharged ?? data.amount) },
          ]
        : []),
      { label: "Outstanding (all terms)", value: formatNairaPlain(data.balanceRemaining) },
    ],
    notice: status.notice,
    // Only the exceptional case. A settled receipt falls through to the school code that
    // every document now carries, and "Refunded" matters more to a reader than branding.
    watermark: status.stamp,
    fitOnePage: true,
    signatures: [
      {
        label: `Received by · ${data.school.name}`,
        name: data.receivedBy,
        caption: signatureCaption,
      },
      {
        label: "Parent / Student",
        caption: "Name, signature and date on receipt.",
      },
    ],
    signatureLabel: "Authorized Signature",
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:mx-0 print:max-w-none print:space-y-0" data-print-page>
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <ReceiptText className="h-7 w-7 text-primary" aria-hidden />
            <h1 className="text-3xl font-bold tracking-tight">Receipt</h1>
            <InfoGuide guideKey="finance.receipt" />
          </div>
          <p className="text-muted-foreground">{data.receiptNo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* An online receipt is refunded through the gateway from Online Payments, where the
              money actually goes back to the payer, and one made from held transfer money goes
              back to held money; this button only reverses cash-desk receipts. */}
          {canRefund && data.status === "COMPLETED" && !data.online && !data.fromHeldTransfer && !data.pendingRefund
            && viewer?.permissions.includes("finance.collect_payments") && <RefundPaymentButton paymentId={data.id} />}
          <PrintButton label={status.stamp ? "Print copy" : "Print Receipt"} />
          <BrandedDocumentDownload
            document={document}
            label={status.stamp ? "Download copy" : "Download PDF"}
          />
        </div>
      </div>

      {viewer && data.pendingRefund && data.status === "COMPLETED" && (
        <PendingRefundDecision
          requestId={data.pendingRefund.id}
          reason={data.pendingRefund.reason}
          requestedByName={data.pendingRefund.requestedByName}
          requestedAt={data.pendingRefund.requestedAt}
          canApprove={viewer.permissions.includes("finance.approve_refunds")}
          isRequester={data.pendingRefund.requestedBy === viewer.actor.userId}
        />
      )}

      <Card
        data-print-document
        data-print-fit={printDensity}
        className="relative overflow-hidden border-t-4 border-t-primary shadow-sm print:rounded-none print:border-0 print:shadow-none"
      >
        {status.stamp && (
          // `print-exact` so the browser keeps the colour when printing; without it most
          // browsers drop background and faded text and the stamp vanishes on paper.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]"
          >
            <span className="-rotate-[28deg] select-none text-6xl font-extrabold uppercase tracking-widest text-destructive/15">
              {status.stamp}
            </span>
          </div>
        )}
        <BrandedPrintHeader title="Official Receipt" reference={data.receiptNo} />
        <CardHeader className="border-b print:px-0 print:pb-3 print:pt-0">
          <div className="flex items-start justify-between gap-4">
            {/* The screen's version of the letterhead. On paper BrandedPrintHeader carries
                it instead, with the logo and address, so this half is suppressed there —
                but the amount beside it must still print. */}
            <div className="flex items-start gap-3 print:hidden">
              {data.school.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- stored school branding may be local or remote.
                <img
                  src={data.school.logoUrl}
                  alt={`${data.school.name} logo`}
                  className="h-14 w-14 shrink-0 rounded-md border bg-white object-contain p-1"
                />
              )}
              <div>
                <CardTitle>{data.school.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{data.school.code}</p>
                <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-foreground">Official Receipt</p>
                <p className="text-sm text-muted-foreground">{data.receiptNo}</p>
              </div>
            </div>
            <div className="text-right print:w-full">
              <p className="text-sm text-muted-foreground">Amount Paid</p>
              <p className="text-2xl font-bold">{formatNaira(data.amount)}</p>
              <p className="mt-1 max-w-xs text-xs italic text-muted-foreground">{words}</p>
              <Badge data-print-colour className={`mt-2 gap-1 ${status.className}`}>
                {data.status === "COMPLETED" && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                {status.label}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6 print:space-y-4 print:px-0 print:pt-4">
          {status.notice && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{status.label}</AlertTitle>
              <AlertDescription>{status.notice}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Student" value={`${data.student.name} (${data.student.admissionNo})`} />
            <Info label="Class / Section" value={data.student.currentClass ?? "-"} />
            <Info label="Session / Term" value={`${data.term.sessionName} · ${data.term.name}`} />
            <Info label="Payment Date" value={paymentDate} />
            <Info label="Payment Method" value={paymentMethod} />
            <Info label="Reference" value={data.referenceNo ?? "-"} />
            {data.online?.payerEmail && <Info label="Paid By" value={data.online.payerEmail} />}
            {data.online?.providerReference && (
              <Info label="Gateway Reference" value={data.online.providerReference} />
            )}
            <Info label="Received By" value={receivedByLabel} />
          </div>

          <div>
            <h2 className="mb-3 font-semibold">Fee Items Paid</h2>
            {data.allocations.length === 0 ? (
              // An empty heading told the reader nothing. This says why it is empty.
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {status.notice
                  ? "Nothing has been applied to a fee item."
                  : "This payment is not recorded against any fee item."}
              </p>
            ) : (
              <div className="space-y-2">
                {data.allocations.map((allocation, index) => (
                  <div
                    key={`${allocation.description}-${index}`}
                    className="flex justify-between border-b pb-2 last:border-0"
                  >
                    <span>{allocation.description}</span>
                    <span className="font-medium">{formatNaira(allocation.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Under a gross-up the payer's bank shows more than the school credited. Without
              this the two numbers look like an overcharge. */}
          {data.online?.feePaidByPayer && (
            <div className="rounded-md border p-4">
              <h2 className="mb-3 font-semibold">What the payer was charged</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Credited to {data.school.name}</span>
                  <span className="font-medium">{formatNaira(data.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Online processing fee</span>
                  <span className="font-medium">{formatNaira(data.online.feePaidByPayer)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total charged</span>
                  <span>{formatNaira(data.online.amountCharged ?? data.amount)}</span>
                </div>
              </div>
            </div>
          )}

          <div data-print-colour className="rounded-md bg-muted p-4 text-right">
            {/* Every unpaid charge the student carries, not just this term's — labelled,
                because "Balance Remaining" beside one term's receipt reads as that term's. */}
            <p className="text-sm text-muted-foreground">Outstanding balance (all terms)</p>
            <p className="text-xl font-bold">{formatNaira(data.balanceRemaining)}</p>
          </div>

          <div className="grid gap-6 pt-8 sm:grid-cols-2 print:gap-4 print:pt-5">
            <div>
              <p className="font-serif text-xl italic leading-tight text-foreground/80">
                {data.receivedBy ?? " "}
              </p>
              <div className="mt-1 border-t pt-2">
                <p className="text-sm font-medium">Received by · {data.school.name}</p>
                <p className="text-xs text-muted-foreground">
                  {signatureCaption}
                </p>
              </div>
            </div>
            <div>
              <p
                className="text-xl leading-tight text-transparent select-none print:hidden"
                aria-hidden
              >
                &nbsp;
              </p>
              <div className="mt-1 border-t pt-2">
                <p className="text-sm font-medium">Parent / Student</p>
                <p className="text-xs text-muted-foreground">Name, signature and date on receipt.</p>
              </div>
            </div>
          </div>

          {/* On paper only: a receipt can be reprinted at any time, and without a date there
              is no telling a reprint from the original. The PDF carries the same line. */}
          <p className="hidden pt-2 text-xs text-muted-foreground print:block">
            Generated {generatedAt} · {data.school.name} ({data.school.code})
          </p>
        </CardContent>
      </Card>
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
