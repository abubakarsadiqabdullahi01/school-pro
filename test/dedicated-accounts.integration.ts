import { createHmac } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Slice 9 — dedicated accounts, from assignment through a signed webhook to the ledger,
 * against a real database. Paystack is replaced at the adapter boundary only: the webhook
 * inbox, signature check, event processor and ledger posting are the real ones.
 */

const context = vi.hoisted(() => ({ schoolId: "", userId: "dva-finance-user" }))
const provider = vi.hoisted(() => ({
  createCustomer: vi.fn(),
  createDedicatedAccount: vi.fn(),
  verifyPayment: vi.fn(),
  deactivateDedicatedAccount: vi.fn(),
  createSplit: vi.fn(async () => ({ splitId: "4896895", splitCode: "SPL_dvaschool" })),
  updateSplitShare: vi.fn(),
  validateCustomer: vi.fn(),
  createRefund: vi.fn(),
  retryRefundWithCustomerDetails: vi.fn(),
  listBanks: vi.fn(async () => [{ id: 9, code: "058", name: "Guaranty Trust Bank" }]),
  resolveBankAccount: vi.fn(async (accountNumber: string, bankCode: string) => ({ accountNumber, accountName: "ADEBAYO OKONKWO", bankCode })),
  listSettlements: vi.fn(async () => []),
  listSettlementTransactions: vi.fn(async () => []),
}))

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }))
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/authz", () => ({
  requirePermission: async () => ({ userId: context.userId, role: "ADMIN", name: "DVA Test", schoolId: context.schoolId, teacherId: null }),
  requireActor: async () => ({ userId: context.userId, role: "ADMIN", name: "DVA Test", schoolId: context.schoolId, teacherId: null }),
  requireRole: async () => ({ userId: "platform-owner", role: "SUPER_ADMIN", name: "Platform Owner", schoolId: null, teacherId: null }),
}))
vi.mock("@/lib/payments/payment-settings.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/payment-settings.server")>()),
  adapterForPaymentConfiguration: async () => provider,
}))

const { prisma } = await import("@/lib/db")
const { acceptPaystackWebhook } = await import("@/lib/payments/webhook-inbox.server")
const { processGatewayEvent } = await import("@/lib/payments/gateway-event-processor.server")
const {
  applyUnappliedPayment,
  assignDedicatedAccount,
  assignMissingDedicatedAccounts,
  confirmUnappliedReturn,
  getUnappliedPayments,
  moveAppliedMoneyBackToHeld,
  requestDedicatedIdentification,
  requestUnappliedReturn,
  withdrawUnappliedReturn,
} = await import("@/app/actions/dedicated-accounts")
const { approveGatewayRefund, confirmRefundBankDetails, provideRefundBankDetails, requestUnappliedRefund } = await import("@/app/actions/gateway-operations-slice7")
const { choosePaymentGatewayMode, setPlatformCharge } = await import("@/app/actions/payment-settings")
const { requestStudentPaymentRefund: refundStudentPayment } = await import("@/app/actions/finance")
const { retryParkedGatewayEvent, settleParkedGatewayEvent } = await import("@/app/actions/payment-pilot")
const { collectPaymentHealth } = await import("@/lib/payments/payment-health.server")

const SECRET = "sk_test_dedicated_account_integration"
const stamp = `ZZDva-${Date.now()}`
const ACCOUNT_NUMBER = String(Date.now()).slice(-10).padStart(10, "7")
let schoolId = ""
let studentId = ""
let secondStudentId = ""
let parentUserId = ""
let olderChargeId = ""
let newerChargeId = ""
let sessionId = ""
let newerTermId = ""
let feeScheduleId = ""
let eventCounter = 0
// Keyed by reference: a replayed transfer is recognised before Paystack is asked, so a
// queue of one-shot answers would hand the next transfer the wrong verification.
const verifications = new Map<string, unknown>()
provider.verifyPayment.mockImplementation(async (reference: string) => verifications.get(reference))

async function cleanupSchool(id: string) {
  const profiles = await prisma.school.findUnique({
    where: { id },
    select: { parents: { select: { userId: true } }, students: { select: { userId: true } } },
  })
  const ids = [...(profiles?.parents ?? []), ...(profiles?.students ?? [])].map((profile) => profile.userId)
  await prisma.gatewayEvent.deleteMany({ where: { OR: [{ schoolId: id }, { reference: { startsWith: "ZZDva-" } }] } })
  await prisma.notificationOutbox.deleteMany({ where: { schoolId: id } })
  await prisma.gatewayRefund.deleteMany({ where: { schoolId: id } })
  await prisma.dedicatedCustomerIdentification.deleteMany({ where: { schoolId: id } })
  await prisma.unappliedPayment.deleteMany({ where: { schoolId: id } })
  await prisma.gatewayTransaction.deleteMany({ where: { schoolId: id } })
  await prisma.dedicatedAccount.deleteMany({ where: { schoolId: id } })
  await prisma.accountingReversal.deleteMany({ where: { schoolId: id } })
  await prisma.counterRefundRequest.deleteMany({ where: { schoolId: id } })
  await prisma.payment.deleteMany({ where: { schoolId: id } })
  await prisma.studentCharge.deleteMany({ where: { schoolId: id } })
  await prisma.feeSchedule.deleteMany({ where: { schoolId: id } })
  await prisma.feeCategory.deleteMany({ where: { schoolId: id } })
  await prisma.school.deleteMany({ where: { id } })
  await prisma.credential.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}

async function makeStudent(suffix: string) {
  const user = await prisma.user.create({
    data: {
      firstName: suffix, lastName: "Pupil", role: "STUDENT",
      credentials: { create: { type: "REGISTRATION_NUMBER", value: `${stamp}-${suffix}`, passwordHash: "test" } },
      student: { create: { schoolId, admissionNo: `${stamp}-${suffix}` } },
    },
  })
  return prisma.student.findUniqueOrThrow({ where: { userId: user.id } })
}

