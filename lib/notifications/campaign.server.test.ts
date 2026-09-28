import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { applyGovernance, categoryAllowed, isEssential } = await import("./campaign.server")

const request = (channel: "SMS" | "EMAIL", templateKey: string, body = "Short message") => ({
  schoolId: "s", channel, recipient: channel === "SMS" ? "+2348031234567" : "a@b.ng", body, templateKey,
})

describe("school notification controls", () => {
  const open = { disabled: new Set<string>(), smsMonthlyLimit: null, smsUnitsThisMonth: 0 }

  it("never lets a school switch off emailed receipts or refund notices", () => {
    expect(isEssential("payment.received", "EMAIL")).toBe(true)
    expect(isEssential("payment.refunded", "EMAIL")).toBe(true)
    expect(isEssential("payment.received", "SMS")).toBe(false)
    const governance = { ...open, disabled: new Set(["payment.received:EMAIL", "payment.received:SMS"]) }
    expect(categoryAllowed(governance, "payment.received", "EMAIL")).toBe(true)
    expect(categoryAllowed(governance, "payment.received", "SMS")).toBe(false)
  })

  it("drops a switched-off category on that channel only", () => {
    const governance = { ...open, disabled: new Set(["fees.reminder:SMS"]) }
    const result = applyGovernance([request("SMS", "fees.reminder"), request("EMAIL", "fees.reminder")], governance)
    expect(result.allowed.map((r) => r.channel)).toEqual(["EMAIL"])
    expect(result.switchedOff).toBe(1)
  })

  it("admits SMS in order until the next one would cross the monthly cap", () => {
    const governance = { ...open, smsMonthlyLimit: 10, smsUnitsThisMonth: 8 }
    const result = applyGovernance([request("SMS", "announcement"), request("SMS", "announcement"), request("SMS", "announcement"), request("EMAIL", "announcement")], governance)
    expect(result.allowed.filter((r) => r.channel === "SMS")).toHaveLength(2)
    expect(result.overSmsLimit).toBe(1)
    expect(result.smsUnits).toBe(2)
    // Email is never capped.
    expect(result.allowed.some((r) => r.channel === "EMAIL")).toBe(true)
  })

  it("counts a long SMS as several units", () => {
    const long = "x".repeat(200)
    const result = applyGovernance([request("SMS", "announcement", long)], { ...open, smsMonthlyLimit: 1 })
    expect(result.allowed).toHaveLength(0)
    expect(result.overSmsLimit).toBe(1)
  })
})
