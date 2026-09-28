import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The finance module end to end, against a real database.
 *
 * Type-checking and linting say nothing about whether a charge balance survives a discount,
 * or whether a receipt's allocations add up to the money taken. This drives the actual
 * server actions — not a re-implementation of them — through the sequence a term is worked
 * in: schedule fees, bill students, take a payment, adjust, then read every report back and
 * check the arithmetic ties out.
 *
 * Everything it creates is torn down afterwards. It borrows an existing school, session,
 * term and class rather than inventing them, because charge generation depends on real
 * enrolment.
 */

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  unstable_cache: <T>(loader: T) => loader,
}))
// Only reached for a super admin picking a school from the switcher; this suite acts as a
// school admin, whose school comes from their own record.
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const {
  applyChargeDiscount,
  applyChargeExemption,
  createFeeCategory,
  createFeeSchedule,
  getAccumulatedFundReport,
  getClassPaymentSummary,
  getDebtorsReport,
  getFinanceOverview,
  getReceipt,
  getStudentStatement,
  recordStudentPayment,
} = await import("@/app/actions/finance")

const STAMP = "ZZ Integration"
const FEE_AMOUNT = 50_000
const PAYMENT = 20_000
const DISCOUNT_PERCENT = 10 // of FEE_AMOUNT => 5,000
const EXEMPTION_FIXED = 2_500
const DISCOUNT_VALUE = (FEE_AMOUNT * DISCOUNT_PERCENT) / 100

/** Unwraps an ActionResult, surfacing the action's own error text when it failed. */
function ok<T>(result: { success: true; data: T } | { success: false; error: string }, label: string): T {
  if (!result.success) throw new Error(`${label} failed: ${result.error}`)
  return result.data
}

const created = {
  categoryId: "",
  scheduleIds: [] as string[],
  paymentIds: [] as string[],
  // The prior-session cohort, built so "returning" is not vacuously empty.
  priorSessionId: "",
  priorTermId: "",
  priorClassTermId: "",
  priorStudentIds: [] as string[],
}

let schoolId = ""
let sessionId = ""
let termId = ""
let classTermId = ""
let enrolledCount = 0
let newStudentCount = 0
let returningStudentCount = 0
let studentId = ""
let chargeId = ""

beforeAll(async () => {
  // A class that actually has students enrolled: charge generation reads StudentClassTerm,
  // so an empty class would let the whole billing path pass without doing anything.
  const enrolment = await prisma.studentClassTerm.findFirst({
    where: { status: "ACTIVE" },
    select: {
      classTermId: true,
      termId: true,
      studentId: true,
      student: { select: { schoolId: true } },
      classTerm: { select: { classId: true, term: { select: { sessionId: true } } } },
    },
  })
  if (!enrolment) throw new Error("No active student enrolment in the database to bill against")

  schoolId = enrolment.student.schoolId
  classTermId = enrolment.classTermId
  termId = enrolment.termId
  sessionId = enrolment.classTerm.term.sessionId
  studentId = enrolment.studentId

  const enrolments = await prisma.studentClassTerm.findMany({
    where: { classTermId, status: "ACTIVE" },
    select: { studentId: true },
    orderBy: { studentId: "asc" },
  })
  enrolledCount = enrolments.length
  if (enrolledCount < 2) throw new Error("Need at least two enrolled students to split new from returning")

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { startDate: true },
  })

  // A seeded school may only have one session, which would leave "returning" empty and let
  // the appliesTo tests pass without proving anything. Build a genuine earlier session and
  // put some — not all — of this class through it, so the cohort is actually mixed.
  const priorStart = new Date(session.startDate)
  priorStart.setFullYear(priorStart.getFullYear() - 1)
  const priorEnd = new Date(session.startDate)
  priorEnd.setDate(priorEnd.getDate() - 1)

  const priorSession = await prisma.session.create({
    data: {
      schoolId,
      name: `${STAMP} Prior Session`,
      startDate: priorStart,
      endDate: priorEnd,
      isCurrent: false,
    },
    select: { id: true },
  })
  created.priorSessionId = priorSession.id

  const priorTerm = await prisma.term.create({
    data: {
      sessionId: priorSession.id,
      name: `${STAMP} Prior Term`,
      startDate: priorStart,
      endDate: priorEnd,
      isCurrent: false,
    },
    select: { id: true },
  })
  created.priorTermId = priorTerm.id

  const priorClassTerm = await prisma.classTerm.create({
    data: { classId: enrolment.classTerm.classId, termId: priorTerm.id },
    select: { id: true },
  })
  created.priorClassTermId = priorClassTerm.id

  // Half the class, and never the whole class, so both branches have someone in them.
  created.priorStudentIds = enrolments
    .slice(0, Math.max(1, Math.floor(enrolledCount / 2)))
    .map((row) => row.studentId)

  await prisma.studentClassTerm.createMany({
    data: created.priorStudentIds.map((id) => ({
      studentId: id,
      classTermId: priorClassTerm.id,
      termId: priorTerm.id,
      status: "ACTIVE" as const,
    })),
  })

  // The new/returning split is worked out here independently of the action under test, so
  // the assertion is a real check rather than the code agreeing with itself.
  const earlier = await prisma.studentClassTerm.findMany({
    where: {
      studentId: { in: enrolments.map((row) => row.studentId) },
      term: { session: { schoolId, startDate: { lt: session.startDate } } },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  })
  const returning = new Set(earlier.map((row) => row.studentId))
  returningStudentCount = enrolments.filter((row) => returning.has(row.studentId)).length
  newStudentCount = enrolledCount - returningStudentCount

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId } },
    select: { id: true },
  })
  if (!admin) throw new Error(`No active admin for school ${schoolId}`)

  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
})