beforeAll(async () => {
  for (const stale of await prisma.school.findMany({ where: { name: { startsWith: "ZZDva-" } }, select: { id: true } })) {
    await cleanupSchool(stale.id)
  }
  const school = await prisma.school.create({
    data: { name: stamp, code: stamp.slice(0, 50), address: "Integration test", phone: "08000000000", email: `${stamp.toLowerCase()}@example.test` },
  })
  schoolId = school.id
  context.schoolId = schoolId

  const parentUser = await prisma.user.create({
    data: {
      firstName: "Transfer", lastName: "Parent", role: "PARENT", phone: "0803 555 0101",
      credentials: { create: { type: "EMAIL", value: `${stamp.toLowerCase()}-parent@example.test`, passwordHash: "test" } },
      parent: { create: { schoolId } },
    },
  })
  parentUserId = parentUser.id
  // Receipts record who applied held money, so the finance actor must be a real user.
  context.userId = (await prisma.user.create({
    data: { firstName: "Finance", lastName: "Officer", role: "ADMIN" },
  })).id
  const parent = await prisma.parent.findUniqueOrThrow({ where: { userId: parentUser.id } })
  const student = await makeStudent("Ada")
  const second = await makeStudent("Bola")
  studentId = student.id
  secondStudentId = second.id
  await prisma.studentParent.create({ data: { parentId: parent.id, studentId, relationship: "Parent" } })

  const session = await prisma.session.create({ data: { schoolId, name: `${stamp} Session`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } })
  sessionId = session.id
  const older = await prisma.term.create({ data: { sessionId, name: `${stamp} First`, startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") } })
  const newer = await prisma.term.create({ data: { sessionId, name: `${stamp} Second`, startDate: new Date("2026-05-01"), endDate: new Date("2026-08-01"), isCurrent: true } })
  newerTermId = newer.id
  const category = await prisma.feeCategory.create({ data: { schoolId, name: `${stamp} Category` } })
  const olderSchedule = await prisma.feeSchedule.create({ data: { schoolId, sessionId, termId: older.id, categoryId: category.id, name: `${stamp} First Tuition`, amount: 30000 } })
  const newerSchedule = await prisma.feeSchedule.create({ data: { schoolId, sessionId, termId: newer.id, categoryId: category.id, name: `${stamp} Second Tuition`, amount: 20000 } })
  // Billed later, in the "apply held money" test.
  feeScheduleId = (await prisma.feeSchedule.create({ data: { schoolId, sessionId, termId: newer.id, categoryId: category.id, name: `${stamp} Excursion`, amount: 10000 } })).id
  // Created newest-first on purpose: allocation must follow the term, not insertion order.
  const newerCharge = await prisma.studentCharge.create({
    data: { schoolId, studentId, sessionId, termId: newer.id, feeScheduleId: newerSchedule.id, originalAmount: 20000, finalAmountDue: 20000, balance: 20000 },
  })
  const olderCharge = await prisma.studentCharge.create({
    data: { schoolId, studentId, sessionId, termId: older.id, feeScheduleId: olderSchedule.id, originalAmount: 30000, finalAmountDue: 30000, balance: 30000 },
  })
  olderChargeId = olderCharge.id
  newerChargeId = newerCharge.id

  await prisma.schoolPaymentConfiguration.create({
    data: {
      schoolId, environment: "TEST", accountMode: "PLATFORM_MANAGED", feePolicy: "SCHOOL_PAYS", status: "READY", isEnabled: true,
      subaccountCode: "ACCT_dva_school", allowedChannels: ["card", "bank_transfer"], verifiedAt: new Date(),
      dedicatedAccountsEnabled: true,
    },
  })

  provider.createCustomer.mockImplementation(async (input: { email: string }) => ({ customerCode: `CUS_${stamp.replace(/[^A-Za-z0-9]/g, "")}`, email: input.email }))
  provider.createDedicatedAccount.mockImplementation(async (input: { customerCode: string }) => ({
    providerAccountId: String(Date.now()), accountNumber: ACCOUNT_NUMBER, accountName: "DIGISCHOOL/ADA PUPIL",
    bankName: "Test Bank", bankSlug: "test-bank", customerCode: input.customerCode, active: true,
  }))
})

afterAll(async () => {
  if (schoolId) await cleanupSchool(schoolId)
  await prisma.user.deleteMany({ where: { id: context.userId } })
})

/** Sends a signed dedicated-account transfer through the real inbox and processor. */
async function transfer(amountNaira: number, options: {
  reference?: string
  subaccountCode?: string
  splitCode?: string
  accountNumber?: string
  /** What Paystack's verify answers; "success" unless a test says otherwise. */
  verifyStatus?: string
  /** The payer Paystack's verify names; omitted, as some real responses omit it. */
  verifiedCustomerCode?: string
  /** The receiving account Paystack's verify names; omitted unless a test sets it. */
  verifiedReceiverAccount?: string
  /** A webhook naming only the customer, not the account paid into. */
  omitReceiverAccount?: boolean
} = {}) {
  eventCounter += 1
  const reference = options.reference ?? `${stamp}-T${eventCounter}`
  const body = Buffer.from(JSON.stringify({
    id: `${stamp}-E${eventCounter}`,
    event: "charge.success",
    data: {
      id: 900000 + eventCounter, domain: "test", status: "success", reference, amount: amountNaira * 100, currency: "NGN",
      channel: "dedicated_nuban", paid_at: new Date().toISOString(),
      customer: { customer_code: options.accountNumber ? "CUS_unknown" : `CUS_${stamp.replace(/[^A-Za-z0-9]/g, "")}` },
      authorization: {
        ...(options.omitReceiverAccount ? {} : { receiver_bank_account_number: options.accountNumber ?? ACCOUNT_NUMBER }),
        sender_name: "ADEBAYO OKONKWO", sender_bank: "Kuda Bank",
      },
    },
  }))
  const signature = createHmac("sha512", SECRET).update(body).digest("hex")
  verifications.set(reference, {
    providerTransactionId: String(900000 + eventCounter), reference, environment: "test", status: options.verifyStatus ?? "success", currency: "NGN",
    amountKobo: amountNaira * 100, requestedAmountKobo: amountNaira * 100, feesKobo: 5000, channel: "dedicated_nuban",
    subaccountCode: options.splitCode ? undefined : options.subaccountCode ?? "ACCT_dva_school", splitCode: options.splitCode, paidAt: new Date(),
    customerCode: options.verifiedCustomerCode,
    receiverAccountNumber: options.verifiedReceiverAccount,
  })
  const accepted = await acceptPaystackWebhook(body, signature, { secretKey: SECRET, environment: "TEST" })
  return { reference, accepted, result: await processGatewayEvent(accepted.eventId) }
}

async function balances() {
  const charges = await prisma.studentCharge.findMany({ where: { id: { in: [olderChargeId, newerChargeId] } }, select: { id: true, balance: true } })
  const byId = new Map(charges.map((charge) => [charge.id, charge.balance.toNumber()]))
  return { older: byId.get(olderChargeId), newer: byId.get(newerChargeId) }
}

describe("assigning dedicated accounts", () => {
  it("creates one account per student, settling to the school's subaccount", async () => {
    const result = await assignDedicatedAccount({ studentId })
    expect(result).toEqual({ success: true, data: { accountNumber: ACCOUNT_NUMBER, bankName: "Test Bank" } })
    expect(provider.createCustomer).toHaveBeenCalledWith(expect.objectContaining({
      email: expect.stringMatching(/^student-[a-z0-9]+@students\./), phone: "08035550101", firstName: "Ada",
    }))
    // Through a split, so the school's subaccount bears Paystack's fee.
    expect(provider.createSplit).toHaveBeenCalledWith(expect.objectContaining({ subaccountCode: "ACCT_dva_school", subaccountShare: 100 }))
    expect(provider.createDedicatedAccount).toHaveBeenCalledWith(expect.objectContaining({ preferredBank: "test-bank", splitCode: "SPL_dvaschool" }))
  })

  it("does not call Paystack again for a student who already has one", async () => {
    provider.createCustomer.mockClear()
    expect(await assignDedicatedAccount({ studentId })).toMatchObject({ success: true })
    expect(provider.createCustomer).not.toHaveBeenCalled()
  })

  it("reports a student whose parent has no usable phone instead of stopping the batch", async () => {
    const result = await assignMissingDedicatedAccounts()
    expect(result).toMatchObject({ success: true, data: { created: 0, remaining: 1 } })
    if (result.success) expect(result.data.failures[0]?.error).toMatch(/phone number to a parent of Bola Pupil/)
    expect(await prisma.dedicatedAccount.count({ where: { studentId: secondStudentId } })).toBe(0)
  })
})

describe("transfers into a dedicated account", () => {
  it("resolves the school from the account and pays the oldest charge first", async () => {
    const { accepted, result, reference } = await transfer(35000)
    expect(result).toBe("processed")
    expect((await prisma.gatewayEvent.findUniqueOrThrow({ where: { id: accepted.eventId } })).schoolId).toBe(schoolId)
    expect(await balances()).toEqual({ older: 0, newer: 15000 })

    const recorded = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } }, include: { payment: true } })
    expect(recorded).toMatchObject({ source: "DEDICATED_ACCOUNT", status: "SUCCEEDED", senderName: "ADEBAYO OKONKWO", senderBank: "Kuda Bank" })
    expect(recorded.payment?.amount.toNumber()).toBe(35000)
    // The school's receipt, once by email and once by SMS.
    expect(await prisma.notificationOutbox.count({ where: { schoolId, recipientUserId: parentUserId, channel: "EMAIL" } })).toBe(1)
    expect(await prisma.notificationOutbox.count({ where: { schoolId, recipientUserId: parentUserId, channel: "SMS" } })).toBe(1)
  })

  it("posts nothing twice when Paystack sends the same transfer again", async () => {
    const reference = `${stamp}-replayed`
    expect((await transfer(1000, { reference })).result).toBe("processed")
    const again = await transfer(1000, { reference })
    expect(again.result).toBe("already_processed")
    expect(await prisma.payment.count({ where: { schoolId, referenceNo: reference } })).toBe(1)
    expect(await balances()).toEqual({ older: 0, newer: 14000 })
  })

  it("holds money beyond what is owed for the bursar", async () => {
    const { reference } = await transfer(20000)
    expect(await balances()).toEqual({ older: 0, newer: 0 })
    const held = await getUnappliedPayments()
    expect(held.success).toBe(true)
    if (!held.success) return
    expect(held.data).toHaveLength(1)
    expect(held.data[0]).toMatchObject({ amount: "6000.00", reference, owingNow: "0.00", senderName: "ADEBAYO OKONKWO" })
  })

  it("applies held money only once there is enough owing to take it", async () => {
    const held = await getUnappliedPayments()
    if (!held.success) throw new Error(held.error)
    const id = held.data[0]!.id
    expect(await applyUnappliedPayment({ id, confirmation: true })).toMatchObject({ success: false, error: expect.stringMatching(/owes ₦0.00/) })

    await prisma.studentCharge.create({
      data: { schoolId, studentId, sessionId, termId: newerTermId, feeScheduleId, originalAmount: 10000, finalAmountDue: 10000, balance: 10000 },
    })
    const applied = await applyUnappliedPayment({ id, confirmation: true })
    expect(applied).toMatchObject({ success: true })
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "APPLIED" })
    expect(await applyUnappliedPayment({ id, confirmation: true })).toMatchObject({ success: false })
  })

  it("returns held money outside DigiSchool only once a second person confirms it", async () => {
    await transfer(9000)
    const held = await getUnappliedPayments()
    if (!held.success) throw new Error(held.error)
    const [row] = held.data
    expect(row?.amount).toBe("5000.00")
    const recorder = context.userId
    expect(await requestUnappliedReturn({ id: row!.id, note: "Refunded by bank transfer from the school account", confirmation: true }))
      .toEqual({ success: true, data: undefined })

    // Still held, and visibly waiting, until someone else confirms.
    const waiting = await getUnappliedPayments()
    expect(waiting.success && waiting.data[0]).toMatchObject({ id: row!.id, returnRequest: { byMe: true } })
    const requestedAt = waiting.success ? waiting.data[0]!.returnRequest!.at! : ""
    // Nothing else may happen to the money meanwhile.
    expect(await applyUnappliedPayment({ id: row!.id, confirmation: true }))
      .toMatchObject({ success: false, error: expect.stringMatching(/waiting for confirmation/) })
    expect(await requestUnappliedRefund({ unappliedId: row!.id, reason: "Parent asked for it back", confirmation: true }))
      .toMatchObject({ success: false, error: expect.stringMatching(/waiting for confirmation/) })
    // The person who recorded it cannot close it.
    expect(await confirmUnappliedReturn({ id: row!.id, requestedAt, confirmation: true }))
      .toEqual({ success: false, error: "A different person must confirm a return you recorded" })

    const confirmer = await secondPerson()
    try {
      context.userId = confirmer
      expect(await confirmUnappliedReturn({ id: row!.id, requestedAt, confirmation: true })).toEqual({ success: true, data: undefined })
    } finally {
      context.userId = recorder
    }
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: row!.id } }))
      .toMatchObject({ status: "RETURNED", resolvedBy: confirmer, returnRequestedBy: recorder })
    const open = await getUnappliedPayments()
    expect(open.success && open.data).toEqual([])
    await prisma.user.deleteMany({ where: { id: confirmer } })
  })

  it("quarantines a transfer that settled to the wrong subaccount", async () => {
    const before = await prisma.payment.count({ where: { schoolId } })
    const { reference, result } = await transfer(5000, { subaccountCode: "ACCT_someone_else" })
    expect(result).toBe("processed")
    expect(await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } } }))
      .toMatchObject({ status: "REQUIRES_REVIEW", paymentId: null, failureMessage: "The transfer did not settle to this school's subaccount" })
    expect(await prisma.payment.count({ where: { schoolId } })).toBe(before)
  })

  it("fails loudly, and keeps retrying, when no account matches", async () => {
    const { accepted, result } = await transfer(5000, { accountNumber: "0000000001" })
    expect(result).toBe("failed")
    expect(await prisma.gatewayEvent.findUniqueOrThrow({ where: { id: accepted.eventId } }))
      .toMatchObject({ status: "FAILED", lastError: "No dedicated account matched this transfer" })
  })
})


