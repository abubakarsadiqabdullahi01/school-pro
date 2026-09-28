import { createHash, createHmac } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const paymentMocks = vi.hoisted(() => ({ verifyPayment: vi.fn() }))
vi.mock("@/lib/payments/payment-settings.server", () => ({
  adapterForPaymentConfiguration: async () => ({ verifyPayment: paymentMocks.verifyPayment }),
}))

paymentMocks.verifyPayment.mockImplementation(async (reference: string) => ({
  providerTransactionId: reference.endsWith("review") ? "9007199254740993" : "8000000000000001",
  reference,
  environment: "test" as const,
  status: reference.endsWith("failed") ? "failed" : "success",
  currency: "NGN",
  amountKobo: reference.endsWith("failed") ? 0 : reference.endsWith("review") ? 1 : 5_250_000,
  requestedAmountKobo: reference.endsWith("failed") ? 0 : reference.endsWith("review") ? 1 : 5_250_000,
  feesKobo: reference.endsWith("failed") ? 0 : 88_750,
  channel: reference.endsWith("transfer") ? "bank_transfer" : "card",
  subaccountCode: "ACCT_webhook_test",
  paidAt: new Date("2026-09-25T12:00:00.000Z"),
}))

const { prisma } = await import("@/lib/db")
const { acceptPaystackWebhook } = await import("@/lib/payments/webhook-inbox.server")
const { processGatewayEvent } = await import("@/lib/payments/gateway-event-processor.server")
const { drainOutbox } = await import("@/lib/notifications/outbox.server")

const stamp = `ZZWebhook-${Date.now()}`
const secretKey = "sk_test_webhook-integration-not-a-real-secret"
let schoolId = ""
let studentUserId = ""
let transactionId = ""
let reference = ""
let studentId = ""
let sessionId = ""
let termId = ""
let categoryId = ""
let configurationId = ""

async function cleanupSchool(id: string) {
  const students = await prisma.student.findMany({ where: { schoolId: id }, select: { userId: true } })
  await prisma.gatewayReconciliationIssue.deleteMany({ where: { schoolId: id } })
  await prisma.gatewaySettlement.deleteMany({ where: { schoolId: id } })
  await prisma.gatewayDispute.deleteMany({ where: { schoolId: id } })
  await prisma.gatewayRefund.deleteMany({ where: { schoolId: id } })
  await prisma.gatewayEvent.deleteMany({ where: { schoolId: id } })
  await prisma.gatewayTransaction.deleteMany({ where: { schoolId: id } })
  await prisma.studentCharge.deleteMany({ where: { schoolId: id } })
  await prisma.feeSchedule.deleteMany({ where: { schoolId: id } })
  await prisma.feeCategory.deleteMany({ where: { schoolId: id } })
  await prisma.school.deleteMany({ where: { id } })
  const userIds = students.map((student) => student.userId)
  await prisma.credential.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

beforeAll(async () => {
  await prisma.gatewayEvent.deleteMany({
    where: { provider: "PAYSTACK", environment: "TEST", providerEventId: { in: ["evt-one", "evt-two", "evt-forged"] } },
  })
  const stale = await prisma.school.findMany({ where: { name: { startsWith: "ZZWebhook-" } }, select: { id: true } })
  for (const school of stale) await cleanupSchool(school.id)

  const school = await prisma.school.create({
    data: { name: stamp, code: stamp.slice(0, 50), address: "Integration test", phone: "08000000000", email: `${stamp.toLowerCase()}@example.test` },
  })
  schoolId = school.id
  const user = await prisma.user.create({
    data: {
      firstName: "Webhook",
      lastName: "Student",
      role: "STUDENT",
      credentials: { create: { type: "REGISTRATION_NUMBER", value: `${stamp}-student`, passwordHash: "test" } },
      student: { create: { schoolId, admissionNo: `${stamp}-student` } },
    },
  })
  studentUserId = user.id
  await prisma.credential.create({
    data: { userId: user.id, type: "EMAIL", value: "parent@example.test", passwordHash: "test" },
  })
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } })
  studentId = student.id
  const session = await prisma.session.create({
    data: { schoolId, name: `${stamp} Session`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
  })
  sessionId = session.id
  const term = await prisma.term.create({
    data: { sessionId: session.id, name: `${stamp} Term`, startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") },
  })
  termId = term.id
  const category = await prisma.feeCategory.create({ data: { schoolId, name: `${stamp} Category` } })
  categoryId = category.id
  const schedule = await prisma.feeSchedule.create({
    data: { schoolId, sessionId: session.id, termId: term.id, categoryId: category.id, name: `${stamp} Tuition`, amount: 52500 },
  })
  const charge = await prisma.studentCharge.create({
    data: { schoolId, studentId: student.id, sessionId: session.id, termId: term.id, feeScheduleId: schedule.id, originalAmount: 52500, finalAmountDue: 52500, balance: 52500 },
  })
  const configuration = await prisma.schoolPaymentConfiguration.create({
    data: {
      schoolId,
      environment: "TEST",
      accountMode: "PLATFORM_MANAGED",
      status: "READY",
      isEnabled: true,
      subaccountCode: "ACCT_webhook_test",
      allowedChannels: ["card"],
      verifiedAt: new Date(),
    },
  })
  configurationId = configuration.id
  reference = `DSP-${Date.now().toString(36)}-webhook`
  const transaction = await prisma.gatewayTransaction.create({
    data: {
      schoolId,
      studentId: student.id,
      termId: term.id,
      configurationId: configuration.id,
      environment: "TEST",
      reference,
      status: "INITIALIZED",
      amountExpected: 52500,
      amountRequested: 52500,
      payerEmail: "parent@example.test",
      configurationSnapshot: {
        accountMode: "PLATFORM_MANAGED",
        feePolicy: "SCHOOL_PAYS",
        processingFeeKobo: 0,
        subaccountCode: "ACCT_webhook_test",
      },
      allocations: { create: { chargeId: charge.id, amount: 52500 } },
    },
  })
  transactionId = transaction.id
})

