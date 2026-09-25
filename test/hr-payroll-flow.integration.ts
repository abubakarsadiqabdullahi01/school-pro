import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * HR and payroll end to end, against a real database.
 *
 * The guards are what earn a test here, because each one exists to stop a specific way a
 * school pays somebody the wrong amount: a second payroll for the same month, a salary
 * change that erases what came before, an edit after approval, a payslip that quietly
 * rewrites itself, and an accountant approving their own pay.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {},
  // `lib/authz` reaches session expiry, which caches the school's idle limits.
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const {
  approvePayroll,
  assignStaffAllowance,
  assignStaffDeduction,
  assignStaffSalary,
  cancelPayroll,
  createAllowanceType,
  createDeductionType,
  createSalaryScale,
  createStaff,
  generatePayroll,
  getHrOverview,
  getHrReports,
  getPayrollRun,
  getPayslip,
  getStaffMember,
  payPayroll,
  reopenPayroll,
  saveHrConfig,
  setStaffEmploymentStatus,
  submitPayrollForApproval,
  updateStaff,
} = await import("@/app/actions/hr")
const { createExpenseCategory, createPaymentAccount, getExpenseTransactions } = await import(
  "@/app/actions/expenditure"
)
const { createFinanceOfficer } = await import("@/app/actions/finance")

const STAMP = "ZZ HR"
const BASE_SALARY = 200_000
const TRANSPORT = 20_000
const PENSION_PERCENT = 8
const OPENING_BALANCE = 5_000_000

// A month far enough back that a real payroll for it is implausible, so the unique
// (school, year, month) constraint cannot collide with the user's own data.
const YEAR = 2019
const MONTH = 7

function ok<T>(result: { success: true; data: T } | { success: false; error: string }, label: string): T {
  if (!result.success) throw new Error(`${label} failed: ${result.error}`)
  return result.data
}

function err(result: { success: true } | { success: false; error: string }, label: string): string {
  if (result.success) throw new Error(`${label} was expected to fail, but succeeded`)
  return result.error
}

const created = {
  staffIds: [] as string[],
  runIds: [] as string[],
  categoryId: "",
  accountId: "",
  scaleId: "",
  allowanceTypeId: "",
  deductionTypeId: "",
  accountantUserId: "",
  expenseIds: [] as string[],
}

let schoolId = ""
let adminUserId = ""
let mainStaffId = ""
let unsalariedStaffId = ""

function actAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school to run HR against")

  adminUserId = admin.id
  schoolId = admin.admin.schoolId
  actAs(adminUserId)

  // Proration off by default so the arithmetic assertions are about pay, not calendars;
  // one test turns it back on deliberately.
  ok(
    await saveHrConfig({
      staffNoPrefix: "ZZS",
      payrollClosingDay: 25,
      defaultPaymentMethod: "BANK_TRANSFER",
      requirePayrollApproval: true,
      allowNegativeNet: false,
      prorateFirstMonth: false,
    }),
    "saveHrConfig",
  )
})

afterAll(async () => {
  if (created.runIds.length > 0) {
    const items = await prisma.payrollItem.findMany({
      where: { runId: { in: created.runIds } },
      select: { id: true },
    })
    await prisma.payrollItemLine.deleteMany({ where: { itemId: { in: items.map((item) => item.id) } } })
    await prisma.salaryPayment.deleteMany({ where: { runId: { in: created.runIds } } })
    await prisma.payrollItem.deleteMany({ where: { runId: { in: created.runIds } } })
    await prisma.payrollRun.deleteMany({ where: { id: { in: created.runIds } } })
  }
  if (created.expenseIds.length > 0) {
    await prisma.expense.deleteMany({ where: { id: { in: created.expenseIds } } })
  }
  if (created.staffIds.length > 0) {
    await prisma.staffAllowance.deleteMany({ where: { staffId: { in: created.staffIds } } })
    await prisma.staffDeduction.deleteMany({ where: { staffId: { in: created.staffIds } } })
    await prisma.staffSalary.deleteMany({ where: { staffId: { in: created.staffIds } } })
    await prisma.staffDisciplinaryRecord.deleteMany({ where: { staffId: { in: created.staffIds } } })
    await prisma.staff.deleteMany({ where: { id: { in: created.staffIds } } })
  }
  if (created.allowanceTypeId) await prisma.allowanceType.deleteMany({ where: { id: created.allowanceTypeId } })
  if (created.deductionTypeId) await prisma.deductionType.deleteMany({ where: { id: created.deductionTypeId } })
  if (created.scaleId) await prisma.salaryScale.deleteMany({ where: { id: created.scaleId } })
  if (created.categoryId) await prisma.expenseCategory.deleteMany({ where: { id: created.categoryId } })
  if (created.accountId) await prisma.paymentAccount.deleteMany({ where: { id: created.accountId } })
  if (created.accountantUserId) {
    await prisma.admin.deleteMany({ where: { userId: created.accountantUserId } })
    await prisma.credential.deleteMany({ where: { userId: created.accountantUserId } })
    await prisma.user.deleteMany({ where: { id: created.accountantUserId } })
  }
  // The staff config is the school's own; leave it rather than deleting their settings.
  await prisma.$disconnect()
})