/** A second, real user: refunds need two different people. */
async function secondPerson() {
  const user = await prisma.user.create({ data: { firstName: "Second", lastName: "Approver", role: "ADMIN" } })
  return user.id
}

async function signedEvent(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload))
  const accepted = await acceptPaystackWebhook(body, createHmac("sha512", SECRET).update(body).digest("hex"), { secretKey: SECRET, environment: "TEST" })
  return { accepted, result: await processGatewayEvent(accepted.eventId) }
}

describe("closing the dedicated-account gaps", () => {
  let approverId = ""
  let requesterId = ""
  beforeAll(async () => {
    requesterId = context.userId
    approverId = await secondPerson()
  })
  afterAll(async () => {
    context.userId = requesterId
    await prisma.user.deleteMany({ where: { id: approverId } })
  })

  it("accepts a transfer that settled through the school's split", async () => {
    const { result, reference } = await transfer(1000, { splitCode: "SPL_dvaschool" })
    expect(result).toBe("processed")
    expect(await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } } }))
      .toMatchObject({ status: "SUCCEEDED" })
  })

  it("keeps the split's share in step with the platform percentage, whole numbers only", async () => {
    const configuration = await prisma.schoolPaymentConfiguration.findFirstOrThrow({ where: { schoolId, environment: "TEST" } })
    expect(await setPlatformCharge({ configurationId: configuration.id, type: "PERCENTAGE", value: 2 })).toMatchObject({ success: true })
    expect(provider.updateSplitShare).toHaveBeenCalledWith("4896895", "ACCT_dva_school", 98)
    expect(await setPlatformCharge({ configurationId: configuration.id, type: "PERCENTAGE", value: 1.5 }))
      .toMatchObject({ success: false, error: expect.stringMatching(/whole-number/) })
    expect((await prisma.schoolPaymentConfiguration.findUniqueOrThrow({ where: { id: configuration.id } })).platformChargeValue.toNumber()).toBe(2)
  })

  it("refunds held money through Paystack with two people, without reversing any receipt", async () => {
    // Nothing is owed now, so the whole transfer is held.
    const { reference } = await transfer(4000)
    const held = await prisma.unappliedPayment.findFirstOrThrow({ where: { gatewayTransaction: { reference } } })
    const paymentsBefore = await prisma.payment.count({ where: { schoolId, status: "COMPLETED" } })

    context.userId = requesterId
    const requested = await requestUnappliedRefund({ unappliedId: held.id, reason: "Parent sent money by mistake", confirmation: true })
    expect(requested).toMatchObject({ success: true, data: { status: "REQUESTED" } })
    if (!requested.success) return
    expect(await applyUnappliedPayment({ id: held.id, confirmation: true })).toMatchObject({ success: false, error: "A refund of this money is in progress" })
    expect(await approveGatewayRefund({ refundId: requested.data.refundId, confirmation: true })).toMatchObject({ success: false })

    context.userId = approverId
    provider.createRefund.mockResolvedValueOnce({ providerRefundId: "5551234", status: "needs-attention", amountKobo: 400000, currency: "NGN" })
    expect(await approveGatewayRefund({ refundId: requested.data.refundId, confirmation: true })).toMatchObject({ success: true, data: { status: "NEEDS_ATTENTION" } })
    expect(provider.createRefund).toHaveBeenCalledWith(reference, 400000, "Parent sent money by mistake")

    // Paystack needs the payer's bank account for a transfer refund. Where the money goes
    // takes two people: one enters the account and Paystack names its holder...
    expect(await provideRefundBankDetails({ refundId: requested.data.refundId, accountNumber: "0123456789", bankId: "9", bankCode: "058", confirmation: true }))
      .toEqual({ success: true, data: { status: "AWAITING_CONFIRMATION", accountName: "ADEBAYO OKONKWO" } })
    expect(provider.retryRefundWithCustomerDetails).not.toHaveBeenCalled()
    const { payoutEnteredAt } = await prisma.gatewayRefund.findUniqueOrThrow({ where: { id: requested.data.refundId } })
    const enteredAt = payoutEnteredAt!.toISOString()
    // ...who cannot also confirm it...
    expect(await confirmRefundBankDetails({ refundId: requested.data.refundId, enteredAt, confirmation: true }))
      .toEqual({ success: false, error: "A different person must confirm an account you entered" })
    // ...and a different person's confirmation is what sends it.
    context.userId = requesterId
    expect(await confirmRefundBankDetails({ refundId: requested.data.refundId, enteredAt, confirmation: true }))
      .toEqual({ success: true, data: { status: "PENDING" } })
    expect(provider.retryRefundWithCustomerDetails).toHaveBeenCalledWith("5551234", "0123456789", "9")
    expect(await prisma.gatewayRefund.findUniqueOrThrow({ where: { id: requested.data.refundId } }))
      .toMatchObject({ status: "PENDING", payoutAccountNumber: "******6789", payoutAccountName: "ADEBAYO OKONKWO", payoutEnteredBy: approverId, payoutConfirmedBy: requesterId })

    const { result } = await signedEvent({ event: "refund.processed", data: { id: 5551234, domain: "test", status: "processed", transaction_reference: reference, amount: 400000, currency: "NGN" } })
    expect(result).toBe("processed")
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({ status: "RETURNED" })
    expect(await prisma.gatewayRefund.findUniqueOrThrow({ where: { id: requested.data.refundId } })).toMatchObject({ status: "PROCESSED" })
    expect(await prisma.payment.count({ where: { schoolId, status: "COMPLETED" } })).toBe(paymentsBefore)
    context.userId = requesterId
  })

  it("identifies the payer through Paystack, then creates the account when Paystack confirms", async () => {
    const configuration = await prisma.schoolPaymentConfiguration.findFirstOrThrow({ where: { schoolId, environment: "TEST" } })
    await prisma.schoolPaymentConfiguration.update({ where: { id: configuration.id }, data: { dedicatedRequiresIdentification: true } })
    // Give Bola a parent with a phone.
    const parent = await prisma.parent.findFirstOrThrow({ where: { userId: parentUserId } })
    await prisma.studentParent.create({ data: { parentId: parent.id, studentId: secondStudentId, relationship: "Parent" } })

    expect(await assignDedicatedAccount({ studentId: secondStudentId }))
      .toMatchObject({ success: false, error: expect.stringMatching(/Verify the payer's identity/) })

    const customerCode = "CUS_bolaidentified"
    provider.createCustomer.mockResolvedValueOnce({ customerCode, email: "x@students.digischool.test" })
    const identify = { studentId: secondStudentId, firstName: "Transfer", lastName: "Parent", bvn: "22212345678", bankCode: "058", accountNumber: "0123456789", consent: true }
    expect(await requestDedicatedIdentification(identify)).toEqual({ success: true, data: { status: "PENDING" } })
    expect(provider.validateCustomer).toHaveBeenCalledWith(customerCode, expect.objectContaining({ bvn: "22212345678" }))
    // No BVN or account number is stored.
    const row = await prisma.dedicatedCustomerIdentification.findFirstOrThrow({ where: { studentId: secondStudentId } })
    expect(JSON.stringify(row)).not.toContain("22212345678")

    provider.createDedicatedAccount.mockResolvedValueOnce({
      providerAccountId: "777001", accountNumber: "9930000999", accountName: "DIGISCHOOL/TRANSFER PARENT",
      bankName: "Test Bank", bankSlug: "test-bank", customerCode, active: true,
    })
    // Paystack's identification events carry no domain; the signing secret decides.
    const { result, accepted } = await signedEvent({ event: "customeridentification.success", data: { customer_id: "1", customer_code: customerCode, email: "x@students.digischool.test", identification: { country: "NG", type: "bank_account" } } })
    expect(result).toBe("processed")
    expect((await prisma.gatewayEvent.findUniqueOrThrow({ where: { id: accepted.eventId } })).schoolId).toBe(schoolId)
    expect(await prisma.dedicatedCustomerIdentification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "SUCCEEDED" })
    expect(await prisma.dedicatedAccount.findFirstOrThrow({ where: { studentId: secondStudentId } }))
      .toMatchObject({ accountNumber: "9930000999", providerCustomerCode: customerCode })
  })

  it("records Paystack's reason when identification fails", async () => {
    const third = await makeStudent("Chidi")
    const parent = await prisma.parent.findFirstOrThrow({ where: { userId: parentUserId } })
    await prisma.studentParent.create({ data: { parentId: parent.id, studentId: third.id, relationship: "Parent" } })
    provider.createCustomer.mockResolvedValueOnce({ customerCode: "CUS_chidifails", email: "y@students.digischool.test" })
    await requestDedicatedIdentification({ studentId: third.id, firstName: "Transfer", lastName: "Parent", bvn: "22212345679", bankCode: "058", accountNumber: "0123456780", consent: true })
    await signedEvent({ event: "customeridentification.failed", data: { customer_id: 2, customer_code: "CUS_chidifails", email: "y@students.digischool.test", reason: "Account number or BVN is incorrect" } })
    expect(await prisma.dedicatedCustomerIdentification.findFirstOrThrow({ where: { studentId: third.id } }))
      .toMatchObject({ status: "FAILED", failureReason: "Account number or BVN is incorrect" })
    expect(await prisma.dedicatedAccount.count({ where: { studentId: third.id } })).toBe(0)
  })
})

