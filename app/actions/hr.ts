"use server"

import { Prisma, type EmploymentStatus, type Gender, type PayrollStatus, type StaffType } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { generateTemporaryPassword } from "@/lib/temporary-password"

import { recordAudit } from "@/lib/audit"
import { AuthorizationError, requireAnyPermission, requirePermission, type Actor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { computePay, daysEmployedInMonth } from "@/lib/payroll"
import {
  canDeletePayComponent,
  canDeleteSalaryScale,
  canUseComponentName,
} from "@/lib/hr/pay-component-rules"
import { canGeneratePayroll } from "@/lib/hr/payroll-period-rules"
import { LOGINS_THAT_FOLLOW_EMPLOYMENT, STAFF_LOGINS, isLoginStaffType, type LoginStaffType } from "@/lib/hr/staff-logins"
import { nextStaffNo as nextStaffNoFor } from "@/lib/hr/staff-provisioning"
import { getActiveSchool } from "@/lib/school-context.server"
import { revokeAllSessionsForUser } from "@/lib/sessions.server"
import { salaryCategoryFor } from "@/lib/expenditure/standard-categories"

/**
 * HR and payroll.
 *
 * Answers who works here, what each of them is owed, and whether it has been paid. Paying a
 * run creates an expenditure record, so salaries land in the budget summary alongside every
 * other kind of spending.
 *
 * Four rules shape this module:
 *
 *  - **Money is Decimal.** Never Float, never summed as plain numbers.
 *  - **Salary history is append-only.** A raise inserts a row and retires the old one. What
 *    somebody was paid two years ago, and who approved it, must still be answerable.
 *  - **A payslip is frozen when the run is generated.** Its figures live in
 *    `PayrollItemLine`, not in the allowance configuration, so editing a transport allowance
 *    today cannot rewrite last March's payslip.
 *  - **A paid run is locked.** No silent edits. A mistake is corrected by cancelling with a
 *    reason, leaving both the original and the correction on the record.
 */

const moneySchema = z.coerce.number().nonnegative().max(9999999999)
const positiveMoney = z.coerce.number().positive().max(9999999999)

const staffSchema = z.object({
  /** Acknowledges a suspected duplicate person, the way a duplicate voucher is acknowledged. */
  confirmDuplicate: z.coerce.boolean().default(false),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  gender: z.enum(["MALE", "FEMALE"]).optional().nullable(),
  dateOfBirth: z.coerce.date().refine((date) => date <= new Date(), "Date of birth cannot be in the future").optional().nullable(),
  phone: z.string().trim().max(40).regex(/^$|^\+?[0-9 ()-]{7,40}$/, "Enter a valid phone number").optional().nullable(),
  email: z.string().trim().max(160).email().optional().nullable().or(z.literal("")),
  address: z.string().trim().max(500).optional().nullable(),
  department: z.string().trim().max(120).optional().nullable(),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  staffType: z.enum([
    "TEACHER",
    "ADMIN_STAFF",
    "ACCOUNTANT",
    "CLEANER",
    "DRIVER",
    "SECURITY",
    "LIBRARIAN",
    "NURSE",
    "OTHER",
  ]).default("OTHER"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"]).default("FULL_TIME"),
  dateEmployed: z.preprocess((value) => value === null || value === "" ? undefined : value, z.coerce.date()),
  qualification: z.string().trim().max(200).optional().nullable(),
  emergencyContactName: z.string().trim().max(120).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(40).regex(/^$|^\+?[0-9 ()-]{7,40}$/, "Enter a valid emergency phone number").optional().nullable(),
  bankName: z.string().trim().max(120).optional().nullable(),
  accountNumber: z.string().trim().regex(/^$|^\d{10}$/, "Account number must contain exactly 10 digits").optional().nullable(),
  accountName: z.string().trim().max(120).optional().nullable(),
  pensionPfa: z.string().trim().max(120).optional().nullable(),
  pensionPin: z.string().trim().max(60).optional().nullable(),
  taxId: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** Links this record to an existing login, so a teacher is not duplicated. */
  userId: z.string().min(1).optional().nullable(),
  createLogin: z.boolean().default(false),
})

const configSchema = z.object({
  staffNoPrefix: z.string().trim().min(1).max(10).default("STF"),
  payrollClosingDay: z.coerce.number().int().min(1).max(31).default(25),
  defaultAccountId: z.string().min(1).optional().nullable(),
  defaultPaymentMethod: z.enum(["CASH", "BANK_TRANSFER", "POS", "CHEQUE", "ONLINE"]).default("BANK_TRANSFER"),
  requirePayrollApproval: z.coerce.boolean().default(true),
  allowNegativeNet: z.coerce.boolean().default(false),
  prorateFirstMonth: z.coerce.boolean().default(true),
  payslipNote: z.string().trim().max(500).optional().nullable(),
})

const scaleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  gradeLevel: z.string().trim().max(60).optional().nullable(),
  step: z.string().trim().max(60).optional().nullable(),
  baseSalary: positiveMoney,
  description: z.string().trim().max(300).optional().nullable(),
})

const salaryAssignmentSchema = z.object({
  staffId: z.string().min(1),
  scaleId: z.string().min(1).optional().nullable(),
  baseSalary: positiveMoney,
  effectiveFrom: z.coerce.date(),
  note: z.string().trim().max(300).optional().nullable(),
})

const componentTypeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["FIXED", "PERCENTAGE"]).default("FIXED"),
  value: positiveMoney,
  isRecurring: z.coerce.boolean().default(true),
})

const allowanceTypeSchema = componentTypeSchema.extend({
  isTaxable: z.coerce.boolean().default(true),
})

const deductionTypeSchema = componentTypeSchema.extend({
  timing: z.enum(["PRE_TAX", "POST_TAX"]).default("POST_TAX"),
})

const assignmentSchema = z.object({
  staffId: z.string().min(1),
  typeId: z.string().min(1),
  valueOverride: moneySchema.optional().nullable(),
  isRecurring: z.coerce.boolean().default(true),
  /** Required for a one-off, so it lands in exactly one run. */
  periodYear: z.coerce.number().int().min(2000).max(2200).optional().nullable(),
  periodMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  reason: z.string().trim().max(300).optional().nullable(),
})

const payrollPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
  sessionId: z.string().min(1).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

const paySchema = z.object({
  runId: z.string().min(1),
  accountId: z.string().min(1),
  method: z.enum(["CASH", "BANK_TRANSFER", "POS", "CHEQUE", "ONLINE"]).default("BANK_TRANSFER"),
  reference: z.string().trim().max(120).optional().nullable(),
  paidOn: z.coerce.date().optional().nullable(),
  /** Let the salary payment take the paying account below zero. Recorded in the audit log. */
  allowOverdraft: z.coerce.boolean().default(false),
})

const decisionSchema = z.object({
  runId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
})

const disciplineSchema = z.object({
  staffId: z.string().min(1),
  type: z.enum(["QUERY", "WARNING", "SUSPENSION", "TERMINATION", "RESIGNATION"]),
  reason: z.string().trim().min(3).max(2000),
  occurredOn: z.coerce.date(),
  actionTaken: z.string().trim().max(2000).optional().nullable(),
  attachmentUrl: z.string().trim().url().max(1000).optional().nullable(),
})

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/** Runs that still admit change. APPROVED and beyond do not. */
const EDITABLE_RUN: PayrollStatus[] = ["DRAFT", "PENDING_APPROVAL"]

function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function moneyString(value: Prisma.Decimal.Value | null | undefined): string {
  return money(value ?? 0).toFixed(2)
}

async function actorSchool(actor: Actor): Promise<string> {
  if (actor.schoolId) return actor.schoolId

  if (actor.role === "SUPER_ADMIN") {
    const active = await getActiveSchool()
    if (active) return active.id
  }

  throw new AuthorizationError("Select a school before using HR")
}

/**
 * Read staff records, payroll and every HR report.
 *
 * `payroll.pay` counts here as well as `payroll.manage`, because the accountant profile
 * carries the first without the second: they are meant to generate a run and release the
 * money, and they cannot do either without seeing what they are paying. Requiring the
 * manage key to read made the accountant's own job impossible — the overview refused them
 * while the actions it leads to were theirs by design.
 *
 * Reading is still not free: someone with neither key sees nothing. What does not exist yet
 * is read-only HR access for an auditor who should see payroll and change nothing, which
 * needs a `payroll.view` key in `lib/permissions.ts` — a change to the permission grid and
 * to every stored profile, so a decision rather than a tidy-up.
 */
async function requireHrViewer(): Promise<Actor> {
  return requireAnyPermission(["payroll.manage", "payroll.pay"])
}

/**
 * Staff records, salary scales, salary assignment, allowance and deduction configuration,
 * payroll approval and cancellation.
 *
 * Intended as the admin's authority, on the principle that whoever runs payroll should not
 * also be the one who approves it. The split is real in the actions — generating, submitting
 * and paying need `payroll.pay`, approving and cancelling need `payroll.manage` — but the
 * built-in "HR and Payroll Officer" profile grants both, so one person can carry a run from
 * generation to payment. `approvePayroll` records that in the audit log rather than refusing
 * it, which suits a small school where the admin does everything and is worth knowing about
 * in one where it does not.
 */
async function requireHrManager(): Promise<Actor> {
  return requirePermission("payroll.manage")
}

/** Generate a run and release the money. Shared with the accountant. */
async function requirePayrollOfficer(): Promise<Actor> {
  return requirePermission("payroll.pay")
}

function revalidateHr(...suffixes: string[]) {
  for (const base of ["/dashboard/admin/hr", "/dashboard/accountant/hr"]) {
    revalidatePath(base)
    for (const suffix of suffixes) {
      revalidatePath(`${base}${suffix}`)
    }
  }
  // Salary payments become expenditure, so those totals move too.
  revalidatePath("/dashboard/admin/expenditure")
  revalidatePath("/dashboard/accountant/expenditure")
}

function toError(error: unknown, fallback: string): { success: false; error: string } {
  // A ZodError must not reach console.error: Node's inspect throws on one, and that throw
  // would escape this catch block and turn a rejected field into a server error.
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

/** The school's HR settings, falling back to the documented defaults when unset. */
async function hrConfig(schoolId: string) {
  const config = await prisma.staffConfig.findUnique({ where: { schoolId } })
  return {
    staffNoPrefix: config?.staffNoPrefix ?? "STF",
    payrollClosingDay: config?.payrollClosingDay ?? 25,
    defaultAccountId: config?.defaultAccountId ?? null,
    defaultPaymentMethod: config?.defaultPaymentMethod ?? ("BANK_TRANSFER" as const),
    requirePayrollApproval: config?.requirePayrollApproval ?? true,
    allowNegativeNet: config?.allowNegativeNet ?? false,
    prorateFirstMonth: config?.prorateFirstMonth ?? true,
    payslipNote: config?.payslipNote ?? null,
  }
}

/**
 * The first and last instant of a payroll month, in one place so nothing goes off by a day.
 */
function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start, end, daysInMonth }
}

// ---------------------------------------------------------------------------
// Staff records
// ---------------------------------------------------------------------------