async function addStaff(firstName: string, overrides: Record<string, unknown> = {}) {
  const result = ok(
    await createStaff({
      firstName,
      lastName: "Tester",
      staffType: "TEACHER",
      employmentType: "FULL_TIME",
      department: `${STAMP} Department`,
      jobTitle: "Teacher",
      dateEmployed: "2015-01-01",
      bankName: "Test Bank",
      accountNumber: "0123456789",
      ...overrides,
    }),
    "createStaff",
  )
  created.staffIds.push(result.id)
  return result
}

describe("staff records", () => {
  it("issues a staff number using the configured prefix", async () => {
    const staff = await addStaff("Amina")
    mainStaffId = staff.id
    expect(staff.staffNo).toMatch(/^ZZS-\d{4}$/)
  })

  it("keeps salary history instead of overwriting it", async () => {
    const scale = ok(
      await createSalaryScale({ name: `${STAMP} Senior`, baseSalary: BASE_SALARY, gradeLevel: "GL 08" }),
      "createSalaryScale",
    )
    created.scaleId = scale.id

    ok(
      await assignStaffSalary({
        staffId: mainStaffId,
        scaleId: scale.id,
        baseSalary: 150_000,
        effectiveFrom: "2015-01-01",
      }),
      "first salary",
    )
    ok(
      await assignStaffSalary({
        staffId: mainStaffId,
        baseSalary: BASE_SALARY,
        effectiveFrom: "2016-01-01",
        note: "annual review",
      }),
      "raise",
    )

    const staff = ok(await getStaffMember(mainStaffId), "getStaffMember")
    expect(staff.salaryHistory).toHaveLength(2)
    // The old figure is still answerable, and exactly one row is current.
    expect(staff.salaryHistory.filter((salary) => salary.isActive)).toHaveLength(1)
    expect(Number(staff.currentSalary!.baseSalary)).toBe(BASE_SALARY)
    expect(staff.salaryHistory.some((salary) => Number(salary.baseSalary) === 150_000)).toBe(true)
  })

  it("refuses to link one login to two staff records", async () => {
    const second = await addStaff("Bola")
    ok(await updateStaff({ ...staffPayload("Amina"), staffId: mainStaffId, userId: adminUserId }), "link admin login")

    const message = err(
      await updateStaff({ ...staffPayload("Bola"), staffId: second.id, userId: adminUserId }),
      "second link",
    )
    expect(message).toContain("already linked")

    // Unlink so the fixture does not leave the admin attached to a test record.
    ok(await updateStaff({ ...staffPayload("Amina"), staffId: mainStaffId }), "unlink")
  })
})

function staffPayload(firstName: string) {
  return {
    firstName,
    lastName: "Tester",
    staffType: "TEACHER",
    employmentType: "FULL_TIME",
    dateEmployed: "2015-01-01",
  }
}

