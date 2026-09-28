import { describe, expect, it } from "vitest"

import {
  baseSalaryChangeNote,
  canDeletePayComponent,
  canDeleteSalaryScale,
  canUseComponentName,
  retireComponentNote,
} from "@/lib/hr/pay-component-rules"

const taken = [
  { id: "teacher", name: "Teacher" },
  { id: "senior", name: "Senior Teacher" },
]

describe("canUseComponentName", () => {
  it("accepts a name nothing else holds", () => {
    expect(canUseComponentName("Principal", taken, "salary scale")).toEqual({ allowed: true })
  })

  it("refuses a name too short to mean anything, naming the thing", () => {
    const verdict = canUseComponentName("T", taken, "allowance")
    expect(verdict.allowed === false && verdict.reason).toBe(
      "Give the allowance a name of at least two characters.",
    )
  })

  it("refuses a clash regardless of case or surrounding space", () => {
    const verdict = canUseComponentName("  teacher ", taken, "salary scale")
    expect(verdict.allowed === false && verdict.reason).toContain("Teacher already exists")
  })

  it("lets a component keep its own name while being edited", () => {
    expect(canUseComponentName("Teacher", taken, "salary scale", "teacher")).toEqual({ allowed: true })
  })
})

describe("canDeleteSalaryScale", () => {
  it("allows deleting a scale nobody has been put on", () => {
    expect(canDeleteSalaryScale({ staffCount: 0 })).toEqual({ allowed: true })
  })

  it("refuses once somebody is on it, and says to retire instead", () => {
    const verdict = canDeleteSalaryScale({ staffCount: 6 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("6 members of staff are on this scale")
    expect(verdict.allowed === false && verdict.reason).toContain("Retire it instead")
  })

  it("reads correctly for one person", () => {
    const verdict = canDeleteSalaryScale({ staffCount: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("1 member of staff is on this scale")
  })
})

describe("canDeletePayComponent", () => {
  it("allows deleting one that has never been assigned", () => {
    expect(canDeletePayComponent({ assignedCount: 0 }, "allowance")).toEqual({ allowed: true })
  })

  it("refuses once assigned, because payslips name it", () => {
    const verdict = canDeletePayComponent({ assignedCount: 12 }, "allowance")
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("assigned to 12 members of staff")
    expect(verdict.allowed === false && verdict.reason).toContain("payslips already issued")
  })

  it("names a deduction as a deduction", () => {
    const verdict = canDeletePayComponent({ assignedCount: 3 }, "deduction")
    expect(verdict.allowed === false && verdict.reason).toContain("This deduction is assigned")
  })
})

describe("retireComponentNote", () => {
  it("says nothing when nobody is on it", () => {
    expect(retireComponentNote({ assignedCount: 0 }, "allowance")).toBeNull()
  })

  it("warns that the people on it keep it", () => {
    const note = retireComponentNote({ assignedCount: 12 }, "deduction")
    expect(note).toContain("12 members of staff keep this deduction")
    expect(note).toContain("stopped on their own record")
  })

  it("reads correctly for one person", () => {
    expect(retireComponentNote({ assignedCount: 1 }, "allowance")).toContain("1 member of staff keeps")
  })
})

describe("baseSalaryChangeNote", () => {
  it("says nothing when the figure is unchanged", () => {
    expect(baseSalaryChangeNote("140000.00", "140000", { staffCount: 6 })).toBeNull()
  })

  it("says nothing rather than NaN while the field is being typed", () => {
    expect(baseSalaryChangeNote("140000.00", "abc", { staffCount: 6 })).toBeNull()
  })

  it("explains that nobody's pay moves, because a scale is copied not linked", () => {
    const note = baseSalaryChangeNote("140000.00", "150000", { staffCount: 6 })
    expect(note).toContain("6 members of staff stay on their current pay")
    expect(note).toContain("copied onto the record when it is assigned")
  })

  it("says something simpler when nobody is on the scale", () => {
    expect(baseSalaryChangeNote("140000.00", "150000", { staffCount: 0 })).toContain(
      "only sets where the next assignment starts",
    )
  })
})
