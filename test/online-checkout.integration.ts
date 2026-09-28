import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const paymentMocks = vi.hoisted(() => ({ initializePayment: vi.fn(), verifyPayment: vi.fn() }))
paymentMocks.initializePayment.mockImplementation(async (input: { reference: string }) => ({
  reference: input.reference,
  accessCode: `access-${input.reference}`,
  authorizationUrl: `https://checkout.paystack.com/${input.reference}`,
}))
vi.mock("@/lib/payments/payment-settings.server", () => ({
  adapterForPaymentConfiguration: async () => ({
    initializePayment: paymentMocks.initializePayment,
    verifyPayment: paymentMocks.verifyPayment,
  }),
}))
const initializePayment = paymentMocks.initializePayment

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const {
  abandonOnlinePayment,
  getOnlinePaymentQuote,
  initializeOnlinePayment,
  refreshOnlinePaymentStatus,
} = await import("@/app/actions/online-payment")

const stamp = `ZZCheckout-${Date.now()}`
let schoolId = ""
let parentUserId = ""
let studentId = ""
let unlinkedStudentId = ""
let chargeId = ""
let secondChargeId = ""

async function cleanupSchool(id: string) {
  const profiles = await prisma.school.findUnique({
    where: { id },
    select: {
      parents: { select: { userId: true } },
      students: { select: { userId: true } },
    },
  })
  const userIds = [...(profiles?.parents ?? []), ...(profiles?.students ?? [])].map((profile) => profile.userId)
  await prisma.gatewayTransaction.deleteMany({ where: { schoolId: id } })
  await prisma.studentCharge.deleteMany({ where: { schoolId: id } })
  await prisma.feeSchedule.deleteMany({ where: { schoolId: id } })
  await prisma.feeCategory.deleteMany({ where: { schoolId: id } })
  await prisma.school.deleteMany({ where: { id } })
  await prisma.credential.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function cleanup() {
  if (schoolId) await cleanupSchool(schoolId)
}

beforeAll(async () => {
  const staleSchools = await prisma.school.findMany({ where: { name: { startsWith: "ZZCheckout-" } }, select: { id: true } })
  for (const stale of staleSchools) await cleanupSchool(stale.id)
  const school = await prisma.school.create({
    data: {
      name: stamp,
      code: stamp.slice(0, 50),
      address: "Integration test",
      phone: "08000000000",
      email: `${stamp.toLowerCase()}@example.test`,
    },
  })
  schoolId = school.id
  const parentUser = await prisma.user.create({
    data: {
      firstName: "Checkout",
      lastName: "Parent",
      role: "PARENT",
      credentials: { create: { type: "EMAIL", value: `${stamp.toLowerCase()}-parent@example.test`, passwordHash: "test" } },
      parent: { create: { schoolId } },
    },
  })
  parentUserId = parentUser.id
  const makeStudent = async (suffix: string) => {
    const user = await prisma.user.create({ data: {
      firstName: suffix,
      lastName: "Student",
      role: "STUDENT",
      credentials: { create: { type: "REGISTRATION_NUMBER", value: `${stamp}-${suffix}`, passwordHash: "test" } },
      student: { create: { schoolId, admissionNo: `${stamp}-${suffix}` } },
    } })
    return prisma.student.findUniqueOrThrow({ where: { userId: user.id } })
  }
  const linked = await makeStudent("Linked")
  const unlinked = await makeStudent("Unlinked")
  studentId = linked.id
  unlinkedStudentId = unlinked.id
  const parent = await prisma.parent.findUniqueOrThrow({ where: { userId: parentUserId } })
  await prisma.studentParent.create({ data: { parentId: parent.id, studentId, relationship: "Parent" } })

  const session = await prisma.session.create({
    data: { schoolId, name: `${stamp} Session`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
  })
  const term = await prisma.term.create({
    data: { sessionId: session.id, name: `${stamp} Term`, startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") },
  })
  const category = await prisma.feeCategory.create({ data: { schoolId, name: `${stamp} Category` } })
  const schedule = await prisma.feeSchedule.create({
    data: { schoolId, sessionId: session.id, termId: term.id, categoryId: category.id, name: `${stamp} Tuition`, amount: 52500 },
  })
  const secondSchedule = await prisma.feeSchedule.create({
    data: { schoolId, sessionId: session.id, termId: term.id, categoryId: category.id, name: `${stamp} Books`, amount: 10000 },
  })
  const [charge, second] = await Promise.all([
    prisma.studentCharge.create({
      data: { schoolId, studentId, sessionId: session.id, termId: term.id, feeScheduleId: schedule.id, originalAmount: 52500, finalAmountDue: 52500, balance: 52500 },
    }),
    prisma.studentCharge.create({
      data: { schoolId, studentId, sessionId: session.id, termId: term.id, feeScheduleId: secondSchedule.id, originalAmount: 10000, finalAmountDue: 10000, balance: 10000 },
    }),
  ])
  chargeId = charge.id
  secondChargeId = second.id
  await prisma.schoolPaymentConfiguration.create({
    data: {
      schoolId,
      environment: "TEST",
      accountMode: "PLATFORM_MANAGED",
      feePolicy: "PARENT_PAYS_GROSS_UP",
      status: "READY",
      isEnabled: true,
      subaccountCode: "ACCT_checkout_test",
      allowedChannels: ["card", "bank_transfer"],
      verifiedAt: new Date(),
    },
  })

  vi.mocked(auth).mockResolvedValue({ user: { id: parentUserId, sessionRecordId: null } } as never)
})

afterAll(cleanup)

async function createAttempt(suffix: string, status: "INITIALIZED" | "ABANDONED" = "INITIALIZED") {
  const configuration = await prisma.schoolPaymentConfiguration.findFirstOrThrow({ where: { schoolId } })
  const charge = await prisma.studentCharge.findUniqueOrThrow({ where: { id: secondChargeId } })
  return prisma.gatewayTransaction.create({
    data: {
      schoolId,
      studentId,
      termId: charge.termId!,
      configurationId: configuration.id,
      environment: "TEST",
      reference: `${stamp}-${suffix}`,
      status,
      amountExpected: 10000,
      amountRequested: 10000,
      payerEmail: `${stamp.toLowerCase()}-parent@example.test`,
      configurationSnapshot: {
        accountMode: "PLATFORM_MANAGED",
        feePolicy: "SCHOOL_PAYS",
        processingFeeKobo: 0,
        subaccountCode: "ACCT_checkout_test",
      },
      allocations: { create: { chargeId: secondChargeId, amount: 10000 } },
    },
  })
}

describe("parent online checkout initialization", () => {
  it("refuses a student who is not linked to the signed-in parent", async () => {
    const result = await getOnlinePaymentQuote({ studentId: unlinkedStudentId, chargeIds: [chargeId] })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("not linked")
  })

  it("quotes from the authoritative charge balance", async () => {
    const result = await getOnlinePaymentQuote({ studentId, chargeIds: [chargeId] })
    expect(result).toEqual({
      success: true,
      data: {
        schoolFeesKobo: 5_250_000,
        processingFeeKobo: 90_102,
        parentChargeKobo: 5_340_102,
        feePolicy: "PARENT_PAYS_GROSS_UP",
        environment: "TEST",
      },
    })
  })

  it("creates immutable allocations before the provider call", async () => {
    const result = await initializeOnlinePayment({ studentId, chargeIds: [chargeId] })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.authorizationUrl).toContain("checkout.paystack.com")

    const transaction = await prisma.gatewayTransaction.findUniqueOrThrow({
      where: { provider_reference: { provider: "PAYSTACK", reference: result.data.reference } },
      include: { allocations: true },
    })
    expect(transaction.status).toBe("INITIALIZED")
    expect(transaction.amountExpected.toFixed(2)).toBe("52500.00")
    expect(transaction.allocations).toHaveLength(1)
    expect(transaction.allocations[0]!.amount.toFixed(2)).toBe("52500.00")
    expect(initializePayment).toHaveBeenCalledTimes(1)
  })

  it("reuses an active checkout instead of charging the same fee twice", async () => {
    const result = await initializeOnlinePayment({ studentId, chargeIds: [chargeId] })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.reused).toBe(true)
    expect(initializePayment).toHaveBeenCalledTimes(1)
    expect(await prisma.gatewayTransaction.count({ where: { allocations: { some: { chargeId } } } })).toBe(1)
  })

  it("uses a unique provider reference for a different charge", async () => {
    const first = await prisma.gatewayTransaction.findFirstOrThrow({ where: { allocations: { some: { chargeId } } } })
    const result = await initializeOnlinePayment({ studentId, chargeIds: [secondChargeId] })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.reference).not.toBe(first.reference)
    expect(await prisma.gatewayTransaction.count({ where: { schoolId } })).toBe(2)
  })

  it("enforces disabled partial payments, then initializes the exact partial amount when enabled", async () => {
    const partialInput = {
      studentId,
      chargeIds: [secondChargeId],
      allocations: [{ chargeId: secondChargeId, amountKobo: 500_000 }],
    }
    const disabled = await getOnlinePaymentQuote(partialInput)
    expect(disabled.success).toBe(false)
    if (!disabled.success) expect(disabled.error).toContain("does not allow partial")

    await prisma.gatewayTransaction.updateMany({
      where: { schoolId, allocations: { some: { chargeId: secondChargeId } } },
      data: { status: "ABANDONED", expiresAt: new Date(Date.now() - 1_000) },
    })
    await prisma.schoolPaymentConfiguration.updateMany({
      where: { schoolId },
      data: { allowPartialPayments: true },
    })

    const quote = await getOnlinePaymentQuote(partialInput)
    expect(quote.success).toBe(true)
    if (quote.success) expect(quote.data.schoolFeesKobo).toBe(500_000)
    const initialized = await initializeOnlinePayment(partialInput)
    expect(initialized.success).toBe(true)
    if (!initialized.success) return
    const transaction = await prisma.gatewayTransaction.findUniqueOrThrow({
      where: { provider_reference: { provider: "PAYSTACK", reference: initialized.data.reference } },
      include: { allocations: true },
    })
    expect(transaction.amountExpected.toFixed(2)).toBe("5000.00")
    expect(transaction.allocations[0]!.amount.toFixed(2)).toBe("5000.00")
  })

  it("classifies a verified failed checkout as FAILED rather than review", async () => {
    const transaction = await createAttempt("failed")
    paymentMocks.verifyPayment.mockResolvedValueOnce({
      reference: transaction.reference,
      environment: "test",
      status: "failed",
      currency: "NGN",
      amountKobo: 0,
      requestedAmountKobo: 0,
      feesKobo: 0,
      channel: "card",
    })
    const result = await refreshOnlinePaymentStatus({ studentId, reference: transaction.reference })
    expect(result).toEqual({ success: true, data: { status: "FAILED" } })
  })

  it("records a parent cancellation and can observe a later verified success safely", async () => {
    const transaction = await createAttempt("abandoned")
    const abandoned = await abandonOnlinePayment({ studentId, reference: transaction.reference })
    expect(abandoned.success).toBe(true)
    expect((await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id } })).status).toBe("ABANDONED")

    paymentMocks.verifyPayment.mockResolvedValueOnce({
      providerTransactionId: "8000000000000099",
      reference: transaction.reference,
      environment: "test",
      status: "success",
      currency: "NGN",
      amountKobo: 1_000_000,
      requestedAmountKobo: 1_000_000,
      feesKobo: 18_000,
      channel: "bank_transfer",
      subaccountCode: "ACCT_checkout_test",
      paidAt: new Date(),
    })
    // A verified success found by the parent's refresh is posted at once, without waiting
    // for a webhook that may never come - exactly one payment.
    const refreshed = await refreshOnlinePaymentStatus({ studentId, reference: transaction.reference })
    expect(refreshed).toEqual({ success: true, data: { status: "SUCCEEDED" } })
    expect(await prisma.payment.count({ where: { gatewayTransaction: { id: transaction.id } } })).toBe(1)
  })
})