describe("hardening found by the September audit", () => {
  it("leaves a held transfer alone when Paystack delivers it again with different bytes", async () => {
    // Nothing is owed by now, so this transfer is held in full: SUCCEEDED, no receipt.
    const { reference } = await transfer(2500)
    const recorded = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } } })
    expect(recorded).toMatchObject({ status: "SUCCEEDED", paymentId: null })

    // A fresh event id changes the bytes, so the payload-hash dedupe cannot catch it.
    const again = await transfer(2500, { reference })
    expect(again.result).toBe("already_processed")
    expect(await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: recorded.id } }))
      .toMatchObject({ status: "SUCCEEDED", failureMessage: null })
    expect(await prisma.unappliedPayment.count({ where: { gatewayTransactionId: recorded.id } })).toBe(1)
  })

  it("tries again later when Paystack has not finished the transfer, instead of parking it", async () => {
    const { reference, accepted, result } = await transfer(1500, { verifyStatus: "pending" })
    expect(result).toBe("failed")
    expect(await prisma.gatewayEvent.findUniqueOrThrow({ where: { id: accepted.eventId } }))
      .toMatchObject({ status: "FAILED", lastError: expect.stringMatching(/not finished this transfer yet/) })
    // Nothing recorded, so the retry starts clean.
    expect(await prisma.gatewayTransaction.count({ where: { reference } })).toBe(0)
  })

  it("quarantines a transfer Paystack attributes to a different customer", async () => {
    const before = await prisma.payment.count({ where: { schoolId } })
    const { reference, result } = await transfer(2000, { verifiedCustomerCode: "CUS_another_family" })
    expect(result).toBe("processed")
    expect(await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } } }))
      .toMatchObject({ status: "REQUIRES_REVIEW", paymentId: null, failureMessage: expect.stringMatching(/different customer/) })
    expect(await prisma.payment.count({ where: { schoolId } })).toBe(before)
    expect(await prisma.unappliedPayment.count({ where: { gatewayTransaction: { reference } } })).toBe(0)
  })

  it("will not reverse at the counter a receipt made from held transfer money", async () => {
    const applied = await prisma.unappliedPayment.findFirstOrThrow({ where: { schoolId, status: "APPLIED", appliedPaymentId: { not: null } } })
    const result = await refundStudentPayment({ paymentId: applied.appliedPaymentId, reason: "Testing the counter refund guard" })
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/bank transfer into a dedicated account/) })
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: applied.appliedPaymentId! } })).toMatchObject({ status: "COMPLETED" })
  })

  it("refuses to go offline or switch Paystack mode while dedicated accounts are live", async () => {
    const live = await prisma.dedicatedAccount.count({ where: { schoolId, environment: "TEST", status: "ACTIVE" } })
    expect(live).toBeGreaterThan(0)
    for (const mode of ["OFFLINE", "SCHOOL_OWNED"] as const) {
      expect(await choosePaymentGatewayMode({ environment: "TEST", mode }))
        .toMatchObject({ success: false, error: expect.stringMatching(/still active\. Deactivate them/) })
    }
    expect(await prisma.schoolPaymentConfiguration.findFirstOrThrow({ where: { schoolId, environment: "TEST" } }))
      .toMatchObject({ status: "READY", accountMode: "PLATFORM_MANAGED", isEnabled: true })
  })
})

