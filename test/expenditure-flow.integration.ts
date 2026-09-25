import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The expenditure module end to end, against a real database.
 *
 * Drives the actual server actions through the life of a payment: set up a category and an
 * account, record an expense, work it through approval, release the money, then read the
 * reports and the budget summary back and check the arithmetic ties out.
 *
 * The parts worth having a test for are the guards, because each one exists to stop a
 * specific way a school loses money: paying the same invoice twice, editing an expense
 * after it was approved, overdrawing an account, and an accountant approving their own
 * spending.
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
  approveExpense,
  cancelExpense,
  createExpense,
  createExpenseCategory,
  createPaymentAccount,
  getBudgetSummary,
  getExpenditureOverview,
  getExpenditureSetupData,
  getExpense,
  getExpenseTransactions,
  getSessionExpenditureReport,
  getTermlyExpenditureReport,
  markExpensePaid,
  rejectExpense,
  updateExpense,
} = await import("@/app/actions/expenditure")
const { createFinanceOfficer } = await import("@/app/actions/finance")

const STAMP = "ZZ Expenditure"
const OPENING_BALANCE = 500_000
const BUDGET_LIMIT = 60_000
const AMOUNT = 20_000

function ok<T>(result: { success: true; data: T } | { success: false; error: string }, label: string): T {
  if (!result.success) throw new Error(`${label} failed: ${result.error}`)
  return result.data
}

function err(result: { success: true } | { success: false; error: string }, label: string): string {
  if (result.success) throw new Error(`${label} was expected to fail, but succeeded`)
  return result.error
}

const created = {
  categoryId: "",
  accountId: "",
  expenseIds: [] as string[],
  accountantUserId: "",
}

let schoolId = ""
let sessionId = ""
let termId = ""
let adminUserId = ""

/** Points the mocked session at a given user, so role behaviour can be exercised for real. */
function actAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

beforeAll(async () => {
  const term = await prisma.term.findFirst({
    where: { session: { school: { admins: { some: {} } } } },
    orderBy: { startDate: "desc" },
    select: { id: true, sessionId: true, session: { select: { schoolId: true } } },
  })
  if (!term) throw new Error("No term with a school to record expenditure against")

  termId = term.id
  sessionId = term.sessionId
  schoolId = term.session.schoolId

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId } },
    select: { id: true },
  })
  if (!admin) throw new Error(`No active admin for school ${schoolId}`)
  adminUserId = admin.id
  actAs(adminUserId)
})

afterAll(async () => {
  if (created.expenseIds.length > 0) {
    await prisma.expenseAttachment.deleteMany({ where: { expenseId: { in: created.expenseIds } } })
    await prisma.expense.deleteMany({ where: { id: { in: created.expenseIds } } })
  }
  if (created.categoryId) await prisma.expenseCategory.deleteMany({ where: { id: created.categoryId } })
  if (created.accountId) await prisma.paymentAccount.deleteMany({ where: { id: created.accountId } })
  if (created.accountantUserId) {
    await prisma.admin.deleteMany({ where: { userId: created.accountantUserId } })
    await prisma.credential.deleteMany({ where: { userId: created.accountantUserId } })
    await prisma.user.deleteMany({ where: { id: created.accountantUserId } })
  }
  // Voucher numbering is per school per year and shared with nothing else, so the sequence
  // row is left alone: resetting it would hand a real voucher number out twice.
  await prisma.$disconnect()
})

/** Records an expense with sensible defaults and registers it for teardown. */
async function record(overrides: Record<string, unknown> = {}) {
  const result = await createExpense({
    termId,
    categoryId: created.categoryId,
    accountId: created.accountId,
    payeeName: `${STAMP} Vendor`,
    payeeType: "VENDOR",
    description: `${STAMP} supplies`,
    amount: AMOUNT,
    paymentMethod: "CASH",
    expenseDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  })
  if (result.success) created.expenseIds.push(result.data.id)
  return result
}

