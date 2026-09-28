import { Prisma } from "@prisma/client"

/**
 * A student's account as a running ledger.
 *
 * A statement of account is not two tables side by side — one of charges, one of payments —
 * which is what this screen showed. It is a single chronological record: every charge
 * raised and every payment received, in date order, each line carrying the balance the
 * account stood at afterwards. That is the form a parent can check line by line and an
 * accountant can reconcile, and it is the only form in which "balance" means anything
 * precise.
 */

export type LedgerCharge = {
  id: string
  description: string
  /** The amount finally due after any discount or exemption. */
  amount: Prisma.Decimal | string | number
  raisedOn: Date | string
}

export type LedgerPayment = {
  id: string
  receiptNo: string
  amount: Prisma.Decimal | string | number
  paymentDate: Date | string
  status: string
}

export type LedgerEntry = {
  id: string
  date: Date
  description: string
  reference: string | null
  /** Money owed by the student on this line. Zero for a payment. */
  debit: Prisma.Decimal
  /** Money received on this line. Zero for a charge. */
  credit: Prisma.Decimal
  /** What the account stood at after this line. */
  balance: Prisma.Decimal
  kind: "charge" | "payment"
  /** A payment that has not cleared: listed for the record, but it moves nothing. */
  pending: boolean
}

export type Ledger = {
  entries: LedgerEntry[]
  totalCharged: Prisma.Decimal
  totalPaid: Prisma.Decimal
  closingBalance: Prisma.Decimal
  /** Payments awaiting confirmation, which the closing balance deliberately excludes. */
  pendingTotal: Prisma.Decimal
}

const ZERO = new Prisma.Decimal(0)

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Builds the ledger.
 *
 * Only a COMPLETED payment moves the balance — the same rule the receipt states. A pending
 * transfer appears on its date so the account reads truthfully, but carries no credit and
 * leaves the running balance where it was; otherwise the statement would show money the
 * school has not received.
 */
export function buildStatementLedger(
  charges: LedgerCharge[],
  payments: LedgerPayment[],
): Ledger {
  const rows: Omit<LedgerEntry, "balance">[] = [
    ...charges.map((charge) => ({
      id: `charge-${charge.id}`,
      date: asDate(charge.raisedOn),
      description: charge.description,
      reference: null,
      debit: new Prisma.Decimal(charge.amount),
      credit: ZERO,
      kind: "charge" as const,
      pending: false,
    })),
    ...payments.map((payment) => {
      const pending = payment.status !== "COMPLETED"
      return {
        id: `payment-${payment.id}`,
        date: asDate(payment.paymentDate),
        description: pending ? `Payment received (${payment.status.toLowerCase()})` : "Payment received",
        reference: payment.receiptNo,
        debit: ZERO,
        credit: pending ? ZERO : new Prisma.Decimal(payment.amount),
        kind: "payment" as const,
        pending,
      }
    }),
  ]

  // Date order, and where two land on the same day the charge comes first: the money is
  // owed before it can be paid, and a credit shown ahead of its debit reads as an overpayment.
  rows.sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime()
    if (byDate !== 0) return byDate
    if (a.kind === b.kind) return 0
    return a.kind === "charge" ? -1 : 1
  })

  let running = ZERO
  const entries: LedgerEntry[] = rows.map((row) => {
    running = running.plus(row.debit).minus(row.credit)
    return { ...row, balance: running }
  })

  const totalCharged = charges.reduce(
    (total, charge) => total.plus(new Prisma.Decimal(charge.amount)),
    ZERO,
  )
  const totalPaid = payments.reduce(
    (total, payment) =>
      payment.status === "COMPLETED" ? total.plus(new Prisma.Decimal(payment.amount)) : total,
    ZERO,
  )
  const pendingTotal = payments.reduce(
    (total, payment) =>
      payment.status === "PENDING" ? total.plus(new Prisma.Decimal(payment.amount)) : total,
    ZERO,
  )

  return { entries, totalCharged, totalPaid, closingBalance: running, pendingTotal }
}

/**
 * Which date a charge belongs on in the statement.
 *
 * Not `createdAt`. That is when the row was written, which for a bulk enrolment run — or a
 * term's fees raised late — is nothing to do with when the money fell due. Dating by it put
 * every charge on one day and left January's payment sitting above the charge it settled,
 * so the running balance read minus fifty-two thousand for most of the year.
 *
 * The due date is the accounting date. Where a charge has none, the term it belongs to
 * started when the fee became owed, and only failing both is the row's own timestamp used.
 */
export function chargeStatementDate(charge: {
  dueDate?: Date | string | null
  termStart?: Date | string | null
  raisedOn: Date | string
}): Date {
  if (charge.dueDate) return asDate(charge.dueDate)
  if (charge.termStart) return asDate(charge.termStart)
  return asDate(charge.raisedOn)
}
