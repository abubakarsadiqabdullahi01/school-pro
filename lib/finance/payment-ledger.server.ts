import { Prisma } from "@prisma/client"

export type LedgerPaymentAllocationInput = {
  chargeId: string
  amount: Prisma.Decimal.Value
}

export type PostStudentPaymentInput = {
  schoolId: string
  studentId: string
  termId: string
  paymentDate: Date
  paymentMethod: string
  referenceNo?: string | null
  receivedBy?: string | null
  notes?: string | null
  allocations: LedgerPaymentAllocationInput[]
}

export type PostedStudentPayment = {
  id: string
  receiptNo: string
  amount: Prisma.Decimal
}

function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

/**
 * Posts one balanced student payment inside an existing database transaction.
 *
 * The manual finance action and gateway confirmation both use this function. Keeping the
 * gateway-state update in the caller's transaction makes the provider reference, receipt,
 * allocations and charge balances succeed or roll back together.
 */
export async function postStudentPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: PostStudentPaymentInput,
): Promise<PostedStudentPayment> {
  if (input.allocations.length === 0) throw new Error("Enter an allocation for at least one charge")

  const chargeIds = input.allocations.map((allocation) => allocation.chargeId)
  if (new Set(chargeIds).size !== chargeIds.length) {
    throw new Error("The same charge cannot appear more than once in a payment")
  }

  const normalizedAllocations = input.allocations.map((allocation) => {
    const amount = money(allocation.amount)
    if (!amount.isPositive() || amount.decimalPlaces() > 2) {
      throw new Error("Every payment allocation must be a positive amount rounded to kobo")
    }
    return { chargeId: allocation.chargeId, amount }
  })
  const allocationTotal = normalizedAllocations.reduce((total, allocation) => total.plus(allocation.amount), money(0))

  const student = await tx.student.findFirst({
    where: { id: input.studentId, schoolId: input.schoolId },
    select: { id: true },
  })
  if (!student) throw new Error("Student not found")

  const term = await tx.term.findFirst({
    where: { id: input.termId, session: { schoolId: input.schoolId } },
    select: { id: true, sessionId: true },
  })
  if (!term) throw new Error("Term not found")

  const charges = await tx.studentCharge.findMany({
    where: { id: { in: chargeIds }, studentId: input.studentId, schoolId: input.schoolId },
    select: { id: true, balance: true },
  })
  if (charges.length !== chargeIds.length) throw new Error("One or more selected charges were not found")

  const chargeBalances = new Map(charges.map((charge) => [charge.id, charge.balance]))
  for (const allocation of normalizedAllocations) {
    const balance = chargeBalances.get(allocation.chargeId)
    if (!balance || allocation.amount.gt(balance)) {
      throw new Error("Payment allocation cannot exceed the selected charge balance")
    }
  }

  const year = input.paymentDate.getFullYear()
  const sequence = await tx.receiptSequence.upsert({
    where: { schoolId_year: { schoolId: input.schoolId, year } },
    create: { schoolId: input.schoolId, year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  })
  const receiptNo = `RCPT-${year}-${String(sequence.lastSequence).padStart(5, "0")}`

  const created = await tx.payment.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      termId: input.termId,
      sessionId: term.sessionId,
      amount: allocationTotal,
      paymentDate: input.paymentDate,
      receiptNo,
      paymentMethod: input.paymentMethod,
      referenceNo: input.referenceNo || receiptNo,
      receivedBy: input.receivedBy || null,
      notes: input.notes || null,
      status: "COMPLETED",
      allocations: {
        create: normalizedAllocations.map((allocation) => ({
          chargeId: allocation.chargeId,
          amount: allocation.amount,
        })),
      },
    },
    select: { id: true, receiptNo: true, amount: true },
  })

  for (const allocation of normalizedAllocations) {
    // The predicate and decrement are one SQL operation. A concurrent payment that uses
    // the balance first causes this entire transaction, including the receipt, to roll back.
    const reserved = await tx.studentCharge.updateMany({
      where: {
        id: allocation.chargeId,
        studentId: input.studentId,
        schoolId: input.schoolId,
        balance: { gte: allocation.amount },
      },
      data: {
        amountPaid: { increment: allocation.amount },
        balance: { decrement: allocation.amount },
      },
    })
    if (reserved.count !== 1) {
      throw new Error("A selected charge balance changed. Refresh the statement and try again.")
    }

    const charge = await tx.studentCharge.findUniqueOrThrow({
      where: { id: allocation.chargeId },
      select: { balance: true },
    })
    await tx.studentCharge.update({
      where: { id: allocation.chargeId },
      data: { status: charge.balance.lte(0) ? "PAID" : "PARTIAL" },
    })
  }

  return created
}

/** Convenience wrapper for trusted non-gateway callers that do not already own a tx. */
export async function postStudentPayment(input: PostStudentPaymentInput): Promise<PostedStudentPayment> {
  const { prisma } = await import("@/lib/db")
  return prisma.$transaction((tx) => postStudentPaymentInTransaction(tx, input))
}

/** Reverses a completed receipt inside the caller's transaction. Safe to call after a
 * provider confirms an asynchronous refund; the unique reversal and status claim prevent
 * duplicate webhook delivery from restoring charge balances twice. */
export async function reverseStudentPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; paymentId: string; reason: string; referenceNo?: string | null; createdBy: string },
): Promise<"reversed" | "already_reversed"> {
  const payment = await tx.payment.findFirst({
    where: { id: input.paymentId, schoolId: input.schoolId },
    select: { id: true, amount: true, status: true, notes: true, studentId: true, allocations: { select: { chargeId: true, amount: true } } },
  })
  if (!payment) throw new Error("Payment not found")
  if (payment.status === "REFUNDED") return "already_reversed"
  if (payment.status !== "COMPLETED") throw new Error(`Only a completed payment can be reversed; this receipt is ${payment.status.toLowerCase()}`)

  const claimed = await tx.payment.updateMany({
    where: { id: payment.id, schoolId: input.schoolId, status: "COMPLETED" },
    data: { status: "REFUNDED", notes: `${payment.notes ? `${payment.notes}\n` : ""}Refunded: ${input.reason}` },
  })
  if (claimed.count !== 1) throw new Error("This payment was already changed")

  for (const allocation of payment.allocations) {
    const restored = await tx.studentCharge.updateMany({
      where: { id: allocation.chargeId, schoolId: input.schoolId, studentId: payment.studentId, amountPaid: { gte: allocation.amount } },
      data: { amountPaid: { decrement: allocation.amount }, balance: { increment: allocation.amount } },
    })
    if (restored.count !== 1) throw new Error("A linked fee charge no longer matches this receipt. Run integrity checks before refunding.")
    const charge = await tx.studentCharge.findUniqueOrThrow({ where: { id: allocation.chargeId }, select: { amountPaid: true, balance: true } })
    await tx.studentCharge.update({
      where: { id: allocation.chargeId },
      data: { status: charge.balance.lte(0) ? "PAID" : charge.amountPaid.gt(0) ? "PARTIAL" : "UNPAID" },
    })
  }
  await tx.accountingReversal.create({
    data: { schoolId: input.schoolId, targetType: "PAYMENT", paymentId: payment.id, amount: payment.amount,
      reason: input.reason, referenceNo: input.referenceNo || null, createdBy: input.createdBy },
  })
  return "reversed"
}