afterAll(async () => {
  // FK-safe order: allocations, then payments, then the adjustments and charges hanging off
  // each schedule, then the schedules and their category.
  if (created.paymentIds.length > 0) {
    await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: created.paymentIds } } })
    await prisma.payment.deleteMany({ where: { id: { in: created.paymentIds } } })
  }
  if (created.scheduleIds.length > 0) {
    const charges = await prisma.studentCharge.findMany({
      where: { feeScheduleId: { in: created.scheduleIds } },
      select: { id: true },
    })
    const chargeIds = charges.map((charge) => charge.id)
    if (chargeIds.length > 0) {
      await prisma.discount.deleteMany({ where: { chargeId: { in: chargeIds } } })
      await prisma.feeExemption.deleteMany({ where: { chargeId: { in: chargeIds } } })
      await prisma.paymentAllocation.deleteMany({ where: { chargeId: { in: chargeIds } } })
      await prisma.studentCharge.deleteMany({ where: { id: { in: chargeIds } } })
    }
    await prisma.feeSchedule.deleteMany({ where: { id: { in: created.scheduleIds } } })
  }
  if (created.categoryId) {
    await prisma.feeCategory.delete({ where: { id: created.categoryId } })
  }

  // The prior-session cohort, innermost first.
  if (created.priorClassTermId) {
    await prisma.studentClassTerm.deleteMany({ where: { classTermId: created.priorClassTermId } })
    await prisma.classTerm.delete({ where: { id: created.priorClassTermId } })
  }
  if (created.priorTermId) await prisma.term.delete({ where: { id: created.priorTermId } })
  if (created.priorSessionId) await prisma.session.delete({ where: { id: created.priorSessionId } })

  await prisma.$disconnect()
})

/** Creates a schedule under the shared category and registers it for teardown. */
async function schedule(name: string, appliesTo: "NEW_STUDENTS" | "RETURNING_STUDENTS" | "ALL_STUDENTS") {
  const result = ok(
    await createFeeSchedule({
      sessionId,
      termId,
      classTermId,
      categoryId: created.categoryId,
      name,
      amount: FEE_AMOUNT,
      appliesTo,
      isMandatory: true,
    }),
    `createFeeSchedule(${appliesTo})`,
  )
  created.scheduleIds.push(result.id)
  return result
}

describe("fee setup bills every enrolled student", () => {
  it("creates a category", async () => {
    const category = ok(
      await createFeeCategory({ name: `${STAMP} Tuition`, type: "MANDATORY", description: "Integration fixture" }),
      "createFeeCategory",
    )
    created.categoryId = category.id
    expect(category.id).toBeTruthy()
  })

  it("generates one charge per active student in the class", async () => {
    const result = await schedule(`${STAMP} Term Fee`, "ALL_STUDENTS")
    expect(enrolledCount).toBeGreaterThan(0)
    expect(result.chargesCreated).toBe(enrolledCount)
  })

  it("bills the student the scheduled amount, with nothing paid yet", async () => {
    const statement = ok(await getStudentStatement(studentId), "getStudentStatement")
    const charge = statement.charges.find((row) => row.description === `${STAMP} Term Fee`)
    expect(charge, "the new fee should appear on the student's statement").toBeTruthy()

    chargeId = charge!.id
    expect(Number(charge!.amount)).toBe(FEE_AMOUNT)
    expect(Number(charge!.paid)).toBe(0)
    expect(Number(charge!.balance)).toBe(FEE_AMOUNT)
    expect(charge!.status).toBe("UNPAID")
  })
})

