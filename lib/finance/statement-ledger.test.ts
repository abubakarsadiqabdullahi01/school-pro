import { describe, expect, it } from "vitest"

import { buildStatementLedger, chargeStatementDate } from "@/lib/finance/statement-ledger"

const charge = (id: string, amount: number, raisedOn: string, description = `Fee ${id}`) => ({
  id,
  description,
  amount,
  raisedOn: new Date(raisedOn),
})

const payment = (id: string, amount: number, paymentDate: string, status = "COMPLETED") => ({
  id,
  receiptNo: `RCT/${id}`,
  amount,
  paymentDate: new Date(paymentDate),
  status,
})

describe("buildStatementLedger", () => {
  it("interleaves charges and payments in date order", () => {
    const ledger = buildStatementLedger(
      [charge("a", 45000, "2026-01-05"), charge("b", 7500, "2026-04-20")],
      [payment("p1", 20000, "2026-02-10")],
    )

    expect(ledger.entries.map((entry) => entry.description)).toEqual([
      "Fee a",
      "Payment received",
      "Fee b",
    ])
  })

  it("carries a running balance down the page", () => {
    const ledger = buildStatementLedger(
      [charge("a", 45000, "2026-01-05"), charge("b", 7500, "2026-04-20")],
      [payment("p1", 20000, "2026-02-10")],
    )

    expect(ledger.entries.map((entry) => entry.balance.toNumber())).toEqual([45000, 25000, 32500])
    expect(ledger.closingBalance.toNumber()).toBe(32500)
  })

  it("totals only what has actually been received", () => {
    const ledger = buildStatementLedger(
      [charge("a", 45000, "2026-01-05")],
      [payment("p1", 20000, "2026-02-10"), payment("p2", 5000, "2026-03-01", "PENDING")],
    )

    expect(ledger.totalCharged.toNumber()).toBe(45000)
    expect(ledger.totalPaid.toNumber()).toBe(20000)
    expect(ledger.pendingTotal.toNumber()).toBe(5000)
  })

  // The rule the receipt already states: an unconfirmed transfer settles nothing.
  it("lists a pending payment without letting it move the balance", () => {
    const ledger = buildStatementLedger(
      [charge("a", 45000, "2026-01-05")],
      [payment("p2", 20000, "2026-03-01", "PENDING")],
    )

    const pendingEntry = ledger.entries[1]
    expect(pendingEntry.pending).toBe(true)
    expect(pendingEntry.credit.toNumber()).toBe(0)
    expect(pendingEntry.balance.toNumber()).toBe(45000)
    expect(ledger.closingBalance.toNumber()).toBe(45000)
  })

  it("names the status of a payment that did not settle", () => {
    const ledger = buildStatementLedger([], [payment("p3", 1000, "2026-03-01", "FAILED")])
    expect(ledger.entries[0].description).toBe("Payment received (failed)")
  })

  it("puts a charge before a payment raised the same day", () => {
    const ledger = buildStatementLedger(
      [charge("a", 45000, "2026-01-05")],
      [payment("p1", 45000, "2026-01-05")],
    )

    expect(ledger.entries.map((entry) => entry.kind)).toEqual(["charge", "payment"])
    expect(ledger.entries.map((entry) => entry.balance.toNumber())).toEqual([45000, 0])
  })

  it("handles an account with nothing on it", () => {
    const ledger = buildStatementLedger([], [])
    expect(ledger.entries).toEqual([])
    expect(ledger.closingBalance.toNumber()).toBe(0)
  })

  it("keeps exact money, so repeated kobo do not drift", () => {
    const ledger = buildStatementLedger(
      [charge("a", 0.1, "2026-01-01"), charge("b", 0.2, "2026-01-02")],
      [],
    )
    expect(ledger.closingBalance.toFixed(2)).toBe("0.30")
  })
})

describe("chargeStatementDate", () => {
  const raisedOn = new Date("2026-09-17")

  it("uses the due date, which is when the money fell due", () => {
    const date = chargeStatementDate({
      dueDate: new Date("2026-01-15"),
      termStart: new Date("2025-12-25"),
      raisedOn,
    })
    expect(date.toISOString().slice(0, 10)).toBe("2026-01-15")
  })

  it("falls back to the term start when there is no due date", () => {
    const date = chargeStatementDate({ dueDate: null, termStart: new Date("2025-12-25"), raisedOn })
    expect(date.toISOString().slice(0, 10)).toBe("2025-12-25")
  })

  // Only when nothing better exists: a bulk enrolment run writes every row on one day, and
  // dating by it puts a whole year's fees after the payments that settled them.
  it("falls back to the row timestamp only as a last resort", () => {
    const date = chargeStatementDate({ dueDate: null, termStart: null, raisedOn })
    expect(date.toISOString().slice(0, 10)).toBe("2026-09-17")
  })

  it("keeps a payment after the charge it settles, given real dates", () => {
    const ledger = buildStatementLedger(
      [
        {
          id: "a",
          description: "Tuition — First Term",
          amount: 45000,
          raisedOn: chargeStatementDate({
            dueDate: new Date("2026-01-15"),
            termStart: null,
            raisedOn,
          }),
        },
      ],
      [
        {
          id: "p",
          receiptNo: "RCT/1",
          amount: 45000,
          paymentDate: new Date("2026-01-20"),
          status: "COMPLETED",
        },
      ],
    )

    expect(ledger.entries.map((entry) => entry.balance.toNumber())).toEqual([45000, 0])
  })
})
