import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Slice 8 — the live pilot gate, the two-person refund rule, and the monitor, against a
 * real database. Paystack is replaced at the adapter boundary; nothing here reaches it.
 */

const context = vi.hoisted(() => ({
  actor: { userId: "", role: "ADMIN", name: "Pilot Test", schoolId: "" as string | null, teacherId: null as string | null },
  parentUserId: "",
}))
const provider = vi.hoisted(() => ({ createRefund: vi.fn(), initializePayment: vi.fn(), verifyPayment: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }))
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/authz", () => ({
  requirePermission: async () => context.actor,
  requireRole: async () => ({ userId: "platform-owner", role: "SUPER_ADMIN", name: "Platform Owner", schoolId: null, teacherId: null }),
  requireActor: async () => ({ userId: context.parentUserId, role: "PARENT", name: "Pilot Parent", schoolId: context.actor.schoolId, teacherId: null }),
}))
vi.mock("@/lib/payments/payment-settings.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/payment-settings.server")>()),
  adapterForPaymentConfiguration: async () => provider,
}))

const { prisma } = await import("@/lib/db")
const { approveGatewayRefund, rejectGatewayRefund, requestGatewayRefund } = await import("@/app/actions/gateway-operations-slice7")
const { setSchoolLiveApproval } = await import("@/app/actions/payment-settings")
const { getOnlinePaymentQuote } = await import("@/app/actions/online-payment")
const { collectPaymentHealth } = await import("@/lib/payments/payment-health.server")

const stamp = `ZZPilot-${Date.now()}`
const REQUESTER = `${stamp}-requester`
const APPROVER = `${stamp}-approver`
let schoolId = ""
let studentId = ""
let chargeId = ""
let transactionId = ""
let liveConfigurationId = ""
const userIds: string[] = []

async function cleanupSchool(id: string) {
  const profiles = await prisma.school.findUnique({
    where: { id },
    select: { parents: { select: { userId: true } }, students: { select: { userId: true } } },
  })
  const ids = [...(profiles?.parents ?? []), ...(profiles?.students ?? [])].map((profile) => profile.userId)
  await prisma.gatewayRefund.deleteMany({ where: { schoolId: id } })
  await prisma.gatewayTransaction.deleteMany({ where: { schoolId: id } })
  await prisma.payment.deleteMany({ where: { schoolId: id } })
  await prisma.studentCharge.deleteMany({ where: { schoolId: id } })
  await prisma.feeSchedule.deleteMany({ where: { schoolId: id } })
  await prisma.feeCategory.deleteMany({ where: { schoolId: id } })
  await prisma.school.deleteMany({ where: { id } })
  await prisma.credential.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}