afterAll(async () => {
  if (schoolId) await cleanupSchool(schoolId)
  if (studentUserId) await prisma.user.deleteMany({ where: { id: studentUserId } })
})

async function createGatewayAttempt(suffix: string, status: "INITIALIZED" | "ABANDONED" | "FAILED" = "INITIALIZED") {
  const schedule = await prisma.feeSchedule.create({
    data: {
      schoolId,
      sessionId,
      termId,
      categoryId,
      name: `${stamp} ${suffix}`,
      amount: 52500,
    },
  })
  const charge = await prisma.studentCharge.create({
    data: {
      schoolId,
      studentId,
      sessionId,
      termId,
      feeScheduleId: schedule.id,
      originalAmount: 52500,
      finalAmountDue: 52500,
      balance: 52500,
    },
  })
  const attemptReference = `${stamp}-${suffix}`
  const transaction = await prisma.gatewayTransaction.create({
    data: {
      schoolId,
      studentId,
      termId,
      configurationId,
      environment: "TEST",
      reference: attemptReference,
      status,
      amountExpected: 52500,
      amountRequested: 52500,
      payerEmail: "parent@example.test",
      configurationSnapshot: {
        accountMode: "PLATFORM_MANAGED",
        feePolicy: "SCHOOL_PAYS",
        processingFeeKobo: 0,
        subaccountCode: "ACCT_webhook_test",
      },
      allocations: { create: { chargeId: charge.id, amount: 52500 } },
    },
  })
  return { charge, transaction }
}

function signedPayload(
  eventId: string,
  transactionReference = reference,
  eventType: "charge.success" | "charge.failed" = "charge.success",
  channel: "card" | "bank_transfer" = "card",
) {
  const raw = Buffer.from(JSON.stringify({
    id: eventId,
    event: eventType,
    data: {
      id: "8000000000000001",
      domain: "test",
      status: eventType === "charge.failed" ? "failed" : "success",
      reference: transactionReference,
      amount: eventType === "charge.failed" ? 0 : 5_250_000,
      requested_amount: eventType === "charge.failed" ? 0 : 5_250_000,
      fees: eventType === "charge.failed" ? 0 : 88_750,
      currency: "NGN",
      channel,
      subaccount: { subaccount_code: "ACCT_webhook_test" },
    },
  }))
  return { raw, signature: createHmac("sha512", secretKey).update(raw).digest("hex") }
}

