import { prisma } from "@/lib/db"

/**
 * The account a refund is waiting to be paid into, as the approvers see it: who entered it,
 * and whether a second person has confirmed it (see provideRefundBankDetails).
 */
export type RefundPayoutView = {
  accountNumber: string
  accountName: string | null
  bankName: string | null
  enteredAt: string
  enteredByName: string
  confirmed: boolean
}

type PayoutFields = {
  id: string
  payoutAccountNumber: string | null
  payoutAccountName: string | null
  payoutBankName: string | null
  payoutEnteredBy: string | null
  payoutEnteredAt: Date | null
  payoutConfirmedBy: string | null
}

export async function refundPayoutViews(refunds: PayoutFields[]): Promise<Map<string, RefundPayoutView | null>> {
  const ids = [...new Set(refunds.map((refund) => refund.payoutEnteredBy).filter((id): id is string => Boolean(id)))]
  const names = new Map(
    (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }))
      .map((user) => [user.id, `${user.firstName} ${user.lastName}`]),
  )
  return new Map(refunds.map((refund) => [
    refund.id,
    refund.payoutEnteredBy && refund.payoutEnteredAt && refund.payoutAccountNumber
      ? {
          accountNumber: refund.payoutAccountNumber,
          accountName: refund.payoutAccountName,
          bankName: refund.payoutBankName,
          enteredAt: refund.payoutEnteredAt.toISOString(),
          enteredByName: names.get(refund.payoutEnteredBy) ?? "another approver",
          confirmed: Boolean(refund.payoutConfirmedBy),
        }
      : null,
  ]))
}
