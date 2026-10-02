import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Notifications end to end against a real database: counter payments and refunds with
 * their receipts, results and annual notices behind publication, fee reminders,
 * announcements, a school's own controls, and the production worker's honesty. Nothing
 * here reaches a provider — no real SMS or email is sent.
 */

const context = vi.hoisted(() => ({ schoolId: "", userId: "" }))
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }))
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/authz", () => {
  const actor = async () => ({ userId: context.userId, role: "ADMIN", name: "Comms Test", schoolId: context.schoolId, teacherId: null })
  class AuthorizationError extends Error {}
  return { AuthorizationError, requirePermission: actor, requireAnyPermission: actor, requireActor: actor, requireRole: actor,
    getEffectivePermissionsForCurrentUser: async () => [] }
})
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))

const { prisma } = await import("@/lib/db")
const { approveStudentPaymentRefund, recordStudentPayment, requestStudentPaymentRefund } = await import("@/app/actions/finance")
const { sendResultsNotice } = await import("@/app/actions/notifications")
const comms = await import("@/app/actions/communications")
const { drainOutbox } = await import("@/lib/notifications/outbox.server")

const stamp = `ZZComms-${Date.now()}`
let schoolId = ""
let parentUserId = ""
let studentA = ""
let studentB = ""
let classId = ""
let sessionId = ""
let olderTermId = ""
let currentTermId = ""
let currentClassTermId = ""
const charges: Record<string, string> = {}

async function cleanupSchool(id: string) {
  const profiles = await prisma.school.findUnique({ where: { id }, select: { parents: { select: { userId: true } }, students: { select: { userId: true } } } })
  const ids = [...(profiles?.parents ?? []), ...(profiles?.students ?? [])].map((profile) => profile.userId)
  await prisma.notificationOutbox.deleteMany({ where: { schoolId: id } })
  await prisma.accountingReversal.deleteMany({ where: { schoolId: id } }).catch(() => undefined)
  await prisma.counterRefundRequest.deleteMany({ where: { schoolId: id } })
  await prisma.payment.deleteMany({ where: { schoolId: id } })
  await prisma.studentCharge.deleteMany({ where: { schoolId: id } })
  await prisma.feeSchedule.deleteMany({ where: { schoolId: id } })
  await prisma.feeCategory.deleteMany({ where: { schoolId: id } })
  await prisma.school.deleteMany({ where: { id } })
  await prisma.credential.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}

async function outbox(where: Record<string, unknown> = {}) {
  return prisma.notificationOutbox.findMany({ where: { schoolId, ...where }, orderBy: { createdAt: "asc" } })
}