export async function getStaffDirectory(filters?: {
  search?: string | null
  department?: string | null
  staffType?: StaffType | null
  employmentStatus?: EmploymentStatus | null
}): Promise<ActionResult<{
  rows: Array<{
    id: string
    staffNo: string
    name: string
    gender: string | null
    phone: string | null
    email: string | null
    department: string | null
    jobTitle: string | null
    staffType: string
    employmentType: string
    employmentStatus: string
    dateEmployed: string
    baseSalary: string | null
    hasLogin: boolean
  }>
  departments: string[]
}>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const search = filters?.search?.trim()
    const staff = await prisma.staff.findMany({
      where: {
        schoolId,
        ...(filters?.department ? { department: filters.department } : {}),
        ...(filters?.staffType ? { staffType: filters.staffType } : {}),
        ...(filters?.employmentStatus ? { employmentStatus: filters.employmentStatus } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { staffNo: { contains: search } },
                { jobTitle: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        staffNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        phone: true,
        email: true,
        department: true,
        jobTitle: true,
        staffType: true,
        employmentType: true,
        employmentStatus: true,
        dateEmployed: true,
        userId: true,
        salaries: {
          where: { isActive: true },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { baseSalary: true },
        },
      },
    })

    // Distinct departments for the filter, drawn from the data rather than a fixed list, so
    // a school can name its own.
    const departments = [
      ...new Set(
        (
          await prisma.staff.findMany({
            where: { schoolId, department: { not: null } },
            select: { department: true },
            distinct: ["department"],
          })
        )
          .map((row) => row.department)
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort()

    return {
      success: true,
      data: {
        rows: staff.map((member) => ({
          id: member.id,
          staffNo: member.staffNo,
          name: `${member.firstName} ${member.lastName}`,
          gender: member.gender,
          phone: member.phone,
          email: member.email,
          department: member.department,
          jobTitle: member.jobTitle,
          staffType: member.staffType,
          employmentType: member.employmentType,
          employmentStatus: member.employmentStatus,
          dateEmployed: member.dateEmployed.toISOString(),
          baseSalary: member.salaries[0] ? moneyString(member.salaries[0].baseSalary) : null,
          hasLogin: Boolean(member.userId),
        })),
        departments,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the staff directory")
  }
}

export async function getStaffMember(staffId: string): Promise<ActionResult<{
  id: string
  staffNo: string
  firstName: string
  lastName: string
  name: string
  gender: string | null
  dateOfBirth: string | null
  phone: string | null
  email: string | null
  address: string | null
  department: string | null
  jobTitle: string | null
  staffType: string
  employmentType: string
  employmentStatus: string
  dateEmployed: string
  dateExited: string | null
  qualification: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  pensionPfa: string | null
  pensionPin: string | null
  taxId: string | null
  notes: string | null
  userId: string | null
  loginEmail: string | null
  currentSalary: { id: string; baseSalary: string; effectiveFrom: string; scaleName: string | null; approvedByName: string | null } | null
  salaryHistory: Array<{
    id: string
    baseSalary: string
    effectiveFrom: string
    isActive: boolean
    scaleName: string | null
    createdByName: string
    approvedByName: string | null
    note: string | null
  }>
  allowances: Array<{
    id: string
    name: string
    kind: string
    value: string
    isRecurring: boolean
    periodLabel: string | null
    startDate: string
    endDate: string | null
    isActive: boolean
  }>
  deductions: Array<{
    id: string
    name: string
    kind: string
    value: string
    timing: string
    isRecurring: boolean
    periodLabel: string | null
    startDate: string
    endDate: string | null
    isActive: boolean
    reason: string | null
  }>
  discipline: Array<{
    id: string
    type: string
    reason: string
    occurredOn: string
    actionTaken: string | null
    recordedByName: string
    approvedByName: string | null
    attachmentUrl: string | null
  }>
  payslips: Array<{ itemId: string; payslipNo: string; period: string; netPay: string; status: string; paidAt: string | null }>
}>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const member = await prisma.staff.findFirst({
      where: { id: staffId, schoolId },
      include: {
        user: { select: { credentials: { where: { type: "EMAIL" }, take: 1, select: { value: true } } } },
        salaries: {
          orderBy: { effectiveFrom: "desc" },
          include: {
            scale: { select: { name: true } },
            createdByUser: { select: { firstName: true, lastName: true } },
            approvedByUser: { select: { firstName: true, lastName: true } },
          },
        },
        allowances: {
          orderBy: { startDate: "desc" },
          include: { allowanceType: { select: { name: true, kind: true, value: true } } },
        },
        deductions: {
          orderBy: { startDate: "desc" },
          include: { deductionType: { select: { name: true, kind: true, value: true, timing: true } } },
        },
        discipline: {
          orderBy: { occurredOn: "desc" },
          include: {
            recordedByUser: { select: { firstName: true, lastName: true } },
            approvedByUser: { select: { firstName: true, lastName: true } },
          },
        },
        payrollItems: {
          orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }],
          take: 24,
          select: {
            id: true,
            payslipNo: true,
            netPay: true,
            status: true,
            paidAt: true,
            run: { select: { year: true, month: true } },
          },
        },
      },
    })
    if (!member) throw new Error("Staff member not found")

    const name = (person: { firstName: string; lastName: string } | null) =>
      person ? `${person.firstName} ${person.lastName}` : null
    const periodLabel = (year: number | null, month: number | null) =>
      year && month ? `${year}-${String(month).padStart(2, "0")}` : null
    const current = member.salaries.find((salary) => salary.isActive) ?? null

    return {
      success: true,
      data: {
        id: member.id,
        staffNo: member.staffNo,
        firstName: member.firstName,
        lastName: member.lastName,
        name: `${member.firstName} ${member.lastName}`,
        gender: member.gender,
        dateOfBirth: member.dateOfBirth?.toISOString() ?? null,
        phone: member.phone,
        email: member.email,
        address: member.address,
        department: member.department,
        jobTitle: member.jobTitle,
        staffType: member.staffType,
        employmentType: member.employmentType,
        employmentStatus: member.employmentStatus,
        dateEmployed: member.dateEmployed.toISOString(),
        dateExited: member.dateExited?.toISOString() ?? null,
        qualification: member.qualification,
        emergencyContactName: member.emergencyContactName,
        emergencyContactPhone: member.emergencyContactPhone,
        bankName: member.bankName,
        accountNumber: member.accountNumber,
        accountName: member.accountName,
        pensionPfa: member.pensionPfa,
        pensionPin: member.pensionPin,
        taxId: member.taxId,
        notes: member.notes,
        userId: member.userId,
        loginEmail: member.user?.credentials[0]?.value ?? null,
        currentSalary: current
          ? {
              id: current.id,
              baseSalary: moneyString(current.baseSalary),
              effectiveFrom: current.effectiveFrom.toISOString(),
              scaleName: current.scale?.name ?? null,
              approvedByName: name(current.approvedByUser),
            }
          : null,
        salaryHistory: member.salaries.map((salary) => ({
          id: salary.id,
          baseSalary: moneyString(salary.baseSalary),
          effectiveFrom: salary.effectiveFrom.toISOString(),
          isActive: salary.isActive,
          scaleName: salary.scale?.name ?? null,
          createdByName: name(salary.createdByUser) ?? "-",
          approvedByName: name(salary.approvedByUser),
          note: salary.note,
        })),
        allowances: member.allowances.map((assignment) => ({
          id: assignment.id,
          name: assignment.allowanceType.name,
          kind: assignment.allowanceType.kind,
          value: moneyString(assignment.valueOverride ?? assignment.allowanceType.value),
          isRecurring: assignment.isRecurring,
          periodLabel: periodLabel(assignment.periodYear, assignment.periodMonth),
          startDate: assignment.startDate.toISOString(),
          endDate: assignment.endDate?.toISOString() ?? null,
          isActive: assignment.isActive,
        })),
        deductions: member.deductions.map((assignment) => ({
          id: assignment.id,
          name: assignment.deductionType.name,
          kind: assignment.deductionType.kind,
          value: moneyString(assignment.valueOverride ?? assignment.deductionType.value),
          timing: assignment.deductionType.timing,
          isRecurring: assignment.isRecurring,
          periodLabel: periodLabel(assignment.periodYear, assignment.periodMonth),
          startDate: assignment.startDate.toISOString(),
          endDate: assignment.endDate?.toISOString() ?? null,
          isActive: assignment.isActive,
          reason: assignment.reason,
        })),
        discipline: member.discipline.map((record) => ({
          id: record.id,
          type: record.type,
          reason: record.reason,
          occurredOn: record.occurredOn.toISOString(),
          actionTaken: record.actionTaken,
          recordedByName: name(record.recordedByUser) ?? "-",
          approvedByName: name(record.approvedByUser),
          attachmentUrl: record.attachmentUrl,
        })),
        payslips: member.payrollItems.map((item) => ({
          itemId: item.id,
          payslipNo: item.payslipNo,
          period: `${item.run.year}-${String(item.run.month).padStart(2, "0")}`,
          netPay: moneyString(item.netPay),
          status: item.status,
          paidAt: item.paidAt?.toISOString() ?? null,
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the staff member")
  }
}

/**
 * The login for a teacher, an accountant or an administrator, made inside the transaction
 * that records them, so a staff record and its login are created together or not at all.
 * A teacher also gets the Teacher record the Teachers screen manages classes and subjects
 * through; an accountant and an administrator get the school-scoped admin record that ties
 * their login to this school.
 */
async function createStaffLoginInTransaction(tx: Prisma.TransactionClient, input: {
  schoolId: string
  staffNo: string
  staffType: LoginStaffType
  email: string
  passwordHash: string
  firstName: string
  lastName: string
  phone?: string | null
  gender?: Gender | null
  address?: string | null
  dateOfBirth?: Date | null
  department?: string | null
  qualification?: string | null
}): Promise<string> {
  const user = await tx.user.create({
    data: {
      firstName: input.firstName, lastName: input.lastName, role: STAFF_LOGINS[input.staffType].role,
      phone: input.phone || null, gender: input.gender || null,
      address: input.address || null, dateOfBirth: input.dateOfBirth || null,
      credentials: { create: { type: "EMAIL", value: input.email.toLowerCase(), passwordHash: input.passwordHash, isPrimary: true } },
    },
  })
  if (input.staffType === "TEACHER") {
    await tx.teacher.create({ data: { userId: user.id, schoolId: input.schoolId, staffId: input.staffNo, department: input.department, qualification: input.qualification } })
  } else {
    const profile = input.staffType === "ADMIN_STAFF" ? "MANAGER" : "FINANCE"
    await tx.admin.create({ data: { userId: user.id, schoolId: input.schoolId, permissions: JSON.stringify([profile]) } })
  }
  return user.id
}

/**
 * Who may give each kind of staff a login: hiring is HR's, the access it opens is not.
 * See STAFF_LOGINS for the permission each one needs.
 */
async function requireLoginCreator(staffType: StaffType): Promise<LoginStaffType> {
  if (!isLoginStaffType(staffType)) {
    throw new Error("Logins are created for teachers, accountants and administrative staff only")
  }
  await requirePermission(STAFF_LOGINS[staffType].permission)
  return staffType
}

/**
 * Gives a login to someone HR has already hired: a teacher, accountant or administrator
 * whose record was saved without one, or hired before logins were made here. The only
 * other way to a staff login is creating the record with one, so every login still starts
 * from an HR record. The temporary password is returned once, to show the person creating it.
 */
export async function createLoginForStaff(input: unknown): Promise<ActionResult<{ loginEmail: string; temporaryPassword: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ staffId: z.string().uuid(), email: z.string().trim().max(160).email() }).parse(input)
    const staff = await prisma.staff.findFirst({
      where: { id: data.staffId, schoolId },
      select: { id: true, staffNo: true, staffType: true, userId: true, employmentStatus: true, firstName: true, lastName: true,
        phone: true, gender: true, address: true, dateOfBirth: true, department: true, qualification: true, email: true },
    })
    if (!staff) throw new Error("Staff record not found")
    if (staff.userId) throw new Error("This staff member already has a login")
    if (staff.employmentStatus !== "ACTIVE") throw new Error("Reinstate this staff member in HR before giving them a login")
    const loginType = await requireLoginCreator(staff.staffType)
    const email = data.email.toLowerCase()
    if (await prisma.credential.findUnique({ where: { value: email }, select: { id: true } })) {
      throw new Error("That email address is already used by another login")
    }
    if (staff.staffType === "TEACHER"
      && await prisma.teacher.findFirst({ where: { schoolId, staffId: staff.staffNo }, select: { id: true } })) {
      throw new Error(`A teacher login already uses staff number ${staff.staffNo}. Link it to this record from HR onboarding instead.`)
    }

    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await bcrypt.hash(temporaryPassword, 12)
    await prisma.$transaction(async (tx) => {
      const userId = await createStaffLoginInTransaction(tx, {
        schoolId, staffNo: staff.staffNo, staffType: loginType, email, passwordHash,
        firstName: staff.firstName, lastName: staff.lastName, phone: staff.phone, gender: staff.gender, address: staff.address,
        dateOfBirth: staff.dateOfBirth, department: staff.department, qualification: staff.qualification,
      })
      // Claimed only while still without a login, so two people at once cannot both attach one.
      const linked = await tx.staff.updateMany({
        where: { id: staff.id, userId: null },
        data: { userId, ...(staff.email ? {} : { email }) },
      })
      if (linked.count !== 1) throw new Error("This staff member was given a login a moment ago. Refresh the page.")
    })

    await recordAudit({
      actor,
      action: "staff.login_create",
      entityType: "Staff",
      entityId: staff.id,
      summary: `Created ${loginType === "ADMIN_STAFF" ? "an" : "a"} ${STAFF_LOGINS[loginType].label} login for ${staff.firstName} ${staff.lastName} (${staff.staffNo})`,
      after: { email },
    })
    revalidateHr("/staff", `/staff/${staff.id}`, "/onboarding")
    revalidatePath("/dashboard/admin/teachers")
    revalidatePath("/dashboard/admin/finance/staff")
    revalidatePath("/dashboard/admin/permissions")
    return { success: true, data: { loginEmail: email, temporaryPassword } }
  } catch (error) {
    return toError(error, "Failed to create the login")
  }
}

export async function createStaff(input: unknown): Promise<ActionResult<{ id: string; staffNo: string; temporaryPassword?: string; loginEmail?: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = staffSchema.parse(input)
    const config = await hrConfig(schoolId)
    let loginType: LoginStaffType | null = null
    if (data.createLogin) {
      if (data.userId) throw new Error("Choose an existing login or create a new one, not both")
      if (!data.email) throw new Error("Email is required when creating a login")
      loginType = await requireLoginCreator(data.staffType)
      const existingCredential = await prisma.credential.findUnique({
        where: { value: data.email.toLowerCase() },
        select: { id: true },
      })
      if (existingCredential) throw new Error("That email address is already used by another login")
    }
    const temporaryPassword = data.createLogin ? generateTemporaryPassword() : undefined
    const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 12) : undefined

    // Linking to a login must not steal one already claimed, and must stay inside the school.
    if (data.userId) {
      const [user, taken] = await Promise.all([
        prisma.user.findFirst({
          where: {
            id: data.userId,
            OR: [{ admin: { schoolId } }, { teacher: { schoolId } }],
          },
          select: { id: true },
        }),
        prisma.staff.findUnique({ where: { userId: data.userId }, select: { staffNo: true } }),
      ])
      if (!user) throw new Error("That login does not belong to this school")
      if (taken) throw new Error(`That login is already linked to staff ${taken.staffNo}`)
    }

    // The same person entered twice. Payroll pays one payslip per active staff record, so
    // a duplicate draws two salaries every month until somebody notices, and the unique
    // login does not catch it because a person typed in a second time usually has no login
    // at all. Name and date of birth together is the same human by any ordinary reading.
    //
    // A shared bank account is deliberately NOT refused here. Two staff can genuinely be
    // paid into one family account, and refusing data entry over it blocks honest work
    // while a fictitious name paid into a real account would still get through. That
    // belongs in the integrity checks, which look across every record rather than at the
    // one being typed — which is where a payroll audit looks for it too.
    if (!data.confirmDuplicate) {
      // Date of birth makes the match certain, but it is optional on this form, and gating
      // the whole check on it left the commonest duplicate — someone typed in twice from
      // memory, with no date — completely unguarded. An exact name match among active staff
      // is worth a question either way: two people of the same name in one school is
      // possible, a second payslip every month for one person is not worth the silence.
      const twin = await prisma.staff.findFirst({
        where: {
          schoolId,
          employmentStatus: "ACTIVE",
          firstName: data.firstName,
          lastName: data.lastName,
          ...(data.dateOfBirth ? { dateOfBirth: data.dateOfBirth } : {}),
        },
        select: { staffNo: true, dateOfBirth: true },
      })
      if (twin) {
        throw new Error(
          data.dateOfBirth
            ? `${twin.staffNo} is already ${data.firstName} ${data.lastName} with that date of `
              + "birth. Confirm if this is genuinely a different person."
            : `${twin.staffNo} is already an active ${data.firstName} ${data.lastName}. Confirm `
              + "if this is genuinely a different person.",
        )
      }
    }

    const staff = await prisma.$transaction(async (tx) => {
      let userId = data.userId || null
      const staffNo = await nextStaffNoFor(tx, schoolId, config.staffNoPrefix)
      if (passwordHash && data.email && loginType) {
        userId = await createStaffLoginInTransaction(tx, {
          schoolId, staffNo, staffType: loginType, email: data.email, passwordHash,
          firstName: data.firstName, lastName: data.lastName, phone: data.phone, gender: data.gender, address: data.address,
          dateOfBirth: data.dateOfBirth, department: data.department, qualification: data.qualification,
        })
      }
      return tx.staff.create({
      data: {
        schoolId,
        staffNo,
        userId,
        onboardingStatus: "IN_PROGRESS",
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        department: data.department || null,
        jobTitle: data.jobTitle || null,
        staffType: data.staffType,
        employmentType: data.employmentType,
        dateEmployed: data.dateEmployed,
        qualification: data.qualification || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        bankName: data.bankName || null,
        accountNumber: data.accountNumber || null,
        accountName: data.accountName || null,
        pensionPfa: data.pensionPfa || null,
        pensionPin: data.pensionPin || null,
        taxId: data.taxId || null,
        notes: data.notes || null,
      },
      select: { id: true, staffNo: true },
      })
    })

    await recordAudit({
      actor,
      action: "staff.create",
      entityType: "Staff",
      entityId: staff.id,
      summary: `Added ${data.firstName} ${data.lastName} as ${staff.staffNo}`,
    })

    revalidateHr("/staff")
    revalidatePath("/dashboard/admin/teachers")
    revalidatePath("/dashboard/admin/finance/staff")
    revalidateHr("/onboarding")
    return { success: true, data: { ...staff, temporaryPassword, loginEmail: data.createLogin ? data.email ?? undefined : undefined } }
  } catch (error) {
    return toError(error, "Failed to create the staff record")
  }
}