describe("payroll generation", () => {
  it("computes gross and net from the allowance and deduction configuration", async () => {
    const allowance = ok(
      await createAllowanceType({ name: `${STAMP} Transport`, kind: "FIXED", value: TRANSPORT, isTaxable: true }),
      "createAllowanceType",
    )
    created.allowanceTypeId = allowance.id

    const deduction = ok(
      await createDeductionType({
        name: `${STAMP} Pension`,
        kind: "PERCENTAGE",
        value: PENSION_PERCENT,
        timing: "PRE_TAX",
      }),
      "createDeductionType",
    )
    created.deductionTypeId = deduction.id

    ok(
      await assignStaffAllowance({ staffId: mainStaffId, typeId: allowance.id, startDate: "2015-01-01" }),
      "assignStaffAllowance",
    )
    ok(
      await assignStaffDeduction({ staffId: mainStaffId, typeId: deduction.id, startDate: "2015-01-01" }),
      "assignStaffDeduction",
    )

    // Somebody with no salary: payroll must skip and name them, not pay them zero.
    const unsalaried = await addStaff("Chidi")
    unsalariedStaffId = unsalaried.id

    const run = ok(await generatePayroll({ year: YEAR, month: MONTH }), "generatePayroll")
    created.runIds.push(run.id)

    expect(run.status).toBe("DRAFT")
    expect(run.skipped.some((entry) => entry.staffNo === unsalaried.staffNo)).toBe(true)

    const detail = ok(await getPayrollRun(run.id), "getPayrollRun")
    const item = detail.items.find((row) => row.staffId === mainStaffId)
    expect(item, "the salaried staff member should be on the run").toBeTruthy()

    const gross = BASE_SALARY + TRANSPORT
    const pension = (gross * PENSION_PERCENT) / 100
    expect(Number(item!.baseSalary)).toBe(BASE_SALARY)
    expect(Number(item!.totalAllowances)).toBe(TRANSPORT)
    expect(Number(item!.grossPay)).toBe(gross)
    expect(Number(item!.totalDeductions)).toBe(pension)
    expect(Number(item!.netPay)).toBe(gross - pension)
    expect(item!.payslipNo).toMatch(/^PS-\d{4}-\d{5}$/)
  })

  it("refuses a second payroll for the same month", async () => {
    // The duplicate-payroll guard, enforced by a unique index and surfaced in words.
    //
    // Matched on "already", not on a whole sentence. The message now names the month and
    // says what to do about it - "July 2019 has already been generated and is still a
    // draft. A month is generated once; open that run to change it." - which is a better
    // message than the one this used to pin, and there is no reason a rewording of it
    // should read as a broken guard.
    const message = err(await generatePayroll({ year: YEAR, month: MONTH }), "duplicate payroll")
    expect(message).toMatch(/already/i)
  })

  it("refuses to generate when deductions would exceed pay", async () => {
    const ruinous = ok(
      await createDeductionType({ name: `${STAMP} Ruinous`, kind: "FIXED", value: 10_000_000, timing: "POST_TAX" }),
      "createDeductionType",
    )
    ok(
      await assignStaffDeduction({ staffId: mainStaffId, typeId: ruinous.id, startDate: "2015-01-01" }),
      "assign ruinous deduction",
    )

    const message = err(await generatePayroll({ year: YEAR, month: MONTH + 1 }), "negative net")
    expect(message).toContain("Deductions exceed pay")

    // Put it back so the remaining tests work from a sane figure.
    await prisma.staffDeduction.deleteMany({ where: { deductionTypeId: ruinous.id } })
    await prisma.deductionType.delete({ where: { id: ruinous.id } })
  })

  it("leaves out somebody who has left, from their exit date", async () => {
    const leaver = await addStaff("Dayo")
    ok(await assignStaffSalary({ staffId: leaver.id, baseSalary: 100_000, effectiveFrom: "2015-01-01" }), "salary")
    ok(
      await setStaffEmploymentStatus({
        staffId: leaver.id,
        employmentStatus: "RESIGNED",
        effectiveOn: "2018-01-01",
      }),
      "resign",
    )

    const run = ok(await generatePayroll({ year: YEAR, month: MONTH + 2 }), "generatePayroll")
    created.runIds.push(run.id)

    const detail = ok(await getPayrollRun(run.id), "getPayrollRun")
    expect(detail.items.some((item) => item.staffId === leaver.id)).toBe(false)
  })
})

describe("the payslip is frozen", () => {
  it("does not change when the allowance configuration changes afterwards", async () => {
    // This is the reason PayrollItemLine exists. Without it, editing the transport allowance
    // would silently rewrite every payslip ever issued.
    const detail = ok(await getPayrollRun(created.runIds[0]), "getPayrollRun")
    const item = detail.items.find((row) => row.staffId === mainStaffId)!
    const before = ok(await getPayslip(item.id), "getPayslip before")

    await prisma.allowanceType.update({
      where: { id: created.allowanceTypeId },
      data: { value: 999_999, name: `${STAMP} Transport RENAMED` },
    })

    const after = ok(await getPayslip(item.id), "getPayslip after")
    expect(after.allowances).toEqual(before.allowances)
    expect(after.grossPay).toBe(before.grossPay)
    expect(after.netPay).toBe(before.netPay)

    await prisma.allowanceType.update({
      where: { id: created.allowanceTypeId },
      data: { value: TRANSPORT, name: `${STAMP} Transport` },
    })
  })

  it("breaks the payslip down into earnings and deductions", async () => {
    const detail = ok(await getPayrollRun(created.runIds[0]), "getPayrollRun")
    const item = detail.items.find((row) => row.staffId === mainStaffId)!
    const payslip = ok(await getPayslip(item.id), "getPayslip")

    expect(payslip.allowances).toHaveLength(1)
    expect(payslip.deductions).toHaveLength(1)
    expect(Number(payslip.baseSalary) + Number(payslip.totalAllowances)).toBeCloseTo(Number(payslip.grossPay), 2)
    expect(Number(payslip.grossPay) - Number(payslip.totalDeductions)).toBeCloseTo(Number(payslip.netPay), 2)
  })
})

