/**
 * Slice 9 — dedicated virtual accounts (DVA).
 *
 * Each student gets a permanent account number. A parent transfers whatever they choose,
 * whenever they choose, from any bank, so there is no checkout to fix the amount in
 * advance: the rules here decide what a transfer may be posted as once Paystack reports it.
 *
 * Pure, like the other payment rules, so they can be proved without a database.
 */

import { allocateAmount, type Allocation, type AllocatableCharge } from "@/lib/finance/payment-allocation"

export const DEDICATED_ACCOUNT_CHANNEL = "dedicated_nuban"

/** Paystack's own test bank; live accounts use a real partner bank. */
export const TEST_DEDICATED_BANK = "test-bank"
export const DEFAULT_LIVE_DEDICATED_BANK = "wema-bank"
export const LIVE_DEDICATED_BANKS = ["wema-bank", "titan-paystack"] as const

/**
 * Paystack keys a customer by email, so each student needs an address of its own. A
 * parent's email would merge siblings into one Paystack customer and one account.
 * The address is never shown to anyone and never needs to receive mail.
 */
export function dedicatedCustomerEmail(studentId: string, domain: string): string {
  const cleanDomain = domain.trim().toLowerCase().replace(/^@/, "")
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanDomain)) throw new Error("The dedicated-account email domain is not valid")
  const local = studentId.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!local) throw new Error("A student id is required")
  return `student-${local}@${cleanDomain}`
}

export function dedicatedCustomerDomain(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.PAYSTACK_DVA_EMAIL_DOMAIN?.trim()
  if (explicit) return explicit
  const origin = env.NEXTAUTH_URL?.trim()
  if (!origin) throw new Error("Set PAYSTACK_DVA_EMAIL_DOMAIN or NEXTAUTH_URL")
  const host = new URL(origin).hostname
  // localhost has no dot, which Paystack's email validation rejects.
  return host.includes(".") && host !== "127.0.0.1" ? `students.${host}` : "students.digischool.test"
}

export function dedicatedBankFor(environment: "TEST" | "LIVE", configured: string | null): string {
  if (environment === "TEST") return TEST_DEDICATED_BANK
  return configured && (LIVE_DEDICATED_BANKS as readonly string[]).includes(configured) ? configured : DEFAULT_LIVE_DEDICATED_BANK
}

/** Paystack wants a Nigerian number as 0XXXXXXXXXX or +234XXXXXXXXXX. */
export function normalizeNigerianPhone(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/[^\d+]/g, "")
  if (/^0[789][01]\d{8}$/.test(digits)) return digits
  if (/^\+234[789][01]\d{8}$/.test(digits)) return digits
  if (/^234[789][01]\d{8}$/.test(digits)) return `+${digits}`
  return null
}

export type DedicatedReadinessInput = {
  environment: "TEST" | "LIVE"
  isEnabled: boolean
  status: string
  verifiedAt: Date | null
  dedicatedAccountsEnabled: boolean
  accountMode: "PLATFORM_MANAGED" | "SCHOOL_OWNED"
  subaccountCode: string | null
  hasCredential: boolean
  liveApprovedAt: Date | null
}

export function dedicatedAccountReadinessProblems(input: DedicatedReadinessInput): string[] {
  const problems: string[] = []
  if (!input.isEnabled || input.status !== "READY" || !input.verifiedAt) {
    problems.push("Online payments must be connected and switched on first")
  }
  if (!input.dedicatedAccountsEnabled) problems.push("Dedicated accounts are switched off for this school")
  if (input.accountMode === "PLATFORM_MANAGED" && !input.subaccountCode) {
    problems.push("The school settlement subaccount is missing")
  }
  if (input.accountMode === "SCHOOL_OWNED" && !input.hasCredential) {
    problems.push("The school's Paystack credentials are missing")
  }
  if (input.environment === "LIVE" && !input.liveApprovedAt) {
    problems.push("DigiSchool has not yet approved this school for live payments")
  }
  return problems
}

/**
 * Which of the matching dedicated accounts a transfer was paid into.
 *
 * A student keeps one Paystack customer for life, so an account that was deactivated and
 * replaced shares its customer code with the new one. Picking either at random quarantined
 * a transfer into the new account as "a different receiving account". The receiving account
 * number is the exact answer; without it, the customer's active account, then its newest.
 */