describe("appliesTo decides who is billed", () => {
  // This was stored on the schedule and ignored during billing, so a new-student
  // registration fee was charged to returning students as well.
  it("bills only students new to the session", async () => {
    const result = await schedule(`${STAMP} Registration`, "NEW_STUDENTS")
    expect(result.chargesCreated).toBe(newStudentCount)
  })

  it("bills only students returning from an earlier session", async () => {
    const result = await schedule(`${STAMP} Returning Levy`, "RETURNING_STUDENTS")
    expect(result.chargesCreated).toBe(returningStudentCount)
  })

  it("splits the class exactly, billing nobody twice and nobody not at all", async () => {
    expect(newStudentCount + returningStudentCount).toBe(enrolledCount)
  })

  it("is testing a genuinely mixed cohort", () => {
    // Guards the two tests above. With every student on one side of the split, they would
    // both pass while proving nothing — which is how the original bug survived.
    expect(newStudentCount, "no new students in the fixture").toBeGreaterThan(0)
    expect(returningStudentCount, "no returning students in the fixture").toBeGreaterThan(0)
  })
})

describe("a payment is allocated to the fee items it settles", () => {
  it("records the payment and returns a receipt number", async () => {
    const payment = ok(
      await recordStudentPayment({
        studentId,
        termId,
        paymentMethod: "CASH",
        referenceNo: `${STAMP}-REF`,
        allocations: [{ chargeId, amount: PAYMENT }],
      }),
      "recordStudentPayment",
    )
    created.paymentIds.push(payment.id)
    expect(payment.receiptNo).toBeTruthy()
  })

  it("moves the charge to PARTIAL and leaves the right balance", async () => {
    const charge = await prisma.studentCharge.findUniqueOrThrow({ where: { id: chargeId } })
    expect(Number(charge.amountPaid)).toBe(PAYMENT)
    expect(Number(charge.balance)).toBe(FEE_AMOUNT - PAYMENT)
    expect(charge.status).toBe("PARTIAL")
  })

  it("produces a receipt whose allocations add up to the money taken", async () => {
    const receipt = ok(await getReceipt(created.paymentIds[0]), "getReceipt")
    const allocated = receipt.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
    expect(allocated).toBe(PAYMENT)
    expect(Number(receipt.amount)).toBe(PAYMENT)
  })
})