describe("setting up the payment chart", () => {
  it("creates a category with a termly budget", async () => {
    const category = ok(
      await createExpenseCategory({
        name: `${STAMP} Repairs`,
        description: "Integration fixture",
        budgetLimit: BUDGET_LIMIT,
      }),
      "createExpenseCategory",
    )
    created.categoryId = category.id
    expect(category.id).toBeTruthy()
  })

  it("creates an account with an opening balance", async () => {
    const account = ok(
      await createPaymentAccount({
        name: `${STAMP} Cash Office`,
        type: "CASH",
        openingBalance: OPENING_BALANCE,
      }),
      "createPaymentAccount",
    )
    created.accountId = account.id

    const setup = ok(await getExpenditureSetupData(), "getExpenditureSetupData")
    const row = setup.accounts.find((entry) => entry.id === account.id)
    expect(row, "the new account should appear in the payment chart").toBeTruthy()
    // Nothing spent yet, so the balance is exactly what it opened with.
    expect(Number(row!.balance)).toBe(OPENING_BALANCE)
  })
})

describe("recording an expense", () => {
  it("issues a voucher number and waits for approval", async () => {
    const expense = ok(await record(), "createExpense")
    expect(expense.voucherNo).toMatch(/^PV-\d{4}-\d{5}$/)
    expect(expense.status).toBe("PENDING_APPROVAL")
  })

  it("refuses a second identical payment until it is confirmed", async () => {
    // Same account, payee, amount and day: far more often a resubmitted form than a real
    // second payment, so it has to be acknowledged rather than silently accepted.
    const blocked = err(await record(), "duplicate createExpense")
    expect(blocked).toContain("Confirm the duplicate")

    const allowed = ok(await record({ confirmDuplicate: true }), "confirmed duplicate")
    expect(allowed.voucherNo).toBeTruthy()
  })

  it("saves a draft without sending it for approval", async () => {
    const draft = ok(await record({ submit: false, amount: 1_000, confirmDuplicate: true }), "draft")
    expect(draft.status).toBe("DRAFT")
  })
})

describe("the approval trail", () => {
  let expenseId = ""

  it("lets an expense be edited while it still awaits approval", async () => {
    expenseId = created.expenseIds[0]
    const result = await updateExpense({
      expenseId,
      termId,
      categoryId: created.categoryId,
      accountId: created.accountId,
      payeeName: `${STAMP} Vendor`,
      payeeType: "VENDOR",
      description: `${STAMP} supplies, corrected`,
      amount: AMOUNT,
      paymentMethod: "CASH",
      expenseDate: new Date().toISOString().slice(0, 10),
    })
    expect(result.success).toBe(true)
  })

  it("records who approved it", async () => {
    const approved = ok(await approveExpense({ expenseId }), "approveExpense")
    expect(approved.status).toBe("APPROVED")

    const expense = ok(await getExpense(expenseId), "getExpense")
    expect(expense.approvedByName).toBeTruthy()
    expect(expense.approvedAt).toBeTruthy()
    expect(expense.paidByName).toBeNull()
  })

  it("refuses an edit once approved", async () => {
    // The payroll-lock principle: what was approved must still be what was approved.
    const message = err(
      await updateExpense({
        expenseId,
        termId,
        categoryId: created.categoryId,
        accountId: created.accountId,
        payeeName: "Someone else entirely",
        payeeType: "VENDOR",
        description: "Quietly changed after approval",
        amount: 999_999,
        paymentMethod: "CASH",
        expenseDate: new Date().toISOString().slice(0, 10),
      }),
      "edit after approval",
    )
    expect(message).toContain("Cannot edit")
  })

  it("releases the money and moves the account balance", async () => {
    const paid = ok(await markExpensePaid({ expenseId, referenceNo: `${STAMP}-REF` }), "markExpensePaid")
    expect(paid.status).toBe("PAID")
    expect(Number(paid.accountBalance)).toBe(OPENING_BALANCE - AMOUNT)

    const expense = ok(await getExpense(expenseId), "getExpense")
    expect(expense.paidByName).toBeTruthy()
    expect(expense.paidAt).toBeTruthy()
    expect(expense.referenceNo).toBe(`${STAMP}-REF`)
  })

  it("refuses to pay the same expense twice", async () => {
    const message = err(await markExpensePaid({ expenseId }), "second payment")
    expect(message).toContain("Cannot pay")
  })

  it("cannot pay something that was never approved", async () => {
    const pending = ok(await record({ amount: 500, confirmDuplicate: true }), "pending expense")
    const message = err(await markExpensePaid({ expenseId: pending.id }), "pay unapproved")
    expect(message).toContain("Cannot pay")
  })

  it("rejects with a reason, and the reason is kept", async () => {
    const toReject = ok(await record({ amount: 750, confirmDuplicate: true }), "expense to reject")
    ok(await rejectExpense({ expenseId: toReject.id, reason: "Not budgeted for this term" }), "rejectExpense")

    const expense = ok(await getExpense(toReject.id), "getExpense")
    expect(expense.status).toBe("REJECTED")
    expect(expense.decisionReason).toBe("Not budgeted for this term")
  })
})