export async function updateStaff(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = staffSchema.extend({ staffId: z.string().min(1) }).parse(input)

    const existing = await prisma.staff.findFirst({
      where: { id: data.staffId, schoolId },
      select: { id: true, staffNo: true },
    })
    if (!existing) throw new Error("Staff member not found")

    if (data.userId) {
      const [user, taken] = await Promise.all([
        prisma.user.findFirst({
          where: {
            id: data.userId,
            OR: [{ admin: { schoolId } }, { teacher: { schoolId } }],
          },
          select: { id: true },
        }),
        prisma.staff.findUnique({ where: { userId: data.userId }, select: { id: true, staffNo: true } }),
      ])
      if (!user) throw new Error("That login does not belong to this school")
      if (taken && taken.id !== existing.id) {
        throw new Error(`That login is already linked to staff ${taken.staffNo}`)
      }
    }

    await prisma.staff.update({
      where: { id: existing.id },
      data: {
        userId: data.userId || null,
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        department: data.department || null,
        jobTitle: data.jobTitle || null,
        staffType: data.staffType,
        employmentType: data.employmentType,
        dateEmployed: data.dateEmployed,
        qualification: data.qualification || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        bankName: data.bankName || null,
        accountNumber: data.accountNumber || null,
        accountName: data.accountName || null,
        pensionPfa: data.pensionPfa || null,
        pensionPin: data.pensionPin || null,
        taxId: data.taxId || null,
        notes: data.notes || null,
      },
    })

    await recordAudit({
      actor,
      action: "staff.update",
      entityType: "Staff",
      entityId: existing.id,
      summary: `Updated the record for ${existing.staffNo}`,
    })

    revalidateHr("/staff", `/staff/${existing.id}`)
    return { success: true, data: { id: existing.id } }
  } catch (error) {
    return toError(error, "Failed to update the staff record")
  }
}

/**
 * Changes someone's employment status.
 *
 * Exiting sets `dateExited`, which is what stops payroll including them, so a resignation
 * cannot leave someone quietly on the payroll next month. Leaving, or being suspended, also
 * switches off their login and signs them out everywhere; returning to ACTIVE switches it
 * back on. See LOGINS_THAT_FOLLOW_EMPLOYMENT for whose.
 */
export async function setStaffEmploymentStatus(input: unknown): Promise<ActionResult<{
  employmentStatus: string
  /** What happened to their sign-in, or null when they have none that follows HR. */
  login: "DEACTIVATED" | "REACTIVATED" | null
}>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z
      .object({
        staffId: z.string().min(1),
        employmentStatus: z.enum(["ACTIVE", "SUSPENDED", "RESIGNED", "TERMINATED"]),
        effectiveOn: z.coerce.date().optional().nullable(),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input)

    const member = await prisma.staff.findFirst({
      where: { id: data.staffId, schoolId },
      select: {
        id: true,
        staffNo: true,
        employmentStatus: true,
        userId: true,
        user: { select: { role: true, isActive: true } },
      },
    })
    if (!member) throw new Error("Staff member not found")

    const exiting = data.employmentStatus === "RESIGNED" || data.employmentStatus === "TERMINATED"
    const active = data.employmentStatus === "ACTIVE"

    if (!active && member.userId === actor.userId) {
      throw new Error("You cannot suspend or end your own employment. Ask another HR officer or the school admin.")
    }
    // An administrator's login follows HR as well, and opens the whole school. Deciding their
    // employment is for someone who could grant or remove that access anyway.
    const administrator = member.user?.role === "ADMIN"
    if (administrator) await requirePermission("users.manage")

    const followsHr = Boolean(member.userId && member.user && LOGINS_THAT_FOLLOW_EMPLOYMENT.has(member.user.role))
    const login: "DEACTIVATED" | "REACTIVATED" | null = !followsHr
      ? null
      : active
        ? (member.employmentStatus !== "ACTIVE" && !member.user?.isActive ? "REACTIVATED" : null)
        : (member.user?.isActive ? "DEACTIVATED" : null)

    await prisma.$transaction(async (tx) => {
      // A school with no working administrator can only be recovered by the platform. The
      // school's administrator logins are locked before counting, so two administrators let
      // go at the same moment cannot each see the other as the one who remains.
      if (administrator && login === "DEACTIVATED") {
        const admins = await tx.$queryRaw<Array<{ id: string; isActive: unknown }>>(
          Prisma.sql`SELECT u.id, u.isActive FROM users u JOIN Admin a ON a.userId = u.id
            WHERE a.schoolId = ${schoolId} AND u.role = 'ADMIN' FOR UPDATE`,
        )
        if (!admins.some((row) => row.id !== member.userId && Boolean(Number(row.isActive)))) {
          throw new Error(
            "This is the school's only active administrator. Give another member of staff an administrator "
              + "login first, so the school is not left without one.",
          )
        }
      }
      await tx.staff.update({
        where: { id: member.id },
        data: {
          employmentStatus: data.employmentStatus,
          dateExited: exiting ? (data.effectiveOn ?? new Date()) : null,
        },
      })
      if (login && member.userId) {
        await tx.user.update({
          where: { id: member.userId },
          data: { isActive: login === "REACTIVATED" },
        })
      }
    })

    // After the commit, and outside it: revocation is best-effort by design (see
    // sessions.server), and `requireActor` already refuses an inactive user on their next
    // request, so a failure here narrows nothing.
    if (login === "DEACTIVATED" && member.userId) {
      await revokeAllSessionsForUser(member.userId)
    }

    await recordAudit({
      actor,
      action: "staff.status_change",
      entityType: "Staff",
      entityId: member.id,
      summary:
        `${member.staffNo} moved from ${member.employmentStatus.toLowerCase()} to ` +
        `${data.employmentStatus.toLowerCase()}` +
        (login === "DEACTIVATED" ? "; login switched off" : "") +
        (login === "REACTIVATED" ? "; login switched back on" : "") +
        (data.reason ? `: ${data.reason}` : ""),
      before: { employmentStatus: member.employmentStatus, loginActive: member.user?.isActive ?? null },
      after: {
        employmentStatus: data.employmentStatus,
        loginActive: login ? login === "REACTIVATED" : (member.user?.isActive ?? null),
      },
    })

    revalidateHr("/staff", `/staff/${member.id}`)
    revalidatePath("/dashboard/admin/teachers")
    revalidatePath("/dashboard/admin/finance/staff")
    return { success: true, data: { employmentStatus: data.employmentStatus, login } }
  } catch (error) {
    return toError(error, "Failed to change the employment status")
  }
}

// ---------------------------------------------------------------------------
// Configuration: settings, scales, allowance and deduction types
// ---------------------------------------------------------------------------

export async function getHrSetupData(): Promise<ActionResult<{
  config: Awaited<ReturnType<typeof hrConfig>>
  scales: Array<{ id: string; name: string; gradeLevel: string | null; step: string | null; baseSalary: string; description: string | null; isActive: boolean; staffCount: number }>
  allowanceTypes: Array<{ id: string; name: string; kind: string; value: string; isTaxable: boolean; isRecurring: boolean; isActive: boolean; assignedCount: number }>
  deductionTypes: Array<{ id: string; name: string; kind: string; value: string; timing: string; isRecurring: boolean; isActive: boolean; assignedCount: number }>
  accounts: Array<{ id: string; name: string; balance: string; isActive: boolean }>
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  linkableUsers: Array<{ id: string; name: string; role: string }>
}>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const [config, scales, allowanceTypes, deductionTypes, accounts, sessions, users, linkedUserIds, paidByAccount] =
      await Promise.all([
        hrConfig(schoolId),
        prisma.salaryScale.findMany({
          where: { schoolId },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            gradeLevel: true,
            step: true,
            baseSalary: true,
            description: true,
            isActive: true,
            _count: { select: { salaries: true } },
          },
        }),
        prisma.allowanceType.findMany({
          where: { schoolId },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            kind: true,
            value: true,
            isTaxable: true,
            isRecurring: true,
            isActive: true,
            _count: { select: { assignments: true } },
          },
        }),
        prisma.deductionType.findMany({
          where: { schoolId },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            kind: true,
            value: true,
            timing: true,
            isRecurring: true,
            isActive: true,
            _count: { select: { assignments: true } },
          },
        }),
        prisma.paymentAccount.findMany({
          where: { schoolId },
          orderBy: { name: "asc" },
          select: { id: true, name: true, openingBalance: true, isActive: true },
        }),
        prisma.session.findMany({
          where: { schoolId },
          orderBy: { startDate: "desc" },
          select: { id: true, name: true, isCurrent: true },
        }),
        prisma.user.findMany({
          where: { isActive: true, OR: [{ admin: { schoolId } }, { teacher: { schoolId } }] },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, role: true },
        }),
        prisma.staff.findMany({ where: { schoolId, userId: { not: null } }, select: { userId: true } }),
        prisma.expense.groupBy({
          by: ["accountId"],
          where: { schoolId, status: "PAID" },
          _sum: { amount: true },
        }),
      ])

    const spent = new Map(paidByAccount.map((row) => [row.accountId, money(row._sum.amount ?? 0)]))
    const linked = new Set(linkedUserIds.map((row) => row.userId))

    return {
      success: true,
      data: {
        config,
        scales: scales.map((scale) => ({
          id: scale.id,
          name: scale.name,
          gradeLevel: scale.gradeLevel,
          step: scale.step,
          baseSalary: moneyString(scale.baseSalary),
          description: scale.description,
          isActive: scale.isActive,
          staffCount: scale._count.salaries,
        })),
        allowanceTypes: allowanceTypes.map((type) => ({
          id: type.id,
          name: type.name,
          kind: type.kind,
          value: moneyString(type.value),
          isTaxable: type.isTaxable,
          isRecurring: type.isRecurring,
          isActive: type.isActive,
          assignedCount: type._count.assignments,
        })),
        deductionTypes: deductionTypes.map((type) => ({
          id: type.id,
          name: type.name,
          kind: type.kind,
          value: moneyString(type.value),
          timing: type.timing,
          isRecurring: type.isRecurring,
          isActive: type.isActive,
          assignedCount: type._count.assignments,
        })),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          balance: moneyString(account.openingBalance.minus(spent.get(account.id) ?? 0)),
          isActive: account.isActive,
        })),
        sessions,
        // Only logins not already claimed by a staff record, so the picker cannot create a
        // duplicate person.
        linkableUsers: users
          .filter((user) => !linked.has(user.id))
          .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`, role: user.role })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load HR setup data")
  }
}

export async function saveHrConfig(input: unknown): Promise<ActionResult<{ schoolId: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = configSchema.parse(input)

    if (data.defaultAccountId) {
      const account = await prisma.paymentAccount.findFirst({
        where: { id: data.defaultAccountId, schoolId },
        select: { id: true },
      })
      if (!account) throw new Error("That payment account does not belong to this school")
    }

    await prisma.staffConfig.upsert({
      where: { schoolId },
      create: { schoolId, ...data, defaultAccountId: data.defaultAccountId || null, payslipNote: data.payslipNote || null },
      update: { ...data, defaultAccountId: data.defaultAccountId || null, payslipNote: data.payslipNote || null },
    })

    await recordAudit({
      actor,
      action: "hr.config_save",
      entityType: "StaffConfig",
      entityId: schoolId,
      summary: "Updated the HR and payroll settings",
      after: {
        requirePayrollApproval: data.requirePayrollApproval,
        allowNegativeNet: data.allowNegativeNet,
        prorateFirstMonth: data.prorateFirstMonth,
      },
    })

    revalidateHr("/config")
    return { success: true, data: { schoolId } }
  } catch (error) {
    return toError(error, "Failed to save the HR settings")
  }
}

export async function createSalaryScale(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = scaleSchema.parse(input)

    const names = await prisma.salaryScale.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const naming = canUseComponentName(data.name, names, "salary scale")
    if (!naming.allowed) throw new Error(naming.reason)

    const scale = await prisma.salaryScale.create({
      data: {
        schoolId,
        name: data.name,
        gradeLevel: data.gradeLevel || null,
        step: data.step || null,
        baseSalary: money(data.baseSalary),
        description: data.description || null,
      },
      select: { id: true },
    })

    revalidateHr("/salary-scales")
    return { success: true, data: scale }
  } catch (error) {
    return toError(error, "Failed to create the salary scale")
  }
}

export async function setSalaryScaleActive(input: unknown): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ scaleId: z.string().min(1), isActive: z.boolean() }).parse(input)

    const scale = await prisma.salaryScale.findFirst({ where: { id: data.scaleId, schoolId }, select: { id: true } })
    if (!scale) throw new Error("Salary scale not found in this school")

    await prisma.salaryScale.update({ where: { id: scale.id }, data: { isActive: data.isActive } })

    revalidateHr("/salary-scales")
    return { success: true, data: { isActive: data.isActive } }
  } catch (error) {
    return toError(error, "Failed to update the salary scale")
  }
}

export type SalaryScaleDetail = {
  id: string
  name: string
  gradeLevel: string | null
  step: string | null
  baseSalary: string
  description: string | null
  isActive: boolean
  staffCount: number
  createdAt: string
  /** Every scale name in the school, so a rename is checked before it is submitted. */
  takenNames: Array<{ id: string; name: string }>
  /** Who is on it, so the delete refusal and its cause sit side by side. */
  staff: Array<{ id: string; staffNo: string; name: string; department: string | null; baseSalary: string }>
}

/** One salary scale, with everything the manage screen decides what to offer on. */
export async function getSalaryScale(scaleId: string): Promise<ActionResult<SalaryScaleDetail>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const scale = await prisma.salaryScale.findFirst({
      where: { id: scaleId, schoolId },
      select: {
        id: true,
        name: true,
        gradeLevel: true,
        step: true,
        baseSalary: true,
        description: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!scale) throw new Error("Salary scale not found in this school")

    const [names, salaries] = await Promise.all([
      prisma.salaryScale.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      prisma.staffSalary.findMany({
        where: { scaleId, isActive: true },
        orderBy: { effectiveFrom: "desc" },
        select: {
          baseSalary: true,
          staff: {
            select: { id: true, staffNo: true, firstName: true, lastName: true, department: true },
          },
        },
      }),
    ])

    return {
      success: true,
      data: {
        id: scale.id,
        name: scale.name,
        gradeLevel: scale.gradeLevel,
        step: scale.step,
        baseSalary: moneyString(scale.baseSalary),
        description: scale.description,
        isActive: scale.isActive,
        staffCount: salaries.length,
        createdAt: scale.createdAt.toISOString(),
        takenNames: names,
        staff: salaries.map((salary) => ({
          id: salary.staff.id,
          staffNo: salary.staff.staffNo,
          name: `${salary.staff.firstName} ${salary.staff.lastName}`,
          department: salary.staff.department,
          baseSalary: moneyString(salary.baseSalary),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the salary scale")
  }
}

/**
 * Renames a scale, corrects its grade and step, moves its base salary, retires or revives it.
 *
 * Moving the base salary does not move anybody's pay: assigning a scale copies the figure
 * onto the staff record, so the scale is a template. The screen says so before saving.
 */
export async function updateSalaryScale(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = scaleSchema.extend({ id: z.string().min(1), isActive: z.boolean() }).parse(input)

    const scale = await prisma.salaryScale.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true, isActive: true, baseSalary: true },
    })
    if (!scale) throw new Error("Salary scale not found in this school")

    const names = await prisma.salaryScale.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const naming = canUseComponentName(data.name, names, "salary scale", data.id)
    if (!naming.allowed) throw new Error(naming.reason)

    await prisma.salaryScale.update({
      where: { id: data.id },
      data: {
        name: data.name,
        gradeLevel: data.gradeLevel || null,
        step: data.step || null,
        baseSalary: money(data.baseSalary),
        description: data.description || null,
        isActive: data.isActive,
      },
    })

    await recordAudit({
      actor,
      action: "hr.scale.update",
      entityType: "SalaryScale",
      entityId: data.id,
      summary: `Updated the salary scale ${data.name}`,
      before: { name: scale.name, baseSalary: moneyString(scale.baseSalary), isActive: scale.isActive },
      after: { name: data.name, baseSalary: moneyString(data.baseSalary), isActive: data.isActive },
    })

    revalidateHr("/salary-scales", `/salary-scales/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to update the salary scale")
  }
}

