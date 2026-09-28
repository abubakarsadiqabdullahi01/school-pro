"use server"

import { Prisma, type ExpenseStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getAccumulatedFundReport } from "@/app/actions/finance"
import { recordAudit } from "@/lib/audit"
import { AuthorizationError, requirePermission, type Actor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import {
  matchesCategoryUsage,
  type ExpenseCategoryFilters,
} from "@/lib/expenditure/expense-category-filters"
import {
  canDeleteExpenseCategory,
  canUseExpenseCategoryName,
} from "@/lib/expenditure/expense-category-rules"
import {
  matchesDerivedFilters,
  type PaymentAccountFilters,
} from "@/lib/expenditure/payment-account-filters"
import {
  canClosePaymentAccount,
  canDeletePaymentAccount,
  canUsePaymentAccountName,
} from "@/lib/expenditure/payment-account-rules"
import { getActiveSchool } from "@/lib/school-context.server"
import { localFileKey, readStoredFile } from "@/lib/local-storage"

/**
 * Expenditure — the spending side of the ledger.
 *
 * Finance answers what came in. This answers where it went, who authorised it, and which
 * account it left from. The two meet in `getBudgetSummary`, which subtracts paid
 * expenditure from paid income.
 *
 * Three rules shape everything here:
 *
 *  - **Money is Decimal.** Never Float, never summed as plain numbers.
 *  - **Segregation of duties.** Recording, approving and paying are three separate acts by
 *    three recorded people. An accountant records and pays; only an admin approves.
 *  - **No silent edits after approval.** An approved or paid expense is immutable. A
 *    mistake is corrected by cancelling it with a reason, which leaves both the original
 *    and the correction visible.
 */

const moneySchema = z.coerce.number().positive().max(9999999999)

const expenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional().nullable(),
  budgetLimit: z.coerce.number().nonnegative().max(9999999999).optional().nullable(),
})

const paymentAccountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["CASH", "BANK", "POS", "WALLET", "OTHER"]).default("CASH"),
  bankName: z.string().trim().max(120).optional().nullable(),
  accountNumber: z.string().trim().max(40).optional().nullable(),
  openingBalance: z.coerce.number().nonnegative().max(9999999999).default(0),
})

const expenseSchema = z.object({
  termId: z.string().min(1),
  categoryId: z.string().min(1),
  accountId: z.string().min(1),
  payeeName: z.string().trim().min(2).max(150),
  payeeType: z.enum(["STAFF", "VENDOR", "PARENT", "STUDENT", "OTHER"]).default("VENDOR"),
  payeeUserId: z.string().min(1).optional().nullable(),
  payeeStudentId: z.string().min(1).optional().nullable(),
  description: z.string().trim().min(3).max(1000),
  amount: moneySchema,
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "POS", "CHEQUE", "ONLINE"]).default("CASH"),
  referenceNo: z.string().trim().max(120).optional().nullable(),
  expenseDate: z.coerce.date(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** DRAFT parks it for later; PENDING_APPROVAL puts it in front of an admin. */
  submit: z.coerce.boolean().default(true),
  /**
   * A same-account, same-payee, same-amount, same-day expense already exists. The caller
   * has seen the warning and means it — a school really can pay one vendor twice in a day.
   */
  confirmDuplicate: z.coerce.boolean().default(false),
})

const decisionSchema = z.object({
  expenseId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
})

const paySchema = z.object({
  expenseId: z.string().min(1),
  paidOn: z.coerce.date().optional().nullable(),
  referenceNo: z.string().trim().max(120).optional().nullable(),
  /** Let the payment take the account below zero. Recorded in the audit trail. */
  allowOverdraft: z.coerce.boolean().default(false),
})

const attachmentSchema = z.object({
  expenseId: z.string().min(1),
  url: z.string().trim().max(1000).refine(value => localFileKey(value)?.startsWith("expense-receipts/"), "Upload a receipt first"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive().max(25 * 1024 * 1024),
})

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/** Only PAID money has actually left the school. */
const SPENT: ExpenseStatus[] = ["PAID"]
/** Approved but unpaid is committed: promised, not yet gone. */
const COMMITTED: ExpenseStatus[] = ["APPROVED", "PAID"]
/** Editable states. Everything else is a matter of record. */
const EDITABLE: ExpenseStatus[] = ["DRAFT", "PENDING_APPROVAL"]

function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function moneyString(value: Prisma.Decimal.Value | null | undefined): string {
  return money(value ?? 0).toFixed(2)
}

/**
 * Expenditure is per-school, like finance. Admins and accountants carry their school on
 * their own record; a super admin browses the platform and picks one with the switcher.
 */
async function actorSchool(actor: Actor): Promise<string> {
  if (actor.schoolId) return actor.schoolId

  if (actor.role === "SUPER_ADMIN") {
    const active = await getActiveSchool()
    if (active) return active.id
  }

  throw new AuthorizationError("Select a school before using expenditure")
}

/** Read any expenditure record or report. */
async function requireExpenditureViewer(): Promise<Actor> {
  return requirePermission("expenditure.manage")
}

/** Configure categories and accounts, approve, reject, cancel. The admin's authority. */
async function requireExpenditureManager(): Promise<Actor> {
  return requirePermission("expenditure.approve")
}

/** Record an expense, attach a receipt, release payment on an approved one. */
async function requireExpenditureRecorder(): Promise<Actor> {
  return requirePermission("expenditure.manage")
}

/**
 * Expenditure renders under two URL trees — /dashboard/admin/expenditure for admins and
 * /dashboard/accountant/expenditure for the assigned officer — so every write clears both.
 * Paths that exist in one tree and not the other are a harmless no-op.
 */
function revalidateExpenditure(...suffixes: string[]) {
  for (const base of ["/dashboard/admin/expenditure", "/dashboard/accountant/expenditure"]) {
    revalidatePath(base)
    for (const suffix of suffixes) {
      revalidatePath(`${base}${suffix}`)
    }
  }
}

function toError(error: unknown, fallback: string): { success: false; error: string } {
  // A ZodError must not reach console.error: Node's inspect throws on one, and that throw
  // would escape this catch block and turn a rejected field into a server error. Same
  // hazard as on the finance side.
  if (error instanceof z.ZodError) {
    console.error(fallback, error.issues)
    const [issue] = error.issues
    if (!issue) return { success: false, error: fallback }
    const field = issue.path.join(".")
    return { success: false, error: field ? `${field}: ${issue.message}` : issue.message }
  }

  console.error(fallback, error)
  return { success: false, error: error instanceof Error ? error.message : fallback }
}

/**
 * What an account has left: what it opened with, minus everything actually paid out of it.
 *
 * Computed on read rather than stored. A cancelled or corrected expense then cannot leave a
 * stale balance behind, which is the usual way running-total columns go wrong.
 */
async function accountBalance(accountId: string, openingBalance: Prisma.Decimal): Promise<Prisma.Decimal> {
  const paid = await prisma.expense.aggregate({
    where: { accountId, status: { in: SPENT } },
    _sum: { amount: true },
  })
  return openingBalance.minus(paid._sum.amount ?? 0)
}

/**
 * How much of a category's termly budget is used, and by how much it is over.
 *
 * Returns null when the category has no limit set, which is the normal case — a limit is
 * opt-in. Committed spend is used rather than paid, so an approved-but-unpaid run of
 * expenses cannot hide the fact that the budget is gone.
 */
async function budgetUsage(categoryId: string, termId: string): Promise<
  { limit: string; committed: string; remaining: string; overBy: string } | null
> {
  const category = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
    select: { budgetLimit: true },
  })
  if (!category?.budgetLimit) return null

  const committed = await prisma.expense.aggregate({
    where: { categoryId, termId, status: { in: COMMITTED } },
    _sum: { amount: true },
  })
  const used = money(committed._sum.amount ?? 0)
  const remaining = category.budgetLimit.minus(used)

  return {
    limit: moneyString(category.budgetLimit),
    committed: moneyString(used),
    remaining: moneyString(Prisma.Decimal.max(remaining, money(0))),
    overBy: moneyString(remaining.isNegative() ? remaining.negated() : money(0)),
  }
}

/** Issues the next voucher number for the school and year, inside the caller's transaction. */
async function nextVoucherNo(tx: Prisma.TransactionClient, schoolId: string, year: number): Promise<string> {
  const sequence = await tx.expenseVoucherSequence.upsert({
    where: { schoolId_year: { schoolId, year } },
    create: { schoolId, year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  })
  return `PV-${year}-${String(sequence.lastSequence).padStart(5, "0")}`
}

/**
 * Loads an expense inside the actor's school, or throws.
 *
 * Every mutating action goes through this rather than trusting the id it was handed —
 * school scope comes from the session, never from a parameter.
 */
async function scopedExpense(expenseId: string, schoolId: string) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, schoolId },
    select: {
      id: true,
      voucherNo: true,
      status: true,
      amount: true,
      payeeName: true,
      recordedBy: true,
      accountId: true,
      categoryId: true,
      termId: true,
      account: { select: { name: true, openingBalance: true } },
      category: { select: { name: true } },
      _count: { select: { salaryPayments: true } },
    },
  })
  if (!expense) throw new Error("Expense not found")
  return expense
}

