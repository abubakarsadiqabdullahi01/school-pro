import { Prisma } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"

import { postStudentPaymentInTransaction } from "./payment-ledger.server"

function transactionDouble(options?: { reserveCount?: number }) {
  const create = vi.fn(async ({ data }: { data: { amount: Prisma.Decimal } }) => ({
    id: "payment-1",
    receiptNo: "RCPT-2026-00001",
    amount: data.amount,
  }))
  const updateMany = vi.fn(async () => ({ count: options?.reserveCount ?? 1 }))

  const tx = {
    student: { findFirst: vi.fn(async () => ({ id: "student-1" })) },
    term: { findFirst: vi.fn(async () => ({ id: "term-1", sessionId: "session-1" })) },
    studentCharge: {
      findMany: vi.fn(async () => [
        { id: "charge-1", balance: new Prisma.Decimal(100) },
        { id: "charge-2", balance: new Prisma.Decimal(50) },
      ]),
      updateMany,
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
        balance: new Prisma.Decimal(where.id === "charge-1" ? 40 : 0),
      })),
      update: vi.fn(async () => ({})),
    },
    receiptSequence: { upsert: vi.fn(async () => ({ lastSequence: 1 })) },
    payment: { create },
  } as unknown as Prisma.TransactionClient

  return { tx, create, updateMany }
}

const input = {
  schoolId: "school-1",
  studentId: "student-1",
  termId: "term-1",
  paymentDate: new Date("2026-09-25T10:00:00.000Z"),
  paymentMethod: "ONLINE",
  referenceNo: "gateway-reference-1",
  allocations: [
    { chargeId: "charge-1", amount: "60.00" },
    { chargeId: "charge-2", amount: "50.00" },
  ],
}

describe("postStudentPaymentInTransaction", () => {
  it("creates one balanced ordinary payment and reserves every charge", async () => {
    const { tx, create, updateMany } = transactionDouble()

    const payment = await postStudentPaymentInTransaction(tx, input)

    expect(payment.id).toBe("payment-1")
    expect(payment.amount.toFixed(2)).toBe("110.00")
    expect(create).toHaveBeenCalledOnce()
    const createData = create.mock.calls[0]?.[0].data
    expect(createData.amount.toFixed(2)).toBe("110.00")
    expect(updateMany).toHaveBeenCalledTimes(2)
  })

  it("rejects duplicate charge rows before writing a receipt", async () => {
    const { tx, create } = transactionDouble()

    await expect(
      postStudentPaymentInTransaction(tx, {
        ...input,
        allocations: [
          { chargeId: "charge-1", amount: "10.00" },
          { chargeId: "charge-1", amount: "20.00" },
        ],
      }),
    ).rejects.toThrow("same charge")
    expect(create).not.toHaveBeenCalled()
  })

  it("rejects fractions smaller than one kobo", async () => {
    const { tx, create } = transactionDouble()

    await expect(
      postStudentPaymentInTransaction(tx, {
        ...input,
        allocations: [{ chargeId: "charge-1", amount: "10.001" }],
      }),
    ).rejects.toThrow("rounded to kobo")
    expect(create).not.toHaveBeenCalled()
  })

  it("rolls back when a concurrent payment consumes a charge balance", async () => {
    const { tx } = transactionDouble({ reserveCount: 0 })

    await expect(postStudentPaymentInTransaction(tx, input)).rejects.toThrow("balance changed")
  })
})