beforeAll(async () => {
  for (const stale of await prisma.school.findMany({ where: { name: { startsWith: "ZZComms-" } }, select: { id: true } })) await cleanupSchool(stale.id)
  const school = await prisma.school.create({ data: { name: stamp, code: stamp.slice(0, 50), address: "Test", phone: "08000000000", email: `${stamp.toLowerCase()}@example.test` } })
  schoolId = school.id
  context.schoolId = schoolId
  context.userId = (await prisma.user.create({ data: { firstName: "Bursar", lastName: "Test", role: "ADMIN" } })).id

  const parent = await prisma.user.create({
    data: { firstName: "Hauwa", lastName: "Bello", role: "PARENT", phone: "08031112222",
      credentials: { create: { type: "EMAIL", value: `${stamp.toLowerCase()}-parent@example.test`, passwordHash: "x" } }, parent: { create: { schoolId } } },
  })
  parentUserId = parent.id
  const parentRow = await prisma.parent.findUniqueOrThrow({ where: { userId: parent.id } })
  const makeStudent = async (suffix: string) => {
    const user = await prisma.user.create({ data: { firstName: suffix, lastName: "Bello", role: "STUDENT",
      credentials: { create: { type: "REGISTRATION_NUMBER", value: `${stamp}-${suffix}`, passwordHash: "x" } }, student: { create: { schoolId, admissionNo: `${stamp}-${suffix}` } } } })
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } })
    await prisma.studentParent.create({ data: { parentId: parentRow.id, studentId: student.id, relationship: "Parent" } })
    return student.id
  }
  studentA = await makeStudent("Amina")
  studentB = await makeStudent("Bala")

  const session = await prisma.session.create({ data: { schoolId, name: `${stamp} 2025/2026`, startDate: new Date("2025-09-01"), endDate: new Date("2026-08-01") } })
  sessionId = session.id
  const older = await prisma.term.create({ data: { sessionId, name: "First Term", startDate: new Date("2025-09-01"), endDate: new Date("2025-12-15") } })
  const current = await prisma.term.create({ data: { sessionId, name: "Second Term", startDate: new Date("2026-01-05"), endDate: new Date("2026-04-01"), isCurrent: true } })
  olderTermId = older.id
  currentTermId = current.id
  const klass = await prisma.class.create({ data: { schoolId, name: `${stamp} JSS1`, level: "JSS" } })
  classId = klass.id
  const olderClassTerm = await prisma.classTerm.create({ data: { classId, termId: olderTermId } })
  const currentClassTerm = await prisma.classTerm.create({ data: { classId, termId: currentTermId } })
  currentClassTermId = currentClassTerm.id
  for (const studentId of [studentA, studentB]) {
    await prisma.studentClassTerm.create({ data: { studentId, classTermId: olderClassTerm.id, termId: olderTermId } })
    await prisma.studentClassTerm.create({ data: { studentId, classTermId: currentClassTerm.id, termId: currentTermId } })
  }
  await prisma.classTermResultWorkflow.create({ data: { classTermId: olderClassTerm.id, status: "PUBLISHED", publishedAt: new Date("2025-12-20") } })

  const category = await prisma.feeCategory.create({ data: { schoolId, name: `${stamp} Fees` } })
  for (const [key, termId, amount, studentId] of [["A1", olderTermId, 20000, studentA], ["A2", currentTermId, 30000, studentA], ["B2", currentTermId, 15000, studentB]] as const) {
    const schedule = await prisma.feeSchedule.create({ data: { schoolId, sessionId, termId, categoryId: category.id, name: `${stamp} Tuition ${key}`, amount } })
    charges[key] = (await prisma.studentCharge.create({ data: { schoolId, studentId, sessionId, termId, feeScheduleId: schedule.id, originalAmount: amount, finalAmountDue: amount, balance: amount } })).id
  }
})

let approverId = ""

afterAll(async () => {
  if (schoolId) await cleanupSchool(schoolId)
  await prisma.user.deleteMany({ where: { id: { in: [context.userId, approverId].filter(Boolean) } } })
})