/** Deletes a scale nobody has been put on. Anything else is retired. */
export async function deleteSalaryScale(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ id: z.string().min(1) }).parse(input)

    const scale = await prisma.salaryScale.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true },
    })
    if (!scale) throw new Error("Salary scale not found in this school")

    const staffCount = await prisma.staffSalary.count({ where: { scaleId: data.id } })
    const removal = canDeleteSalaryScale({ staffCount })
    if (!removal.allowed) throw new Error(removal.reason)

    await prisma.salaryScale.delete({ where: { id: data.id } })

    await recordAudit({
      actor,
      action: "hr.scale.delete",
      entityType: "SalaryScale",
      entityId: data.id,
      summary: `Deleted the salary scale ${scale.name}, which nobody was on`,
      before: { name: scale.name },
    })

    revalidateHr("/salary-scales", `/salary-scales/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to delete the salary scale")
  }
}

export type PayComponentDetail = {
  id: string
  name: string
  kind: string
  value: string
  isRecurring: boolean
  isActive: boolean
  assignedCount: number
  createdAt: string
  /** Allowances only. */
  isTaxable?: boolean
  /** Deductions only. */
  timing?: string
  takenNames: Array<{ id: string; name: string }>
  staff: Array<{ id: string; staffNo: string; name: string; value: string }>
}

/** One allowance type, with who is on it. */
export async function getAllowanceType(typeId: string): Promise<ActionResult<PayComponentDetail>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const type = await prisma.allowanceType.findFirst({
      where: { id: typeId, schoolId },
      select: {
        id: true,
        name: true,
        kind: true,
        value: true,
        isTaxable: true,
        isRecurring: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!type) throw new Error("Allowance not found in this school")

    const [names, assignments] = await Promise.all([
      prisma.allowanceType.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      prisma.staffAllowance.findMany({
        where: { allowanceTypeId: typeId, isActive: true },
        select: {
          valueOverride: true,
          staff: { select: { id: true, staffNo: true, firstName: true, lastName: true } },
        },
      }),
    ])

    return {
      success: true,
      data: {
        id: type.id,
        name: type.name,
        kind: type.kind,
        value: moneyString(type.value),
        isTaxable: type.isTaxable,
        isRecurring: type.isRecurring,
        isActive: type.isActive,
        assignedCount: assignments.length,
        createdAt: type.createdAt.toISOString(),
        takenNames: names,
        staff: assignments.map((assignment) => ({
          id: assignment.staff.id,
          staffNo: assignment.staff.staffNo,
          name: `${assignment.staff.firstName} ${assignment.staff.lastName}`,
          value: moneyString(assignment.valueOverride ?? type.value),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the allowance")
  }
}

/** One deduction type, with who is on it. */
export async function getDeductionType(typeId: string): Promise<ActionResult<PayComponentDetail>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const type = await prisma.deductionType.findFirst({
      where: { id: typeId, schoolId },
      select: {
        id: true,
        name: true,
        kind: true,
        value: true,
        timing: true,
        isRecurring: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!type) throw new Error("Deduction not found in this school")

    const [names, assignments] = await Promise.all([
      prisma.deductionType.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      prisma.staffDeduction.findMany({
        where: { deductionTypeId: typeId, isActive: true },
        select: {
          valueOverride: true,
          staff: { select: { id: true, staffNo: true, firstName: true, lastName: true } },
        },
      }),
    ])

    return {
      success: true,
      data: {
        id: type.id,
        name: type.name,
        kind: type.kind,
        value: moneyString(type.value),
        timing: type.timing,
        isRecurring: type.isRecurring,
        isActive: type.isActive,
        assignedCount: assignments.length,
        createdAt: type.createdAt.toISOString(),
        takenNames: names,
        staff: assignments.map((assignment) => ({
          id: assignment.staff.id,
          staffNo: assignment.staff.staffNo,
          name: `${assignment.staff.firstName} ${assignment.staff.lastName}`,
          value: moneyString(assignment.valueOverride ?? type.value),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the deduction")
  }
}

export async function updateAllowanceType(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = allowanceTypeSchema.extend({ id: z.string().min(1), isActive: z.boolean() }).parse(input)

    const type = await prisma.allowanceType.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true, isActive: true, value: true },
    })
    if (!type) throw new Error("Allowance not found in this school")

    const names = await prisma.allowanceType.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const naming = canUseComponentName(data.name, names, "allowance", data.id)
    if (!naming.allowed) throw new Error(naming.reason)

    await prisma.allowanceType.update({
      where: { id: data.id },
      data: {
        name: data.name,
        kind: data.kind,
        value: money(data.value),
        isTaxable: data.isTaxable,
        isRecurring: data.isRecurring,
        isActive: data.isActive,
      },
    })

    await recordAudit({
      actor,
      action: "hr.allowance.update",
      entityType: "AllowanceType",
      entityId: data.id,
      summary: `Updated the allowance ${data.name}`,
      before: { name: type.name, value: moneyString(type.value), isActive: type.isActive },
      after: { name: data.name, value: moneyString(data.value), isActive: data.isActive },
    })

    revalidateHr("/allowances", `/allowances/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to update the allowance")
  }
}

export async function updateDeductionType(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = deductionTypeSchema.extend({ id: z.string().min(1), isActive: z.boolean() }).parse(input)

    const type = await prisma.deductionType.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true, isActive: true, value: true },
    })
    if (!type) throw new Error("Deduction not found in this school")

    const names = await prisma.deductionType.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const naming = canUseComponentName(data.name, names, "deduction", data.id)
    if (!naming.allowed) throw new Error(naming.reason)

    await prisma.deductionType.update({
      where: { id: data.id },
      data: {
        name: data.name,
        kind: data.kind,
        value: money(data.value),
        timing: data.timing,
        isRecurring: data.isRecurring,
        isActive: data.isActive,
      },
    })

    await recordAudit({
      actor,
      action: "hr.deduction.update",
      entityType: "DeductionType",
      entityId: data.id,
      summary: `Updated the deduction ${data.name}`,
      before: { name: type.name, value: moneyString(type.value), isActive: type.isActive },
      after: { name: data.name, value: moneyString(data.value), isActive: data.isActive },
    })

    revalidateHr("/deductions", `/deductions/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to update the deduction")
  }
}

/**
 * Deletes an allowance or deduction type nobody has ever been assigned.
 *
 * Anything else is retired: the name is on payslips already issued and in the allowance and
 * deduction reports, and those have to keep resolving.
 */
export async function deletePayComponent(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z
      .object({ id: z.string().min(1), kind: z.enum(["allowance", "deduction"]) })
      .parse(input)

    if (data.kind === "allowance") {
      const type = await prisma.allowanceType.findFirst({
        where: { id: data.id, schoolId },
        select: { id: true, name: true },
      })
      if (!type) throw new Error("Allowance not found in this school")

      const assignedCount = await prisma.staffAllowance.count({ where: { allowanceTypeId: data.id } })
      const removal = canDeletePayComponent({ assignedCount }, "allowance")
      if (!removal.allowed) throw new Error(removal.reason)

      await prisma.allowanceType.delete({ where: { id: data.id } })
      await recordAudit({
        actor,
        action: "hr.allowance.delete",
        entityType: "AllowanceType",
        entityId: data.id,
        summary: `Deleted the allowance ${type.name}, which had never been assigned`,
        before: { name: type.name },
      })
      revalidateHr("/allowances", `/allowances/${data.id}`)
      return { success: true, data: { id: data.id } }
    }

    const type = await prisma.deductionType.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, name: true },
    })
    if (!type) throw new Error("Deduction not found in this school")

    const assignedCount = await prisma.staffDeduction.count({ where: { deductionTypeId: data.id } })
    const removal = canDeletePayComponent({ assignedCount }, "deduction")
    if (!removal.allowed) throw new Error(removal.reason)

    await prisma.deductionType.delete({ where: { id: data.id } })
    await recordAudit({
      actor,
      action: "hr.deduction.delete",
      entityType: "DeductionType",
      entityId: data.id,
      summary: `Deleted the deduction ${type.name}, which had never been assigned`,
      before: { name: type.name },
    })
    revalidateHr("/deductions", `/deductions/${data.id}`)
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to delete it")
  }
}

export async function createAllowanceType(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = allowanceTypeSchema.parse(input)

    if (data.kind === "PERCENTAGE" && data.value > 100) {
      throw new Error("A percentage allowance cannot be more than 100% of base salary")
    }

    const names = await prisma.allowanceType.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const naming = canUseComponentName(data.name, names, "allowance")
    if (!naming.allowed) throw new Error(naming.reason)

    const type = await prisma.allowanceType.create({
      data: {
        schoolId,
        name: data.name,
        kind: data.kind,
        value: money(data.value),
        isTaxable: data.isTaxable,
        isRecurring: data.isRecurring,
      },
      select: { id: true },
    })

    revalidateHr("/allowances")
    return { success: true, data: type }
  } catch (error) {
    return toError(error, "Failed to create the allowance")
  }
}

export async function createDeductionType(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = deductionTypeSchema.parse(input)

    if (data.kind === "PERCENTAGE" && data.value > 100) {
      throw new Error("A percentage deduction cannot be more than 100%")
    }

    const names = await prisma.deductionType.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const naming = canUseComponentName(data.name, names, "deduction")
    if (!naming.allowed) throw new Error(naming.reason)

    const type = await prisma.deductionType.create({
      data: {
        schoolId,
        name: data.name,
        kind: data.kind,
        value: money(data.value),
        timing: data.timing,
        isRecurring: data.isRecurring,
      },
      select: { id: true },
    })

    revalidateHr("/deductions")
    return { success: true, data: type }
  } catch (error) {
    return toError(error, "Failed to create the deduction")
  }
}

export async function setComponentTypeActive(input: unknown): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z
      .object({
        kind: z.enum(["ALLOWANCE", "DEDUCTION"]),
        typeId: z.string().min(1),
        isActive: z.boolean(),
      })
      .parse(input)

    // Retired rather than deleted: the type names historical payslip lines, and those must
    // keep resolving even after the school stops using it.
    if (data.kind === "ALLOWANCE") {
      const found = await prisma.allowanceType.findFirst({ where: { id: data.typeId, schoolId }, select: { id: true } })
      if (!found) throw new Error("Allowance not found in this school")
      await prisma.allowanceType.update({ where: { id: found.id }, data: { isActive: data.isActive } })
    } else {
      const found = await prisma.deductionType.findFirst({ where: { id: data.typeId, schoolId }, select: { id: true } })
      if (!found) throw new Error("Deduction not found in this school")
      await prisma.deductionType.update({ where: { id: found.id }, data: { isActive: data.isActive } })
    }

    revalidateHr("/allowances", "/deductions")
    return { success: true, data: { isActive: data.isActive } }
  } catch (error) {
    return toError(error, "Failed to update the component")
  }
}

// ---------------------------------------------------------------------------
// Salary assignment, and per-staff allowances and deductions
// ---------------------------------------------------------------------------

/**
 * Assigns a salary, keeping the history.
 *
 * The previous row is deactivated rather than overwritten, so what somebody was paid before
 * the raise — and who approved it — survives. The new row is approved by the manager making
 * the change, which is also who is recorded against it.
 */
export async function assignStaffSalary(input: unknown): Promise<ActionResult<{ id: string; baseSalary: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = salaryAssignmentSchema.parse(input)

    const [member, scale] = await Promise.all([
      prisma.staff.findFirst({ where: { id: data.staffId, schoolId }, select: { id: true, staffNo: true } }),
      data.scaleId
        ? prisma.salaryScale.findFirst({ where: { id: data.scaleId, schoolId }, select: { id: true } })
        : Promise.resolve(null),
    ])
    if (!member) throw new Error("Staff member not found")
    if (data.scaleId && !scale) throw new Error("Salary scale not found")

    const previous = await prisma.staffSalary.findFirst({
      where: { staffId: member.id, isActive: true },
      select: { id: true, baseSalary: true },
    })

    const salary = await prisma.$transaction(async (tx) => {
      if (previous) {
        await tx.staffSalary.update({ where: { id: previous.id }, data: { isActive: false } })
      }
      return tx.staffSalary.create({
        data: {
          staffId: member.id,
          scaleId: data.scaleId || null,
          baseSalary: money(data.baseSalary),
          effectiveFrom: data.effectiveFrom,
          isActive: true,
          createdBy: actor.userId,
          approvedBy: actor.userId,
          approvedAt: new Date(),
          note: data.note || null,
        },
        select: { id: true, baseSalary: true },
      })
    })

    await recordAudit({
      actor,
      action: "staff.salary_assign",
      entityType: "StaffSalary",
      entityId: salary.id,
      summary:
        `Set ${member.staffNo}'s salary to ${moneyString(data.baseSalary)}` +
        (previous ? ` (was ${moneyString(previous.baseSalary)})` : ""),
      before: previous ? { baseSalary: moneyString(previous.baseSalary) } : undefined,
      after: { baseSalary: moneyString(data.baseSalary), effectiveFrom: data.effectiveFrom.toISOString() },
    })

    revalidateHr("/staff", `/staff/${member.id}`)
    return { success: true, data: { id: salary.id, baseSalary: moneyString(salary.baseSalary) } }
  } catch (error) {
    return toError(error, "Failed to assign the salary")
  }
}

