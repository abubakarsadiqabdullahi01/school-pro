/**
 * What HR still needs from a member of staff.
 *
 * The gap this closes: adding a teacher created a `User` and a `Teacher` and nothing else.
 * HR never heard about them. They had no staff number, could not be put on payroll, and
 * nothing anywhere said so — the only link between the two sides is an optional
 * `Staff.userId` that somebody had to remember to set by hand from a dropdown.
 *
 * Teacher creation now provisions a `Staff` record, which raises the opposite risk: a row
 * with a name and nothing else looking, to payroll, exactly like a complete one. So a
 * provisioned record starts NOT_STARTED and this module is what decides when it is done.
 *
 * Completeness is **derived from the fields**, never asserted. A stored flag that says
 * "complete" while the bank details are empty is worse than no flag, because payroll would
 * believe it. `onboardingStatus` exists to make the queue queryable; this function is what
 * makes it true.
 *
 * Pure on purpose: no Prisma, so every branch is testable without a fixture.
 */

export type OnboardingSeverity = "REQUIRED" | "RECOMMENDED"

export type OnboardingItem = {
  key: string
  label: string
  severity: OnboardingSeverity
  satisfied: boolean
  /** What to do about it, shown next to the item on the HR screen. */
  hint: string
}

/**
 * Everything the checklist reads. A plain shape rather than a Prisma type so the rules can
 * be tested, and so a caller has to think about what it is passing.
 */
export type StaffOnboardingInput = {
  phone?: string | null
  email?: string | null
  dateOfBirth?: Date | null
  gender?: string | null
  address?: string | null
  jobTitle?: string | null
  department?: string | null
  qualification?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  bankName?: string | null
  accountNumber?: string | null
  accountName?: string | null
  pensionPfa?: string | null
  pensionPin?: string | null
  taxId?: string | null
  /** Whether an active salary has been assigned. Payroll cannot pay without one. */
  hasActiveSalary: boolean
  /** Document types already on file. */
  documentTypes: readonly string[]
}

function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * The checklist, in the order HR should work through it.
 *
 * Severity is not decoration. A cleaner on a casual contract genuinely may have no pension
 * PIN, and blocking their payroll over one would make the whole feature something schools
 * route around. Required means "payroll would be wrong without this"; recommended means
 * "a complete personnel file has it".
 */
export function staffOnboardingChecklist(input: StaffOnboardingInput): OnboardingItem[] {
  const documents = new Set(input.documentTypes)

  return [
    {
      key: "contact",
      label: "Contact details",
      severity: "REQUIRED",
      satisfied: present(input.phone),
      hint: "A phone number, so the school can reach them.",
    },
    {
      key: "employment",
      label: "Employment details",
      severity: "REQUIRED",
      satisfied: present(input.jobTitle) && present(input.department),
      hint: "Job title and department.",
    },
    {
      key: "qualification",
      label: "Qualification",
      severity: "REQUIRED",
      satisfied: present(input.qualification),
      hint: "The highest qualification held.",
    },
    {
      key: "emergency",
      label: "Emergency contact",
      severity: "REQUIRED",
      satisfied: present(input.emergencyContactName) && present(input.emergencyContactPhone),
      hint: "A name and a number, for an accident at work.",
    },
    {
      key: "bank",
      label: "Bank account",
      severity: "REQUIRED",
      // All three, not any: a salary sent on a name without an account number does not
      // arrive, and one on an account number without a name cannot be traced.
      satisfied: present(input.bankName) && present(input.accountNumber) && present(input.accountName),
      hint: "Bank, account number and account name — where salary is sent.",
    },
    {
      key: "salary",
      label: "Salary assigned",
      severity: "REQUIRED",
      satisfied: input.hasActiveSalary,
      hint: "Payroll cannot include somebody with no salary on record.",
    },
    {
      key: "appointment_letter",
      label: "Appointment letter",
      severity: "REQUIRED",
      satisfied: documents.has("APPOINTMENT_LETTER"),
      hint: "The signed letter of appointment.",
    },
    {
      key: "identification",
      label: "Identification",
      severity: "REQUIRED",
      satisfied: documents.has("IDENTIFICATION"),
      hint: "A national ID, driver's licence or passport.",
    },
    {
      key: "personal",
      label: "Personal details",
      severity: "RECOMMENDED",
      satisfied: input.dateOfBirth != null && present(input.address),
      hint: "Date of birth and home address.",
    },
    {
      key: "certificate",
      label: "Qualification certificate",
      severity: "RECOMMENDED",
      satisfied: documents.has("QUALIFICATION_CERTIFICATE"),
      hint: "A scan of the certificate claimed above.",
    },
    {
      key: "pension",
      label: "Pension details",
      severity: "RECOMMENDED",
      satisfied: present(input.pensionPfa) && present(input.pensionPin),
      hint: "PFA and PIN. Not every employment type has one.",
    },
    {
      key: "tax",
      label: "Tax identification",
      severity: "RECOMMENDED",
      satisfied: present(input.taxId),
      hint: "The staff member's TIN.",
    },
  ]
}

export type OnboardingProgress = {
  items: OnboardingItem[]
  /** Required items still outstanding. Empty means the record may be marked complete. */
  outstandingRequired: OnboardingItem[]
  outstandingRecommended: OnboardingItem[]
  /** Percentage of *all* items satisfied, for a progress bar. */
  percentComplete: number
  /** True when every REQUIRED item is satisfied. */
  canComplete: boolean
}

export function staffOnboardingProgress(input: StaffOnboardingInput): OnboardingProgress {
  const items = staffOnboardingChecklist(input)
  const outstandingRequired = items.filter((item) => item.severity === "REQUIRED" && !item.satisfied)
  const outstandingRecommended = items.filter(
    (item) => item.severity === "RECOMMENDED" && !item.satisfied,
  )
  const satisfied = items.filter((item) => item.satisfied).length

  return {
    items,
    outstandingRequired,
    outstandingRecommended,
    percentComplete: items.length === 0 ? 100 : Math.round((satisfied / items.length) * 100),
    canComplete: outstandingRequired.length === 0,
  }
}

/**
 * The status a record's own data implies.
 *
 * Note what this does *not* do: it never returns COMPLETE. Marking somebody complete is a
 * deliberate act by an HR officer who has seen the documents, not something a function
 * infers from non-empty strings — a scan of the wrong person's ID satisfies every check
 * here. This answers only "has anybody started", which is what the queue needs.
 */
export function impliedOnboardingStatus(
  progress: OnboardingProgress,
): "NOT_STARTED" | "IN_PROGRESS" {
  const anySatisfied = progress.items.some((item) => item.satisfied)
  return anySatisfied ? "IN_PROGRESS" : "NOT_STARTED"
}

/** A one-line summary for the queue, so a row explains itself without being opened. */
export function onboardingSummary(progress: OnboardingProgress): string {
  if (progress.canComplete) {
    return progress.outstandingRecommended.length === 0
      ? "Everything on file."
      : `Ready to complete — ${progress.outstandingRecommended.length} optional item(s) outstanding.`
  }
  const missing = progress.outstandingRequired.map((item) => item.label)
  if (missing.length <= 2) return `Missing ${missing.join(" and ")}.`
  return `Missing ${missing.slice(0, 2).join(", ")} and ${missing.length - 2} more.`
}