describe("counter payments at the bursary", () => {
  it("refuses a bank transfer with no reference", async () => {
    const result = await recordStudentPayment({ studentId: studentA, termId: currentTermId, paymentMethod: "BANK_TRANSFER", allocations: [{ chargeId: charges.A2, amount: 1000 }] })
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/reference/) })
  })

  it("splits one payment over two terms into one receipt per term, and sends each receipt", async () => {
    const result = await recordStudentPayment({
      studentId: studentA, termId: currentTermId, paymentMethod: "POS", referenceNo: `${stamp}-POS1`,
      allocations: [{ chargeId: charges.A1, amount: 20000 }, { chargeId: charges.A2, amount: 10000 }],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.receipts.map((receipt) => [receipt.termName, receipt.amount])).toEqual([["First Term", "20000.00"], ["Second Term", "10000.00"]])
    const payments = await prisma.payment.findMany({ where: { schoolId, studentId: studentA }, select: { termId: true, amount: true } })
    expect(payments.map((payment) => payment.termId).sort()).toEqual([olderTermId, currentTermId].sort())
    const receipts = await outbox({ templateKey: "payment.received", studentId: studentA })
    expect(receipts.filter((row) => row.channel === "EMAIL")).toHaveLength(2)
    expect(receipts.filter((row) => row.channel === "SMS")).toHaveLength(2)
    expect(receipts.find((row) => row.channel === "EMAIL")!.body).toContain("POS (card at the bursary)")
  })

  it("refuses the same POS reference twice", async () => {
    const result = await recordStudentPayment({ studentId: studentA, termId: currentTermId, paymentMethod: "POS", referenceNo: `${stamp}-POS1`, allocations: [{ chargeId: charges.A2, amount: 500 }] })
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/already receipted/) })
  })

  it("refunds a counter receipt only once a second person approves, then tells the family", async () => {
    const payment = await prisma.payment.findFirstOrThrow({ where: { schoolId, studentId: studentA, termId: currentTermId } })
    const requested = await requestStudentPaymentRefund({ paymentId: payment.id, reason: "Paid twice at the bursary" })
    expect(requested).toMatchObject({ success: true })
    if (!requested.success) return
    // Nothing has moved yet, and nobody has been told.
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: "COMPLETED" })
    expect(await outbox({ templateKey: "payment.refunded" })).toEqual([])
    // Asked once; the same person cannot approve it.
    expect(await requestStudentPaymentRefund({ paymentId: payment.id, reason: "Paid twice at the bursary" }))
      .toMatchObject({ success: false, error: expect.stringMatching(/already waiting/) })
    expect(await approveStudentPaymentRefund({ requestId: requested.data.requestId, confirmation: true }))
      .toMatchObject({ success: false, error: "A different person must approve a refund you asked for" })

    const bursar = context.userId
    approverId = (await prisma.user.create({ data: { firstName: "Head", lastName: "Approver", role: "ADMIN" } })).id
    try {
      context.userId = approverId
      expect(await approveStudentPaymentRefund({ requestId: requested.data.requestId, confirmation: true })).toMatchObject({ success: true })
    } finally {
      context.userId = bursar
    }
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { reversals: true } }))
      .toMatchObject({ status: "REFUNDED", reversals: [expect.objectContaining({ createdBy: approverId })] })
    expect(await prisma.counterRefundRequest.findUniqueOrThrow({ where: { id: requested.data.requestId } }))
      .toMatchObject({ status: "APPROVED", requestedBy: bursar, decidedBy: approverId })
    const notices = await outbox({ templateKey: "payment.refunded" })
    expect(notices.some((row) => row.channel === "EMAIL" && row.body.includes("Paid twice at the bursary"))).toBe(true)
  })
})

describe("results notices", () => {
  it("refuses to announce unpublished results, then allows it once published", async () => {
    expect(await sendResultsNotice({ classTermId: currentClassTermId, channels: ["EMAIL"] })).toMatchObject({ success: false, error: expect.stringMatching(/Publish/) })
    await prisma.classTermResultWorkflow.create({ data: { classTermId: currentClassTermId, status: "PUBLISHED", publishedAt: new Date("2026-04-02") } })
    const first = await sendResultsNotice({ classTermId: currentClassTermId, channels: ["EMAIL"] })
    expect(first).toMatchObject({ success: true, data: { queued: 2 } })
    expect(await sendResultsNotice({ classTermId: currentClassTermId, channels: ["EMAIL"] })).toMatchObject({ success: true, data: { queued: 0, duplicates: 2 } })
  })

  it("allows a fresh notice after a republish", async () => {
    await prisma.classTermResultWorkflow.update({ where: { classTermId: currentClassTermId }, data: { publishedAt: new Date("2026-04-05") } })
    expect(await sendResultsNotice({ classTermId: currentClassTermId, channels: ["EMAIL"] })).toMatchObject({ success: true, data: { queued: 2 } })
  })

  it("sends the annual notice only when every term of the session is published", async () => {
    await prisma.classTermResultWorkflow.update({ where: { classTermId: currentClassTermId }, data: { status: "REVIEWED" } })
    const blocked = await comms.previewAnnualNotice({ classId, sessionId, channels: ["EMAIL"] })
    expect(blocked).toMatchObject({ success: true, data: { blockedReason: expect.stringMatching(/Second Term/) } })
    await prisma.classTermResultWorkflow.update({ where: { classTermId: currentClassTermId }, data: { status: "PUBLISHED" } })
    expect(await comms.sendAnnualNotice({ classId, sessionId, channels: ["EMAIL"] })).toMatchObject({ success: true, data: { queued: 2 } })
  })
})