describe("signed Paystack webhook confirmation", () => {
  it("rejects a forged payload before persistence", async () => {
    const { raw } = signedPayload("evt-forged")
    await expect(acceptPaystackWebhook(raw, "0".repeat(128), { secretKey, environment: "TEST" })).rejects.toThrow("signature")
    expect(await prisma.gatewayEvent.count({ where: { gatewayTransactionId: transactionId } })).toBe(0)
  })

  it("deduplicates the exact same delivery in the durable inbox", async () => {
    const payload = signedPayload("evt-one")
    const first = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })
    const duplicate = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })
    expect(first.duplicate).toBe(false)
    expect(duplicate).toEqual({ eventId: first.eventId, duplicate: true })
  })

  it("posts one receipt, allocation, balance update and notification under concurrent duplicate events", async () => {
    const first = await prisma.gatewayEvent.findFirstOrThrow({ where: { gatewayTransactionId: transactionId } })
    const secondPayload = signedPayload("evt-two")
    const second = await acceptPaystackWebhook(secondPayload.raw, secondPayload.signature, { secretKey, environment: "TEST" })

    await Promise.all([processGatewayEvent(first.id), processGatewayEvent(second.eventId)])

    const transaction = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transactionId }, include: { payment: { include: { allocations: true } } } })
    expect(transaction.status).toBe("SUCCEEDED")
    expect(transaction.payment).not.toBeNull()
    expect(transaction.payment!.allocations).toHaveLength(1)
    // One school receipt per parent per channel, however many duplicate events arrive.
    expect(await prisma.notificationOutbox.count({
      where: { schoolId, dedupeKey: { startsWith: `payment-receipt:${transaction.payment!.id}:email:` } },
    })).toBe(1)
    const charge = await prisma.studentCharge.findFirstOrThrow({ where: { gatewayAllocations: { some: { gatewayTransactionId: transactionId } } } })
    expect(charge.balance.toFixed(2)).toBe("0.00")
    expect(charge.status).toBe("PAID")
    expect(await prisma.payment.count({ where: { gatewayTransaction: { id: transactionId } } })).toBe(1)
    expect(await prisma.gatewayEvent.count({ where: { gatewayTransactionId: transactionId, status: "PROCESSED" } })).toBe(2)
  })

  it("posts a Pay with Transfer success using the verified channel", async () => {
    const { charge, transaction } = await createGatewayAttempt("transfer")
    const payload = signedPayload("evt-transfer-success", transaction.reference, "charge.success", "bank_transfer")
    const accepted = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })

    expect(await processGatewayEvent(accepted.eventId)).toBe("processed")
    const saved = await prisma.gatewayTransaction.findUniqueOrThrow({
      where: { id: transaction.id },
      include: { payment: true },
    })
    expect(saved.status).toBe("SUCCEEDED")
    expect(saved.channel).toBe("bank_transfer")
    expect(saved.payment?.paymentMethod).toBe("PAYSTACK_BANK_TRANSFER")
    expect((await prisma.studentCharge.findUniqueOrThrow({ where: { id: charge.id } })).status).toBe("PAID")
  })

  it("accepts a delayed verified success after the parent abandoned checkout", async () => {
    const { transaction } = await createGatewayAttempt("delayed", "ABANDONED")
    const payload = signedPayload("evt-delayed-success", transaction.reference)
    const accepted = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })

    expect(await processGatewayEvent(accepted.eventId)).toBe("processed")
    expect((await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id } })).status).toBe("SUCCEEDED")
  })

  it("records a signed charge.failed webhook without posting a payment", async () => {
    const { transaction } = await createGatewayAttempt("failed")
    const payload = signedPayload("evt-charge-failed", transaction.reference, "charge.failed")
    const accepted = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })

    expect(await processGatewayEvent(accepted.eventId)).toBe("processed")
    const saved = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id } })
    expect(saved.status).toBe("FAILED")
    expect(saved.paymentId).toBeNull()
  })

  it("quarantines a successful webhook whose verified amount is wrong", async () => {
    const { transaction } = await createGatewayAttempt("review")
    const payload = signedPayload("evt-amount-review", transaction.reference)
    const accepted = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })

    expect(await processGatewayEvent(accepted.eventId)).toBe("processed")
    const saved = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id } })
    expect(saved.status).toBe("REQUIRES_REVIEW")
    expect(saved.paymentId).toBeNull()
    expect(saved.failureMessage).toContain("Requested amount does not match")
  })

  it("quarantines a verified success that contradicts a terminal local failure", async () => {
    const { transaction } = await createGatewayAttempt("contradictory", "FAILED")
    const payload = signedPayload("evt-contradictory-success", transaction.reference)
    const accepted = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })

    expect(await processGatewayEvent(accepted.eventId)).toBe("processed")
    const saved = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id } })
    expect(saved.status).toBe("REQUIRES_REVIEW")
    expect(saved.paymentId).toBeNull()
    expect(saved.failureMessage).toContain("conflicts with terminal local status FAILED")
  })

  it("keeps a successful payment intact when the notification provider fails", async () => {
    const { transaction } = await createGatewayAttempt("notify-provider")
    const payload = signedPayload("evt-notification-provider-failure", transaction.reference)
    const accepted = await acceptPaystackWebhook(payload.raw, payload.signature, { secretKey, environment: "TEST" })
    expect(await processGatewayEvent(accepted.eventId)).toBe("processed")

    const paid = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id }, select: { paymentId: true } })
    const outbox = await prisma.notificationOutbox.findFirstOrThrow({
      where: { schoolId, dedupeKey: { startsWith: `payment-receipt:${paid.paymentId}:email:` } },
    })
    // Every other queued message is pushed out of reach, not just this school's: the drain
    // claims across the whole deployment, so a row another fixture queued for a different
    // school would be drained here too and counted as a second failure. Scoping this to
    // `schoolId` made the assertion depend on which files had run first.
    await prisma.notificationOutbox.updateMany({
      where: { status: "QUEUED", id: { not: outbox.id } },
      data: { availableAt: new Date(Date.now() + 60 * 60_000) },
    })
    const previousToken = process.env.SMARTSMS_API_TOKEN
    process.env.SMARTSMS_API_TOKEN = "test-token-not-a-real-secret"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ status: "error", message: ["Temporary provider outage"] }),
      { status: 503, headers: { "content-type": "application/json" } },
    )))
    try {
      const drained = await drainOutbox(10)
      expect(drained.failed).toBe(1)
    } finally {
      vi.unstubAllGlobals()
      if (previousToken === undefined) delete process.env.SMARTSMS_API_TOKEN
      else process.env.SMARTSMS_API_TOKEN = previousToken
    }

    const [savedTransaction, savedOutbox] = await Promise.all([
      prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outbox.id } }),
    ])
    expect(savedTransaction.status).toBe("SUCCEEDED")
    expect(savedTransaction.paymentId).not.toBeNull()
    expect(savedOutbox.status).toBe("QUEUED")
    expect(savedOutbox.attempts).toBe(1)
    expect(savedOutbox.lastError).toContain("Temporary provider outage")
  })

  it("recovers a worker claim left stale by an interrupted process", async () => {
    const stale = await prisma.gatewayEvent.create({
      data: {
        schoolId,
        gatewayTransactionId: transactionId,
        environment: "TEST",
        eventType: "transfer.success",
        reference,
        payloadHash: createHash("sha256").update(`${stamp}-stale`).digest("hex"),
        status: "PROCESSING",
        claimedAt: new Date(Date.now() - 11 * 60 * 1000),
      },
    })
    expect(await processGatewayEvent(stale.id)).toBe("ignored")
    expect((await prisma.gatewayEvent.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("IGNORED")
  })

  it("reverses the ledger once only after a signed refund.processed event", async () => {
    const transaction = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transactionId } })
    const refund = await prisma.gatewayRefund.create({ data: {
      schoolId, gatewayTransactionId: transactionId, paymentId: transaction.paymentId!, environment: "TEST",
      providerRefundId: "7000000000000001", status: "PENDING", amount: 52500,
      reason: "Integration test full refund", requestedBy: studentUserId,
    } })
    const raw = Buffer.from(JSON.stringify({ id: "evt-refund-processed", event: "refund.processed", data: {
      id: refund.providerRefundId, domain: "test", status: "processed", transaction: { reference },
      amount: 5_250_000, currency: "NGN",
    } }))
    const signature = createHmac("sha512", secretKey).update(raw).digest("hex")
    const accepted = await acceptPaystackWebhook(raw, signature, { secretKey, environment: "TEST", schoolId })
    expect(await processGatewayEvent(accepted.eventId)).toBe("processed")
    expect(await processGatewayEvent(accepted.eventId)).toBe("busy")

    const [payment, charge, savedRefund] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: transaction.paymentId! } }),
      prisma.studentCharge.findFirstOrThrow({ where: { gatewayAllocations: { some: { gatewayTransactionId: transactionId } } } }),
      prisma.gatewayRefund.findUniqueOrThrow({ where: { id: refund.id } }),
    ])
    expect(payment.status).toBe("REFUNDED")
    expect(charge.balance.toFixed(2)).toBe("52500.00")
    expect(savedRefund.status).toBe("PROCESSED")
    expect(await prisma.accountingReversal.count({ where: { paymentId: payment.id } })).toBe(1)
  })
})
