import { Prisma, type PaymentStatus } from "@prisma/client"

import { prisma } from "@/lib/db"

/*
 * The receipt as a document, read for one school.
 *
 * It lived in app/actions/finance.ts, a "use server" file, which made it a callable
 * endpoint with no sign-in check of its own: given a receipt id and a school id, anyone
 * could read the student, class, balance and payer email. Here it is only reachable from
 * code that has already decided who is asking (getReceipt for finance staff, the portal
 * receipt actions for a family).
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function moneyString(value: Prisma.Decimal.Value | null | undefined): string {
  return money(value ?? 0).toFixed(2)
}

export type ReceiptDocument = {
  id: string
  receiptNo: string
  /** PENDING, COMPLETED, FAILED or REFUNDED — the receipt has to say which. */
  status: PaymentStatus
  amount: string
  paymentDate: string
  paymentMethod: string
  referenceNo: string | null
  receivedBy: string | null
  student: { name: string; admissionNo: string; currentClass: string | null }
  school: { name: string; code: string; logoUrl: string | null }
  term: { name: string; sessionName: string }
  allocations: Array<{ description: string; amount: string }>
  balanceRemaining: string
  /**
   * Present only when the money arrived through the online gateway.
   *
   * A gateway payment has no cashier, so the receipt cannot name one — and when the school's
   * policy puts the processing fee on the payer, the card statement shows more than the
   * receipt credits. Both facts belong on the paper rather than in a support conversation.
   */
  online: {
    payerEmail: string | null
    channel: string | null
    /** Paystack's own identifier, for reconciling against their dashboard. */
    providerReference: string | null
    /** What the payer was actually debited, when it differs from the amount credited. */
    amountCharged: string | null
    /** The processing fee the payer covered, when the policy put it on them. */
    feePaidByPayer: string | null
  } | null
  /**
   * Made by applying a held dedicated-account transfer. It is transfer money, so it is never
   * refunded at the counter; it goes back to held money instead.
   */
  fromHeldTransfer: boolean
  /** A counter refund asked for and not yet decided: the receipt stands until it is. */
  pendingRefund: { id: string; reason: string; requestedBy: string; requestedByName: string; requestedAt: string } | null
}

/**
 * Reads a receipt for a school, with no opinion about who is asking.
 *
 * `getReceipt` is the finance staff entry point and keeps its permission check. The student
 * and parent portals establish their own right to a payment — that it belongs to them, or to
 * a child linked to them — and then come here, so a family reads exactly the document the
 * accountant reads rather than a second rendering of it that could drift.
 */
export async function loadReceipt(
  paymentId: string,
  schoolId: string,
): Promise<ActionResult<ReceiptDocument>> {
  try {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, schoolId },
      select: {
        id: true,
        receiptNo: true,
        status: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        referenceNo: true,
        receivedByUser: { select: { firstName: true, lastName: true } },
        student: {
          select: {
            admissionNo: true,
            user: { select: { firstName: true, lastName: true } },
            charges: { select: { balance: true } },
            classTerms: {
              where: { status: "ACTIVE" },
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { classTerm: { select: { class: { select: { name: true } } } } },
            },
          },
        },
        school: { select: { name: true, code: true, logoUrl: true } },
        term: { select: { name: true, session: { select: { name: true } } } },
        allocations: {
          select: {
            amount: true,
            charge: { select: { feeSchedule: { select: { name: true } } } },
          },
        },
        gatewayTransaction: {
          select: {
            payerEmail: true,
            channel: true,
            providerTransactionId: true,
            amountExpected: true,
            amountCharged: true,
            configurationSnapshot: true,
          },
        },
        unappliedApplications: { select: { id: true }, take: 1 },
        counterRefundRequests: { where: { status: "REQUESTED" }, take: 1, select: { id: true, reason: true, requestedBy: true, createdAt: true } },
      },
    })

    if (!payment) throw new Error("Receipt not found")
    const refundRequest = payment.counterRefundRequests[0] ?? null
    const refundRequester = refundRequest
      ? await prisma.user.findUnique({ where: { id: refundRequest.requestedBy }, select: { firstName: true, lastName: true } })
      : null

    const gateway = payment.gatewayTransaction
    const snapshot = gateway?.configurationSnapshot as { feePolicy?: unknown } | null
    // Only a gross-up puts the fee on the payer. Under any other policy the payer was
    // debited exactly what the school credited, and a breakdown would invent a distinction.
    const payerCoveredFee = snapshot?.feePolicy === "PARENT_PAYS_GROSS_UP"
    const feePaidByPayer = payerCoveredFee && gateway?.amountCharged
      ? gateway.amountCharged.minus(gateway.amountExpected)
      : null

    return {
      success: true,
      data: {
        id: payment.id,
        receiptNo: payment.receiptNo,
        // A receipt that does not say whether the money actually arrived is the one thing a
        // receipt must not do. A PENDING transfer allocates nothing and moves no balance.
        status: payment.status,
        amount: moneyString(payment.amount),
        paymentDate: payment.paymentDate.toISOString(),
        paymentMethod: payment.paymentMethod,
        referenceNo: payment.referenceNo,
        receivedBy: payment.receivedByUser
          ? `${payment.receivedByUser.firstName} ${payment.receivedByUser.lastName}`
          : null,
        student: {
          name: `${payment.student.user.firstName} ${payment.student.user.lastName}`,
          admissionNo: payment.student.admissionNo,
          currentClass: payment.student.classTerms[0]?.classTerm.class.name ?? null,
        },
        school: payment.school,
        term: { name: payment.term.name, sessionName: payment.term.session.name },
        allocations: payment.allocations.map((allocation) => ({
          description: allocation.charge.feeSchedule.name,
          amount: moneyString(allocation.amount),
        })),
        balanceRemaining: moneyString(payment.student.charges.reduce((total, charge) => total.plus(charge.balance), money(0))),
        online: gateway
          ? {
              payerEmail: gateway.payerEmail,
              channel: gateway.channel,
              providerReference: gateway.providerTransactionId,
              amountCharged: gateway.amountCharged ? moneyString(gateway.amountCharged) : null,
              feePaidByPayer: feePaidByPayer && feePaidByPayer.greaterThan(0)
                ? moneyString(feePaidByPayer)
                : null,
            }
          : null,
        fromHeldTransfer: payment.unappliedApplications.length > 0,
        pendingRefund: refundRequest
          ? {
              id: refundRequest.id,
              reason: refundRequest.reason,
              requestedBy: refundRequest.requestedBy,
              requestedByName: refundRequester ? `${refundRequester.firstName} ${refundRequester.lastName}` : "another user",
              requestedAt: refundRequest.createdAt.toISOString(),
            }
          : null,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to load receipt" }
  }
}