describe("fee reminders and a school's controls", () => {
  beforeEach(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { schoolId, templateKey: "fees.reminder" } })
    await prisma.schoolNotificationSettings.deleteMany({ where: { schoolId } })
  })

  it("reminds each owing learner's family once a day, with their own balance", async () => {
    const preview = await comms.previewFeeReminder({ classId, minBalance: 1, channels: ["SMS", "EMAIL"] })
    expect(preview).toMatchObject({ success: true, data: { audience: 2, smsRecipients: 2, emailRecipients: 2 } })
    expect(await comms.sendFeeReminder({ classId, minBalance: 1, channels: ["SMS", "EMAIL"] })).toMatchObject({ success: true, data: { queued: 4 } })
    expect(await comms.sendFeeReminder({ classId, minBalance: 1, channels: ["SMS", "EMAIL"] })).toMatchObject({ success: true, data: { queued: 0, duplicates: 4 } })
    const bala = (await outbox({ templateKey: "fees.reminder", studentId: studentB, channel: "EMAIL" }))[0]!
    expect(bala.body).toContain("15,000.00")
  })

  it("obeys a switched-off channel and the monthly SMS cap", async () => {
    await comms.saveNotificationControls({ disabled: ["fees.reminder:SMS", "payment.received:EMAIL"], smsMonthlyLimit: null })
    const controls = await comms.getNotificationControls()
    const receipts = controls.success ? controls.data.categories.find((c) => c.key === "payment.received")! : null
    expect(receipts?.channels.find((c) => c.channel === "EMAIL")).toMatchObject({ enabled: true, essential: true })
    expect(await comms.sendFeeReminder({ classId, minBalance: 1, channels: ["SMS", "EMAIL"] })).toMatchObject({ success: true, data: { queued: 2, switchedOff: 2 } })

    await prisma.notificationOutbox.deleteMany({ where: { schoolId, templateKey: "fees.reminder" } })
    const controlsNow = await comms.getNotificationControls()
    const used = controlsNow.success ? controlsNow.data.smsUnitsThisMonth : 0
    await comms.saveNotificationControls({ disabled: [], smsMonthlyLimit: null })
    const preview = await comms.previewFeeReminder({ classId, minBalance: 1, channels: ["SMS"] })
    const each = preview.success ? preview.data.smsSegmentsEach : 1
    // Room for exactly one reminder SMS this month.
    await comms.saveNotificationControls({ disabled: [], smsMonthlyLimit: used + each })
    expect(await comms.sendFeeReminder({ classId, minBalance: 1, channels: ["SMS"] })).toMatchObject({ success: true, data: { queued: 1, overSmsLimit: 1 } })
  })
})

describe("announcements", () => {
  beforeAll(async () => { await prisma.schoolNotificationSettings.deleteMany({ where: { schoolId } }) })

  it("reaches a parent of two children once, can be scheduled, and withdrawn", async () => {
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const sent = await comms.sendAnnouncement({ title: "Mid-term break", message: "School closes Friday.", audience: "ALL_PARENTS", channels: ["SMS", "EMAIL"], scheduledFor: later.toISOString() })
    expect(sent).toMatchObject({ success: true, data: { queued: 2 } })
    if (!sent.success) return
    const rows = await outbox({ templateKey: "announcement" })
    expect(rows.filter((row) => row.recipientUserId === parentUserId)).toHaveLength(2)
    expect(rows.every((row) => row.availableAt.getTime() >= later.getTime() - 1000)).toBe(true)
    expect(rows.find((row) => row.channel === "EMAIL")!.body).toContain("Dear Hauwa Bello")

    expect(await comms.cancelAnnouncement({ id: sent.data.announcementId })).toEqual({ success: true, data: { cancelled: 2 } })
    expect((await outbox({ templateKey: "announcement" })).every((row) => row.status === "CANCELLED")).toBe(true)
  })

  it("needs at least one class for a class announcement", async () => {
    expect(await comms.previewAnnouncement({ title: "Trip", message: "Bring lunch.", audience: "CLASS_PARENTS", classIds: [], channels: ["EMAIL"] }))
      .toMatchObject({ success: false, error: "Choose at least one class" })
  })
})