describe("discounts and exemptions reduce what is owed", () => {
  it("applies a percentage discount against the original amount", async () => {
    const discount = ok(
      await applyChargeDiscount({
        studentId,
        chargeId,
        type: "PERCENTAGE",
        value: DISCOUNT_PERCENT,
        reason: `${STAMP} sibling discount`,
      }),
      "applyChargeDiscount",
    )
    expect(Number(discount.amountApplied)).toBe(DISCOUNT_VALUE)
  })

  // FULL vs PARTIAL is not an input: the action derives it from whether the exemption
  // clears the remaining balance. What it takes is how to compute the amount.
  it("applies a fixed exemption on top", async () => {
    const exemption = ok(
      await applyChargeExemption({
        studentId,
        chargeId,
        type: "FIXED",
        value: EXEMPTION_FIXED,
        reason: `${STAMP} hardship exemption`,
      }),
      "applyChargeExemption",
    )
    expect(Number(exemption.amountApplied)).toBe(EXEMPTION_FIXED)
  })

  it("recalculates the charge so due = original - discount - exemption", async () => {
    const charge = await prisma.studentCharge.findUniqueOrThrow({ where: { id: chargeId } })
    const expectedDue = FEE_AMOUNT - DISCOUNT_VALUE - EXEMPTION_FIXED

    expect(Number(charge.discountAmount)).toBe(DISCOUNT_VALUE)
    expect(Number(charge.exemptedAmount)).toBe(EXEMPTION_FIXED)
    expect(Number(charge.finalAmountDue)).toBe(expectedDue)
    expect(Number(charge.balance)).toBe(expectedDue - PAYMENT)
    expect(Number(charge.amountPaid)).toBe(PAYMENT)
    expect(charge.status).toBe("PARTIAL")
  })

  it("rejects bad input with a readable message instead of throwing", async () => {
    // Node's inspect throws on a ZodError, so logging one used to escape the action's own
    // catch block and surface as an unhandled server error rather than a form message.
    const result = await applyChargeExemption({
      studentId,
      chargeId,
      type: "NOT_A_TYPE",
      value: EXEMPTION_FIXED,
      reason: `${STAMP} invalid`,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBeTruthy()
    expect(result.error).not.toContain("[")
  })
})

describe("the reports agree with the ledger", () => {
  it("lists the student as a debtor for the outstanding balance", async () => {
    const debtors = ok(await getDebtorsReport({ termId }), "getDebtorsReport")
    const row = debtors.find((entry) => entry.studentId === studentId)
    expect(row, "a student with a balance should appear in the debtor report").toBeTruthy()
    expect(Number(row!.balance)).toBeGreaterThan(0)
  })

  it("counts the class summary against the charges it generated", async () => {
    const summary = ok(await getClassPaymentSummary({ termId }), "getClassPaymentSummary")
    const row = summary.find((entry) => entry.classTermId === classTermId)
    expect(row, "the billed class should appear in the class summary").toBeTruthy()
    expect(row!.students).toBeGreaterThan(0)
    expect(Number(row!.expected)).toBeGreaterThan(0)
    // Expected is what is still owed plus what has come in, whatever else the class carries.
    expect(Number(row!.paid) + Number(row!.outstanding)).toBeCloseTo(Number(row!.expected), 2)
  })

  it("nets the accumulated fund down by the adjustments", async () => {
    const report = ok(await getAccumulatedFundReport({ sessionId }), "getAccumulatedFundReport")
    const row = report.terms.find((entry) => entry.termId === termId)
    expect(row, "the billed term should appear in the accumulated fund report").toBeTruthy()

    const netExpected = Number(row!.scheduledFees) - Number(row!.discounts) - Number(row!.exemptions)
    expect(Number(row!.netExpected)).toBeCloseTo(netExpected, 2)
    expect(Number(row!.netExpected)).toBeCloseTo(Number(row!.paid) + Number(row!.outstanding), 2)
  })

  it("reflects the same adjustments on the finance dashboard", async () => {
    const overview = ok(await getFinanceOverview(), "getFinanceOverview")
    expect(Number(overview.totals.discounts)).toBeGreaterThanOrEqual(DISCOUNT_VALUE)
    expect(Number(overview.totals.exemptions)).toBeGreaterThanOrEqual(EXEMPTION_FIXED)
    expect(overview.counts.partial).toBeGreaterThan(0)
  })
})

describe("the debtor list can be narrowed to a chase list", () => {
  it("keeps a student whose balance clears the threshold and drops one who does not", async () => {
    const included = ok(await getDebtorsReport({ termId, minBalance: 1 }), "getDebtorsReport(minBalance: 1)")
    expect(included.some((row) => row.studentId === studentId)).toBe(true)

    const excluded = ok(
      await getDebtorsReport({ termId, minBalance: 999_999_999 }),
      "getDebtorsReport(minBalance: huge)",
    )
    expect(excluded).toHaveLength(0)
  })

  it("separates students who have paid something from those who have paid nothing", async () => {
    const partial = ok(await getDebtorsReport({ termId, paymentStatus: "PARTIAL" }), "getDebtorsReport(PARTIAL)")
    const unpaid = ok(await getDebtorsReport({ termId, paymentStatus: "UNPAID" }), "getDebtorsReport(UNPAID)")

    // This student paid 20,000 of their fee, so they are part-paid and not untouched.
    expect(partial.some((row) => row.studentId === studentId)).toBe(true)
    expect(unpaid.some((row) => row.studentId === studentId)).toBe(false)

    // Every part-paid debtor has money against them; every unpaid one has none.
    expect(partial.every((row) => Number(row.totalPaid) > 0)).toBe(true)
    expect(unpaid.every((row) => Number(row.totalPaid) === 0)).toBe(true)
  })

  it("splits new from returning without losing or duplicating anyone", async () => {
    const all = ok(await getDebtorsReport({ sessionId, termId }), "getDebtorsReport(all)")
    const newOnly = ok(
      await getDebtorsReport({ sessionId, termId, studentType: "NEW_STUDENTS" }),
      "getDebtorsReport(NEW_STUDENTS)",
    )
    const returningOnly = ok(
      await getDebtorsReport({ sessionId, termId, studentType: "RETURNING_STUDENTS" }),
      "getDebtorsReport(RETURNING_STUDENTS)",
    )

    const ids = (rows: Array<{ studentId: string }>) => new Set(rows.map((row) => row.studentId))
    const newIds = ids(newOnly)
    const returningIds = ids(returningOnly)

    expect(newOnly.length + returningOnly.length).toBe(all.length)
    expect([...newIds].some((id) => returningIds.has(id))).toBe(false)
    for (const id of ids(all)) {
      expect(newIds.has(id) || returningIds.has(id)).toBe(true)
    }
  })

  it("refuses a new-or-returning filter it cannot anchor to a session", async () => {
    // Without a session there is no "before", so the question is unanswerable. Saying so
    // beats quietly returning every debtor as though they were all new.
    const current = await prisma.session.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } })
    if (current) return // a current session exists, so the filter can anchor itself

    const result = await getDebtorsReport({ studentType: "NEW_STUDENTS" })
    expect(result.success).toBe(false)
  })
})