describe("fixes from the second review", () => {
  let other = ""
  let third = ""
  beforeAll(async () => {
    other = await secondPerson()
    third = await secondPerson()
  })
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [other, third] } } })
  })

  async function heldTransfer(amountNaira: number) {
    // Nothing is owed by now, so the whole transfer is held.
    const { reference } = await transfer(amountNaira)
    return prisma.unappliedPayment.findFirstOrThrow({ where: { gatewayTransaction: { reference } } })
  }

  async function as<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const previous = context.userId
    context.userId = userId
    try {
      return await work()
    } finally {
      context.userId = previous
    }
  }

  it("credits a transfer into a student's replacement account, not the old one that shares its customer", async () => {
    const current = await prisma.dedicatedAccount.findFirstOrThrow({ where: { studentId, status: "ACTIVE" } })
    // The student's earlier account: same Paystack customer, closed, a different number.
    const old = await prisma.dedicatedAccount.create({
      data: {
        schoolId, studentId, configurationId: current.configurationId, environment: "TEST", status: "DEACTIVATED",
        providerCustomerCode: current.providerCustomerCode, providerAccountId: `${stamp}-old`, customerEmail: current.customerEmail,
        accountNumber: String(Number(ACCOUNT_NUMBER) - 1).padStart(10, "0"), accountName: current.accountName, bankName: current.bankName,
        createdBy: context.userId, createdAt: new Date("2025-01-01"), deactivatedAt: new Date("2025-06-01"),
      },
    })
    try {
      // Named by account number, and by customer alone: both land on the current account.
      for (const omitReceiverAccount of [false, true]) {
        const { reference, result } = await transfer(700, {
          omitReceiverAccount, verifiedCustomerCode: current.providerCustomerCode, verifiedReceiverAccount: ACCOUNT_NUMBER,
        })
        expect(result).toBe("processed")
        expect(await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } } }))
          .toMatchObject({ status: "SUCCEEDED", dedicatedAccountId: current.id, failureMessage: null })
      }
    } finally {
      await prisma.gatewayTransaction.updateMany({ where: { dedicatedAccountId: old.id }, data: { dedicatedAccountId: null } })
      await prisma.dedicatedAccount.delete({ where: { id: old.id } })
    }
  })

  it("will not record a return while a Paystack refund of the same money is live, nor send the refund while a return waits", async () => {
    const held = await heldTransfer(1200)
    const requested = await requestUnappliedRefund({ unappliedId: held.id, reason: "Parent asked for it back", confirmation: true })
    expect(requested).toMatchObject({ success: true })
    if (!requested.success) return
    expect(await requestUnappliedReturn({ id: held.id, note: "Returned from the school account", confirmation: true }))
      .toMatchObject({ success: false, error: "A refund of this money is in progress" })

    // What a race between the two requests used to leave behind: both live at once.
    await prisma.unappliedPayment.update({ where: { id: held.id }, data: { returnRequestedBy: other, returnRequestedAt: new Date(), resolutionNote: "Returned from the school account" } })
    provider.createRefund.mockClear()
    expect(await as(third, () => approveGatewayRefund({ refundId: requested.data.refundId, confirmation: true })))
      .toMatchObject({ success: false, error: expect.stringMatching(/waiting for confirmation/) })
    expect(provider.createRefund).not.toHaveBeenCalled()
    const at = (await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } })).returnRequestedAt!.toISOString()
    expect(await as(third, () => confirmUnappliedReturn({ id: held.id, requestedAt: at, confirmation: true })))
      .toMatchObject({ success: false, error: expect.stringMatching(/Paystack refund of this money is also in progress/) })
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({ status: "OPEN" })
    expect(await prisma.gatewayRefund.findUniqueOrThrow({ where: { id: requested.data.refundId } })).toMatchObject({ status: "REQUESTED", approvedAt: null })
  })

  it("serializes a return and a refund requested at the same moment: exactly one wins", async () => {
    const held = await heldTransfer(1300)
    const [returned, refunded] = await Promise.all([
      requestUnappliedReturn({ id: held.id, note: "Returned from the school account", confirmation: true }),
      requestUnappliedRefund({ unappliedId: held.id, reason: "Parent asked for it back", confirmation: true }),
    ])
    expect([returned.success, refunded.success].filter(Boolean)).toHaveLength(1)
    const row = await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id }, include: { refund: true } })
    expect(Boolean(row.returnRequestedBy) && Boolean(row.refund)).toBe(false)
  })

  it("confirms only the return the confirmer was shown", async () => {
    const held = await heldTransfer(1400)
    expect(await requestUnappliedReturn({ id: held.id, note: "Returned by transfer on Monday", confirmation: true })).toMatchObject({ success: true })
    const first = (await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } })).returnRequestedAt!.toISOString()
    expect(await withdrawUnappliedReturn({ id: held.id, confirmation: true })).toEqual({ success: true, data: undefined })
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } }))
      .toMatchObject({ status: "OPEN", returnRequestedBy: null, returnRequestedAt: null, resolutionNote: null })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(await requestUnappliedReturn({ id: held.id, note: "Handed back in cash instead", confirmation: true })).toMatchObject({ success: true })

    expect(await as(other, () => confirmUnappliedReturn({ id: held.id, requestedAt: first, confirmation: true })))
      .toMatchObject({ success: false, error: expect.stringMatching(/changed after you opened it/) })
    const second = (await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } })).returnRequestedAt!.toISOString()
    expect(await as(other, () => confirmUnappliedReturn({ id: held.id, requestedAt: second, confirmation: true }))).toEqual({ success: true, data: undefined })
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } }))
      .toMatchObject({ status: "RETURNED", resolvedBy: other, resolutionNote: "Handed back in cash instead" })
  })

  it("moves applied money back to held: the receipt is reversed, the fees reopen, and the money can go again", async () => {
    // Bill a fee large enough to take a held sum, then apply it.
    const held = await heldTransfer(1500)
    const { categoryId } = await prisma.feeSchedule.findUniqueOrThrow({ where: { id: feeScheduleId } })
    const schedule = await prisma.feeSchedule.create({ data: { schoolId, sessionId, termId: newerTermId, categoryId, name: `${stamp} Sports`, amount: 1500 } })
    const charge = await prisma.studentCharge.create({
      data: { schoolId, studentId, sessionId, termId: newerTermId, feeScheduleId: schedule.id, originalAmount: 1500, finalAmountDue: 1500, balance: 1500 },
    })
    const applied = await applyUnappliedPayment({ id: held.id, confirmation: true })
    expect(applied).toMatchObject({ success: true })
    const receipt = await prisma.payment.findFirstOrThrow({ where: { unappliedApplications: { some: { id: held.id } } } })
    expect(await prisma.studentCharge.findUniqueOrThrow({ where: { id: charge.id } })).toMatchObject({ status: "PAID" })

    // The counter says where to go instead.
    expect(await refundStudentPayment({ paymentId: receipt.id, reason: "Parent wants it back" }))
      .toMatchObject({ success: false, error: expect.stringMatching(/Move back to held/) })

    expect(await moveAppliedMoneyBackToHeld({ id: held.id, reason: "Parent wants the money back", confirmation: true }))
      .toEqual({ success: true, data: { receiptNo: receipt.receiptNo } })
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: receipt.id }, include: { reversals: true } }))
      .toMatchObject({ status: "REFUNDED", reversals: [expect.objectContaining({ reason: "Moved back to held money: Parent wants the money back" })] })
    const reopened = await prisma.studentCharge.findUniqueOrThrow({ where: { id: charge.id } })
    expect(reopened).toMatchObject({ status: "UNPAID" })
    expect(reopened.balance.toNumber()).toBe(1500)
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } }))
      .toMatchObject({ status: "OPEN", appliedPaymentId: null, resolvedBy: null, resolutionNote: expect.stringMatching(new RegExp(`^Moved back from receipt ${receipt.receiptNo}`)) })

    // Once only.
    expect(await moveAppliedMoneyBackToHeld({ id: held.id, reason: "Parent wants the money back", confirmation: true }))
      .toMatchObject({ success: false, error: "Applied held money not found" })
    // And the money is ordinary held money again: here, returned by two people.
    expect(await requestUnappliedReturn({ id: held.id, note: "Returned from the school account", confirmation: true })).toMatchObject({ success: true })
    const at = (await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } })).returnRequestedAt!.toISOString()
    expect(await as(other, () => confirmUnappliedReturn({ id: held.id, requestedAt: at, confirmation: true }))).toEqual({ success: true, data: undefined })
  })

  it("lets the platform owner retry a parked event once, or close it as settled by hand", async () => {
    // A transfer into an account nobody knows, parked after its retries ran out.
    const { accepted } = await transfer(800, { accountNumber: "0000000002" })
    await prisma.gatewayEvent.update({ where: { id: accepted.eventId }, data: { status: "DEAD", attempts: 12, nextAttemptAt: null } })
    const listed = async () => (await collectPaymentHealth()).parkedEvents.some((event) => event.id === accepted.eventId)
    expect(await listed()).toBe(true)

    // One attempt, and straight back to parked when it fails again.
    expect(await retryParkedGatewayEvent({ eventId: accepted.eventId, confirmation: true })).toEqual({ success: true, data: { result: "failed" } })
    expect(await prisma.gatewayEvent.findUniqueOrThrow({ where: { id: accepted.eventId } }))
      .toMatchObject({ status: "DEAD", lastError: expect.stringMatching(/No dedicated account matched/) })

    expect(await settleParkedGatewayEvent({ eventId: accepted.eventId, note: "Credited at the counter, receipt 0142", confirmation: true }))
      .toEqual({ success: true, data: undefined })
    expect(await prisma.gatewayEvent.findUniqueOrThrow({ where: { id: accepted.eventId } }))
      .toMatchObject({ status: "IGNORED", lastError: expect.stringMatching(/^Settled by hand by Platform Owner: Credited at the counter/) })
    expect(await listed()).toBe(false)
    // Neither works on an event that is not parked.
    expect(await retryParkedGatewayEvent({ eventId: accepted.eventId, confirmation: true })).toMatchObject({ success: false })
    expect(await settleParkedGatewayEvent({ eventId: accepted.eventId, note: "Credited at the counter again", confirmation: true })).toMatchObject({ success: false })
  })
})