describe("the account cannot be quietly overdrawn", () => {
  it("blocks a payment the account cannot cover, then allows it deliberately", async () => {
    const big = ok(await record({ amount: OPENING_BALANCE * 2, confirmDuplicate: true }), "large expense")
    ok(await approveExpense({ expenseId: big.id }), "approve large expense")

    const message = err(await markExpensePaid({ expenseId: big.id }), "overdraw")
    expect(message).toContain("Allow the overdraft")

    const forced = ok(await markExpensePaid({ expenseId: big.id, allowOverdraft: true }), "forced payment")
    expect(Number(forced.accountBalance)).toBeLessThan(0)

    // Cancelling restores the balance, because it is computed from paid expenses rather
    // than stored as a running total.
    ok(await cancelExpense({ expenseId: big.id, reason: "Recorded against the wrong account" }), "cancelExpense")
    const setup = ok(await getExpenditureSetupData(), "getExpenditureSetupData")
    const account = setup.accounts.find((entry) => entry.id === created.accountId)
    expect(Number(account!.balance)).toBe(OPENING_BALANCE - AMOUNT)
  })
})

describe("segregation of duties", () => {
  it("lets an accountant record but not approve", async () => {
    const officer = ok(
      await createFinanceOfficer({
        firstName: "ZZ",
        lastName: "Officer",
        email: `zz.officer.${Date.now()}@example.test`,
      }),
      "createFinanceOfficer",
    )
    created.accountantUserId = officer.userId

    actAs(officer.userId)

    // Recording is theirs to do.
    const recorded = ok(await record({ amount: 1_500, confirmDuplicate: true }), "accountant records")
    expect(recorded.status).toBe("PENDING_APPROVAL")

    // Approving is not, and neither is setting up the chart.
    expect(err(await approveExpense({ expenseId: recorded.id }), "accountant approves")).toContain("Unauthorized")
    expect(
      err(await createExpenseCategory({ name: `${STAMP} Sneaky` }), "accountant creates a category"),
    ).toContain("Unauthorized")

    // ...but they can still read every report, which is the job.
    expect(ok(await getExpenditureOverview(), "accountant reads the overview").sessionTotal).toBeTruthy()

    actAs(adminUserId)
  })
})