/** Validates every foreign key accepted by the expense form against the actor's school. */
async function validateExpenseReferences(
  data: z.infer<typeof expenseSchema>,
  schoolId: string,
) {
  const [term, category, account, payeeUser, payeeStudent] = await Promise.all([
    prisma.term.findFirst({
      where: { id: data.termId, session: { schoolId } },
      select: { id: true, sessionId: true },
    }),
    prisma.expenseCategory.findFirst({
      where: { id: data.categoryId, schoolId },
      select: { id: true, isActive: true },
    }),
    prisma.paymentAccount.findFirst({
      where: { id: data.accountId, schoolId },
      select: { id: true, isActive: true },
    }),
    data.payeeUserId
      ? prisma.user.findFirst({
          where: {
            id: data.payeeUserId,
            OR: [
              { admin: { schoolId } },
              { teacher: { schoolId } },
              { parent: { schoolId } },
              { staffRecord: { schoolId } },
            ],
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    data.payeeStudentId
      ? prisma.student.findFirst({ where: { id: data.payeeStudentId, schoolId }, select: { id: true } })
      : Promise.resolve(null),
  ])

  if (!term) throw new Error("Term not found")
  if (!category) throw new Error("Expense category not found")
  if (!category.isActive) throw new Error("That expense category is inactive")
  if (!account) throw new Error("Payment account not found")
  if (!account.isActive) throw new Error("That payment account is inactive")
  if (data.payeeUserId && !payeeUser) throw new Error("That payee is not a member of this school")
  if (data.payeeStudentId && !payeeStudent) throw new Error("That student is not in this school")
  return term
}

/** Rejects a state change the workflow does not allow, naming both states. */
function assertTransition(from: ExpenseStatus, allowed: ExpenseStatus[], intent: string) {
  if (!allowed.includes(from)) {
    throw new Error(`Cannot ${intent} an expense that is ${from.toLowerCase().replace("_", " ")}`)
  }
}

// ---------------------------------------------------------------------------
// Setup: categories and the payment chart
// ---------------------------------------------------------------------------

export async function getExpenditureSetupData(): Promise<ActionResult<{
  categories: Array<{ id: string; name: string; description: string | null; budgetLimit: string | null; isActive: boolean; expenseCount: number }>
  accounts: Array<{ id: string; name: string; type: string; bankName: string | null; accountNumber: string | null; openingBalance: string; balance: string; isActive: boolean }>
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  terms: Array<{ id: string; name: string; sessionId: string; isCurrent: boolean }>
}>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const [categories, accounts, sessions, terms] = await Promise.all([
      prisma.expenseCategory.findMany({
        where: { schoolId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          budgetLimit: true,
          isActive: true,
          _count: { select: { expenses: true } },
        },
      }),
      prisma.paymentAccount.findMany({
        where: { schoolId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          bankName: true,
          accountNumber: true,
          openingBalance: true,
          isActive: true,
        },
      }),
      prisma.session.findMany({
        where: { schoolId },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, isCurrent: true },
      }),
      prisma.term.findMany({
        where: { session: { schoolId } },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, sessionId: true, isCurrent: true },
      }),
    ])

    // One grouped query for every account's outflow, rather than one per account.
    const spendByAccount = await prisma.expense.groupBy({
      by: ["accountId"],
      where: { schoolId, status: { in: SPENT } },
      _sum: { amount: true },
    })
    const paidByAccount = new Map(spendByAccount.map((row) => [row.accountId, money(row._sum.amount ?? 0)]))

    return {
      success: true,
      data: {
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          budgetLimit: category.budgetLimit ? moneyString(category.budgetLimit) : null,
          isActive: category.isActive,
          expenseCount: category._count.expenses,
        })),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          openingBalance: moneyString(account.openingBalance),
          balance: moneyString(account.openingBalance.minus(paidByAccount.get(account.id) ?? 0)),
          isActive: account.isActive,
        })),
        sessions,
        terms,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load expenditure setup data")
  }
}

export async function createExpenseCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = expenseCategorySchema.parse(input)

    const category = await prisma.expenseCategory.create({
      data: {
        schoolId,
        name: data.name,
        description: data.description || null,
        budgetLimit: data.budgetLimit ? money(data.budgetLimit) : null,
      },
      select: { id: true },
    })

    revalidateExpenditure("/categories")
    return { success: true, data: category }
  } catch (error) {
    return toError(error, "Failed to create expense category")
  }
}

export async function setExpenseCategoryActive(input: unknown): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ categoryId: z.string().min(1), isActive: z.boolean() }).parse(input)

    // Deactivated rather than deleted: the category names historical spending, so removing
    // it would blank out past vouchers and reports.
    const category = await prisma.expenseCategory.findFirst({
      where: { id: data.categoryId, schoolId },
      select: { id: true },
    })
    if (!category) throw new Error("Expense category not found in this school")

    await prisma.expenseCategory.update({ where: { id: data.categoryId }, data: { isActive: data.isActive } })

    revalidateExpenditure("/categories")
    return { success: true, data: { isActive: data.isActive } }
  } catch (error) {
    return toError(error, "Failed to update expense category")
  }
}

export async function createPaymentAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = paymentAccountSchema.parse(input)

    const account = await prisma.paymentAccount.create({
      data: {
        schoolId,
        name: data.name,
        type: data.type,
        bankName: data.bankName || null,
        accountNumber: data.accountNumber || null,
        openingBalance: money(data.openingBalance),
      },
      select: { id: true },
    })

    revalidateExpenditure("/accounts")
    return { success: true, data: account }
  } catch (error) {
    return toError(error, "Failed to create payment account")
  }
}

export async function setPaymentAccountActive(input: unknown): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ accountId: z.string().min(1), isActive: z.boolean() }).parse(input)

    const account = await prisma.paymentAccount.findFirst({
      where: { id: data.accountId, schoolId },
      select: { id: true },
    })
    if (!account) throw new Error("Payment account not found in this school")

    await prisma.paymentAccount.update({ where: { id: data.accountId }, data: { isActive: data.isActive } })

    revalidateExpenditure("/accounts")
    return { success: true, data: { isActive: data.isActive } }
  } catch (error) {
    return toError(error, "Failed to update payment account")
  }
}

/** Raised, not yet paid. These are what a closed account would strand. */
const UNPAID: ExpenseStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED"]

export type ExpenseCategoryRow = {
  id: string
  name: string
  description: string | null
  budgetLimit: string | null
  isActive: boolean
  /** Every voucher ever raised under it, whatever became of it. */
  expenseCount: number
  /** Raised and not yet paid — the ones that would carry a retired label to payment. */
  unpaidExpenseCount: number
  /** Paid under it, all time. */
  totalSpent: string
  /** Paid under it in the current term — what the termly ceiling is reported against. */
  termSpend: string
  createdAt: string
}

/**
 * The expense categories, narrowed to what was asked for.
 *
 * Name, description, status and whether a ceiling exists are a `where`. Whether the term has
 * passed that ceiling is not — it compares a stored figure against one aggregated per term —
 * so it is applied in memory by the same predicate the screen's chips are built from.
 *
 * The term figure is the point of the list: a budget is termly, and "₦830,000 spent" means
 * nothing next to a ₦500,000 limit until you know which term it belongs to.
 */
export async function getExpenseCategories(
  filters: ExpenseCategoryFilters = {},
): Promise<ActionResult<{ rows: ExpenseCategoryRow[]; totalCount: number; termName: string | null }>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const where: Prisma.ExpenseCategoryWhereInput = { schoolId }
    if (filters.status) where.isActive = filters.status === "ACTIVE"
    if (filters.budget === "HAS_LIMIT") where.budgetLimit = { not: null }
    if (filters.budget === "NO_LIMIT") where.budgetLimit = null
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
      ]
    }

    const currentTerm = await prisma.term.findFirst({
      where: { session: { schoolId }, isCurrent: true },
      select: { id: true, name: true },
    })

    const [categories, totalCount, paidGroups, unpaidGroups, allGroups, termGroups] = await Promise.all([
      prisma.expenseCategory.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          budgetLimit: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.expenseCategory.count({ where: { schoolId } }),
      prisma.expense.groupBy({
        by: ["categoryId"],
        where: { schoolId, status: { in: SPENT } },
        _sum: { amount: true },
      }),
      prisma.expense.groupBy({
        by: ["categoryId"],
        where: { schoolId, status: { in: UNPAID } },
        _count: { _all: true },
      }),
      prisma.expense.groupBy({ by: ["categoryId"], where: { schoolId }, _count: { _all: true } }),
      currentTerm
        ? prisma.expense.groupBy({
            by: ["categoryId"],
            where: { schoolId, termId: currentTerm.id, status: { in: SPENT } },
            _sum: { amount: true },
          })
        : [],
    ])

    const paid = new Map(paidGroups.map((row) => [row.categoryId, money(row._sum.amount ?? 0)]))
    const unpaid = new Map(unpaidGroups.map((row) => [row.categoryId, row._count._all]))
    const raised = new Map(allGroups.map((row) => [row.categoryId, row._count._all]))
    const termPaid = new Map(termGroups.map((row) => [row.categoryId, money(row._sum.amount ?? 0)]))

    const rows = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        budgetLimit: category.budgetLimit ? moneyString(category.budgetLimit) : null,
        isActive: category.isActive,
        expenseCount: raised.get(category.id) ?? 0,
        unpaidExpenseCount: unpaid.get(category.id) ?? 0,
        totalSpent: moneyString(paid.get(category.id) ?? 0),
        termSpend: moneyString(termPaid.get(category.id) ?? 0),
        createdAt: category.createdAt.toISOString(),
      }))
      .filter((row) => matchesCategoryUsage(row, filters))

    return { success: true, data: { rows, totalCount, termName: currentTerm?.name ?? null } }
  } catch (error) {
    return toError(error, "Failed to load the expense categories")
  }
}