describe("chargebacks on dedicated-account transfers", () => {
  // Bola owes nothing and has an account of his own, so what is held and what is receipted is
  // exactly what each test sets up.
  const BOLA_ACCOUNT = "9930000999"
  let disputeCounter = 7000

  async function dispute(event: "create" | "remind" | "resolve", reference: string, amountNaira: number, id: number, resolution?: string) {
    return signedEvent({
      event: `charge.dispute.${event}`,
      data: {
        id, domain: "test", status: event === "resolve" ? "resolved" : "awaiting-merchant-feedback", amount: amountNaira * 100,
        currency: "NGN", transaction: { reference }, ...(resolution ? { resolution } : {}),
      },
    })
  }

  async function status(reference: string) {
    return (await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } } })).status
  }

  async function billBola(name: string, amount: number) {
    const { categoryId } = await prisma.feeSchedule.findUniqueOrThrow({ where: { id: feeScheduleId } })
    const schedule = await prisma.feeSchedule.create({ data: { schoolId, sessionId, termId: newerTermId, categoryId, name: `${stamp} ${name}`, amount } })
    return prisma.studentCharge.create({
      data: { schoolId, studentId: secondStudentId, sessionId, termId: newerTermId, feeScheduleId: schedule.id, originalAmount: amount, finalAmountDue: amount, balance: amount },
    })
  }

  it("freezes held money while the payer disputes the transfer, and closes it when the payer wins", async () => {
    const { reference, result } = await transfer(1600, { accountNumber: BOLA_ACCOUNT })
    expect(result).toBe("processed")
    const held = await prisma.unappliedPayment.findFirstOrThrow({ where: { gatewayTransaction: { reference } } })
    expect(held).toMatchObject({ status: "OPEN", studentId: secondStudentId })
    const id = ++disputeCounter

    await dispute("create", reference, 1600, id)
    expect(await status(reference)).toBe("DISPUTED")
    for (const attempt of [
      applyUnappliedPayment({ id: held.id, confirmation: true }),
      requestUnappliedReturn({ id: held.id, note: "Returned from the school account", confirmation: true }),
      requestUnappliedRefund({ unappliedId: held.id, reason: "Parent asked for it back", confirmation: true }),
    ]) {
      expect(await attempt).toMatchObject({ success: false, error: expect.stringMatching(/disputed this transfer/) })
    }

    await dispute("resolve", reference, 1600, id, "merchant-accepted")
    expect(await status(reference)).toBe("REFUNDED")
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } }))
      .toMatchObject({ status: "RETURNED", resolutionNote: "Charged back by the payer's bank" })

    // A reminder arriving after the dispute closed changes nothing.
    await dispute("remind", reference, 1600, id)
    expect(await status(reference)).toBe("REFUNDED")
  })

  it("unwinds every piece of a split transfer the payer charges back: its receipt, and the receipt its held money paid", async () => {
    const tuition = await billBola("Bola Levy", 1000)
    const { reference } = await transfer(1500, { accountNumber: BOLA_ACCOUNT })
    const transaction = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } }, include: { payment: true } })
    expect(transaction.payment?.amount.toNumber()).toBe(1000)
    const held = await prisma.unappliedPayment.findFirstOrThrow({ where: { gatewayTransactionId: transaction.id } })
    expect(held.amount.toNumber()).toBe(500)

    // The held part pays a later bill.
    const club = await billBola("Bola Club", 500)
    expect(await applyUnappliedPayment({ id: held.id, confirmation: true })).toMatchObject({ success: true })
    const applied = await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } })

    await dispute("resolve", reference, 1500, ++disputeCounter, "merchant-accepted")
    expect(await status(reference)).toBe("REFUNDED")
    for (const receiptId of [transaction.paymentId!, applied.appliedPaymentId!]) {
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: receiptId }, include: { reversals: true } }))
        .toMatchObject({ status: "REFUNDED", reversals: [expect.anything()] })
    }
    for (const charge of [tuition, club]) {
      const reopened = await prisma.studentCharge.findUniqueOrThrow({ where: { id: charge.id } })
      expect(reopened.balance.toNumber()).toBe(charge.finalAmountDue.toNumber())
    }
    expect(await prisma.unappliedPayment.findUniqueOrThrow({ where: { id: held.id } }))
      .toMatchObject({ status: "RETURNED", resolutionNote: expect.stringMatching(/^Charged back by the payer's bank; receipt .+ reversed$/) })
  })

  it("sends a partial chargeback to a person rather than guessing which fees reopen", async () => {
    const { reference } = await transfer(1800, { accountNumber: BOLA_ACCOUNT })
    await dispute("resolve", reference, 900, ++disputeCounter, "merchant-accepted")
    expect(await prisma.gatewayTransaction.findUniqueOrThrow({ where: { provider_reference: { provider: "PAYSTACK", reference } } }))
      .toMatchObject({ status: "REQUIRES_REVIEW", failureMessage: expect.stringMatching(/chargeback of ₦900\.00 of the ₦1,800\.00/) })
    expect(await prisma.unappliedPayment.findFirstOrThrow({ where: { gatewayTransaction: { reference } } })).toMatchObject({ status: "OPEN" })
  })
})