export function pickDedicatedAccount<T extends { accountNumber: string; providerCustomerCode: string; status: string; createdAt: Date }>(
  candidates: T[],
  paidInto: { receiverAccountNumber: string | null; customerCode: string | null },
): T | null {
  if (paidInto.receiverAccountNumber) {
    const exact = candidates.find((account) => account.accountNumber === paidInto.receiverAccountNumber)
    if (exact) return exact
  }
  if (!paidInto.customerCode) return null
  const rank = (account: T) => (account.status === "ACTIVE" ? 0 : 1)
  return candidates
    .filter((account) => account.providerCustomerCode === paidInto.customerCode)
    .sort((a, b) => rank(a) - rank(b) || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
}

export type DedicatedTransferCheck = {
  expectedEnvironment: "test" | "live"
  accountMode: "PLATFORM_MANAGED" | "SCHOOL_OWNED"
  expectedSubaccountCode: string | null
  /** The school's dedicated-account split, when its accounts settle through one. */
  expectedSplitCode?: string | null
  /** The Paystack customer and account number of the dedicated account the webhook named. */
  expectedCustomerCode?: string | null
  expectedAccountNumber?: string | null
  verified: {
    status: string
    environment: "test" | "live"
    currency: string
    amountKobo: number
    channel?: string
    subaccountCode?: string
    splitCode?: string
    customerCode?: string
    receiverAccountNumber?: string
  }
}

/**
 * Paystack answers that mean "not finished yet", not "failed".
 *
 * A transfer verified while Paystack is still settling it must be tried again later. Treated
 * as a problem, it was quarantined and its event marked processed, which parked a real
 * payment for good with no way to resolve it in the app.
 */
const UNFINISHED_VERIFICATION = new Set(["pending", "ongoing", "processing", "queued"])

export function isUnfinishedVerification(status: string): boolean {
  return UNFINISHED_VERIFICATION.has(status.trim().toLowerCase())
}

/**
 * What stops a verified transfer being posted. Any problem quarantines it for review: the
 * money is real, so it is recorded, but it is not credited to a student until someone looks.
 */
export function dedicatedTransferProblems(input: DedicatedTransferCheck): string[] {
  const problems: string[] = []
  const { verified } = input
  if (verified.status !== "success") problems.push(`Paystack reports the transfer as ${verified.status}`)
  if (verified.environment !== input.expectedEnvironment) problems.push("The transfer belongs to a different Paystack environment")
  if (verified.currency !== "NGN") problems.push(`Unexpected currency ${verified.currency}`)
  if (!(verified.amountKobo > 0)) problems.push("The transfer amount is zero")
  if (verified.channel !== DEDICATED_ACCOUNT_CHANNEL) problems.push("The transaction is not a dedicated-account transfer")
  const throughOwnSplit = Boolean(input.expectedSplitCode) && verified.splitCode === input.expectedSplitCode
  const toOwnSubaccount = Boolean(input.expectedSubaccountCode) && verified.subaccountCode === input.expectedSubaccountCode
  if (input.accountMode === "PLATFORM_MANAGED" && !throughOwnSplit && !toOwnSubaccount) {
    problems.push("The transfer did not settle to this school's subaccount")
  }
  // The webhook says which account was paid; Paystack's verify says who actually paid. A
  // school holding its own signing secret could otherwise name another student's account
  // against a genuine reference and credit the wrong child. Only a value Paystack actually
  // returned is compared: a missing one is not evidence of anything.
  if (input.expectedCustomerCode && verified.customerCode && verified.customerCode !== input.expectedCustomerCode) {
    problems.push("Paystack attributes the transfer to a different customer than this dedicated account")
  }
  if (input.expectedAccountNumber && verified.receiverAccountNumber
    && verified.receiverAccountNumber !== input.expectedAccountNumber) {
    problems.push("Paystack reports a different receiving account than this dedicated account")
  }
  return problems
}

/**
 * Oldest charge first, as a cashier would; whatever is left after every charge is cleared
 * is returned as unapplied rather than forced onto a charge.
 */
export function splitDedicatedTransfer(
  chargesOldestFirst: AllocatableCharge[],
  amountNaira: number,
): { allocations: Allocation[]; unapplied: number } {
  const { allocations, unallocated } = allocateAmount(chargesOldestFirst, amountNaira)
  return { allocations, unapplied: unallocated }
}

/**
 * The school's share of its dedicated-account split, from the platform charge DigiSchool set.
 *
 * Paystack split shares are whole percentages, and a transfer's size is chosen by the parent,
 * so only a whole-number percentage can be carried over. A flat charge has no equivalent on
 * a variable transfer: DVA transfers then carry no platform charge, and the caller says so.
 */
export function dedicatedSplitShare(type: "NONE" | "FLAT" | "PERCENTAGE", value: number): {
  schoolShare: number
  platformPercent: number
  note: string | null
} {
  if (type === "PERCENTAGE") {
    if (!Number.isInteger(value) || value < 0 || value >= 100) {
      throw new Error("Schools with dedicated accounts need a whole-number platform percentage (for example 1, not 1.5)")
    }
    return { schoolShare: 100 - value, platformPercent: value, note: null }
  }
  return {
    schoolShare: 100,
    platformPercent: 0,
    note: type === "FLAT" ? "A flat platform charge cannot be taken from dedicated-account transfers, so they carry none." : null,
  }
}

/**
 * Whether held money may move, given the transfer it came from.
 *
 * While the payer disputes the transfer with their bank, the money may be taken back, so it
 * can be neither applied, returned nor refunded until the dispute closes. After a refund of
 * the receipted part the transfer reads REFUNDED, and its held part is still the school's to
 * decide on; a full chargeback closes the held money itself, so nothing is left to move.
 */
export function heldTransferProblem(transferStatus: string | null): string | null {
  if (transferStatus === null || transferStatus === "SUCCEEDED" || transferStatus === "REFUNDED") return null
  if (transferStatus === "DISPUTED") {
    return "The payer has disputed this transfer with their bank. The money cannot be moved until the dispute closes."
  }
  return `The transfer behind this money is ${transferStatus.toLowerCase().replaceAll("_", " ")}, so the money cannot be moved until that is resolved.`
}

/**
 * Whether this person may confirm that held money was returned to the payer.
 *
 * Returning money outside DigiSchool is a refund, and a refund takes two people: the one who
 * recorded the return cannot also be the one who closes it.
 */
export function heldReturnConfirmationProblems(input: {
  returnRequestedBy: string | null
  actorUserId: string
}): string[] {
  if (!input.returnRequestedBy) return ["Record how the money was returned before it can be confirmed"]
  if (input.returnRequestedBy === input.actorUserId) {
    return ["A different person must confirm a return you recorded"]
  }
  return []
}