export type ExpenseCategoryDetail = ExpenseCategoryRow & {
  /** Every name in the school, so the form can check a rename before it is submitted. */
  takenNames: Array<{ id: string; name: string }>
  termName: string | null
  recentExpenses: Array<{
    id: string
    voucherNo: string
    payeeName: string
    accountName: string
    amount: string
    status: ExpenseStatus
    expenseDate: string
  }>
}

/** One category, with everything the manage screen decides what to offer on. */
export async function getExpenseCategory(categoryId: string): Promise<ActionResult<ExpenseCategoryDetail>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const category = await prisma.expenseCategory.findFirst({
      where: { id: categoryId, schoolId },
      select: {
        id: true,
        name: true,
        description: true,
        budgetLimit: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!category) throw new Error("Expense category not found in this school")

    const currentTerm = await prisma.term.findFirst({
      where: { session: { schoolId }, isCurrent: true },
      select: { id: true, name: true },
    })

    const [paid, termPaid, unpaidCount, totalCount, names, recent] = await Promise.all([
      prisma.expense.aggregate({
        where: { categoryId, status: { in: SPENT } },
        _sum: { amount: true },
      }),
      currentTerm
        ? prisma.expense.aggregate({
            where: { categoryId, termId: currentTerm.id, status: { in: SPENT } },
            _sum: { amount: true },
          })
        : null,
      prisma.expense.count({ where: { categoryId, status: { in: UNPAID } } }),
      prisma.expense.count({ where: { categoryId } }),
      prisma.expenseCategory.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      prisma.expense.findMany({
        where: { categoryId },
        orderBy: { expenseDate: "desc" },
        take: 6,
        select: {
          id: true,
          voucherNo: true,
          payeeName: true,
          amount: true,
          status: true,
          expenseDate: true,
          account: { select: { name: true } },
        },
      }),
    ])

    return {
      success: true,
      data: {
        id: category.id,
        name: category.name,
        description: category.description,
        budgetLimit: category.budgetLimit ? moneyString(category.budgetLimit) : null,
        isActive: category.isActive,
        expenseCount: totalCount,
        unpaidExpenseCount: unpaidCount,
        totalSpent: moneyString(paid._sum.amount ?? 0),
        termSpend: moneyString(termPaid?._sum.amount ?? 0),
        createdAt: category.createdAt.toISOString(),
        takenNames: names,
        termName: currentTerm?.name ?? null,
        recentExpenses: recent.map((expense) => ({
          id: expense.id,
          voucherNo: expense.voucherNo,
          payeeName: expense.payeeName,
          accountName: expense.account.name,
          amount: moneyString(expense.amount),
          status: expense.status,
          expenseDate: expense.expenseDate.toISOString(),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the expense category")
  }
}

/** Renames a category, corrects its description, moves its ceiling, retires or revives it. */
export async function updateExpenseCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = expenseCategorySchema.extend({ id: z.string().min(1), isActive: z.boolean() }).parse(input)

    const category = await prisma.expenseCategory.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true, isActive: true },
    })
    if (!category) throw new Error("Expense category not found in this school")

    // The same predicate the screen checks the name against as it is typed, so a stale page
    // or a direct call cannot get past what the screen refuses.
    const names = await prisma.expenseCategory.findMany({
      where: { schoolId },
      select: { id: true, name: true },
    })
    const naming = canUseExpenseCategoryName(data.name, names, data.id)
    if (!naming.allowed) throw new Error(naming.reason)

    await prisma.expenseCategory.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description || null,
        budgetLimit: data.budgetLimit ? money(data.budgetLimit) : null,
        isActive: data.isActive,
      },
    })

    await recordAudit({
      actor,
      action: "expenditure.category.update",
      entityType: "ExpenseCategory",
      entityId: data.id,
      summary: `Updated the expense category ${data.name}`,
      before: { name: category.name, isActive: category.isActive },
      after: {
        name: data.name,
        isActive: data.isActive,
        budgetLimit: data.budgetLimit ? moneyString(data.budgetLimit) : null,
      },
    })

    revalidateExpenditure("/categories", `/categories/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to update the expense category")
  }
}

/**
 * Deletes a category nothing has ever been charged to.
 *
 * Anything else is retired instead: a voucher carries its category as the heading it is
 * reported under, and `Expense.category` is RESTRICT precisely so past spending cannot lose
 * the answer to what it was for.
 */
export async function deleteExpenseCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ id: z.string().min(1) }).parse(input)

    const category = await prisma.expenseCategory.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true },
    })
    if (!category) throw new Error("Expense category not found in this school")

    const expenseCount = await prisma.expense.count({ where: { categoryId: data.id } })
    const removal = canDeleteExpenseCategory({ expenseCount })
    if (!removal.allowed) throw new Error(removal.reason)

    await prisma.expenseCategory.delete({ where: { id: data.id } })

    await recordAudit({
      actor,
      action: "expenditure.category.delete",
      entityType: "ExpenseCategory",
      entityId: data.id,
      summary: `Deleted the expense category ${category.name}, which nothing had been charged to`,
      before: { name: category.name },
    })

    revalidateExpenditure("/categories", `/categories/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to delete the expense category")
  }
}

export type PaymentAccountRow = {
  id: string
  name: string
  type: string
  bankName: string | null
  accountNumber: string | null
  openingBalance: string
  paidOut: string
  balance: string
  /** Every voucher ever raised against the account, whatever became of it. */
  expenseCount: number
  /** Those actually paid — the ones behind `paidOut`. */
  paidCount: number
  unpaidExpenseCount: number
  lastPaidAt: string | null
  isActive: boolean
  createdAt: string
}

/**
 * The payment chart, narrowed to what was asked for.
 *
 * Name, type and status are a `where`; balance and activity are not, because a balance is
 * derived on read and cannot be a column filter. Those two are applied in memory against the
 * same reading the table shows, by the predicate the screen's chips are built from.
 *
 * `totalCount` is every account in the school, so the list can say "3 of 11" rather than
 * leaving a filtered page looking like the whole chart.
 */
export async function getPaymentAccounts(
  filters: PaymentAccountFilters = {},
): Promise<ActionResult<{ rows: PaymentAccountRow[]; totalCount: number }>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const where: Prisma.PaymentAccountWhereInput = { schoolId }
    if (filters.type) where.type = filters.type as Prisma.PaymentAccountWhereInput["type"]
    if (filters.status) where.isActive = filters.status === "ACTIVE"
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { bankName: { contains: filters.search } },
        { accountNumber: { contains: filters.search } },
      ]
    }

    const [accounts, totalCount, paidGroups, unpaidGroups, allGroups] = await Promise.all([
      prisma.paymentAccount.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
          bankName: true,
          accountNumber: true,
          openingBalance: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.paymentAccount.count({ where: { schoolId } }),
      // One grouped query each, rather than three per account.
      prisma.expense.groupBy({
        by: ["accountId"],
        where: { schoolId, status: { in: SPENT } },
        _sum: { amount: true },
        _count: { _all: true },
        _max: { paidAt: true },
      }),
      prisma.expense.groupBy({
        by: ["accountId"],
        where: { schoolId, status: { in: UNPAID } },
        _count: { _all: true },
      }),
      prisma.expense.groupBy({
        by: ["accountId"],
        where: { schoolId },
        _count: { _all: true },
      }),
    ])

    const paid = new Map(paidGroups.map((row) => [row.accountId, row]))
    const unpaid = new Map(unpaidGroups.map((row) => [row.accountId, row._count._all]))
    const raised = new Map(allGroups.map((row) => [row.accountId, row._count._all]))

    const rows = accounts
      .map((account) => {
        const spend = paid.get(account.id)
        const paidOut = money(spend?._sum.amount ?? 0)

        return {
          id: account.id,
          name: account.name,
          type: account.type,
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          openingBalance: moneyString(account.openingBalance),
          paidOut: moneyString(paidOut),
          balance: moneyString(account.openingBalance.minus(paidOut)),
          expenseCount: raised.get(account.id) ?? 0,
          paidCount: spend?._count._all ?? 0,
          unpaidExpenseCount: unpaid.get(account.id) ?? 0,
          lastPaidAt: spend?._max.paidAt?.toISOString() ?? null,
          isActive: account.isActive,
          createdAt: account.createdAt.toISOString(),
        }
      })
      .filter((row) => matchesDerivedFilters(row, filters))

    return { success: true, data: { rows, totalCount } }
  } catch (error) {
    return toError(error, "Failed to load the payment chart")
  }
}

export type PaymentAccountDetail = PaymentAccountRow & {
  /** Every name in the school, so the form can check a rename before it is submitted. */
  takenNames: Array<{ id: string; name: string }>
  salaryPaymentCount: number
  staffConfigCount: number
  /** Why it may not be deletable, in the form of the things pointing at it. */
  recentExpenses: Array<{
    id: string
    voucherNo: string
    payeeName: string
    categoryName: string
    amount: string
    status: ExpenseStatus
    expenseDate: string
  }>
}