describe("the payroll workflow", () => {
  let runId = ""

  it("moves from draft to approved", async () => {
    runId = created.runIds[0]
    ok(await submitPayrollForApproval({ runId }), "submitPayrollForApproval")
    ok(await approvePayroll({ runId }), "approvePayroll")

    const detail = ok(await getPayrollRun(runId), "getPayrollRun")
    expect(detail.status).toBe("APPROVED")
    expect(detail.approvedByName).toBeTruthy()
  })

  it("pays the run and books it as expenditure", async () => {
    const category = ok(await createExpenseCategory({ name: `${STAMP} Salaries` }), "createExpenseCategory")
    created.categoryId = category.id
    const account = ok(
      await createPaymentAccount({ name: `${STAMP} Payroll Account`, type: "BANK", openingBalance: OPENING_BALANCE }),
      "createPaymentAccount",
    )
    created.accountId = account.id

    const before = ok(await getPayrollRun(runId), "getPayrollRun")
    const paid = ok(
      await payPayroll({ runId, accountId: account.id, categoryId: category.id, method: "BANK_TRANSFER" }),
      "payPayroll",
    )

    expect(paid.status).toBe("PAID")
    expect(paid.expenseVoucherNo).toMatch(/^PV-\d{4}-\d{5}$/)
    // The account is down by exactly the net payroll.
    expect(Number(paid.accountBalance)).toBeCloseTo(OPENING_BALANCE - Number(before.totals.net), 2)

    // And it is a real expenditure record, not a note.
    const transactions = ok(await getExpenseTransactions({ accountId: account.id }), "getExpenseTransactions")
    const expense = transactions.rows.find((row) => row.voucherNo === paid.expenseVoucherNo)
    expect(expense, "the payroll should appear in expenditure").toBeTruthy()
    expect(expense!.status).toBe("PAID")
    expect(Number(expense!.amount)).toBeCloseTo(Number(before.totals.net), 2)
    created.expenseIds.push(expense!.id)
  })

  it("marks every payslip in the run as paid", async () => {
    const detail = ok(await getPayrollRun(runId), "getPayrollRun")
    expect(detail.items.every((item) => item.status === "PAID")).toBe(true)
  })

  it("locks a paid run against reopening", async () => {
    // The payroll lock: once salaries have gone out, the figures are a matter of record.
    const message = err(await reopenPayroll({ runId, reason: "Changed my mind" }), "reopen a paid run")
    expect(message).toContain("Cannot reopen")
  })

  it("refuses to pay the same run twice", async () => {
    const message = err(
      await payPayroll({ runId, accountId: created.accountId, categoryId: created.categoryId }),
      "second payment",
    )
    expect(message).toContain("Cannot pay")
  })

  it("allows a paid run to be cancelled with a reason, which drops it from the totals", async () => {
    const spare = ok(await generatePayroll({ year: YEAR, month: MONTH + 3 }), "generatePayroll")
    created.runIds.push(spare.id)
    ok(await approvePayroll({ runId: spare.id }), "approvePayroll")

    ok(await cancelPayroll({ runId: spare.id, reason: "Generated against the wrong month" }), "cancelPayroll")
    const detail = ok(await getPayrollRun(spare.id), "getPayrollRun")
    expect(detail.status).toBe("CANCELLED")
    expect(detail.decisionReason).toContain("wrong month")
  })
})

/**
 * What a refusal looks like.
 *
 * Matches the shape of an authorization failure rather than one exact sentence. These
 * pinned the literal word "Unauthorized", which stopped matching once the permission
 * system began naming the permission it wanted ("Missing permission: payroll.manage").
 * The refusal was working; the message had got clearer.
 *
 * That mattered more than a red tick: the assertion failed before the test could hand the
 * admin identity back, so every test after it in the file ran as the accountant and failed
 * for a reason that had nothing to do with what it was testing.
 */
const REFUSAL = /unauthor|missing permission|not permitted|forbidden/i