describe("the worker in production", () => {
  it("never marks a message sent when no provider is configured", async () => {
    const saved = { ...process.env }
    try {
      for (const key of ["SMARTSMS_API_TOKEN", "SMARTSMS_SENDER_ID", "TERMII_API_KEY", "RESEND_API_KEY"]) delete process.env[key]
      ;(process.env as Record<string, string>).NODE_ENV = "production"
      const result = await drainOutbox(10)
      expect(result).toMatchObject({ sent: 0, notConfigured: ["SMS", "EMAIL"] })
    } finally {
      Object.assign(process.env, saved)
    }
  })

  it("refuses the cron route without the secret", async () => {
    const { POST } = await import("@/app/api/cron/notifications/route")
    const response = await POST(new Request("http://localhost/api/cron/notifications", { method: "POST" }))
    expect(response.status).toBe(401)
  })
})

describe("two people at once", () => {
  it("receipts one bank alert once, even when two cashiers submit it at the same moment", async () => {
    // One alert presented at two windows, for two different children, so the postings share
    // no charge row. Whichever loses must be refused with a reason a cashier can act on,
    // never a second receipt and never a bare database error.
    const reference = `${stamp}-RACE`
    const attempt = (studentId: string, chargeId: string) => recordStudentPayment({
      studentId, termId: currentTermId, paymentMethod: "BANK_TRANSFER", referenceNo: reference,
      allocations: [{ chargeId, amount: 1000 }],
    })
    const results = await Promise.all([attempt(studentA, charges.A2), attempt(studentB, charges.B2)])

    expect(results.filter((result) => result.success)).toHaveLength(1)
    const loser = results.find((result) => !result.success)
    expect(loser && !loser.success ? loser.error : "").toMatch(/already receipted|at the same moment/)
    expect(await prisma.payment.count({ where: { schoolId, referenceNo: reference } })).toBe(1)
  })

  it("keeps two campaigns started together inside the monthly SMS cap", async () => {
    const { queueGoverned, loadGovernance } = await import("@/lib/notifications/campaign.server")
    await prisma.schoolNotificationSettings.deleteMany({ where: { schoolId } })
    const used = (await loadGovernance(prisma, schoolId)).smsUnitsThisMonth
    // Room for three one-segment texts, and two campaigns of two each arriving together.
    await prisma.schoolNotificationSettings.create({ data: { schoolId, smsMonthlyLimit: used + 3 } })
    const campaign = (name: string) => queueGoverned(schoolId, [1, 2].map((index) => ({
      schoolId, channel: "SMS" as const, recipient: `0803111222${index}`,
      body: `${stamp} cap race ${name} ${index}`, dedupeKey: `${stamp}:cap:${name}:${index}`,
    })))

    try {
      const [first, second] = await Promise.all([campaign("A"), campaign("B")])
      expect(first.queued + second.queued).toBe(3)
      expect(first.overSmsLimit + second.overSmsLimit).toBe(1)
      expect((await loadGovernance(prisma, schoolId)).smsUnitsThisMonth).toBe(used + 3)
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { schoolId, dedupeKey: { startsWith: `${stamp}:cap:` } } })
      await prisma.schoolNotificationSettings.deleteMany({ where: { schoolId } })
    }
  })
})

describe("a message SmartSMS scheduled for the morning", () => {
  it("cannot be retried, because it would be sent and charged twice", async () => {
    const scheduled = await prisma.notificationOutbox.create({
      data: {
        schoolId, channel: "SMS", recipient: "+2348012345678", body: `${stamp} receipt`, templateKey: "payment.received",
        status: "FAILED", attempts: 1, failedAt: new Date(), dedupeKey: `${stamp}:scheduled`,
        // What an earlier version stored, taking SmartSMS's "scheduled" reply for a refusal.
        lastError: "Your message has been scheduled to deliver at the following time(s): 2026-10-02 08:15:00. This is due to the time restriction",
      },
    })
    try {
      expect(await comms.retryNotification({ id: scheduled.id }))
        .toMatchObject({ success: false, error: expect.stringMatching(/will deliver it at 2026-10-02 08:15\. Retrying would send it twice/) })
      expect(await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: scheduled.id } })).toMatchObject({ status: "FAILED" })

      // An ordinary refusal can still be retried.
      await prisma.notificationOutbox.update({ where: { id: scheduled.id }, data: { lastError: "Insufficient SMS units in the SmartSMS wallet" } })
      expect(await comms.retryNotification({ id: scheduled.id })).toMatchObject({ success: true })
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { id: scheduled.id } })
    }
  })
})