/** One account, with everything the manage screen decides what to offer on. */
export async function getPaymentAccount(accountId: string): Promise<ActionResult<PaymentAccountDetail>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const account = await prisma.paymentAccount.findFirst({
      where: { id: accountId, schoolId },
      select: {
        id: true,
        name: true,
        type: true,
        bankName: true,
        accountNumber: true,
        openingBalance: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!account) throw new Error("Payment account not found in this school")

    const [paid, unpaidCount, totalCount, salaryPaymentCount, staffConfigCount, names, recent] =
      await Promise.all([
        prisma.expense.aggregate({
          where: { accountId, status: { in: SPENT } },
          _sum: { amount: true },
          _count: { _all: true },
          _max: { paidAt: true },
        }),
        prisma.expense.count({ where: { accountId, status: { in: UNPAID } } }),
        prisma.expense.count({ where: { accountId } }),
        prisma.salaryPayment.count({ where: { accountId } }),
        prisma.staffConfig.count({ where: { defaultAccountId: accountId } }),
        prisma.paymentAccount.findMany({ where: { schoolId }, select: { id: true, name: true } }),
        prisma.expense.findMany({
          where: { accountId },
          orderBy: { expenseDate: "desc" },
          take: 6,
          select: {
            id: true,
            voucherNo: true,
            payeeName: true,
            amount: true,
            status: true,
            expenseDate: true,
            category: { select: { name: true } },
          },
        }),
      ])

    const paidOut = money(paid._sum.amount ?? 0)

    return {
      success: true,
      data: {
        id: account.id,
        name: account.name,
        type: account.type,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        openingBalance: moneyString(account.openingBalance),
        paidOut: moneyString(paidOut),
        balance: moneyString(account.openingBalance.minus(paidOut)),
        // Every voucher ever raised, not just the paid ones: this is the figure the delete
        // rule refuses on, and a pending voucher counts against deleting just as much.
        expenseCount: totalCount,
        paidCount: paid._count._all,
        unpaidExpenseCount: unpaidCount,
        lastPaidAt: paid._max.paidAt?.toISOString() ?? null,
        isActive: account.isActive,
        createdAt: account.createdAt.toISOString(),
        takenNames: names,
        salaryPaymentCount,
        staffConfigCount,
        recentExpenses: recent.map((expense) => ({
          id: expense.id,
          voucherNo: expense.voucherNo,
          payeeName: expense.payeeName,
          categoryName: expense.category.name,
          amount: moneyString(expense.amount),
          status: expense.status,
          expenseDate: expense.expenseDate.toISOString(),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the payment account")
  }
}

/**
 * Renames an account, corrects its details, and opens or closes it.
 *
 * The opening balance is editable because it is a stated fact that can be mistyped, and
 * every balance the module reports is derived from it — so the screen says what the
 * correction moves before it is saved.
 */
export async function updatePaymentAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = paymentAccountSchema.extend({ id: z.string().min(1), isActive: z.boolean() }).parse(input)

    const account = await prisma.paymentAccount.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true, isActive: true },
    })
    if (!account) throw new Error("Payment account not found in this school")

    // The same two predicates the screen greys its controls out with, so a stale page or a
    // direct call cannot get past what the screen refuses.
    const names = await prisma.paymentAccount.findMany({
      where: { schoolId },
      select: { id: true, name: true },
    })
    const naming = canUsePaymentAccountName(data.name, names, data.id)
    if (!naming.allowed) throw new Error(naming.reason)

    if (account.isActive && !data.isActive) {
      const unpaidExpenseCount = await prisma.expense.count({
        where: { accountId: data.id, status: { in: UNPAID } },
      })
      const closing = canClosePaymentAccount({ unpaidExpenseCount })
      if (!closing.allowed) throw new Error(closing.reason)
    }

    await prisma.paymentAccount.update({
      where: { id: data.id },
      data: {
        name: data.name,
        type: data.type,
        bankName: data.bankName || null,
        accountNumber: data.accountNumber || null,
        openingBalance: money(data.openingBalance),
        isActive: data.isActive,
      },
    })

    await recordAudit({
      actor,
      action: "expenditure.account.update",
      entityType: "PaymentAccount",
      entityId: data.id,
      summary: `Updated the payment account ${data.name}`,
      before: { name: account.name, isActive: account.isActive },
      after: { name: data.name, isActive: data.isActive, openingBalance: moneyString(data.openingBalance) },
    })

    revalidateExpenditure("/accounts", `/accounts/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to update the payment account")
  }
}

/**
 * Deletes an account nothing has ever used.
 *
 * Anything else is closed instead. A voucher, a salary payment or a staff default pointing at
 * it makes deletion either impossible at the database or destructive to the record of where
 * money came from, and `canDeletePaymentAccount` says which of the three is in the way.
 */
export async function deletePaymentAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ id: z.string().min(1) }).parse(input)

    const account = await prisma.paymentAccount.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true },
    })
    if (!account) throw new Error("Payment account not found in this school")

    const [expenseCount, salaryPaymentCount, staffConfigCount] = await Promise.all([
      prisma.expense.count({ where: { accountId: data.id } }),
      prisma.salaryPayment.count({ where: { accountId: data.id } }),
      prisma.staffConfig.count({ where: { defaultAccountId: data.id } }),
    ])

    const removal = canDeletePaymentAccount({ expenseCount, salaryPaymentCount, staffConfigCount })
    if (!removal.allowed) throw new Error(removal.reason)

    await prisma.paymentAccount.delete({ where: { id: data.id } })

    await recordAudit({
      actor,
      action: "expenditure.account.delete",
      entityType: "PaymentAccount",
      entityId: data.id,
      summary: `Deleted the payment account ${account.name}, which nothing had been paid from`,
      before: { name: account.name },
    })

    revalidateExpenditure("/accounts", `/accounts/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to delete the payment account")
  }
}

// ---------------------------------------------------------------------------
// The expense lifecycle
// ---------------------------------------------------------------------------

export async function createExpense(input: unknown): Promise<ActionResult<{
  id: string
  voucherNo: string
  status: ExpenseStatus
  budget: Awaited<ReturnType<typeof budgetUsage>>
}>> {
  try {
    const actor = await requireExpenditureRecorder()
    const schoolId = await actorSchool(actor)
    const data = expenseSchema.parse(input)

    const [term, category, account] = await Promise.all([
      prisma.term.findFirst({
        where: { id: data.termId, session: { schoolId } },
        select: { id: true, sessionId: true },
      }),
      prisma.expenseCategory.findFirst({
        where: { id: data.categoryId, schoolId },
        select: { id: true, isActive: true },
      }),
      prisma.paymentAccount.findFirst({
        where: { id: data.accountId, schoolId },
        select: { id: true, isActive: true },
      }),
    ])

    if (!term) throw new Error("Term not found")
    if (!category) throw new Error("Expense category not found")
    if (!category.isActive) throw new Error("That expense category is inactive")
    if (!account) throw new Error("Payment account not found")
    if (!account.isActive) throw new Error("That payment account is inactive")

    // A named payee must belong to this school, or the voucher would credit a stranger.
    if (data.payeeUserId) {
      const user = await prisma.user.findFirst({
        where: {
          id: data.payeeUserId,
          OR: [{ admin: { schoolId } }, { teacher: { schoolId } }, { parent: { schoolId } }],
        },
        select: { id: true },
      })
      if (!user) throw new Error("That payee is not a member of this school")
    }
    if (data.payeeStudentId) {
      const student = await prisma.student.findFirst({
        where: { id: data.payeeStudentId, schoolId },
        select: { id: true },
      })
      if (!student) throw new Error("That student is not in this school")
    }

    // Double-payment guard. Same account, payee, amount and day is far more often a
    // resubmitted form than a genuine second payment, so it has to be acknowledged.
    if (!data.confirmDuplicate) {
      const dayStart = new Date(data.expenseDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const twin = await prisma.expense.findFirst({
        where: {
          schoolId,
          accountId: data.accountId,
          payeeName: data.payeeName,
          amount: money(data.amount),
          expenseDate: { gte: dayStart, lt: dayEnd },
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        select: { voucherNo: true },
      })
      if (twin) {
        throw new Error(
          `${twin.voucherNo} already pays ${data.payeeName} this exact amount from this account on that date. ` +
            "Confirm the duplicate if it is genuinely a second payment.",
        )
      }
    }

    const year = data.expenseDate.getFullYear()
    const status: ExpenseStatus = data.submit ? "PENDING_APPROVAL" : "DRAFT"

    const expense = await prisma.$transaction(async (tx) => {
      const voucherNo = await nextVoucherNo(tx, schoolId, year)
      return tx.expense.create({
        data: {
          schoolId,
          sessionId: term.sessionId,
          termId: data.termId,
          categoryId: data.categoryId,
          accountId: data.accountId,
          voucherNo,
          payeeName: data.payeeName,
          payeeType: data.payeeType,
          payeeUserId: data.payeeUserId || null,
          payeeStudentId: data.payeeStudentId || null,
          description: data.description,
          amount: money(data.amount),
          paymentMethod: data.paymentMethod,
          referenceNo: data.referenceNo || null,
          expenseDate: data.expenseDate,
          notes: data.notes || null,
          status,
          recordedBy: actor.userId,
        },
        select: { id: true, voucherNo: true, status: true },
      })
    })

    await recordAudit({
      actor,
      action: "expense.record",
      entityType: "Expense",
      entityId: expense.id,
      summary: `Recorded ${expense.voucherNo}: ${moneyString(data.amount)} to ${data.payeeName}`,
      after: { voucherNo: expense.voucherNo, amount: moneyString(data.amount), status },
    })

    revalidateExpenditure("/transactions", "/new")
    return {
      success: true,
      data: { ...expense, budget: await budgetUsage(data.categoryId, data.termId) },
    }
  } catch (error) {
    return toError(error, "Failed to record expense")
  }
}

export async function updateExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureRecorder()
    const schoolId = await actorSchool(actor)
    const data = expenseSchema.extend({ expenseId: z.string().min(1) }).parse(input)

    const existing = await scopedExpense(data.expenseId, schoolId)
    // Immutable once an admin has looked at it. This is the payroll-lock principle: the
    // thing that was approved must still be the thing that was approved.
    assertTransition(existing.status, EDITABLE, "edit")

    const term = await validateExpenseReferences(data, schoolId)

    await prisma.expense.update({
      where: { id: data.expenseId },
      data: {
        sessionId: term.sessionId,
        termId: data.termId,
        categoryId: data.categoryId,
        accountId: data.accountId,
        payeeName: data.payeeName,
        payeeType: data.payeeType,
        payeeUserId: data.payeeUserId || null,
        payeeStudentId: data.payeeStudentId || null,
        description: data.description,
        amount: money(data.amount),
        paymentMethod: data.paymentMethod,
        referenceNo: data.referenceNo || null,
        expenseDate: data.expenseDate,
        notes: data.notes || null,
        status: data.submit ? "PENDING_APPROVAL" : "DRAFT",
      },
    })

    await recordAudit({
      actor,
      action: "expense.update",
      entityType: "Expense",
      entityId: data.expenseId,
      summary: `Edited ${existing.voucherNo} before approval`,
      before: { amount: moneyString(existing.amount), payeeName: existing.payeeName },
      after: { amount: moneyString(data.amount), payeeName: data.payeeName },
    })

    revalidateExpenditure("/transactions", `/transactions/${data.expenseId}`)
    return { success: true, data: { id: data.expenseId } }
  } catch (error) {
    return toError(error, "Failed to update expense")
  }
}

export async function approveExpense(input: unknown): Promise<ActionResult<{ id: string; status: ExpenseStatus }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ expenseId: z.string().min(1), note: z.string().trim().max(500).optional() }).parse(input)

    const expense = await scopedExpense(data.expenseId, schoolId)
    assertTransition(expense.status, ["DRAFT", "PENDING_APPROVAL"], "approve")

    const approved = await prisma.expense.updateMany({
      where: { id: expense.id, schoolId, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
      data: {
        status: "APPROVED",
        approvedBy: actor.userId,
        approvedAt: new Date(),
        decisionReason: data.note || null,
      },
    })
    if (approved.count !== 1) throw new Error("This expense changed while you were reviewing it. Refresh and try again.")

    // Recorded even when the approver is the recorder. Small schools are explicitly allowed
    // to have one person do both, and the log should show that plainly rather than hide it.
    await recordAudit({
      actor,
      action: "expense.approve",
      entityType: "Expense",
      entityId: expense.id,
      summary:
        `Approved ${expense.voucherNo}: ${moneyString(expense.amount)} to ${expense.payeeName}` +
        (expense.recordedBy === actor.userId ? " (recorded and approved by the same person)" : ""),
      before: { status: expense.status },
      after: { status: "APPROVED" },
    })

    revalidateExpenditure("/transactions", `/transactions/${expense.id}`)
    return { success: true, data: { id: expense.id, status: "APPROVED" } }
  } catch (error) {
    return toError(error, "Failed to approve expense")
  }
}

