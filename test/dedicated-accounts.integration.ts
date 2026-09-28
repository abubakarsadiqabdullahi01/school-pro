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
  getUnappliedPayments,
  markUnappliedReturned,
  requestDedicatedIdentification,
} = await import("@/app/actions/dedicated-accounts")
const { approveGatewayRefund, provideRefundBankDetails, requestUnappliedRefund } = await import("@/app/actions/gateway-operations-slice7")
const { setPlatformCharge } = await import("@/app/actions/payment-settings")

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
async function transfer(amountNaira: number, options: { reference?: string; subaccountCode?: string; splitCode?: string; accountNumber?: string } = {}) {
  eventCounter += 1
  const reference = options.reference ?? `${stamp}-T${eventCounter}`
  const body = Buffer.from(JSON.stringify({
    id: `${stamp}-E${eventCounter}`,
    event: "charge.success",
    data: {
      id: 900000 + eventCounter, domain: "test", status: "success", reference, amount: amountNaira * 100, currency: "NGN",
      channel: "dedicated_nuban", paid_at: new Date().toISOString(),
      customer: { customer_code: options.accountNumber ? "CUS_unknown" : `CUS_${stamp.replace(/[^A-Za-z0-9]/g, "")}` },
      authorization: { receiver_bank_account_number: options.accountNumber ?? ACCOUNT_NUMBER, sender_name: "ADEBAYO OKONKWO", sender_bank: "Kuda Bank" },
    },
  }))
  const signature = createHmac("sha512", SECRET).update(body).digest("hex")
  verifications.set(reference, {
    providerTransactionId: String(900000 + eventCounter), reference, environment: "test", status: "success", currency: "NGN",
    amountKobo: amountNaira * 100, requestedAmountKobo: amountNaira * 100, feesKobo: 5000, channel: "dedicated_nuban",
    subaccountCode: options.splitCode ? undefined : options.subaccountCode ?? "ACCT_dva_school", splitCode: options.splitCode, paidAt: new Date(),
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

  it("records a held sum returned to the payer outside DigiSchool", async () => {
    await transfer(9000)
    const held = await getUnappliedPayments()
    if (!held.success) throw new Error(held.error)
    const [row] = held.data
    expect(row?.amount).toBe("5000.00")
    expect(await markUnappliedReturned({ id: row!.id, note: "Refunded by bank transfer from the school account", confirmation: true })).toEqual({ success: true, data: undefined })
    expect((await getUnappliedPayments()).success && (await getUnappliedPayments() as { data: unknown[] }).data).toEqual([])
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

    // Paystack needs the payer's bank account for a transfer refund.
    expect(await provideRefundBankDetails({ refundId: requested.data.refundId, accountNumber: "0123456789", bankId: "9", confirmation: true }))
      .toEqual({ success: true, data: { status: "PENDING" } })
    expect(provider.retryRefundWithCustomerDetails).toHaveBeenCalledWith("5551234", "0123456789", "9")

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