beforeAll(async () => {
  for (const stale of await prisma.school.findMany({ where: { name: { startsWith: "ZZPilot-" } }, select: { id: true } })) {
    await cleanupSchool(stale.id)
  }
  const school = await prisma.school.create({
    data: { name: stamp, code: stamp.slice(0, 50), address: "Integration test", phone: "08000000000", email: `${stamp.toLowerCase()}@example.test` },
  })
  schoolId = school.id
  context.actor.schoolId = schoolId

  const parentUser = await prisma.user.create({
    data: {
      firstName: "Pilot", lastName: "Parent", role: "PARENT",
      credentials: { create: { type: "EMAIL", value: `${stamp.toLowerCase()}-parent@example.test`, passwordHash: "test" } },
      parent: { create: { schoolId } },
    },
  })
  context.parentUserId = parentUser.id
  userIds.push(parentUser.id)
  const studentUser = await prisma.user.create({
    data: {
      firstName: "Pilot", lastName: "Student", role: "STUDENT",
      credentials: { create: { type: "REGISTRATION_NUMBER", value: `${stamp}-student`, passwordHash: "test" } },
      student: { create: { schoolId, admissionNo: `${stamp}-student` } },
    },
  })
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUser.id } })
  studentId = student.id
  const parent = await prisma.parent.findUniqueOrThrow({ where: { userId: parentUser.id } })
  await prisma.studentParent.create({ data: { parentId: parent.id, studentId, relationship: "Parent" } })

  const session = await prisma.session.create({ data: { schoolId, name: `${stamp} Session`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } })
  const term = await prisma.term.create({ data: { sessionId: session.id, name: `${stamp} Term`, startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") } })
  const category = await prisma.feeCategory.create({ data: { schoolId, name: `${stamp} Category` } })
  const schedule = await prisma.feeSchedule.create({ data: { schoolId, sessionId: session.id, termId: term.id, categoryId: category.id, name: `${stamp} Tuition`, amount: 50000 } })
  const charge = await prisma.studentCharge.create({
    data: { schoolId, studentId, sessionId: session.id, termId: term.id, feeScheduleId: schedule.id, originalAmount: 50000, finalAmountDue: 50000, balance: 50000 },
  })
  chargeId = charge.id

  const liveConfiguration = await prisma.schoolPaymentConfiguration.create({
    data: {
      schoolId, environment: "LIVE", accountMode: "PLATFORM_MANAGED", feePolicy: "SCHOOL_PAYS", status: "READY", isEnabled: true,
      subaccountCode: "ACCT_pilot_live", allowedChannels: ["card", "bank_transfer"], verifiedAt: new Date(),
    },
  })
  liveConfigurationId = liveConfiguration.id

  // A settled online payment to refund.
  const payment = await prisma.payment.create({
    data: { schoolId, studentId, termId: term.id, amount: 20000, paymentDate: new Date(), receiptNo: `${stamp}-RCPT`, paymentMethod: "ONLINE", status: "COMPLETED" },
  })
  const transaction = await prisma.gatewayTransaction.create({
    data: {
      schoolId, studentId, termId: term.id, configurationId: liveConfiguration.id, environment: "LIVE", reference: `${stamp}-paid`,
      status: "SUCCEEDED", amountExpected: 20000, amountRequested: 20000, amountCharged: 20000, paymentId: payment.id, paidAt: new Date(),
    },
  })
  transactionId = transaction.id
})

afterAll(async () => {
  if (schoolId) await cleanupSchool(schoolId)
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
})

beforeEach(() => {
  provider.createRefund.mockReset()
  provider.createRefund.mockResolvedValue({ providerRefundId: "rf_pilot_1", status: "pending", expectedAt: null })
})

function as(userId: string) {
  context.actor.userId = userId
}

describe("two-person refund rule", () => {
  it("records a request without contacting Paystack", async () => {
    as(REQUESTER)
    const result = await requestGatewayRefund({ transactionId, reason: "Parent paid twice for the same term", confirmation: true })
    expect(result).toMatchObject({ success: true, data: { status: "REQUESTED" } })
    expect(provider.createRefund).not.toHaveBeenCalled()
  })

  it("refuses to let the requester approve or reject their own request", async () => {
    as(REQUESTER)
    const refund = await prisma.gatewayRefund.findFirstOrThrow({ where: { gatewayTransactionId: transactionId } })
    expect(await approveGatewayRefund({ refundId: refund.id, confirmation: true })).toMatchObject({ success: false, error: expect.stringMatching(/someone other than/) })
    expect(await rejectGatewayRefund({ refundId: refund.id, reason: "Changed my mind" })).toMatchObject({ success: false })
    expect(provider.createRefund).not.toHaveBeenCalled()
  })

  it("lets a second person reject, and the request can then be raised again", async () => {
    const refund = await prisma.gatewayRefund.findFirstOrThrow({ where: { gatewayTransactionId: transactionId } })
    as(APPROVER)
    expect(await rejectGatewayRefund({ refundId: refund.id, reason: "No duplicate payment found" })).toMatchObject({ success: true, data: { status: "REJECTED" } })
    expect(await approveGatewayRefund({ refundId: refund.id, confirmation: true })).toMatchObject({ success: false })

    as(REQUESTER)
    expect(await requestGatewayRefund({ transactionId, reason: "Second payment confirmed on the bank statement", confirmation: true }))
      .toMatchObject({ success: true, data: { status: "REQUESTED" } })
    const reopened = await prisma.gatewayRefund.findUniqueOrThrow({ where: { id: refund.id } })
    expect(reopened).toMatchObject({ status: "REQUESTED", rejectedAt: null, rejectionReason: null, requestedBy: REQUESTER })
    expect(await prisma.gatewayRefund.count({ where: { gatewayTransactionId: transactionId } })).toBe(1)
  })

  it("submits to Paystack exactly once, on the second person's approval", async () => {
    const refund = await prisma.gatewayRefund.findFirstOrThrow({ where: { gatewayTransactionId: transactionId } })
    as(APPROVER)
    const [first, second] = await Promise.all([
      approveGatewayRefund({ refundId: refund.id, confirmation: true }),
      approveGatewayRefund({ refundId: refund.id, confirmation: true }),
    ])
    expect([first.success, second.success].sort()).toEqual([false, true])
    expect(provider.createRefund).toHaveBeenCalledTimes(1)
    expect(provider.createRefund).toHaveBeenCalledWith(`${stamp}-paid`, 2_000_000, "Second payment confirmed on the bank statement")

    const submitted = await prisma.gatewayRefund.findUniqueOrThrow({ where: { id: refund.id } })
    expect(submitted).toMatchObject({ status: "PENDING", approvedBy: APPROVER, providerRefundId: "rf_pilot_1" })
    // The receipt is untouched until Paystack confirms refund.processed.
    expect(await prisma.payment.findFirstOrThrow({ where: { schoolId } })).toMatchObject({ status: "COMPLETED" })
    expect(await requestGatewayRefund({ transactionId, reason: "Trying to request a second refund", confirmation: true })).toMatchObject({ success: false })
  })
})

describe("live pilot gate", () => {
  const previous = process.env.PAYMENT_CHECKOUT_ENV
  beforeAll(() => { process.env.PAYMENT_CHECKOUT_ENV = "LIVE" })
  afterAll(() => { process.env.PAYMENT_CHECKOUT_ENV = previous })

  it("refuses a live checkout until the platform owner approves the school", async () => {
    const result = await getOnlinePaymentQuote({ studentId, chargeIds: [chargeId] })
    expect(result).toEqual({ success: false, error: "Online payment is not yet approved for live use at this school" })
  })

  it("holds an approved school to its pilot limit, and lifts it when cleared", async () => {
    expect(await setSchoolLiveApproval({ configurationId: liveConfigurationId, approved: true, pilotMaxAmount: 10000, confirmation: true }))
      .toEqual({ success: true, data: undefined })
    const limited = await getOnlinePaymentQuote({ studentId, chargeIds: [chargeId] })
    expect(limited.success).toBe(false)
    if (!limited.success) expect(limited.error).toContain("₦10,000.00")

    await setSchoolLiveApproval({ configurationId: liveConfigurationId, approved: true, pilotMaxAmount: null, confirmation: true })
    expect(await getOnlinePaymentQuote({ studentId, chargeIds: [chargeId] })).toMatchObject({ success: true })
  })

  it("revoking switches live off and invalidates quotes made under the old terms", async () => {
    const before = await prisma.schoolPaymentConfiguration.findUniqueOrThrow({ where: { id: liveConfigurationId } })
    await setSchoolLiveApproval({ configurationId: liveConfigurationId, approved: false, pilotMaxAmount: null, confirmation: true })
    const after = await prisma.schoolPaymentConfiguration.findUniqueOrThrow({ where: { id: liveConfigurationId } })
    expect(after).toMatchObject({ liveApprovedAt: null, isEnabled: false })
    expect(after.suspendedAt).not.toBeNull()
    expect(after.configVersion).toBeGreaterThan(before.configVersion)
    expect(await getOnlinePaymentQuote({ studentId, chargeIds: [chargeId] })).toEqual({ success: false, error: "This school has not enabled online payments" })
  })

  it("refuses pilot approval on a test configuration", async () => {
    const test = await prisma.schoolPaymentConfiguration.create({
      data: { schoolId, environment: "TEST", accountMode: "PLATFORM_MANAGED", status: "READY", subaccountCode: "ACCT_pilot_test", verifiedAt: new Date() },
    })
    expect(await setSchoolLiveApproval({ configurationId: test.id, approved: true, pilotMaxAmount: null, confirmation: true }))
      .toEqual({ success: false, error: "Only a live configuration needs pilot approval" })
  })
})

describe("pilot monitor", () => {
  it("reports this school's counts and alerts", async () => {
    await prisma.gatewayTransaction.create({
      data: {
        schoolId, studentId, termId: (await prisma.term.findFirstOrThrow({ where: { session: { schoolId } } })).id,
        configurationId: liveConfigurationId, environment: "LIVE", reference: `${stamp}-stuck`, status: "PENDING",
        amountExpected: 5000, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    })
    const { schools } = await collectPaymentHealth()
    const row = schools.find((school) => school.schoolId === schoolId)
    expect(row).toBeDefined()
    expect(row?.connections.map((connection) => connection.environment).sort()).toEqual(["LIVE", "TEST"])
    expect(row?.counts.stalePending).toBe(1)
    expect(row?.liveLastSevenDays).toEqual({ count: 1, amount: "20000.00" })
    expect(row?.alerts.map((alert) => alert.message)).toContain("1 checkout has been pending over 30 minutes")
  })
})