export async function rejectExpense(input: unknown): Promise<ActionResult<{ id: string; status: ExpenseStatus }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = decisionSchema.parse(input)

    const expense = await scopedExpense(data.expenseId, schoolId)
    assertTransition(expense.status, ["DRAFT", "PENDING_APPROVAL"], "reject")

    const rejected = await prisma.expense.updateMany({
      where: { id: expense.id, schoolId, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
      data: {
        status: "REJECTED",
        approvedBy: actor.userId,
        approvedAt: new Date(),
        decisionReason: data.reason,
      },
    })
    if (rejected.count !== 1) throw new Error("This expense changed while you were reviewing it. Refresh and try again.")

    await recordAudit({
      actor,
      action: "expense.reject",
      entityType: "Expense",
      entityId: expense.id,
      summary: `Rejected ${expense.voucherNo}: ${data.reason}`,
      before: { status: expense.status },
      after: { status: "REJECTED", reason: data.reason },
    })

    revalidateExpenditure("/transactions", `/transactions/${expense.id}`)
    return { success: true, data: { id: expense.id, status: "REJECTED" } }
  } catch (error) {
    return toError(error, "Failed to reject expense")
  }
}

export async function markExpensePaid(input: unknown): Promise<ActionResult<{
  id: string
  status: ExpenseStatus
  accountBalance: string
}>> {
  try {
    const actor = await requireExpenditureRecorder()
    const schoolId = await actorSchool(actor)
    const data = paySchema.parse(input)

    const expense = await scopedExpense(data.expenseId, schoolId)
    // Only an approved expense can be paid. That is the whole point of the approval step.
    assertTransition(expense.status, ["APPROVED"], "pay")

    const balanceBefore = await accountBalance(expense.accountId, expense.account.openingBalance)
    const balanceAfter = balanceBefore.minus(expense.amount)

    if (balanceAfter.isNegative() && !data.allowOverdraft) {
      throw new Error(
        `${expense.account.name} holds ${moneyString(balanceBefore)} and this pays ` +
          `${moneyString(expense.amount)}, leaving it ${moneyString(balanceAfter.negated())} short. ` +
          "Allow the overdraft if the account really can go below zero.",
      )
    }

    const paid = await prisma.expense.updateMany({
      where: { id: expense.id, schoolId, status: "APPROVED" },
      data: {
        status: "PAID",
        paidBy: actor.userId,
        paidAt: data.paidOn ?? new Date(),
        ...(data.referenceNo ? { referenceNo: data.referenceNo } : {}),
      },
    })
    if (paid.count !== 1) throw new Error("This expense is no longer awaiting payment. Refresh and try again.")

    await recordAudit({
      actor,
      action: "expense.pay",
      entityType: "Expense",
      entityId: expense.id,
      summary:
        `Paid ${expense.voucherNo}: ${moneyString(expense.amount)} to ${expense.payeeName} ` +
        `from ${expense.account.name}` +
        (balanceAfter.isNegative() ? " (overdraft allowed)" : ""),
      before: { status: "APPROVED", accountBalance: moneyString(balanceBefore) },
      after: { status: "PAID", accountBalance: moneyString(balanceAfter) },
    })

    revalidateExpenditure("/transactions", `/transactions/${expense.id}`, "/accounts", "/budget-summary")
    return {
      success: true,
      data: { id: expense.id, status: "PAID", accountBalance: moneyString(balanceAfter) },
    }
  } catch (error) {
    return toError(error, "Failed to mark expense as paid")
  }
}

/**
 * Cancels an unpaid expense or posts an explicit reversal for a paid one.
 *
 * Nothing is deleted and no amount is rewritten. The record stays, carries who cancelled it
 * and why, and drops out of every total — so the correction is as visible as the original.
 */
export async function cancelExpense(input: unknown): Promise<ActionResult<{ id: string; status: ExpenseStatus }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = decisionSchema.parse(input)

    const expense = await scopedExpense(data.expenseId, schoolId)
    assertTransition(expense.status, ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID"], "cancel or reverse")
    if (expense.status === "PAID" && expense._count.salaryPayments > 0) {
      throw new Error("This expense belongs to payroll. Reverse it from the payroll run so both records stay aligned.")
    }

    const nextStatus: ExpenseStatus = expense.status === "PAID" ? "REVERSED" : "CANCELLED"
    await prisma.$transaction(async (tx) => {
      const changed = await tx.expense.updateMany({
        where: { id: expense.id, schoolId, status: expense.status },
        data: { status: nextStatus, decisionReason: data.reason },
      })
      if (changed.count !== 1) {
        throw new Error("This expense changed before it could be corrected. Refresh and try again.")
      }
      if (nextStatus === "REVERSED") {
        await tx.accountingReversal.create({
          data: {
            schoolId,
            targetType: "EXPENSE",
            expenseId: expense.id,
            amount: expense.amount,
            reason: data.reason,
            createdBy: actor.userId,
          },
        })
      }
    })

    await recordAudit({
      actor,
      action: nextStatus === "REVERSED" ? "expense.reverse" : "expense.cancel",
      entityType: "Expense",
      entityId: expense.id,
      summary:
        `${nextStatus === "REVERSED" ? "Reversed" : "Cancelled"} ${expense.voucherNo} ` +
        `(${moneyString(expense.amount)} to ${expense.payeeName})` +
        `: ${data.reason}`,
      before: { status: expense.status },
      after: { status: nextStatus, reason: data.reason },
    })

    revalidateExpenditure("/transactions", `/transactions/${expense.id}`, "/accounts", "/budget-summary")
    return { success: true, data: { id: expense.id, status: nextStatus } }
  } catch (error) {
    return toError(error, "Failed to cancel expense")
  }
}

export async function addExpenseAttachment(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureRecorder()
    const schoolId = await actorSchool(actor)
    const data = attachmentSchema.parse(input)

    const key = localFileKey(data.url)
    if (!key || key.split("/")[1] !== schoolId) throw new AuthorizationError("Receipt belongs to another school")
    await readStoredFile(key)

    const expense = await scopedExpense(data.expenseId, schoolId)
    // Receipts can be added at any point, including after payment — the paper often arrives
    // late. What cannot change after approval is the expense itself.
    if (expense.status === "CANCELLED" || expense.status === "REJECTED" || expense.status === "REVERSED") {
      throw new Error("Cannot attach a receipt to a cancelled or rejected expense")
    }

    const attachment = await prisma.expenseAttachment.create({
      data: {
        expenseId: expense.id,
        url: data.url,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        uploadedBy: actor.userId,
      },
      select: { id: true },
    })

    revalidateExpenditure("/transactions", `/transactions/${expense.id}`)
    return { success: true, data: attachment }
  } catch (error) {
    return toError(error, "Failed to attach the receipt")
  }
}

