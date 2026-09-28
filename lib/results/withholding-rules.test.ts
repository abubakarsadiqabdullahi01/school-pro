import { describe, expect, it } from "vitest"

import { canViewResults, canViewSessionSummary } from "./withholding-rules"

describe("canViewResults", () => {
  it("allows everything when the school has not switched withholding on", () => {
    expect(canViewResults({ withholdEnabled: false, balanceOwing: 50_000 })).toEqual({
      allowed: true,
    })
  })

  it("allows results when the period is paid up", () => {
    expect(canViewResults({ withholdEnabled: true, balanceOwing: 0 })).toEqual({ allowed: true })
  })

  it("allows results on a credit balance rather than reading it as debt", () => {
    // An overpayment carried forward shows as a negative balance. Treating "not zero" as
    // "owing" would hold results from the families who had paid the most.
    expect(canViewResults({ withholdEnabled: true, balanceOwing: -2_500 })).toEqual({
      allowed: true,
    })
  })

  it("holds results when the period is owing and the school withholds", () => {
    const access = canViewResults({ withholdEnabled: true, balanceOwing: 15_000 })
    expect(access.allowed).toBe(false)
    if (!access.allowed) expect(access.reason).toMatch(/bursar/i)
  })

  it("names the period in the message so the parent knows which bill to settle", () => {
    const access = canViewResults({
      withholdEnabled: true,
      balanceOwing: 15_000,
      periodLabel: "First Term, 2025/2026",
    })
    expect(access.allowed).toBe(false)
    if (!access.allowed) expect(access.reason).toContain("First Term, 2025/2026")
  })
})

describe("canViewSessionSummary", () => {
  const open = { allowed: true } as const
  const held = { allowed: false, reason: "held" } as const

  it("is visible when every term is visible", () => {
    expect(
      canViewSessionSummary([
        { access: open, termName: "First Term" },
        { access: open, termName: "Second Term" },
        { access: open, termName: "Third Term" },
      ]),
    ).toEqual({ allowed: true })
  })

  it("is withheld when any single term is, because a partial average is a wrong number", () => {
    const access = canViewSessionSummary([
      { access: open, termName: "First Term" },
      { access: held, termName: "Second Term" },
      { access: open, termName: "Third Term" },
    ])
    expect(access.allowed).toBe(false)
    if (!access.allowed) {
      expect(access.reason).toContain("Second Term")
      expect(access.reason).toContain("is held")
    }
  })

  it("lists every held term and reads as a plural", () => {
    const access = canViewSessionSummary([
      { access: held, termName: "First Term" },
      { access: held, termName: "Second Term" },
      { access: open, termName: "Third Term" },
    ])
    expect(access.allowed).toBe(false)
    if (!access.allowed) {
      expect(access.reason).toContain("First Term, Second Term")
      expect(access.reason).toContain("are held")
    }
  })

  it("treats a session with no terms as visible rather than throwing", () => {
    expect(canViewSessionSummary([])).toEqual({ allowed: true })
  })
})