/** Shared by the allowance and deduction assignment actions, which differ only in table. */
async function assertAssignable(schoolId: string, staffId: string) {
  const member = await prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true, staffNo: true } })
  if (!member) throw new Error("Staff member not found")
  return member
}

export async function assignStaffAllowance(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = assignmentSchema.parse(input)

    const [member, type] = await Promise.all([
      assertAssignable(schoolId, data.staffId),
      prisma.allowanceType.findFirst({ where: { id: data.typeId, schoolId }, select: { id: true, name: true, isActive: true } }),
    ])
    if (!type) throw new Error("Allowance not found")
    if (!type.isActive) throw new Error("That allowance has been retired")
    // A one-off has to name its month, or nothing would ever pick it up.
    if (!data.isRecurring && (!data.periodYear || !data.periodMonth)) {
      throw new Error("A one-time allowance needs the payroll month it belongs to")
    }

    const assignment = await prisma.staffAllowance.create({
      data: {
        staffId: member.id,
        allowanceTypeId: type.id,
        valueOverride: data.valueOverride != null ? money(data.valueOverride) : null,
        isRecurring: data.isRecurring,
        periodYear: data.isRecurring ? null : data.periodYear,
        periodMonth: data.isRecurring ? null : data.periodMonth,
        startDate: data.startDate,
        endDate: data.endDate || null,
        reason: data.reason || null,
      },
      select: { id: true },
    })

    await recordAudit({
      actor,
      action: "staff.allowance_assign",
      entityType: "StaffAllowance",
      entityId: assignment.id,
      summary: `Gave ${member.staffNo} the ${type.name} allowance`,
    })

    revalidateHr("/staff", `/staff/${member.id}`)
    return { success: true, data: assignment }
  } catch (error) {
    return toError(error, "Failed to assign the allowance")
  }
}

export async function assignStaffDeduction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = assignmentSchema.parse(input)

    const [member, type] = await Promise.all([
      assertAssignable(schoolId, data.staffId),
      prisma.deductionType.findFirst({ where: { id: data.typeId, schoolId }, select: { id: true, name: true, isActive: true } }),
    ])
    if (!type) throw new Error("Deduction not found")
    if (!type.isActive) throw new Error("That deduction has been retired")
    if (!data.isRecurring && (!data.periodYear || !data.periodMonth)) {
      throw new Error("A one-time deduction needs the payroll month it belongs to")
    }

    const assignment = await prisma.staffDeduction.create({
      data: {
        staffId: member.id,
        deductionTypeId: type.id,
        valueOverride: data.valueOverride != null ? money(data.valueOverride) : null,
        isRecurring: data.isRecurring,
        periodYear: data.isRecurring ? null : data.periodYear,
        periodMonth: data.isRecurring ? null : data.periodMonth,
        startDate: data.startDate,
        endDate: data.endDate || null,
        reason: data.reason || null,
      },
      select: { id: true },
    })

    await recordAudit({
      actor,
      action: "staff.deduction_assign",
      entityType: "StaffDeduction",
      entityId: assignment.id,
      summary: `Applied the ${type.name} deduction to ${member.staffNo}`,
    })

    revalidateHr("/staff", `/staff/${member.id}`)
    return { success: true, data: assignment }
  } catch (error) {
    return toError(error, "Failed to assign the deduction")
  }
}

export async function setAssignmentActive(input: unknown): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z
      .object({
        kind: z.enum(["ALLOWANCE", "DEDUCTION"]),
        assignmentId: z.string().min(1),
        isActive: z.boolean(),
      })
      .parse(input)

    if (data.kind === "ALLOWANCE") {
      const found = await prisma.staffAllowance.findFirst({
        where: { id: data.assignmentId, staff: { schoolId } },
        select: { id: true, staffId: true },
      })
      if (!found) throw new Error("Allowance assignment not found")
      await prisma.staffAllowance.update({ where: { id: found.id }, data: { isActive: data.isActive } })
      revalidateHr("/staff", `/staff/${found.staffId}`)
    } else {
      const found = await prisma.staffDeduction.findFirst({
        where: { id: data.assignmentId, staff: { schoolId } },
        select: { id: true, staffId: true },
      })
      if (!found) throw new Error("Deduction assignment not found")
      await prisma.staffDeduction.update({ where: { id: found.id }, data: { isActive: data.isActive } })
      revalidateHr("/staff", `/staff/${found.staffId}`)
    }

    return { success: true, data: { isActive: data.isActive } }
  } catch (error) {
    return toError(error, "Failed to update the assignment")
  }
}

export async function createDisciplinaryRecord(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = disciplineSchema.parse(input)

    const member = await assertAssignable(schoolId, data.staffId)

    const record = await prisma.staffDisciplinaryRecord.create({
      data: {
        staffId: member.id,
        type: data.type,
        reason: data.reason,
        occurredOn: data.occurredOn,
        actionTaken: data.actionTaken || null,
        attachmentUrl: data.attachmentUrl || null,
        recordedBy: actor.userId,
      },
      select: { id: true },
    })

    await recordAudit({
      actor,
      action: "staff.discipline_record",
      entityType: "StaffDisciplinaryRecord",
      entityId: record.id,
      summary: `Recorded a ${data.type.toLowerCase()} against ${member.staffNo}`,
    })

    revalidateHr("/discipline", `/staff/${member.id}`)
    return { success: true, data: record }
  } catch (error) {
    return toError(error, "Failed to record the entry")
  }
}

// ---------------------------------------------------------------------------
// Payroll: generation, approval, payment
// ---------------------------------------------------------------------------

/** Everything a run needs about one staff member, gathered in one query per month. */
type PayrollCandidate = {
  id: string
  staffNo: string
  firstName: string
  lastName: string
  department: string | null
  dateEmployed: Date
  dateExited: Date | null
  salaries: Array<{ baseSalary: Prisma.Decimal; effectiveFrom: Date }>
  allowances: Array<{
    valueOverride: Prisma.Decimal | null
    allowanceTypeId: string
    allowanceType: { name: string; kind: "FIXED" | "PERCENTAGE"; value: Prisma.Decimal; isTaxable: boolean }
  }>
  deductions: Array<{
    valueOverride: Prisma.Decimal | null
    deductionTypeId: string
    deductionType: {
      name: string
      kind: "FIXED" | "PERCENTAGE"
      value: Prisma.Decimal
      timing: "PRE_TAX" | "POST_TAX"
    }
  }>
}

/**
 * Everyone who should appear in a given month's payroll.
 *
 * Included when they were employed on or before the month ended, had not left before it
 * began, and are not suspended. A suspended member of staff keeps their record and their
 * history but is not paid, which is the point of the status.
 *
 * Assignments are narrowed to the month here rather than in application code, so a one-off
 * bonus for March cannot leak into April's run.
 */