export async function removeExpenseAttachment(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireExpenditureManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ attachmentId: z.string().min(1) }).parse(input)

    const attachment = await prisma.expenseAttachment.findFirst({
      where: { id: data.attachmentId, expense: { schoolId } },
      select: { id: true, expenseId: true, fileName: true },
    })
    if (!attachment) throw new Error("Attachment not found")

    await prisma.expenseAttachment.delete({ where: { id: attachment.id } })

    await recordAudit({
      actor,
      action: "expense.attachment_remove",
      entityType: "Expense",
      entityId: attachment.expenseId,
      summary: `Removed receipt ${attachment.fileName}`,
    })

    revalidateExpenditure("/transactions", `/transactions/${attachment.expenseId}`)
    return { success: true, data: { id: attachment.id } }
  } catch (error) {
    return toError(error, "Failed to remove the receipt")
  }
}

// ---------------------------------------------------------------------------
// Reading: transactions, vouchers, reports
// ---------------------------------------------------------------------------

/** Filters the transaction list accepts. All optional; omitted means "no restriction". */
export type ExpenseFilters = {
  sessionId?: string | null
  termId?: string | null
  categoryId?: string | null
  accountId?: string | null
  status?: ExpenseStatus | null
  payee?: string | null
  recordedBy?: string | null
  from?: Date | string | null
  to?: Date | string | null
  minAmount?: number | null
  maxAmount?: number | null
}

/** Turns the filter object into a Prisma `where`, dropping anything unset or unusable. */
function expenseWhere(schoolId: string, filters?: ExpenseFilters): Prisma.ExpenseWhereInput {
  const from = filters?.from ? new Date(filters.from) : null
  const to = filters?.to ? new Date(filters.to) : null
  // An inclusive end date: a user picking 31 March means the whole of that day.
  const toExclusive = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null

  const amount: Prisma.DecimalFilter = {}
  if (filters?.minAmount != null && Number.isFinite(filters.minAmount)) amount.gte = money(filters.minAmount)
  if (filters?.maxAmount != null && Number.isFinite(filters.maxAmount)) amount.lte = money(filters.maxAmount)

  return {
    schoolId,
    ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
    ...(filters?.termId ? { termId: filters.termId } : {}),
    ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters?.accountId ? { accountId: filters.accountId } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.recordedBy ? { recordedBy: filters.recordedBy } : {}),
    ...(filters?.payee ? { payeeName: { contains: filters.payee } } : {}),
    ...(from || toExclusive
      ? { expenseDate: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } }
      : {}),
    ...(Object.keys(amount).length > 0 ? { amount } : {}),
  }
}

type ExpenseRow = {
  id: string
  voucherNo: string
  expenseDate: string
  payeeName: string
  payeeType: string
  categoryName: string
  accountName: string
  description: string
  amount: string
  paymentMethod: string
  referenceNo: string | null
  status: ExpenseStatus
  recordedByName: string
  approvedByName: string | null
  paidByName: string | null
  attachmentCount: number
}

const personName = (person: { firstName: string; lastName: string } | null) =>
  person ? `${person.firstName} ${person.lastName}` : null

export async function getExpenseTransactions(filters?: ExpenseFilters): Promise<ActionResult<{
  rows: ExpenseRow[]
  totals: { all: string; paid: string; committed: string; pending: string }
}>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)
    const where = expenseWhere(schoolId, filters)

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      // A cap rather than paging: a term of expenditure is hundreds of rows, not millions,
      // and the export needs the whole filtered set in one go.
      take: 2000,
      select: {
        id: true,
        voucherNo: true,
        expenseDate: true,
        payeeName: true,
        payeeType: true,
        description: true,
        amount: true,
        paymentMethod: true,
        referenceNo: true,
        status: true,
        category: { select: { name: true } },
        account: { select: { name: true } },
        recordedByUser: { select: { firstName: true, lastName: true } },
        approvedByUser: { select: { firstName: true, lastName: true } },
        paidByUser: { select: { firstName: true, lastName: true } },
        _count: { select: { attachments: true } },
      },
    })

    const sumOf = (statuses: ExpenseStatus[]) =>
      expenses
        .filter((expense) => statuses.includes(expense.status))
        .reduce((total, expense) => total.plus(expense.amount), money(0))

    return {
      success: true,
      data: {
        rows: expenses.map((expense) => ({
          id: expense.id,
          voucherNo: expense.voucherNo,
          expenseDate: expense.expenseDate.toISOString(),
          payeeName: expense.payeeName,
          payeeType: expense.payeeType,
          categoryName: expense.category.name,
          accountName: expense.account.name,
          description: expense.description,
          amount: moneyString(expense.amount),
          paymentMethod: expense.paymentMethod,
          referenceNo: expense.referenceNo,
          status: expense.status,
          recordedByName: personName(expense.recordedByUser) ?? "-",
          approvedByName: personName(expense.approvedByUser),
          paidByName: personName(expense.paidByUser),
          attachmentCount: expense._count.attachments,
        })),
        totals: {
          all: moneyString(expenses.reduce((total, expense) => total.plus(expense.amount), money(0))),
          paid: moneyString(sumOf(SPENT)),
          committed: moneyString(sumOf(COMMITTED)),
          pending: moneyString(sumOf(["DRAFT", "PENDING_APPROVAL"])),
        },
      },
    }
  } catch (error) {
    return toError(error, "Failed to load expenditure transactions")
  }
}

export async function getExpense(expenseId: string): Promise<ActionResult<{
  id: string
  voucherNo: string
  status: ExpenseStatus
  school: { name: string; code: string }
  sessionName: string
  termName: string
  termId: string
  categoryId: string
  categoryName: string
  accountId: string
  accountName: string
  accountType: string
  payeeName: string
  payeeType: string
  description: string
  amount: string
  paymentMethod: string
  referenceNo: string | null
  expenseDate: string
  notes: string | null
  decisionReason: string | null
  recordedByName: string
  approvedByName: string | null
  approvedAt: string | null
  paidByName: string | null
  paidAt: string | null
  attachments: Array<{
    id: string
    url: string
    fileName: string
    mimeType: string
    sizeBytes: number
    uploadedAt: string
  }>
  budget: Awaited<ReturnType<typeof budgetUsage>>
}>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, schoolId },
      select: {
        id: true,
        voucherNo: true,
        status: true,
        payeeName: true,
        payeeType: true,
        description: true,
        amount: true,
        paymentMethod: true,
        referenceNo: true,
        expenseDate: true,
        notes: true,
        decisionReason: true,
        approvedAt: true,
        paidAt: true,
        categoryId: true,
        accountId: true,
        termId: true,
        school: { select: { name: true, code: true } },
        session: { select: { name: true } },
        term: { select: { name: true } },
        category: { select: { name: true } },
        account: { select: { name: true, type: true } },
        recordedByUser: { select: { firstName: true, lastName: true } },
        approvedByUser: { select: { firstName: true, lastName: true } },
        paidByUser: { select: { firstName: true, lastName: true } },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, url: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    })
    if (!expense) throw new Error("Expense not found")

    return {
      success: true,
      data: {
        id: expense.id,
        voucherNo: expense.voucherNo,
        status: expense.status,
        school: expense.school,
        sessionName: expense.session.name,
        termName: expense.term.name,
        termId: expense.termId,
        categoryId: expense.categoryId,
        categoryName: expense.category.name,
        accountId: expense.accountId,
        accountName: expense.account.name,
        accountType: expense.account.type,
        payeeName: expense.payeeName,
        payeeType: expense.payeeType,
        description: expense.description,
        amount: moneyString(expense.amount),
        paymentMethod: expense.paymentMethod,
        referenceNo: expense.referenceNo,
        expenseDate: expense.expenseDate.toISOString(),
        notes: expense.notes,
        decisionReason: expense.decisionReason,
        recordedByName: personName(expense.recordedByUser) ?? "-",
        approvedByName: personName(expense.approvedByUser),
        approvedAt: expense.approvedAt?.toISOString() ?? null,
        paidByName: personName(expense.paidByUser),
        paidAt: expense.paidAt?.toISOString() ?? null,
        attachments: expense.attachments.map((attachment) => ({
          id: attachment.id,
          url: attachment.url,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          uploadedAt: attachment.createdAt.toISOString(),
        })),
        budget: await budgetUsage(expense.categoryId, expense.termId),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the expense")
  }
}

// ---------------------------------------------------------------------------
// Dashboard and reports
// ---------------------------------------------------------------------------

/** Sums expenses by a grouping key and resolves the group ids to names, largest first. */
async function spendBreakdown(
  where: Prisma.ExpenseWhereInput,
  by: "categoryId" | "accountId",
): Promise<Array<{ id: string; name: string; amount: string; count: number }>> {
  const grouped = await prisma.expense.groupBy({
    by: [by],
    where: { ...where, status: { in: SPENT } },
    _sum: { amount: true },
    _count: { _all: true },
  })
  if (grouped.length === 0) return []

  const ids = grouped.map((row) => row[by])
  const names =
    by === "categoryId"
      ? await prisma.expenseCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : await prisma.paymentAccount.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const nameById = new Map(names.map((row) => [row.id, row.name]))

  return grouped
    .map((row) => ({
      id: row[by],
      name: nameById.get(row[by]) ?? "Unknown",
      amount: moneyString(row._sum.amount ?? 0),
      count: row._count._all,
    }))
    .sort((a, b) => Number(b.amount) - Number(a.amount))
}