describe("the reports agree with the ledger", () => {
  it("counts only paid money as spent", async () => {
    const report = ok(await getTermlyExpenditureReport({ termId }), "getTermlyExpenditureReport")
    // One expense was paid and then cancelled, and one remains paid.
    expect(Number(report.paid)).toBe(AMOUNT)
    // Committed is paid plus approved-but-unpaid, so it is never below paid.
    expect(Number(report.committed)).toBeGreaterThanOrEqual(Number(report.paid))
  })

  it("flags a category that has gone past its budget", async () => {
    const report = ok(await getTermlyExpenditureReport({ termId }), "getTermlyExpenditureReport")
    const row = report.byCategory.find((entry) => entry.id === created.categoryId)
    expect(row, "the billed category should appear").toBeTruthy()
    expect(row!.budgetLimit).toBe(BUDGET_LIMIT.toFixed(2))
    // 20,000 spent against a 60,000 limit is within budget.
    expect(row!.overBy).toBeNull()
  })

  it("rolls the terms up into the session total", async () => {
    const report = ok(await getSessionExpenditureReport({ sessionId }), "getSessionExpenditureReport")
    const summed = report.terms.reduce((total, term) => total + Number(term.paid), 0)
    expect(Number(report.sessionTotals.paid)).toBeCloseTo(summed, 2)
  })

  it("filters the transaction list by status and amount", async () => {
    const paid = ok(await getExpenseTransactions({ termId, status: "PAID" }), "filter by status")
    expect(paid.rows.every((row) => row.status === "PAID")).toBe(true)

    const large = ok(await getExpenseTransactions({ termId, minAmount: AMOUNT }), "filter by amount")
    expect(large.rows.every((row) => Number(row.amount) >= AMOUNT)).toBe(true)

    const byPayee = ok(await getExpenseTransactions({ termId, payee: `${STAMP} Vendor` }), "filter by payee")
    expect(byPayee.rows.length).toBeGreaterThan(0)
    expect(byPayee.rows.every((row) => row.payeeName.includes(STAMP))).toBe(true)
  })

  it("ignores a nonsense amount filter rather than returning nothing", async () => {
    // A hand-edited ?minAmount=abc must not become NaN inside a Prisma comparison.
    const all = ok(await getExpenseTransactions({ termId }), "unfiltered")
    const nonsense = ok(await getExpenseTransactions({ termId, minAmount: Number("abc") }), "NaN filter")
    expect(nonsense.rows.length).toBe(all.rows.length)
  })
})

describe("the budget summary joins income to expenditure", () => {
  it("balances collected income against paid expenditure", async () => {
    const summary = ok(await getBudgetSummary({ sessionId }), "getBudgetSummary")

    expect(Number(summary.actualBalance)).toBeCloseTo(
      Number(summary.income.paid) - Number(summary.expenditure.paid),
      2,
    )
    expect(Number(summary.expectedBalance)).toBeCloseTo(
      Number(summary.income.netExpected) - Number(summary.expenditure.paid),
      2,
    )
    expect(Number(summary.committedBalance)).toBeCloseTo(
      Number(summary.income.paid) - Number(summary.expenditure.committed),
      2,
    )
  })

  it("counts approved-but-unpaid money as committed, not spent", async () => {
    const summary = ok(await getBudgetSummary({ sessionId }), "getBudgetSummary")
    expect(Number(summary.expenditure.committed)).toBeCloseTo(
      Number(summary.expenditure.paid) + Number(summary.expenditure.approvedUnpaid),
      2,
    )
    // Committing more than you have spent can only make the balance worse, never better.
    expect(Number(summary.committedBalance)).toBeLessThanOrEqual(Number(summary.actualBalance))
  })

  it("takes its income from the finance module rather than recomputing it", async () => {
    const { getAccumulatedFundReport } = await import("@/app/actions/finance")
    const fund = ok(await getAccumulatedFundReport({ sessionId }), "getAccumulatedFundReport")
    const summary = ok(await getBudgetSummary({ sessionId }), "getBudgetSummary")

    expect(summary.income.paid).toBe(fund.sessionTotals.paid)
    expect(summary.income.netExpected).toBe(fund.sessionTotals.netExpected)
    expect(summary.income.outstanding).toBe(fund.sessionTotals.outstanding)
  })
})