async function payrollCandidates(schoolId: string, year: number, month: number): Promise<PayrollCandidate[]> {
  const { start, end } = monthBounds(year, month)

  const periodWindow = {
    isActive: true,
    startDate: { lte: end },
    AND: [{ OR: [{ endDate: null }, { endDate: { gte: start } }] }],
    OR: [
      { isRecurring: true },
      { isRecurring: false, periodYear: year, periodMonth: month },
    ],
  }

  return prisma.staff.findMany({
    where: {
      schoolId,
      dateEmployed: { lte: end },
      OR: [
        { employmentStatus: "ACTIVE", OR: [{ dateExited: null }, { dateExited: { gte: start } }] },
        // Somebody who resigned or was let go on the 12th is owed the 12 days. Filtering on
        // ACTIVE alone dropped them before the pro-rating below could pay those days, so a
        // leaver's last part-month was never paid. Suspended staff stay out: suspension is
        // decided outside payroll, and a school that pays through it adds it by hand.
        { employmentStatus: { in: ["RESIGNED", "TERMINATED"] }, dateExited: { gte: start } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      staffNo: true,
      firstName: true,
      lastName: true,
      department: true,
      dateEmployed: true,
      dateExited: true,
      // The salary in force at the end of the month, newest first.
      salaries: {
        where: { isActive: true, effectiveFrom: { lte: end } },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { baseSalary: true, effectiveFrom: true },
      },
      allowances: {
        where: periodWindow,
        select: {
          valueOverride: true,
          allowanceTypeId: true,
          allowanceType: { select: { name: true, kind: true, value: true, isTaxable: true } },
        },
      },
      deductions: {
        where: periodWindow,
        select: {
          valueOverride: true,
          deductionTypeId: true,
          deductionType: { select: { name: true, kind: true, value: true, timing: true } },
        },
      },
    },
  })
}

/** Issues the next payslip number for a school and year, inside the caller's transaction. */
async function nextPayslipNo(tx: Prisma.TransactionClient, schoolId: string, year: number): Promise<string> {
  const sequence = await tx.payslipSequence.upsert({
    where: { schoolId_year: { schoolId, year } },
    create: { schoolId, year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  })
  return `PS-${year}-${String(sequence.lastSequence).padStart(5, "0")}`
}

/**
 * Generates a month's payroll.
 *
 * Every figure is computed once, here, and written to PayrollItemLine. Nothing downstream
 * recomputes from the allowance configuration, so a payslip issued today still reads the
 * same after somebody edits the transport allowance next term.
 *
 * Refuses outright rather than producing a partial run when any staff member would come out
 * with a negative net, unless the school has opted into that. A negative payslip is almost
 * always a misconfigured deduction, and finding out at payment time is too late.
 */
export async function generatePayroll(input: unknown): Promise<ActionResult<{
  id: string
  status: PayrollStatus
  staffCount: number
  totalNet: string
  skipped: Array<{ staffNo: string; name: string; reason: string }>
}>> {
  try {
    const actor = await requirePayrollOfficer()
    const schoolId = await actorSchool(actor)
    const data = payrollPeriodSchema.parse(input)
    const config = await hrConfig(schoolId)

    // Which months are already spoken for, and which month it actually is. The predicate is
    // the same one the Generate Payroll screen greys its button out with, so the refusal the
    // server gives is the refusal the screen already showed.
    const existing = await prisma.payrollRun.findMany({
      where: { schoolId },
      select: { year: true, month: true, status: true },
    })
    const now = new Date()
    const verdict = canGeneratePayroll(
      { year: data.year, month: data.month },
      { existing, today: { year: now.getFullYear(), month: now.getMonth() + 1 } },
    )
    if (!verdict.allowed) throw new Error(verdict.reason)

    if (data.sessionId) {
      const session = await prisma.session.findFirst({
        where: { id: data.sessionId, schoolId },
        select: { id: true },
      })
      if (!session) throw new Error("Session not found")
    }

    const { start, end, daysInMonth } = monthBounds(data.year, data.month)

    // "Not linked" meant exactly that: the run belonged to no session, and anything reading
    // payroll by session skipped it while its money still showed in expenditure. Left blank,
    // it now takes the session whose term covers the payroll month - the same rule payPayroll
    // books the expense by - and only stays unlinked when no term covers it at all.
    const sessionId =
      data.sessionId ||
      (await prisma.term.findFirst({
        where: { session: { schoolId }, startDate: { lte: end }, endDate: { gte: end } },
        select: { sessionId: true },
      }))?.sessionId ||
      (await prisma.session.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } }))?.id ||
      null
    const candidates = await payrollCandidates(schoolId, data.year, data.month)
    if (candidates.length === 0) throw new Error("No active staff to pay for that month")

    const skipped: Array<{ staffNo: string; name: string; reason: string }> = []
    const negatives: string[] = []
    const computed: Array<{ candidate: PayrollCandidate; pay: ReturnType<typeof computePay> }> = []

    for (const candidate of candidates) {
      const salary = candidate.salaries[0]
      const name = `${candidate.firstName} ${candidate.lastName}`

      // Somebody with no salary on record cannot be paid. Skipping them with a reason beats
      // paying them zero and hoping the payslip is noticed.
      if (!salary) {
        skipped.push({ staffNo: candidate.staffNo, name, reason: "No salary assigned" })
        continue
      }

      const daysWorked = daysEmployedInMonth({
        monthStart: start,
        monthEnd: end,
        daysInMonth,
        dateEmployed: candidate.dateEmployed,
        dateExited: candidate.dateExited,
      })
      if (daysWorked === 0) {
        skipped.push({ staffNo: candidate.staffNo, name, reason: "Not employed during that month" })
        continue
      }

      const pay = computePay({
        baseSalary: salary.baseSalary,
        allowances: candidate.allowances.map((assignment) => ({
          label: assignment.allowanceType.name,
          kind: assignment.allowanceType.kind,
          value: assignment.valueOverride ?? assignment.allowanceType.value,
          isTaxable: assignment.allowanceType.isTaxable,
          sourceType: "AllowanceType",
          sourceId: assignment.allowanceTypeId,
        })),
        deductions: candidate.deductions.map((assignment) => ({
          label: assignment.deductionType.name,
          kind: assignment.deductionType.kind,
          value: assignment.valueOverride ?? assignment.deductionType.value,
          timing: assignment.deductionType.timing,
          sourceType: "DeductionType",
          sourceId: assignment.deductionTypeId,
        })),
        ...(config.prorateFirstMonth ? { daysWorked, daysInMonth } : {}),
      })

      if (pay.isNegative && !config.allowNegativeNet) {
        negatives.push(`${candidate.staffNo} (${name})`)
      }

      computed.push({ candidate, pay })
    }

    if (negatives.length > 0) {
      throw new Error(
        `Deductions exceed pay for ${negatives.join(", ")}. Fix the deductions, or allow ` +
          "negative net pay in the HR settings if that is really intended.",
      )
    }
    if (computed.length === 0) {
      throw new Error("Nobody was eligible for that month. Assign salaries before generating payroll.")
    }

    // Approval can be switched off for a school where the admin does everything, in which
    // case the run is born approved and is ready to pay.
    const status: PayrollStatus = config.requirePayrollApproval ? "DRAFT" : "APPROVED"

    const run = await prisma.$transaction(async (tx) => {
      const totals = computed.reduce(
        (acc, { pay }) => ({
          base: acc.base.plus(pay.baseSalary),
          allowances: acc.allowances.plus(pay.totalAllowances),
          deductions: acc.deductions.plus(pay.totalDeductions),
          gross: acc.gross.plus(pay.grossPay),
          net: acc.net.plus(pay.netPay),
        }),
        { base: money(0), allowances: money(0), deductions: money(0), gross: money(0), net: money(0) },
      )

      const created = await tx.payrollRun.create({
        data: {
          schoolId,
          sessionId,
          year: data.year,
          month: data.month,
          status,
          totalBase: totals.base,
          totalAllowances: totals.allowances,
          totalDeductions: totals.deductions,
          totalGross: totals.gross,
          totalNet: totals.net,
          generatedBy: actor.userId,
          ...(status === "APPROVED" ? { approvedBy: actor.userId, approvedAt: new Date() } : {}),
          notes: data.notes || null,
        },
        select: { id: true, status: true, totalNet: true },
      })

      for (const { candidate, pay } of computed) {
        const item = await tx.payrollItem.create({
          data: {
            schoolId,
            runId: created.id,
            staffId: candidate.id,
            payslipNo: await nextPayslipNo(tx, schoolId, data.year),
            baseSalary: pay.baseSalary,
            totalAllowances: pay.totalAllowances,
            totalDeductions: pay.totalDeductions,
            grossPay: pay.grossPay,
            netPay: pay.netPay,
            proratedDays: pay.proratedDays,
            daysInMonth: pay.daysInMonth,
          },
          select: { id: true },
        })

        // The frozen breakdown. Everything a payslip shows comes from here afterwards.
        const lines = [
          ...pay.allowanceLines.map((line) => ({
            itemId: item.id,
            kind: "ALLOWANCE" as const,
            label: line.label,
            amount: line.amount,
            isTaxable: line.isTaxable ?? null,
            sourceType: line.sourceType ?? null,
            sourceId: line.sourceId ?? null,
          })),
          ...pay.deductionLines.map((line) => ({
            itemId: item.id,
            kind: "DEDUCTION" as const,
            label: line.label,
            amount: line.amount,
            timing: line.timing ?? null,
            sourceType: line.sourceType ?? null,
            sourceId: line.sourceId ?? null,
          })),
        ]
        if (lines.length > 0) await tx.payrollItemLine.createMany({ data: lines })
      }

      return created
    })

    await recordAudit({
      actor,
      action: "payroll.generate",
      entityType: "PayrollRun",
      entityId: run.id,
      summary:
        `Generated payroll for ${data.year}-${String(data.month).padStart(2, "0")}: ` +
        `${computed.length} staff, ${moneyString(run.totalNet)} net` +
        (skipped.length > 0 ? `, ${skipped.length} skipped` : ""),
      after: { status: run.status, staffCount: computed.length, totalNet: moneyString(run.totalNet) },
    })

    revalidateHr("/payroll", `/payroll/${run.id}`)
    return {
      success: true,
      data: {
        id: run.id,
        status: run.status,
        staffCount: computed.length,
        totalNet: moneyString(run.totalNet),
        skipped,
      },
    }
  } catch (error) {
    return toError(error, "Failed to generate payroll")
  }
}

/** Loads a run inside the actor's school, or throws. Scope comes from the session. */
async function scopedRun(runId: string, schoolId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, schoolId },
    select: {
      id: true,
      year: true,
      month: true,
      status: true,
      totalNet: true,
      sessionId: true,
      generatedBy: true,
      approvedBy: true,
      approvedAt: true,
      payments: { select: { id: true, amount: true, expenseId: true } },
    },
  })
  if (!run) throw new Error("Payroll run not found")
  return run
}

function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

function assertRunTransition(from: PayrollStatus, allowed: PayrollStatus[], intent: string) {
  if (!allowed.includes(from)) {
    throw new Error(`Cannot ${intent} a payroll run that is ${from.toLowerCase().replace("_", " ")}`)
  }
}

export async function submitPayrollForApproval(input: unknown): Promise<ActionResult<{ status: PayrollStatus }>> {
  try {
    const actor = await requirePayrollOfficer()
    const schoolId = await actorSchool(actor)
    const data = z.object({ runId: z.string().min(1) }).parse(input)

    const run = await scopedRun(data.runId, schoolId)
    assertRunTransition(run.status, ["DRAFT"], "submit")

    await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "PENDING_APPROVAL" } })

    revalidateHr("/payroll", `/payroll/${run.id}`)
    return { success: true, data: { status: "PENDING_APPROVAL" } }
  } catch (error) {
    return toError(error, "Failed to submit the payroll run")
  }
}

export async function approvePayroll(input: unknown): Promise<ActionResult<{ status: PayrollStatus }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ runId: z.string().min(1), note: z.string().trim().max(500).optional() }).parse(input)

    const run = await scopedRun(data.runId, schoolId)
    assertRunTransition(run.status, EDITABLE_RUN, "approve")

    await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "APPROVED",
        approvedBy: actor.userId,
        approvedAt: new Date(),
        decisionReason: data.note || null,
      },
    })

    await recordAudit({
      actor,
      action: "payroll.approve",
      entityType: "PayrollRun",
      entityId: run.id,
      summary:
        `Approved payroll for ${periodLabel(run.year, run.month)}: ${moneyString(run.totalNet)} net` +
        (run.generatedBy === actor.userId ? " (generated and approved by the same person)" : ""),
      before: { status: run.status },
      after: { status: "APPROVED" },
    })

    revalidateHr("/payroll", `/payroll/${run.id}`)
    return { success: true, data: { status: "APPROVED" } }
  } catch (error) {
    return toError(error, "Failed to approve the payroll run")
  }
}

/** Sends an approved or pending run back to draft so the figures can be corrected. */
export async function reopenPayroll(input: unknown): Promise<ActionResult<{ status: PayrollStatus }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = decisionSchema.parse(input)

    const run = await scopedRun(data.runId, schoolId)
    // A paid run is never reopened. That is the payroll lock: correct it by cancelling.
    assertRunTransition(run.status, ["PENDING_APPROVAL", "APPROVED"], "reopen")

    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: "DRAFT", approvedBy: null, approvedAt: null, decisionReason: data.reason },
    })

    await recordAudit({
      actor,
      action: "payroll.reopen",
      entityType: "PayrollRun",
      entityId: run.id,
      summary: `Reopened payroll for ${periodLabel(run.year, run.month)}: ${data.reason}`,
      before: { status: run.status },
      after: { status: "DRAFT" },
    })

    revalidateHr("/payroll", `/payroll/${run.id}`)
    return { success: true, data: { status: "DRAFT" } }
  } catch (error) {
    return toError(error, "Failed to reopen the payroll run")
  }
}

/**
 * Cancels an unpaid run or posts explicit payroll and expenditure reversals for a paid run.
 *
 * Nothing is deleted and no figure is rewritten. The run and its payslips stay, carry who
 * cancelled them and why, and drop out of the payroll totals — so the correction is as
 * visible as the original.
 */