/** Amount and count per status, so the dashboard can show pending money and not just rows. */
async function statusTotals(where: Prisma.ExpenseWhereInput) {
  const grouped = await prisma.expense.groupBy({
    by: ["status"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  })
  const empty = { amount: "0.00", count: 0 }
  const byStatus = new Map(
    grouped.map((row) => [row.status, { amount: moneyString(row._sum.amount ?? 0), count: row._count._all }]),
  )
  return {
    draft: byStatus.get("DRAFT") ?? empty,
    pending: byStatus.get("PENDING_APPROVAL") ?? empty,
    approved: byStatus.get("APPROVED") ?? empty,
    paid: byStatus.get("PAID") ?? empty,
    rejected: byStatus.get("REJECTED") ?? empty,
    cancelled: byStatus.get("CANCELLED") ?? empty,
  }
}

export async function getExpenditureOverview(): Promise<ActionResult<{
  currentSession: { id: string; name: string } | null
  currentTerm: { id: string; name: string } | null
  termTotal: string
  sessionTotal: string
  statuses: Awaited<ReturnType<typeof statusTotals>>
  byCategory: Array<{ id: string; name: string; amount: string; count: number }>
  byAccount: Array<{ id: string; name: string; amount: string; count: number }>
  recent: Array<{
    id: string
    voucherNo: string
    payeeName: string
    categoryName: string
    amount: string
    status: ExpenseStatus
    expenseDate: string
  }>
  incomeVsExpenditure: { income: string; expenditure: string; balance: string } | null
  /** Paid spending month by month across the session — the shape of the year's outgoings. */
  monthly: Array<{ month: string; label: string; paid: string; count: number }>
  /** Who the money went to, largest first. */
  topPayees: Array<{ name: string; amount: string; count: number }>
  /**
   * Category budgets against what has been paid this term. The limit is a soft ceiling the
   * schema deliberately never enforces, so the dashboard is where going over it is noticed.
   */
  budget: {
    termName: string | null
    tracked: number
    overCount: number
    overBy: string
    rows: Array<{ id: string; name: string; limit: string; spent: string; overBy: string; usedPercent: number }>
  }
  /** The approval that has been waiting longest, because a queue is only a problem over time. */
  oldestPending: { id: string; voucherNo: string; payeeName: string; amount: string; days: number } | null
}>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const currentSession = await prisma.session.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true },
    })
    const currentTerm = currentSession
      ? await prisma.term.findFirst({
          where: { sessionId: currentSession.id, isCurrent: true },
          select: { id: true, name: true },
        })
      : null

    const sessionWhere: Prisma.ExpenseWhereInput = currentSession
      ? { schoolId, sessionId: currentSession.id }
      : { schoolId }
    const termWhere: Prisma.ExpenseWhereInput = currentTerm ? { schoolId, termId: currentTerm.id } : sessionWhere

    const [termPaid, sessionPaid, statuses, byCategory, byAccount, recent] = await Promise.all([
      prisma.expense.aggregate({ where: { ...termWhere, status: { in: SPENT } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { ...sessionWhere, status: { in: SPENT } }, _sum: { amount: true } }),
      statusTotals(sessionWhere),
      spendBreakdown(sessionWhere, "categoryId"),
      spendBreakdown(sessionWhere, "accountId"),
      prisma.expense.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          voucherNo: true,
          payeeName: true,
          amount: true,
          status: true,
          expenseDate: true,
          category: { select: { name: true } },
        },
      }),
    ])

    // Income comes from the finance module rather than being recomputed here, so the two
    // modules cannot disagree about what the school collected.
    let incomeVsExpenditure: { income: string; expenditure: string; balance: string } | null = null
    if (currentSession) {
      const fund = await getAccumulatedFundReport({ sessionId: currentSession.id })
      if (fund.success) {
        const income = money(fund.data.sessionTotals.paid)
        const spent = money(sessionPaid._sum.amount ?? 0)
        incomeVsExpenditure = {
          income: moneyString(income),
          expenditure: moneyString(spent),
          balance: moneyString(income.minus(spent)),
        }
      }
    }

    // --- the shape of the year, who it went to, and what it went over ---------------------
    const [paidThisSession, payees, budgetCategories, pendingQueue] = await Promise.all([
      prisma.expense.findMany({
        where: { ...sessionWhere, status: { in: SPENT } },
        select: { expenseDate: true, amount: true },
      }),
      prisma.expense.groupBy({
        by: ["payeeName"],
        where: { ...sessionWhere, status: { in: SPENT } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.expenseCategory.findMany({
        where: { schoolId, budgetLimit: { not: null } },
        select: { id: true, name: true, budgetLimit: true },
      }),
      prisma.expense.findMany({
        where: { ...sessionWhere, status: "PENDING_APPROVAL" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, voucherNo: true, payeeName: true, amount: true, createdAt: true },
      }),
    ])

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const byMonth = new Map<string, { paid: Prisma.Decimal; count: number }>()
    for (const expense of paidThisSession) {
      const date = expense.expenseDate
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const entry = byMonth.get(key) ?? { paid: money(0), count: 0 }
      entry.paid = entry.paid.plus(expense.amount)
      entry.count += 1
      byMonth.set(key, entry)
    }

    const monthly = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, entry]) => ({
        month,
        label: `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`,
        paid: moneyString(entry.paid),
        count: entry.count,
      }))

    const topPayees = payees
      .map((payee) => ({
        name: payee.payeeName,
        amount: moneyString(payee._sum.amount ?? 0),
        count: payee._count._all,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 6)

    // Budgets are a per-term ceiling, so they are measured against this term rather than the
    // whole session — a session figure would read as three times over on a limit nobody broke.
    const budgetSpend = currentTerm
      ? await prisma.expense.groupBy({
          by: ["categoryId"],
          where: { ...termWhere, status: { in: SPENT } },
          _sum: { amount: true },
        })
      : []
    const spentByCategory = new Map(budgetSpend.map((row) => [row.categoryId, row._sum.amount ?? money(0)]))

    const budgetRows = budgetCategories
      .map((category) => {
        const limit = category.budgetLimit ?? money(0)
        const spent = spentByCategory.get(category.id) ?? money(0)
        const overBy = spent.greaterThan(limit) ? spent.minus(limit) : money(0)

        return {
          id: category.id,
          name: category.name,
          limit: moneyString(limit),
          spent: moneyString(spent),
          overBy: moneyString(overBy),
          usedPercent: limit.isZero() ? 0 : Math.round(spent.div(limit).times(100).toNumber()),
        }
      })
      .sort((a, b) => b.usedPercent - a.usedPercent)

    const over = budgetRows.filter((row) => Number(row.overBy) > 0)
    const waiting = pendingQueue[0]

    return {
      success: true,
      data: {
        currentSession,
        currentTerm,
        monthly,
        topPayees,
        budget: {
          termName: currentTerm?.name ?? null,
          tracked: budgetRows.length,
          overCount: over.length,
          overBy: moneyString(over.reduce((total, row) => total.plus(row.overBy), money(0))),
          rows: budgetRows,
        },
        oldestPending: waiting
          ? {
              id: waiting.id,
              voucherNo: waiting.voucherNo,
              payeeName: waiting.payeeName,
              amount: moneyString(waiting.amount),
              days: Math.max(
                0,
                Math.floor((Date.now() - waiting.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
              ),
            }
          : null,
        termTotal: moneyString(termPaid._sum.amount ?? 0),
        sessionTotal: moneyString(sessionPaid._sum.amount ?? 0),
        statuses,
        byCategory,
        byAccount,
        recent: recent.map((expense) => ({
          id: expense.id,
          voucherNo: expense.voucherNo,
          payeeName: expense.payeeName,
          categoryName: expense.category.name,
          amount: moneyString(expense.amount),
          status: expense.status,
          expenseDate: expense.expenseDate.toISOString(),
        })),
        incomeVsExpenditure,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the expenditure overview")
  }
}

export async function getTermlyExpenditureReport(filters?: {
  sessionId?: string | null
  termId?: string | null
}): Promise<ActionResult<{
  termId: string | null
  termName: string | null
  sessionId: string | null
  sessionName: string | null
  paid: string
  committed: string
  pending: string
  transactionCount: number
  byCategory: Array<{ id: string; name: string; amount: string; count: number; budgetLimit: string | null; overBy: string | null }>
  byAccount: Array<{ id: string; name: string; amount: string; count: number }>
  topTransactions: Array<{ id: string; voucherNo: string; payeeName: string; categoryName: string; amount: string; expenseDate: string }>
}>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    // Which term the report is about. An explicit term wins; a session on its own means
    // "that year", so the term it opens on is that session's current one, or its latest —
    // picking the school's current term there would report a year the filter does not name.
    const select = {
      id: true,
      name: true,
      sessionId: true,
      session: { select: { name: true } },
    } as const

    const term = filters?.termId
      ? await prisma.term.findFirst({ where: { id: filters.termId, session: { schoolId } }, select })
      : filters?.sessionId
        ? ((await prisma.term.findFirst({
            where: { sessionId: filters.sessionId, session: { schoolId }, isCurrent: true },
            select,
          })) ??
          (await prisma.term.findFirst({
            where: { sessionId: filters.sessionId, session: { schoolId } },
            orderBy: { startDate: "desc" },
            select,
          })))
        : await prisma.term.findFirst({
            where: { session: { schoolId }, isCurrent: true },
            select,
          })

    const where: Prisma.ExpenseWhereInput = term ? { schoolId, termId: term.id } : { schoolId }

    const [paid, committed, pending, count, byCategory, byAccount, top, categories] = await Promise.all([
      prisma.expense.aggregate({ where: { ...where, status: { in: SPENT } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { ...where, status: { in: COMMITTED } }, _sum: { amount: true } }),
      prisma.expense.aggregate({
        where: { ...where, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
        _sum: { amount: true },
      }),
      prisma.expense.count({ where }),
      spendBreakdown(where, "categoryId"),
      spendBreakdown(where, "accountId"),
      prisma.expense.findMany({
        where: { ...where, status: { in: SPENT } },
        orderBy: { amount: "desc" },
        take: 10,
        select: {
          id: true,
          voucherNo: true,
          payeeName: true,
          amount: true,
          expenseDate: true,
          category: { select: { name: true } },
        },
      }),
      prisma.expenseCategory.findMany({
        where: { schoolId, budgetLimit: { not: null } },
        select: { id: true, budgetLimit: true },
      }),
    ])

    const limitById = new Map(categories.map((category) => [category.id, category.budgetLimit]))

    return {
      success: true,
      data: {
        termId: term?.id ?? null,
        termName: term?.name ?? null,
        sessionId: term?.sessionId ?? null,
        sessionName: term?.session.name ?? null,
        paid: moneyString(paid._sum.amount ?? 0),
        committed: moneyString(committed._sum.amount ?? 0),
        pending: moneyString(pending._sum.amount ?? 0),
        transactionCount: count,
        byCategory: byCategory.map((row) => {
          const limit = limitById.get(row.id) ?? null
          const over = limit ? money(row.amount).minus(limit) : null
          return {
            ...row,
            budgetLimit: limit ? moneyString(limit) : null,
            overBy: over && over.gt(0) ? moneyString(over) : null,
          }
        }),
        byAccount,
        topTransactions: top.map((expense) => ({
          id: expense.id,
          voucherNo: expense.voucherNo,
          payeeName: expense.payeeName,
          categoryName: expense.category.name,
          amount: moneyString(expense.amount),
          expenseDate: expense.expenseDate.toISOString(),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the termly expenditure report")
  }
}

export async function getSessionExpenditureReport(filters?: { sessionId?: string | null }): Promise<ActionResult<{
  sessionId: string | null
  sessionName: string | null
  terms: Array<{ termId: string; termName: string; paid: string; committed: string; pending: string; count: number }>
  sessionTotals: { paid: string; committed: string; pending: string; count: number }
  byCategory: Array<{ id: string; name: string; amount: string; count: number }>
  byAccount: Array<{ id: string; name: string; amount: string; count: number }>
}>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const session = filters?.sessionId
      ? await prisma.session.findFirst({
          where: { id: filters.sessionId, schoolId },
          select: { id: true, name: true },
        })
      : await prisma.session.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true, name: true } })

    const where: Prisma.ExpenseWhereInput = session ? { schoolId, sessionId: session.id } : { schoolId }

    const terms = session
      ? await prisma.term.findMany({
          where: { sessionId: session.id },
          orderBy: { startDate: "asc" },
          select: { id: true, name: true },
        })
      : []

    // One grouped query per measure across all terms, rather than three queries per term.
    const [paidByTerm, committedByTerm, pendingByTerm, countByTerm, byCategory, byAccount] = await Promise.all([
      prisma.expense.groupBy({ by: ["termId"], where: { ...where, status: { in: SPENT } }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ["termId"], where: { ...where, status: { in: COMMITTED } }, _sum: { amount: true } }),
      prisma.expense.groupBy({
        by: ["termId"],
        where: { ...where, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
        _sum: { amount: true },
      }),
      prisma.expense.groupBy({ by: ["termId"], where, _count: { _all: true } }),
      spendBreakdown(where, "categoryId"),
      spendBreakdown(where, "accountId"),
    ])

    const asMap = (rows: Array<{ termId: string; _sum: { amount: Prisma.Decimal | null } }>) =>
      new Map(rows.map((row) => [row.termId, money(row._sum.amount ?? 0)]))
    const paidMap = asMap(paidByTerm)
    const committedMap = asMap(committedByTerm)
    const pendingMap = asMap(pendingByTerm)
    const countMap = new Map(countByTerm.map((row) => [row.termId, row._count._all]))

    const termRows = terms.map((term) => ({
      termId: term.id,
      termName: term.name,
      paid: moneyString(paidMap.get(term.id) ?? 0),
      committed: moneyString(committedMap.get(term.id) ?? 0),
      pending: moneyString(pendingMap.get(term.id) ?? 0),
      count: countMap.get(term.id) ?? 0,
    }))

    const total = (map: Map<string, Prisma.Decimal>) =>
      [...map.values()].reduce((sum, value) => sum.plus(value), money(0))

    return {
      success: true,
      data: {
        sessionId: session?.id ?? null,
        sessionName: session?.name ?? null,
        terms: termRows,
        sessionTotals: {
          paid: moneyString(total(paidMap)),
          committed: moneyString(total(committedMap)),
          pending: moneyString(total(pendingMap)),
          count: [...countMap.values()].reduce((sum, value) => sum + value, 0),
        },
        byCategory,
        byAccount,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the session expenditure report")
  }
}

/**
 * Where finance and expenditure meet.
 *
 * Income figures come from `getAccumulatedFundReport` rather than being recomputed, so the
 * budget summary can never disagree with the accumulated fund report it is derived from.
 *
 * Two balances, because they answer different questions:
 *  - **actual** is cash reality: what came in, less what went out.
 *  - **expected** assumes every debtor pays, which is what a budget is planned against.
 *
 * `committedBalance` is the one a head teacher should look at before promising more money:
 * it counts approved-but-unpaid expenditure as already gone, because it is.
 */
export async function getBudgetSummary(filters?: { sessionId?: string | null }): Promise<ActionResult<{
  sessionId: string | null
  sessionName: string | null
  income: {
    scheduledFees: string
    discounts: string
    exemptions: string
    netExpected: string
    paid: string
    outstanding: string
  }
  expenditure: { paid: string; approvedUnpaid: string; payrollApprovedUnpaid: string; pending: string; committed: string }
  actualBalance: string
  expectedBalance: string
  committedBalance: string
}>> {
  try {
    const actor = await requireExpenditureViewer()
    const schoolId = await actorSchool(actor)

    const session = filters?.sessionId
      ? await prisma.session.findFirst({
          where: { id: filters.sessionId, schoolId },
          select: { id: true, name: true },
        })
      : await prisma.session.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true, name: true } })

    const fund = await getAccumulatedFundReport({ sessionId: session?.id ?? null })
    if (!fund.success) throw new Error(fund.error)

    const where: Prisma.ExpenseWhereInput = session ? { schoolId, sessionId: session.id } : { schoolId }
    const runWhere: Prisma.PayrollRunWhereInput = session ? { schoolId, sessionId: session.id } : { schoolId }
    const [paid, approvedUnpaid, pending, payrollApproved, payrollPending] = await Promise.all([
      prisma.expense.aggregate({ where: { ...where, status: { in: SPENT } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { ...where, status: "APPROVED" }, _sum: { amount: true } }),
      prisma.expense.aggregate({
        where: { ...where, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
        _sum: { amount: true },
      }),
      // Payroll writes no expense until it is paid, so an approved run - salaries the school
      // has agreed to pay this month - was invisible here until the money left. It is as
      // committed as an approved voucher, and counted the same way.
      prisma.payrollRun.aggregate({ where: { ...runWhere, status: "APPROVED" }, _sum: { totalNet: true } }),
      prisma.payrollRun.aggregate({
        where: { ...runWhere, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
        _sum: { totalNet: true },
      }),
    ])

    const income = fund.data.sessionTotals
    const spent = money(paid._sum.amount ?? 0)
    const payrollCommitted = money(payrollApproved._sum.totalNet ?? 0)
    const committedUnpaid = money(approvedUnpaid._sum.amount ?? 0).plus(payrollCommitted)
    const committed = spent.plus(committedUnpaid)

    return {
      success: true,
      data: {
        sessionId: session?.id ?? null,
        sessionName: session?.name ?? null,
        income: {
          scheduledFees: income.scheduledFees,
          discounts: income.discounts,
          exemptions: income.exemptions,
          netExpected: income.netExpected,
          paid: income.paid,
          outstanding: income.outstanding,
        },
        expenditure: {
          paid: moneyString(spent),
          approvedUnpaid: moneyString(committedUnpaid),
          /** The part of approvedUnpaid that is approved payroll not yet paid. */
          payrollApprovedUnpaid: moneyString(payrollCommitted),
          pending: moneyString(money(pending._sum.amount ?? 0).plus(payrollPending._sum.totalNet ?? 0)),
          committed: moneyString(committed),
        },
        actualBalance: moneyString(money(income.paid).minus(spent)),
        expectedBalance: moneyString(money(income.netExpected).minus(spent)),
        committedBalance: moneyString(money(income.paid).minus(committed)),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the budget summary")
  }
}