describe("segregation of duties", () => {
  // Runs even when an expectation above fails. Without this, a single failure leaves the
  // accountant signed in for every remaining test in the file.
  afterAll(() => actAs(adminUserId))

  it("lets an accountant generate and pay, but never approve or change a salary", async () => {
    const officer = ok(
      await createFinanceOfficer({
        firstName: "ZZ",
        lastName: "Payroll",
        email: `zz.payroll.${Date.now()}@example.test`,
      }),
      "createFinanceOfficer",
    )
    created.accountantUserId = officer.userId
    actAs(officer.userId)

    // Generating is theirs to do.
    const run = ok(await generatePayroll({ year: YEAR, month: MONTH + 1 }), "accountant generates")
    created.runIds.push(run.id)

    // Approving, and changing what anybody earns, are not.
    expect(err(await approvePayroll({ runId: run.id }), "accountant approves")).toMatch(REFUSAL)
    expect(
      err(
        await assignStaffSalary({ staffId: mainStaffId, baseSalary: 9_000_000, effectiveFrom: "2020-01-01" }),
        "accountant raises their own salary",
      ),
    ).toMatch(REFUSAL)
    expect(
      err(await createSalaryScale({ name: `${STAMP} Sneaky`, baseSalary: 1 }), "accountant creates a scale"),
    ).toMatch(REFUSAL)

    // Reading is the job, so that must still work.
    expect(ok(await getHrOverview(), "accountant reads the overview").staff.total).toBeGreaterThan(0)

    actAs(adminUserId)
  })
})

describe("proration", () => {
  it("pays a mid-month joiner for the days they worked", async () => {
    ok(
      await saveHrConfig({
        staffNoPrefix: "ZZS",
        payrollClosingDay: 25,
        defaultPaymentMethod: "BANK_TRANSFER",
        requirePayrollApproval: true,
        allowNegativeNet: false,
        prorateFirstMonth: true,
      }),
      "enable proration",
    )

    // The joiner starts partway through the very month being generated, which is the only
    // arrangement that exercises proration at all. December has 31 days; starting on the
    // 17th leaves 15 worked days, and 310,000 x 15/31 is exactly 150,000.
    const PRORATION_MONTH = 12
    const joiner = await addStaff("Emeka", { dateEmployed: `${YEAR}-${PRORATION_MONTH}-17` })
    ok(
      await assignStaffSalary({
        staffId: joiner.id,
        baseSalary: 310_000,
        effectiveFrom: `${YEAR}-${PRORATION_MONTH}-17`,
      }),
      "salary",
    )

    const run = ok(await generatePayroll({ year: YEAR, month: PRORATION_MONTH }), "generatePayroll")
    created.runIds.push(run.id)

    const detail = ok(await getPayrollRun(run.id), "getPayrollRun")
    const item = detail.items.find((row) => row.staffId === joiner.id)
    expect(item, "the mid-month joiner should be on the run").toBeTruthy()
    expect(item!.proratedDays).toBe(15)
    expect(item!.daysInMonth).toBe(31)
    expect(Number(item!.baseSalary)).toBe(150_000)

    // Somebody who worked the whole month alongside them is not prorated.
    const full = detail.items.find((row) => row.staffId === mainStaffId)
    expect(full, "a full-month colleague should also be on the run").toBeTruthy()
    expect(full!.proratedDays).toBeNull()
    expect(Number(full!.baseSalary)).toBe(BASE_SALARY)
  })
})

describe("the reports agree with the payslips", () => {
  it("totals allowances and deductions from the frozen lines", async () => {
    const reports = ok(await getHrReports({ runId: created.runIds[0] }), "getHrReports")

    const transport = reports.allowanceSummary.find((row) => row.name.includes("Transport"))
    expect(transport, "the transport allowance should appear").toBeTruthy()
    expect(Number(transport!.total)).toBe(TRANSPORT)

    const pension = reports.deductionSummary.find((row) => row.name.includes("Pension"))
    expect(pension, "the pension deduction should appear").toBeTruthy()
    expect(Number(pension!.total)).toBeGreaterThan(0)
  })

  it("lists every active staff member's current salary", async () => {
    const reports = ok(await getHrReports(), "getHrReports")
    const amina = reports.salaryStructure.find((row) => row.name.startsWith("Amina"))
    expect(amina, "an active salaried staff member should appear").toBeTruthy()
    expect(Number(amina!.baseSalary)).toBe(BASE_SALARY)
  })

  it("surfaces active staff who have no salary at all", async () => {
    const overview = ok(await getHrOverview(), "getHrOverview")
    expect(overview.withoutSalary).toBeGreaterThan(0)
    expect(unsalariedStaffId).toBeTruthy()
  })
})
