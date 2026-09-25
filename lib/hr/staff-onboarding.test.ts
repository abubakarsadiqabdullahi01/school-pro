import { describe, expect, it } from "vitest"
import {
  impliedOnboardingStatus,
  onboardingSummary,
  staffOnboardingChecklist,
  staffOnboardingProgress,
  type StaffOnboardingInput,
} from "@/lib/hr/staff-onboarding"

/**
 * The HR onboarding checklist.
 *
 * What matters here is that "complete" cannot be reached while payroll would still be
 * wrong — a bank account with no account name does not pay anybody — and that a record
 * created automatically from a teacher starts out visibly empty rather than looking done.
 */

/** A staff record with nothing filled in — exactly what provisioning from a teacher makes. */
function bare(overrides: Partial<StaffOnboardingInput> = {}): StaffOnboardingInput {
  return {
    hasActiveSalary: false,
    documentTypes: [],
    ...overrides,
  }
}

/** Every REQUIRED item satisfied, nothing optional. */
function requiredComplete(overrides: Partial<StaffOnboardingInput> = {}): StaffOnboardingInput {
  return bare({
    phone: "08031234567",
    jobTitle: "Mathematics Teacher",
    department: "Sciences",
    qualification: "B.Sc Mathematics",
    emergencyContactName: "Ngozi Obi",
    emergencyContactPhone: "08039876543",
    bankName: "Zenith Bank",
    accountNumber: "1234567890",
    accountName: "Ada Obi",
    hasActiveSalary: true,
    documentTypes: ["APPOINTMENT_LETTER", "IDENTIFICATION"],
    ...overrides,
  })
}

describe("a freshly provisioned record", () => {
  it("satisfies nothing", () => {
    const progress = staffOnboardingProgress(bare())
    expect(progress.items.every((item) => !item.satisfied)).toBe(true)
    expect(progress.percentComplete).toBe(0)
  })

  it("cannot be marked complete", () => {
    expect(staffOnboardingProgress(bare()).canComplete).toBe(false)
  })

  it("reads as NOT_STARTED", () => {
    expect(impliedOnboardingStatus(staffOnboardingProgress(bare()))).toBe("NOT_STARTED")
  })

  it("moves to IN_PROGRESS as soon as anything is filled in", () => {
    const progress = staffOnboardingProgress(bare({ phone: "08031234567" }))
    expect(impliedOnboardingStatus(progress)).toBe("IN_PROGRESS")
  })
})

describe("completeness", () => {
  it("is reachable with every required item and no optional ones", () => {
    // A casual cleaner with no pension PIN must not be blocked out of payroll.
    const progress = staffOnboardingProgress(requiredComplete())
    expect(progress.canComplete).toBe(true)
    expect(progress.outstandingRequired).toEqual([])
    expect(progress.outstandingRecommended.length).toBeGreaterThan(0)
  })

  it("is blocked by any single required item", () => {
    const withoutSalary = staffOnboardingProgress(requiredComplete({ hasActiveSalary: false }))
    expect(withoutSalary.canComplete).toBe(false)
    expect(withoutSalary.outstandingRequired.map((item) => item.key)).toEqual(["salary"])
  })

  it("reaches 100 percent only when the optional items are there too", () => {
    expect(staffOnboardingProgress(requiredComplete()).percentComplete).toBeLessThan(100)

    const everything = staffOnboardingProgress(
      requiredComplete({
        dateOfBirth: new Date("1990-04-01"),
        address: "12 Awolowo Road, Ikoyi",
        pensionPfa: "Stanbic IBTC Pension",
        pensionPin: "PEN100200300",
        taxId: "TIN-99887766",
        documentTypes: ["APPOINTMENT_LETTER", "IDENTIFICATION", "QUALIFICATION_CERTIFICATE"],
      }),
    )
    expect(everything.percentComplete).toBe(100)
    expect(everything.outstandingRecommended).toEqual([])
  })
})

describe("bank details", () => {
  // A salary sent on a name with no account number does not arrive; one on an account
  // number with no name cannot be traced. Partial bank details are not partial credit.
  it.each([
    ["no account name", { accountName: null }],
    ["no account number", { accountNumber: null }],
    ["no bank", { bankName: null }],
  ])("is unsatisfied with %s", (_label, overrides) => {
    const progress = staffOnboardingProgress(requiredComplete(overrides))
    expect(progress.canComplete).toBe(false)
    expect(progress.outstandingRequired.map((item) => item.key)).toContain("bank")
  })
})

describe("emergency contact", () => {
  it("needs both a name and a number", () => {
    expect(
      staffOnboardingProgress(requiredComplete({ emergencyContactPhone: null })).canComplete,
    ).toBe(false)
    expect(
      staffOnboardingProgress(requiredComplete({ emergencyContactName: null })).canComplete,
    ).toBe(false)
  })
})

describe("documents", () => {
  it("requires the appointment letter and an ID", () => {
    const progress = staffOnboardingProgress(requiredComplete({ documentTypes: [] }))
    expect(progress.outstandingRequired.map((item) => item.key)).toEqual(
      expect.arrayContaining(["appointment_letter", "identification"]),
    )
  })

  it("does not count an unrelated document towards a required one", () => {
    const progress = staffOnboardingProgress(requiredComplete({ documentTypes: ["MEDICAL_REPORT"] }))
    expect(progress.canComplete).toBe(false)
  })
})

describe("whitespace is not data", () => {
  it("does not accept a blank string as a filled field", () => {
    const progress = staffOnboardingProgress(requiredComplete({ phone: "   " }))
    expect(progress.outstandingRequired.map((item) => item.key)).toContain("contact")
  })
})

describe("every item carries a hint", () => {
  it("so an HR officer is told what to do, not just what is missing", () => {
    for (const item of staffOnboardingChecklist(bare())) {
      expect(item.hint.length).toBeGreaterThan(0)
      expect(item.label.length).toBeGreaterThan(0)
    }
  })
})

describe("onboardingSummary", () => {
  it("names one or two missing items outright", () => {
    const summary = onboardingSummary(
      staffOnboardingProgress(requiredComplete({ hasActiveSalary: false })),
    )
    expect(summary).toBe("Missing Salary assigned.")
  })

  it("counts the rest once there are more than two", () => {
    expect(onboardingSummary(staffOnboardingProgress(bare()))).toMatch(/and \d+ more\.$/)
  })

  it("says so when a record is ready to complete", () => {
    expect(onboardingSummary(staffOnboardingProgress(requiredComplete()))).toContain(
      "Ready to complete",
    )
  })

  it("says so when nothing at all is outstanding", () => {
    const everything = staffOnboardingProgress(
      requiredComplete({
        dateOfBirth: new Date("1990-04-01"),
        address: "12 Awolowo Road",
        pensionPfa: "Stanbic",
        pensionPin: "PEN1",
        taxId: "TIN-1",
        documentTypes: ["APPOINTMENT_LETTER", "IDENTIFICATION", "QUALIFICATION_CERTIFICATE"],
      }),
    )
    expect(onboardingSummary(everything)).toBe("Everything on file.")
  })
})

describe("impliedOnboardingStatus", () => {
  it("never claims COMPLETE — that is a person's decision, not an inference", () => {
    // Non-empty strings prove a form was filled, not that the right documents were seen.
    const everything = staffOnboardingProgress(requiredComplete())
    expect(impliedOnboardingStatus(everything)).toBe("IN_PROGRESS")
  })
})
