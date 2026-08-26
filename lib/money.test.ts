import { describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"
import { formatNaira, sumAmounts, toNumber } from "@/lib/money"

/**
 * The point of moving money off `Float` was exactness. These tests demonstrate the
 * difference rather than asserting it, so the reason for the Decimal columns stays visible
 * to whoever touches finance next.
 */

describe("sumAmounts", () => {
  it("adds amounts exactly where float arithmetic drifts", () => {
    // The canonical float failure: 0.1 + 0.2 !== 0.3.
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(sumAmounts(["0.10", "0.20"]).equals(new Prisma.Decimal("0.30"))).toBe(true)
  })

  it("keeps a long run of kobo amounts exact", () => {
    // 100 payments of ₦0.07. In float this lands on 7.000000000000001.
    const amounts = Array.from({ length: 100 }, () => "0.07")
    const floatTotal = amounts.reduce((total, amount) => total + Number(amount), 0)

    expect(floatTotal).not.toBe(7)
    // Compared by value, not by string — Decimal drops trailing zeros in toString().
    expect(sumAmounts(amounts).equals(new Prisma.Decimal(7))).toBe(true)
  })

  it("totals a realistic term of school fees exactly", () => {
    const fees = ["24523.50", "6445.25", "9763.75", "22116.00"]
    expect(sumAmounts(fees).equals(new Prisma.Decimal("62848.50"))).toBe(true)
    expect(formatNaira(sumAmounts(fees))).toBe("₦62,848.50")
  })

  it("returns zero for an empty list rather than NaN", () => {
    expect(sumAmounts([]).toString()).toBe("0")
  })

  it("accepts Decimal, number and string amounts together", () => {
    const total = sumAmounts([new Prisma.Decimal("1000.50"), 2000, "3000.25"])
    expect(total.toString()).toBe("6000.75")
  })
})

describe("formatNaira", () => {
  it("formats with the Naira sign, thousands separators and kobo", () => {
    expect(formatNaira("24523.5")).toBe("₦24,523.50")
  })

  it("drops the kobo when asked, for summary tiles", () => {
    expect(formatNaira("24523.5", { kobo: false })).toBe("₦24,524")
  })

  it("formats zero rather than rendering an empty string", () => {
    expect(formatNaira(0)).toBe("₦0.00")
  })

  it("formats a Decimal straight from Prisma", () => {
    expect(formatNaira(new Prisma.Decimal("1250000.00"))).toBe("₦1,250,000.00")
  })

  it("keeps a refund's sign visible", () => {
    expect(formatNaira("-5000")).toBe("₦-5,000.00")
  })
})

describe("toNumber", () => {
  it("converts for a boundary that cannot take a Decimal", () => {
    expect(toNumber(new Prisma.Decimal("24523.50"))).toBe(24523.5)
  })

  it("is a one-way door — summing converted values reintroduces the drift", () => {
    // This is why sumAmounts exists and why toNumber is documented as display-only.
    const converted = [new Prisma.Decimal("0.10"), new Prisma.Decimal("0.20")].map(toNumber)
    expect(converted.reduce((a, b) => a + b, 0)).not.toBe(0.3)
  })
})