export async function cancelPayroll(input: unknown): Promise<ActionResult<{ status: PayrollStatus }>> {
  try {
    const actor = await requireHrManager()
    const schoolId = await actorSchool(actor)
    const data = decisionSchema.parse(input)

    const run = await scopedRun(data.runId, schoolId)
    assertRunTransition(run.status, ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID"], "cancel or reverse")
    const nextStatus: PayrollStatus = run.status === "PAID" ? "REVERSED" : "CANCELLED"

    await prisma.$transaction(async (tx) => {
      const changed = await tx.payrollRun.updateMany({
        where: { id: run.id, schoolId, status: run.status },
        data: { status: nextStatus, decisionReason: data.reason },
      })
      if (changed.count !== 1) throw new Error("This payroll run changed. Refresh and try again.")

      if (nextStatus === "REVERSED") {
        await tx.payrollItem.updateMany({
          where: { runId: run.id, status: "PAID" },
          data: { status: "REVERSED" },
        })
        await tx.accountingReversal.create({
          data: {
            schoolId,
            targetType: "PAYROLL",
            payrollRunId: run.id,
            amount: run.totalNet,
            reason: data.reason,
            createdBy: actor.userId,
          },
        })
        for (const payment of run.payments) {
          if (!payment.expenseId) continue
          const reversedExpense = await tx.expense.updateMany({
            where: { id: payment.expenseId, schoolId, status: "PAID" },
            data: { status: "REVERSED", decisionReason: data.reason },
          })
          if (reversedExpense.count !== 1) {
            throw new Error("The linked payroll expense is not in a reversible state")
          }
          await tx.accountingReversal.create({
            data: {
              schoolId,
              targetType: "EXPENSE",
              expenseId: payment.expenseId,
              amount: payment.amount,
              reason: `Payroll reversal: ${data.reason}`,
              createdBy: actor.userId,
            },
          })
        }
      }
    })

    await recordAudit({
      actor,
      action: nextStatus === "REVERSED" ? "payroll.reverse" : "payroll.cancel",
      entityType: "PayrollRun",
      entityId: run.id,
      summary:
        `${nextStatus === "REVERSED" ? "Reversed" : "Cancelled"} payroll for ${periodLabel(run.year, run.month)}` +
        `: ${data.reason}`,
      before: { status: run.status },
      after: { status: nextStatus, reason: data.reason },
    })

    revalidateHr("/payroll", `/payroll/${run.id}`)
    return { success: true, data: { status: nextStatus } }
  } catch (error) {
    return toError(error, "Failed to cancel the payroll run")
  }
}

/**
 * Pays an approved run, and books it as expenditure.
 *
 * The expenditure record is created already PAID rather than going through the expenditure
 * approval flow: payroll has just been through its own approval, and asking an admin to
 * approve the same money twice would be ceremony, not control. The expense carries the
 * payroll's own reference so the two can always be tied together.
 */
export async function payPayroll(input: unknown): Promise<ActionResult<{
  status: PayrollStatus
  expenseVoucherNo: string
  accountBalance: string
}>> {
  try {
    const actor = await requirePayrollOfficer()
    const schoolId = await actorSchool(actor)
    const data = paySchema.extend({ categoryId: z.string().min(1).optional().nullable() }).parse(input)

    const run = await scopedRun(data.runId, schoolId)
    assertRunTransition(run.status, ["APPROVED"], "pay")

    const account = await prisma.paymentAccount.findFirst({
      where: { id: data.accountId, schoolId },
      select: { id: true, name: true, openingBalance: true, isActive: true },
    })
    if (!account) throw new Error("Payment account not found")
    if (!account.isActive) throw new Error("That payment account is closed")

    // Salaries are expenditure like anything else, so they need a category to sit under.
    // One chosen on screen wins; otherwise the school's salary heading, created from the
    // standard chart if it has none, rather than refusing to pay staff over a label.
    const chosen = data.categoryId
      ? await prisma.expenseCategory.findFirst({
          where: { id: data.categoryId, schoolId },
          select: { id: true, name: true, isActive: true },
        })
      : null
    if (data.categoryId && !chosen) throw new Error("That expenditure category is not in this school")
    // The same refusal ordinary expenditure gives: a retired heading is off the form for new
    // spending, and a payroll must not be the one way round that.
    if (chosen && !chosen.isActive) {
      throw new Error(`${chosen.name} has been retired. Choose an active expenditure category.`)
    }
    const category = chosen ?? (await salaryCategoryFor(prisma, schoolId))

    // Expense requires a term. It is taken from the session the run was generated for: the
    // budget counts an approved run as committed against that session, so the salary paid
    // must land there too. Booking by the day it happened to be paid moved a run paid after
    // the session rolled over into the next session's spending. Within the session, the term
    // containing the payroll month, else the last one begun by then, else its first.
    const { end } = monthBounds(run.year, run.month)
    const term = run.sessionId
      ? (await prisma.term.findFirst({
          where: { sessionId: run.sessionId, session: { schoolId }, startDate: { lte: end }, endDate: { gte: end } },
          select: { id: true, sessionId: true },
        })) ??
        (await prisma.term.findFirst({
          where: { sessionId: run.sessionId, session: { schoolId }, startDate: { lte: end } },
          orderBy: { startDate: "desc" },
          select: { id: true, sessionId: true },
        })) ??
        (await prisma.term.findFirst({
          where: { sessionId: run.sessionId, session: { schoolId } },
          orderBy: { startDate: "asc" },
          select: { id: true, sessionId: true },
        }))
      : (await prisma.term.findFirst({
          where: { session: { schoolId }, startDate: { lte: end }, endDate: { gte: end } },
          select: { id: true, sessionId: true },
        })) ??
        (await prisma.term.findFirst({
          where: { session: { schoolId }, isCurrent: true },
          select: { id: true, sessionId: true },
        }))
    if (!term) throw new Error("No term covers that payroll month, and no term is marked current")

    const paidOut = await prisma.expense.aggregate({
      where: { accountId: account.id, status: "PAID" },
      _sum: { amount: true },
    })
    const balanceBefore = account.openingBalance.minus(paidOut._sum.amount ?? 0)
    const balanceAfter = balanceBefore.minus(run.totalNet)

    if (balanceAfter.isNegative() && !data.allowOverdraft) {
      throw new Error(
        `${account.name} holds ${moneyString(balanceBefore)} and this payroll needs ` +
          `${moneyString(run.totalNet)}, leaving it ${moneyString(balanceAfter.negated())} short. ` +
          "Allow the overdraft if the account really can go below zero.",
      )
    }

    const paidAt = data.paidOn ?? new Date()
    const label = periodLabel(run.year, run.month)

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollRun.updateMany({
        where: { id: run.id, schoolId, status: "APPROVED" },
        data: { status: "PAID", paidBy: actor.userId, paidAt },
      })
      if (claimed.count !== 1) {
        throw new Error("This payroll run has already been paid or changed. Refresh and try again.")
      }

      const sequence = await tx.expenseVoucherSequence.upsert({
        where: { schoolId_year: { schoolId, year: paidAt.getFullYear() } },
        create: { schoolId, year: paidAt.getFullYear(), lastSequence: 1 },
        update: { lastSequence: { increment: 1 } },
        select: { lastSequence: true },
      })
      const voucherNo = `PV-${paidAt.getFullYear()}-${String(sequence.lastSequence).padStart(5, "0")}`

      const expense = await tx.expense.create({
        data: {
          schoolId,
          sessionId: term.sessionId,
          termId: term.id,
          categoryId: category.id,
          accountId: account.id,
          voucherNo,
          payeeName: `Payroll ${label}`,
          payeeType: "OTHER",
          description: `Salary payment for ${label}`,
          amount: run.totalNet,
          paymentMethod: data.method,
          referenceNo: data.reference || null,
          expenseDate: paidAt,
          notes: `Generated from payroll run ${run.id}`,
          status: "PAID",
          recordedBy: actor.userId,
          // Whoever approved the payroll run approved this spending. Writing the payer in
          // here made every salary voucher read as self-approved in the expenditure
          // register, which is the one thing segregation of duties is meant to rule out.
          approvedBy: run.approvedBy ?? actor.userId,
          approvedAt: run.approvedAt ?? paidAt,
          paidBy: actor.userId,
          paidAt,
        },
        select: { id: true, voucherNo: true },
      })

      await tx.payrollItem.updateMany({
        where: { runId: run.id, status: "PENDING" },
        data: { status: "PAID", paidAt },
      })
      await tx.salaryPayment.create({
        data: {
          schoolId,
          runId: run.id,
          amount: run.totalNet,
          method: data.method,
          accountId: account.id,
          reference: data.reference || null,
          paidAt,
          paidBy: actor.userId,
          expenseId: expense.id,
        },
      })

      return expense
    })

    await recordAudit({
      actor,
      action: "payroll.pay",
      entityType: "PayrollRun",
      entityId: run.id,
      summary:
        `Paid payroll for ${label}: ${moneyString(run.totalNet)} from ${account.name}, ` +
        `booked as ${result.voucherNo}` +
        (balanceAfter.isNegative() ? " (overdraft allowed)" : ""),
      before: { status: "APPROVED", accountBalance: moneyString(balanceBefore) },
      after: { status: "PAID", accountBalance: moneyString(balanceAfter), voucherNo: result.voucherNo },
    })

    revalidateHr("/payroll", `/payroll/${run.id}`)
    return {
      success: true,
      data: {
        status: "PAID",
        expenseVoucherNo: result.voucherNo,
        accountBalance: moneyString(balanceAfter),
      },
    }
  } catch (error) {
    return toError(error, "Failed to pay the payroll run")
  }
}

// ---------------------------------------------------------------------------
// Reading: runs, payslips, reports
// ---------------------------------------------------------------------------

export async function getPayrollRuns(filters?: { year?: number | null; status?: PayrollStatus | null }): Promise<
  ActionResult<Array<{
    id: string
    period: string
    year: number
    month: number
    status: PayrollStatus
    staffCount: number
    totalGross: string
    totalDeductions: string
    totalNet: string
    generatedByName: string
    approvedByName: string | null
    paidByName: string | null
    paidAt: string | null
  }>>
> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const runs = await prisma.payrollRun.findMany({
      where: {
        schoolId,
        ...(filters?.year ? { year: filters.year } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: {
        id: true,
        year: true,
        month: true,
        status: true,
        totalGross: true,
        totalDeductions: true,
        totalNet: true,
        paidAt: true,
        generatedByUser: { select: { firstName: true, lastName: true } },
        approvedByUser: { select: { firstName: true, lastName: true } },
        paidByUser: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    })

    const name = (person: { firstName: string; lastName: string } | null) =>
      person ? `${person.firstName} ${person.lastName}` : null

    return {
      success: true,
      data: runs.map((run) => ({
        id: run.id,
        period: periodLabel(run.year, run.month),
        year: run.year,
        month: run.month,
        status: run.status,
        staffCount: run._count.items,
        totalGross: moneyString(run.totalGross),
        totalDeductions: moneyString(run.totalDeductions),
        totalNet: moneyString(run.totalNet),
        generatedByName: name(run.generatedByUser) ?? "-",
        approvedByName: name(run.approvedByUser),
        paidByName: name(run.paidByUser),
        paidAt: run.paidAt?.toISOString() ?? null,
      })),
    }
  } catch (error) {
    return toError(error, "Failed to load payroll runs")
  }
}

export async function getPayrollRun(runId: string): Promise<ActionResult<{
  id: string
  period: string
  status: PayrollStatus
  sessionName: string | null
  totals: { base: string; allowances: string; deductions: string; gross: string; net: string }
  generatedByName: string
  approvedByName: string | null
  approvedAt: string | null
  paidByName: string | null
  paidAt: string | null
  decisionReason: string | null
  notes: string | null
  expenseVoucherNo: string | null
  items: Array<{
    id: string
    payslipNo: string
    staffId: string
    staffNo: string
    name: string
    department: string | null
    baseSalary: string
    totalAllowances: string
    totalDeductions: string
    grossPay: string
    netPay: string
    status: string
    proratedDays: number | null
    daysInMonth: number | null
    bankName: string | null
    accountNumber: string | null
  }>
}>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, schoolId },
      include: {
        session: { select: { name: true } },
        generatedByUser: { select: { firstName: true, lastName: true } },
        approvedByUser: { select: { firstName: true, lastName: true } },
        paidByUser: { select: { firstName: true, lastName: true } },
        payments: { select: { expense: { select: { voucherNo: true } } }, take: 1 },
        items: {
          orderBy: { staff: { lastName: "asc" } },
          include: {
            staff: {
              select: {
                id: true,
                staffNo: true,
                firstName: true,
                lastName: true,
                department: true,
                bankName: true,
                accountNumber: true,
              },
            },
          },
        },
      },
    })
    if (!run) throw new Error("Payroll run not found")

    const name = (person: { firstName: string; lastName: string } | null) =>
      person ? `${person.firstName} ${person.lastName}` : null

    return {
      success: true,
      data: {
        id: run.id,
        period: periodLabel(run.year, run.month),
        status: run.status,
        sessionName: run.session?.name ?? null,
        totals: {
          base: moneyString(run.totalBase),
          allowances: moneyString(run.totalAllowances),
          deductions: moneyString(run.totalDeductions),
          gross: moneyString(run.totalGross),
          net: moneyString(run.totalNet),
        },
        generatedByName: name(run.generatedByUser) ?? "-",
        approvedByName: name(run.approvedByUser),
        approvedAt: run.approvedAt?.toISOString() ?? null,
        paidByName: name(run.paidByUser),
        paidAt: run.paidAt?.toISOString() ?? null,
        decisionReason: run.decisionReason,
        notes: run.notes,
        expenseVoucherNo: run.payments[0]?.expense?.voucherNo ?? null,
        items: run.items.map((item) => ({
          id: item.id,
          payslipNo: item.payslipNo,
          staffId: item.staff.id,
          staffNo: item.staff.staffNo,
          name: `${item.staff.firstName} ${item.staff.lastName}`,
          department: item.staff.department,
          baseSalary: moneyString(item.baseSalary),
          totalAllowances: moneyString(item.totalAllowances),
          totalDeductions: moneyString(item.totalDeductions),
          grossPay: moneyString(item.grossPay),
          netPay: moneyString(item.netPay),
          status: item.status,
          proratedDays: item.proratedDays,
          daysInMonth: item.daysInMonth,
          bankName: item.staff.bankName,
          accountNumber: item.staff.accountNumber,
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the payroll run")
  }
}

/**
 * One payslip.
 *
 * Every figure comes from the frozen PayrollItemLine rows, never from the live allowance or
 * deduction configuration, so reprinting an old payslip gives the same document it did the
 * day it was issued.
 */
export async function getPayslip(itemId: string): Promise<ActionResult<{
  payslipNo: string
  period: string
  school: { name: string; code: string }
  staff: {
    id: string
    staffNo: string
    name: string
    department: string | null
    jobTitle: string | null
    bankName: string | null
    accountNumber: string | null
    accountName: string | null
  }
  baseSalary: string
  allowances: Array<{ label: string; amount: string; isTaxable: boolean | null }>
  deductions: Array<{ label: string; amount: string; timing: string | null }>
  totalAllowances: string
  totalDeductions: string
  grossPay: string
  netPay: string
  proratedDays: number | null
  daysInMonth: number | null
  status: string
  paidAt: string | null
  payslipNote: string | null
}>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const item = await prisma.payrollItem.findFirst({
      where: { id: itemId, schoolId },
      include: {
        run: { select: { year: true, month: true } },
        school: { select: { name: true, code: true } },
        staff: {
          select: {
            id: true,
            staffNo: true,
            firstName: true,
            lastName: true,
            department: true,
            jobTitle: true,
            bankName: true,
            accountNumber: true,
            accountName: true,
          },
        },
        lines: { orderBy: { createdAt: "asc" } },
      },
    })
    if (!item) throw new Error("Payslip not found")

    const config = await hrConfig(schoolId)

    return {
      success: true,
      data: {
        payslipNo: item.payslipNo,
        period: periodLabel(item.run.year, item.run.month),
        school: item.school,
        staff: {
          id: item.staff.id,
          staffNo: item.staff.staffNo,
          name: `${item.staff.firstName} ${item.staff.lastName}`,
          department: item.staff.department,
          jobTitle: item.staff.jobTitle,
          bankName: item.staff.bankName,
          accountNumber: item.staff.accountNumber,
          accountName: item.staff.accountName,
        },
        baseSalary: moneyString(item.baseSalary),
        allowances: item.lines
          .filter((line) => line.kind === "ALLOWANCE")
          .map((line) => ({ label: line.label, amount: moneyString(line.amount), isTaxable: line.isTaxable })),
        deductions: item.lines
          .filter((line) => line.kind === "DEDUCTION")
          .map((line) => ({ label: line.label, amount: moneyString(line.amount), timing: line.timing })),
        totalAllowances: moneyString(item.totalAllowances),
        totalDeductions: moneyString(item.totalDeductions),
        grossPay: moneyString(item.grossPay),
        netPay: moneyString(item.netPay),
        proratedDays: item.proratedDays,
        daysInMonth: item.daysInMonth,
        status: item.status,
        paidAt: item.paidAt?.toISOString() ?? null,
        payslipNote: config.payslipNote,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the payslip")
  }
}

export async function getHrOverview(): Promise<ActionResult<{
  staff: {
    total: number
    active: number
    teaching: number
    nonTeaching: number
    suspended: number
    exited: number
  }
  latestRun: {
    id: string
    period: string
    status: PayrollStatus
    gross: string
    deductions: string
    net: string
    paidCount: number
    unpaidCount: number
  } | null
  byDepartment: Array<{ department: string; count: number }>
  byEmploymentType: Array<{ employmentType: string; count: number }>
  recentPayments: Array<{ id: string; period: string; amount: string; paidAt: string; accountName: string | null }>
  withoutSalary: number
  /** The last twelve runs in calendar order, for the trend. Cancelled ones are left out. */
  payrollTrend: Array<{ id: string; period: string; gross: string; deductions: string; net: string }>
  /**
   * What the school still owes its staff: the net of every approved run that has not been
   * paid. This is the figure a head teacher needs and the one the old dashboard buried
   * inside "0 paid · 12 unpaid" on a single card.
   */
  owed: { amount: string; runs: number; people: number }
  /** Runs sitting with the approver. Nobody is paid until these move. */
  awaitingApproval: { amount: string; runs: number }
  /** Salaries paid this session, and what share of all school spending that is. */
  session: { name: string | null; salaries: string; expenditure: string; share: number }
}>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const [counts, byDepartment, byEmploymentType, latest, recentPayments, withoutSalary, runs, currentSession] =
      await Promise.all([
      prisma.staff.groupBy({ by: ["employmentStatus"], where: { schoolId }, _count: { _all: true } }),
      prisma.staff.groupBy({
        by: ["department"],
        where: { schoolId, employmentStatus: "ACTIVE" },
        _count: { _all: true },
      }),
      prisma.staff.groupBy({
        by: ["employmentType"],
        where: { schoolId, employmentStatus: "ACTIVE" },
        _count: { _all: true },
      }),
      prisma.payrollRun.findFirst({
        where: { schoolId, status: { not: "CANCELLED" } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: {
          id: true,
          year: true,
          month: true,
          status: true,
          totalGross: true,
          totalDeductions: true,
          totalNet: true,
          items: { select: { status: true } },
        },
      }),
      prisma.salaryPayment.findMany({
        where: { schoolId },
        orderBy: { paidAt: "desc" },
        take: 6,
        select: {
          id: true,
          amount: true,
          paidAt: true,
          run: { select: { year: true, month: true } },
          account: { select: { name: true } },
        },
      }),
      // Somebody active with no salary on record cannot be paid, so it is worth surfacing.
      prisma.staff.count({
        where: { schoolId, employmentStatus: "ACTIVE", salaries: { none: { isActive: true } } },
      }),
      prisma.payrollRun.findMany({
        where: { schoolId, status: { not: "CANCELLED" } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 12,
        select: {
          id: true,
          year: true,
          month: true,
          status: true,
          totalGross: true,
          totalDeductions: true,
          totalNet: true,
          items: { select: { status: true, netPay: true } },
        },
      }),
      prisma.session.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true, name: true } }),
    ])

    const statusCount = (status: EmploymentStatus) =>
      counts.find((row) => row.employmentStatus === status)?._count._all ?? 0

    const [teaching, nonTeaching, sessionSalaries, sessionSpend] = await Promise.all([
      prisma.staff.count({ where: { schoolId, employmentStatus: "ACTIVE", staffType: "TEACHER" } }),
      prisma.staff.count({ where: { schoolId, employmentStatus: "ACTIVE", staffType: { not: "TEACHER" } } }),
      // Payroll leaves the school as expenditure, so both sides are read the same way: only
      // money actually paid counts, and it counts in the session its expense was booked to.
      // Read through the run's own `sessionId`, a run generated as "Not linked" counted as
      // nothing here while its money showed in expenditure, and a reversed run kept counting
      // because its SalaryPayment stays as evidence. The expense is REVERSED with the run.
      currentSession
        ? prisma.salaryPayment.aggregate({
            where: { schoolId, expense: { sessionId: currentSession.id, status: "PAID" } },
            _sum: { amount: true },
          })
        : null,
      currentSession
        ? prisma.expense.aggregate({
            where: { schoolId, sessionId: currentSession.id, status: "PAID" },
            _sum: { amount: true },
          })
        : null,
    ])

    // An approved run that has not been paid is money the school owes today; one still with
    // the approver is not owed yet, but nobody gets paid until it moves.
    const approvedUnpaid = runs.filter((run) => run.status === "APPROVED")
    const pendingRuns = runs.filter((run) => run.status === "PENDING_APPROVAL")

    const owedItems = approvedUnpaid.flatMap((run) => run.items.filter((item) => item.status !== "PAID"))
    const owedAmount = owedItems.reduce((total, item) => total.plus(item.netPay), money(0))
    const pendingAmount = pendingRuns.reduce((total, run) => total.plus(run.totalNet), money(0))

    const salaries = money(sessionSalaries?._sum.amount ?? 0)
    const spend = money(sessionSpend?._sum.amount ?? 0)
    const share = spend.isZero() ? 0 : Math.round(salaries.div(spend).times(1000).toNumber()) / 10

    return {
      success: true,
      data: {
        staff: {
          total: counts.reduce((sum, row) => sum + row._count._all, 0),
          active: statusCount("ACTIVE"),
          teaching,
          nonTeaching,
          suspended: statusCount("SUSPENDED"),
          exited: statusCount("RESIGNED") + statusCount("TERMINATED"),
        },
        latestRun: latest
          ? {
              id: latest.id,
              period: periodLabel(latest.year, latest.month),
              status: latest.status,
              gross: moneyString(latest.totalGross),
              deductions: moneyString(latest.totalDeductions),
              net: moneyString(latest.totalNet),
              paidCount: latest.items.filter((item) => item.status === "PAID").length,
              unpaidCount: latest.items.filter((item) => item.status !== "PAID").length,
            }
          : null,
        byDepartment: byDepartment
          .map((row) => ({ department: row.department ?? "Unassigned", count: row._count._all }))
          .sort((a, b) => b.count - a.count),
        byEmploymentType: byEmploymentType.map((row) => ({
          employmentType: row.employmentType,
          count: row._count._all,
        })),
        recentPayments: recentPayments.map((payment) => ({
          id: payment.id,
          period: periodLabel(payment.run.year, payment.run.month),
          amount: moneyString(payment.amount),
          paidAt: payment.paidAt.toISOString(),
          accountName: payment.account?.name ?? null,
        })),
        withoutSalary,
        // Oldest first: a trend is read left to right.
        payrollTrend: [...runs].reverse().map((run) => ({
          id: run.id,
          period: periodLabel(run.year, run.month),
          gross: moneyString(run.totalGross),
          deductions: moneyString(run.totalDeductions),
          net: moneyString(run.totalNet),
        })),
        owed: {
          amount: moneyString(owedAmount),
          runs: approvedUnpaid.length,
          people: owedItems.length,
        },
        awaitingApproval: { amount: moneyString(pendingAmount), runs: pendingRuns.length },
        session: {
          name: currentSession?.name ?? null,
          salaries: moneyString(salaries),
          expenditure: moneyString(spend),
          share,
        },
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the HR overview")
  }
}

/**
 * The report pack: salary structure, allowances, deductions, department summary, and who
 * has not been paid.
 *
 * Returned together because they are read together on one page, and separate round trips
 * would mean five sequential queries for one screen.
 */
export async function getHrReports(filters?: { runId?: string | null }): Promise<ActionResult<{
  runPeriod: string | null
  salaryStructure: Array<{
    staffNo: string
    name: string
    department: string | null
    jobTitle: string | null
    scaleName: string | null
    baseSalary: string
    effectiveFrom: string
  }>
  allowanceSummary: Array<{ name: string; staffCount: number; total: string }>
  deductionSummary: Array<{ name: string; staffCount: number; total: string }>
  departmentSummary: Array<{ department: string; staffCount: number; gross: string; deductions: string; net: string }>
  unpaid: Array<{ payslipNo: string; staffNo: string; name: string; netPay: string; status: string }>
}>> {
  try {
    const actor = await requireHrViewer()
    const schoolId = await actorSchool(actor)

    const run = filters?.runId
      ? await prisma.payrollRun.findFirst({
          where: { id: filters.runId, schoolId },
          select: { id: true, year: true, month: true },
        })
      : await prisma.payrollRun.findFirst({
          where: { schoolId, status: { not: "CANCELLED" } },
          orderBy: [{ year: "desc" }, { month: "desc" }],
          select: { id: true, year: true, month: true },
        })

    const [salaries, items] = await Promise.all([
      prisma.staffSalary.findMany({
        where: { isActive: true, staff: { schoolId, employmentStatus: "ACTIVE" } },
        orderBy: [{ staff: { lastName: "asc" } }],
        select: {
          baseSalary: true,
          effectiveFrom: true,
          scale: { select: { name: true } },
          staff: { select: { staffNo: true, firstName: true, lastName: true, department: true, jobTitle: true } },
        },
      }),
      run
        ? prisma.payrollItem.findMany({
            where: { runId: run.id },
            include: {
              staff: { select: { staffNo: true, firstName: true, lastName: true, department: true } },
              lines: { select: { kind: true, label: true, amount: true } },
            },
          })
        : Promise.resolve([]),
    ])

    // Allowance and deduction totals come from the frozen lines, so the report matches the
    // payslips exactly rather than re-deriving from configuration that may have moved on.
    const allowanceTotals = new Map<string, { staffCount: number; total: Prisma.Decimal }>()
    const deductionTotals = new Map<string, { staffCount: number; total: Prisma.Decimal }>()
    const departmentTotals = new Map<
      string,
      { staffCount: number; gross: Prisma.Decimal; deductions: Prisma.Decimal; net: Prisma.Decimal }
    >()

    for (const item of items) {
      for (const line of item.lines) {
        const bucket = line.kind === "ALLOWANCE" ? allowanceTotals : deductionTotals
        const current = bucket.get(line.label) ?? { staffCount: 0, total: money(0) }
        bucket.set(line.label, { staffCount: current.staffCount + 1, total: current.total.plus(line.amount) })
      }

      const department = item.staff.department ?? "Unassigned"
      const current = departmentTotals.get(department) ?? {
        staffCount: 0,
        gross: money(0),
        deductions: money(0),
        net: money(0),
      }
      departmentTotals.set(department, {
        staffCount: current.staffCount + 1,
        gross: current.gross.plus(item.grossPay),
        deductions: current.deductions.plus(item.totalDeductions),
        net: current.net.plus(item.netPay),
      })
    }

    const summarise = (source: Map<string, { staffCount: number; total: Prisma.Decimal }>) =>
      [...source.entries()]
        .map(([name, value]) => ({ name, staffCount: value.staffCount, total: moneyString(value.total) }))
        .sort((a, b) => Number(b.total) - Number(a.total))

    return {
      success: true,
      data: {
        runPeriod: run ? periodLabel(run.year, run.month) : null,
        salaryStructure: salaries.map((salary) => ({
          staffNo: salary.staff.staffNo,
          name: `${salary.staff.firstName} ${salary.staff.lastName}`,
          department: salary.staff.department,
          jobTitle: salary.staff.jobTitle,
          scaleName: salary.scale?.name ?? null,
          baseSalary: moneyString(salary.baseSalary),
          effectiveFrom: salary.effectiveFrom.toISOString(),
        })),
        allowanceSummary: summarise(allowanceTotals),
        deductionSummary: summarise(deductionTotals),
        departmentSummary: [...departmentTotals.entries()]
          .map(([department, value]) => ({
            department,
            staffCount: value.staffCount,
            gross: moneyString(value.gross),
            deductions: moneyString(value.deductions),
            net: moneyString(value.net),
          }))
          .sort((a, b) => Number(b.net) - Number(a.net)),
        unpaid: items
          .filter((item) => item.status !== "PAID")
          .map((item) => ({
            payslipNo: item.payslipNo,
            staffNo: item.staff.staffNo,
            name: `${item.staff.firstName} ${item.staff.lastName}`,
            netPay: moneyString(item.netPay),
            status: item.status,
          })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the HR reports")
  }
}

/**
 * Records a staff reimbursement as expenditure.
 *
 * Deliberately not a separate StaffExpense model: a reimbursement *is* an expense with a
 * staff payee, and routing it through the expenditure flow means it goes through the same
 * approval, lands on the same reports, and shows up in the budget summary — rather than
 * living in a parallel workflow that has to be kept in step.
 */
export async function recordStaffReimbursement(input: unknown): Promise<ActionResult<{
  expenseId: string
  voucherNo: string
}>> {
  try {
    const actor = await requirePayrollOfficer()
    const schoolId = await actorSchool(actor)
    const data = z
      .object({
        staffId: z.string().min(1),
        categoryId: z.string().min(1),
        accountId: z.string().min(1),
        description: z.string().trim().min(3).max(1000),
        amount: positiveMoney,
        incurredOn: z.coerce.date(),
        paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "POS", "CHEQUE", "ONLINE"]).default("BANK_TRANSFER"),
      })
      .parse(input)

    const [member, category, account] = await Promise.all([
      prisma.staff.findFirst({
        where: { id: data.staffId, schoolId },
        select: { id: true, staffNo: true, firstName: true, lastName: true, userId: true },
      }),
      prisma.expenseCategory.findFirst({ where: { id: data.categoryId, schoolId }, select: { id: true } }),
      prisma.paymentAccount.findFirst({ where: { id: data.accountId, schoolId }, select: { id: true } }),
    ])
    if (!member) throw new Error("Staff member not found")
    if (!category) throw new Error("Expense category not found")
    if (!account) throw new Error("Payment account not found")

    const term =
      (await prisma.term.findFirst({
        where: { session: { schoolId }, startDate: { lte: data.incurredOn }, endDate: { gte: data.incurredOn } },
        select: { id: true, sessionId: true },
      })) ??
      (await prisma.term.findFirst({
        where: { session: { schoolId }, isCurrent: true },
        select: { id: true, sessionId: true },
      }))
    if (!term) throw new Error("No term covers that date, and no term is marked current")

    const year = data.incurredOn.getFullYear()
    const expense = await prisma.$transaction(async (tx) => {
      const sequence = await tx.expenseVoucherSequence.upsert({
        where: { schoolId_year: { schoolId, year } },
        create: { schoolId, year, lastSequence: 1 },
        update: { lastSequence: { increment: 1 } },
        select: { lastSequence: true },
      })

      // Enters the normal expenditure queue awaiting approval — unlike payroll, a
      // reimbursement has had no prior approval of its own.
      return tx.expense.create({
        data: {
          schoolId,
          sessionId: term.sessionId,
          termId: term.id,
          categoryId: category.id,
          accountId: account.id,
          voucherNo: `PV-${year}-${String(sequence.lastSequence).padStart(5, "0")}`,
          payeeName: `${member.firstName} ${member.lastName}`,
          payeeType: "STAFF",
          payeeStaffId: member.id,
          payeeUserId: member.userId,
          description: data.description,
          amount: money(data.amount),
          paymentMethod: data.paymentMethod,
          expenseDate: data.incurredOn,
          status: "PENDING_APPROVAL",
          recordedBy: actor.userId,
        },
        select: { id: true, voucherNo: true },
      })
    })

    await recordAudit({
      actor,
      action: "staff.reimbursement",
      entityType: "Expense",
      entityId: expense.id,
      summary: `Raised ${expense.voucherNo} to reimburse ${member.staffNo} ${moneyString(data.amount)}`,
    })

    revalidateHr("/staff", `/staff/${member.id}`)
    return { success: true, data: { expenseId: expense.id, voucherNo: expense.voucherNo } }
  } catch (error) {
    return toError(error, "Failed to record the reimbursement")
  }
}
