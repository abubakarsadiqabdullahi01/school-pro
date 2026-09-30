"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { requireActor, requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { postStudentPaymentInTransaction, reverseStudentPaymentInTransaction } from "@/lib/finance/payment-ledger.server"
import { checkoutEnvironment } from "@/lib/payments/checkout-environment"
import {
  LIVE_DEDICATED_BANKS,
  dedicatedCustomerDomain,
  dedicatedCustomerEmail,
  normalizeNigerianPhone,
  dedicatedBankFor,
  heldReturnConfirmationProblems,
  splitDedicatedTransfer,
} from "@/lib/payments/dedicated-account-rules"
import { assignDedicatedAccountForStudent, lockHeldMoney, readiness, readyConfiguration } from "@/lib/payments/dedicated-accounts.server"
import { adapterForPaymentConfiguration } from "@/lib/payments/payment-settings.server"

type Result<T> = { success: true; data: T } | { success: false; error: string }
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

/** How long a payer identification may wait for Paystack's answer before it can be sent again. */
const IDENTIFICATION_ANSWER_HOURS = 24

/** Students assigned per click. Each costs two Paystack writes; this keeps well under limits. */
const ASSIGN_BATCH_SIZE = 25

async function scoped(permission: "finance.manage_gateway" | "finance.view_reports" | "finance.collect_payments" | "finance.approve_refunds") {
  const actor = await requirePermission(permission)
  if (!actor.schoolId) throw new Error("Select a school before managing dedicated accounts")
  return { actor, schoolId: actor.schoolId }
}

function refresh() {
  for (const base of ["/dashboard/admin/finance", "/dashboard/accountant"]) {
    revalidatePath(`${base}/dedicated-accounts`)
    revalidatePath(`${base}/unapplied-payments`)
  }
  revalidatePath("/dashboard/admin/school-settings/payments")
}

export async function setDedicatedAccountSettings(input: unknown): Promise<Result<undefined>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const data = z.object({
      enabled: z.boolean(),
      bank: z.enum(LIVE_DEDICATED_BANKS).nullable(),
      requiresIdentification: z.boolean().optional(),
    }).parse(input)
    const { configuration } = await readyConfiguration(schoolId)
    await prisma.schoolPaymentConfiguration.update({
      where: { id: configuration.id },
      data: {
        dedicatedAccountsEnabled: data.enabled,
        dedicatedAccountBank: data.bank,
        ...(data.requiresIdentification === undefined ? {} : { dedicatedRequiresIdentification: data.requiresIdentification }),
      },
    })
    await recordAudit({ actor, action: data.enabled ? "dedicated_account.enable" : "dedicated_account.disable",
      entityType: "SchoolPaymentConfiguration", entityId: configuration.id,
      summary: `${data.enabled ? "Switched on" : "Switched off"} dedicated accounts (${configuration.environment.toLowerCase()})`,
      before: { enabled: configuration.dedicatedAccountsEnabled, bank: configuration.dedicatedAccountBank },
      after: { enabled: data.enabled, bank: data.bank } })
    refresh()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: message(error, "Could not save dedicated account settings") }
  }
}

export async function getDedicatedAccountOverview(input: unknown = {}) {
  try {
    const { schoolId } = await scoped("finance.view_reports")
    const filters = z.object({ query: z.string().trim().max(100).optional(), missingOnly: z.boolean().optional() }).parse(input)
    const { environment, configuration } = await readyConfiguration(schoolId).catch(() => ({ environment: checkoutEnvironment(), configuration: null }))
    const query = filters.query
    const students = await prisma.student.findMany({
      where: {
        schoolId,
        AND: [
          // An archived student is left off, unless they still hold a live account: that one
          // must stay reachable, or nobody can deactivate it and transfers keep arriving.
          { OR: [{ user: { isActive: true } }, { dedicatedAccounts: { some: { status: "ACTIVE", environment } } }] },
          ...(query ? [{ OR: [{ admissionNo: { contains: query } }, { user: { firstName: { contains: query } } }, { user: { lastName: { contains: query } } }] }] : []),
        ],
        ...(filters.missingOnly ? { dedicatedAccounts: { none: { status: "ACTIVE", environment } } } : {}),
      },
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      take: 200,
      select: {
        id: true, admissionNo: true,
        user: { select: { firstName: true, lastName: true, isActive: true } },
        dedicatedAccounts: { where: { status: "ACTIVE", environment }, select: { id: true, accountNumber: true, accountName: true, bankName: true, createdAt: true } },
        dedicatedIdentifications: { where: { environment }, select: { status: true, failureReason: true, updatedAt: true } },
      },
    })
    const [withAccount, totalStudents] = await Promise.all([
      // Counted over the same students as the total, so "still without one" adds up; an
      // archived student's live account is listed above with its badge instead.
      prisma.dedicatedAccount.count({ where: { schoolId, environment, status: "ACTIVE", student: { user: { isActive: true } } } }),
      prisma.student.count({ where: { schoolId, user: { isActive: true } } }),
    ])
    return {
      success: true as const,
      data: {
        environment,
        enabled: configuration?.dedicatedAccountsEnabled ?? false,
        requiresIdentification: configuration?.dedicatedRequiresIdentification ?? false,
        bank: configuration ? dedicatedBankFor(environment, configuration.dedicatedAccountBank) : null,
        problems: configuration ? readiness(configuration) : ["Set up the Paystack connection first"],
        totals: { students: totalStudents, withAccount },
        students: students.map((student) => ({
          id: student.id,
          admissionNo: student.admissionNo,
          name: `${student.user.firstName} ${student.user.lastName}`,
          archived: !student.user.isActive,
          identification: student.dedicatedIdentifications[0]
            ? (({ updatedAt, ...identification }) => ({
                ...identification,
                // Paystack answers identification by webhook, usually within minutes. One that
                // has heard nothing for a day was lost on the way, and may be sent again.
                overdue: identification.status === "PENDING" && Date.now() - updatedAt.getTime() > IDENTIFICATION_ANSWER_HOURS * 3_600_000,
                sentAt: updatedAt.toISOString(),
              }))(student.dedicatedIdentifications[0])
            : null,
          account: student.dedicatedAccounts[0]
            ? { ...student.dedicatedAccounts[0], createdAt: student.dedicatedAccounts[0].createdAt.toISOString() }
            : null,
        })),
      },
    }
  } catch (error) {
    return { success: false as const, error: message(error, "Could not load dedicated accounts") }
  }
}

export async function assignDedicatedAccount(input: unknown): Promise<Result<{ accountNumber: string; bankName: string }>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const data = z.object({ studentId: z.string().uuid() }).parse(input)
    const { account, created } = await assignDedicatedAccountForStudent(schoolId, actor.userId, data.studentId)
    if (created) {
      await recordAudit({ actor, action: "dedicated_account.assign", entityType: "DedicatedAccount", entityId: account.id,
        summary: `Assigned dedicated account ${account.accountNumber} (${account.bankName})`, after: { studentId: data.studentId } })
    }
    refresh()
    return { success: true, data: { accountNumber: account.accountNumber, bankName: account.bankName } }
  } catch (error) {
    return { success: false, error: message(error, "Could not assign a dedicated account") }
  }
}

/** Assigns the next batch of students without an account. Failures are reported per student. */
export async function assignMissingDedicatedAccounts(): Promise<Result<{ created: number; remaining: number; failures: Array<{ name: string; error: string }> }>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const { environment, configuration } = await readyConfiguration(schoolId)
    const problem = readiness(configuration)[0]
    if (problem) throw new Error(problem)

    const missing = { schoolId, user: { isActive: true }, dedicatedAccounts: { none: { status: "ACTIVE" as const, environment } } }
    const batch = await prisma.student.findMany({
      where: missing, take: ASSIGN_BATCH_SIZE, orderBy: { admissionNo: "asc" },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    })
    let created = 0
    const failures: Array<{ name: string; error: string }> = []
    for (const student of batch) {
      try {
        if ((await assignDedicatedAccountForStudent(schoolId, actor.userId, student.id)).created) created += 1
      } catch (error) {
        failures.push({ name: `${student.user.firstName} ${student.user.lastName}`, error: message(error, "Failed") })
      }
    }
    const remaining = await prisma.student.count({ where: missing })
    await recordAudit({ actor, action: "dedicated_account.assign_batch", entityType: "School", entityId: schoolId,
      summary: `Assigned ${created} dedicated accounts; ${failures.length} failed; ${remaining} still without one`,
      after: { created, failed: failures.length, remaining } })
    refresh()
    return { success: true, data: { created, remaining, failures } }
  } catch (error) {
    return { success: false, error: message(error, "Could not assign dedicated accounts") }
  }
}

export async function deactivateDedicatedAccount(input: unknown): Promise<Result<undefined>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const data = z.object({ accountId: z.string().uuid(), confirmation: z.literal(true) }).parse(input)
    const account = await prisma.dedicatedAccount.findFirst({ where: { id: data.accountId, schoolId, status: "ACTIVE" } })
    if (!account) throw new Error("Active dedicated account not found")
    await (await adapterForPaymentConfiguration(account.configurationId)).deactivateDedicatedAccount(account.providerAccountId)
    await prisma.dedicatedAccount.update({
      where: { id: account.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date(), deactivatedBy: actor.userId },
    })
    await recordAudit({ actor, action: "dedicated_account.deactivate", entityType: "DedicatedAccount", entityId: account.id,
      summary: `Deactivated dedicated account ${account.accountNumber}`, before: { status: "ACTIVE" }, after: { status: "DEACTIVATED" } })
    refresh()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: message(error, "Could not deactivate the dedicated account") }
  }
}

export async function getUnappliedPayments(input: unknown = {}) {
  try {
    const { actor, schoolId } = await scoped("finance.view_reports")
    const { status } = z.object({ status: z.enum(["OPEN", "APPLIED", "RETURNED"]).optional() }).parse(input)
    const rows = await prisma.unappliedPayment.findMany({
      where: { schoolId, status: status ?? "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        student: { select: { id: true, admissionNo: true, user: { select: { firstName: true, lastName: true } } } },
        gatewayTransaction: { select: { id: true, reference: true, senderName: true, senderBank: true, paidAt: true } },
        appliedPayment: { select: { receiptNo: true } },
      },
    })
    const owing = await prisma.studentCharge.groupBy({
      by: ["studentId"], _sum: { balance: true },
      where: { schoolId, studentId: { in: rows.map((row) => row.studentId) }, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] } },
    })
    const owingByStudent = new Map(owing.map((row) => [row.studentId, row._sum.balance?.toFixed(2) ?? "0.00"]))
    const requesterIds = [...new Set(rows.map((row) => row.returnRequestedBy).filter((id): id is string => Boolean(id)))]
    const requesters = new Map((await prisma.user.findMany({
      where: { id: { in: requesterIds } }, select: { id: true, firstName: true, lastName: true },
    })).map((user) => [user.id, `${user.firstName} ${user.lastName}`]))
    return {
      success: true as const,
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        amount: row.amount.toFixed(2),
        studentId: row.student.id,
        studentName: `${row.student.user.firstName} ${row.student.user.lastName}`,
        admissionNo: row.student.admissionNo,
        owingNow: owingByStudent.get(row.studentId) ?? "0.00",
        transactionId: row.gatewayTransaction.id,
        reference: row.gatewayTransaction.reference,
        senderName: row.gatewayTransaction.senderName,
        senderBank: row.gatewayTransaction.senderBank,
        paidAt: row.gatewayTransaction.paidAt?.toISOString() ?? null,
        receiptNo: row.appliedPayment?.receiptNo ?? null,
        resolutionNote: row.resolutionNote,
        returnRequest: row.returnRequestedBy
          ? {
              byName: requesters.get(row.returnRequestedBy) ?? "another user",
              byMe: row.returnRequestedBy === actor.userId,
              at: row.returnRequestedAt?.toISOString() ?? null,
            }
          : null,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  } catch (error) {
    return { success: false as const, error: message(error, "Could not load unapplied money") }
  }
}

/**
 * Applies held money to what the student owes now — typically once next term's fees are
 * billed. It applies only when the student owes at least the held amount, so a held sum is
 * never split into a smaller held sum nobody can trace.
 */
export async function applyUnappliedPayment(input: unknown): Promise<Result<{ receiptNo: string }>> {
  try {
    const { actor, schoolId } = await scoped("finance.collect_payments")
    const data = z.object({ id: z.string().uuid(), confirmation: z.literal(true) }).parse(input)
    const receiptNo = await prisma.$transaction(async (tx) => {
      await lockHeldMoney(tx, data.id, schoolId)
      const held = await tx.unappliedPayment.findFirst({ where: { id: data.id, schoolId, status: "OPEN" }, include: { refund: true } })
      if (!held) throw new Error("Open unapplied money not found")
      if (held.refund && !["REJECTED", "FAILED"].includes(held.refund.status)) throw new Error("A refund of this money is in progress")
      if (held.returnRequestedBy) throw new Error("A return of this money to the payer is waiting for confirmation")
      await tx.$queryRaw(Prisma.sql`SELECT id FROM students WHERE id = ${held.studentId} FOR UPDATE`)
      const charges = await tx.studentCharge.findMany({
        where: { studentId: held.studentId, schoolId, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] } },
        orderBy: [{ term: { startDate: "asc" } }, { createdAt: "asc" }],
        select: { id: true, balance: true, termId: true },
      })
      const split = splitDedicatedTransfer(charges.map((charge) => ({ id: charge.id, balance: charge.balance.toNumber() })), held.amount.toNumber())
      if (split.unapplied > 0 || split.allocations.length === 0) {
        const owing = charges.reduce((total, charge) => total + charge.balance.toNumber(), 0)
        throw new Error(`The student owes ₦${owing.toFixed(2)}, less than the ₦${held.amount.toFixed(2)} held. Apply it once further fees are billed, or mark it returned.`)
      }
      const termId = charges.find((charge) => charge.id === split.allocations[0]!.chargeId)?.termId
      if (!termId) throw new Error("The charge being paid has no term")
      const updated = await tx.unappliedPayment.updateMany({ where: { id: held.id, status: "OPEN" }, data: { status: "APPLIED" } })
      if (updated.count !== 1) throw new Error("This money was already resolved")
      const payment = await postStudentPaymentInTransaction(tx, {
        schoolId, studentId: held.studentId, termId, paymentDate: new Date(), paymentMethod: "PAYSTACK_DEDICATED_NUBAN",
        referenceNo: `UNAPPLIED-${held.id.slice(0, 8)}`, receivedBy: actor.userId,
        notes: "Held dedicated-account transfer applied to fees", allocations: split.allocations,
      })
      await tx.unappliedPayment.update({ where: { id: held.id }, data: { appliedPaymentId: payment.id, resolvedBy: actor.userId, resolvedAt: new Date() } })
      return payment.receiptNo
    }, { isolationLevel: "Serializable" })
    await recordAudit({ actor, action: "unapplied_payment.apply", entityType: "UnappliedPayment", entityId: data.id,
      summary: `Applied held transfer money to fees, receipt ${receiptNo}`, after: { receiptNo } })
    refresh()
    return { success: true, data: { receiptNo } }
  } catch (error) {
    return { success: false, error: message(error, "Could not apply the held money") }
  }
}

/**
 * Held money handed back to the payer outside DigiSchool (a bank transfer from the school's
 * account, say). It is a refund, so it takes two people: `requestUnappliedReturn` records
 * how it went back, and a different person closes it with `confirmUnappliedReturn`. Until
 * then the money stays OPEN, and can be neither applied to fees nor refunded through Paystack.
 */
export async function requestUnappliedReturn(input: unknown): Promise<Result<undefined>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const data = z.object({ id: z.string().uuid(), note: z.string().trim().min(10).max(500), confirmation: z.literal(true) }).parse(input)
    // The held row is locked, as `requestUnappliedRefund` locks it, so a return and a Paystack
    // refund requested at the same moment cannot both pass their checks and pay the payer twice.
    await prisma.$transaction(async (tx) => {
      await lockHeldMoney(tx, data.id, schoolId)
      const refunding = await tx.gatewayRefund.findFirst({
        where: { unappliedPaymentId: data.id, status: { notIn: ["REJECTED", "FAILED"] } }, select: { id: true },
      })
      if (refunding) throw new Error("A refund of this money is in progress")
      const changed = await tx.unappliedPayment.updateMany({
        where: { id: data.id, schoolId, status: "OPEN", returnRequestedBy: null },
        data: { returnRequestedBy: actor.userId, returnRequestedAt: new Date(), resolutionNote: data.note },
      })
      if (changed.count !== 1) throw new Error("Open unapplied money not found, or a return is already waiting for confirmation")
    })
    await recordAudit({ actor, action: "unapplied_payment.return_request", entityType: "UnappliedPayment", entityId: data.id,
      summary: "Recorded held transfer money as returned to the payer, awaiting a second person", after: { note: data.note } })
    refresh()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: message(error, "Could not record the return") }
  }
}

/**
 * The second person's confirmation. It is the approval of a refund, so it takes the same
 * permission as approving a Paystack refund, and it confirms exactly the request the
 * confirmer was shown: `requestedAt` must still match, so a return withdrawn and recorded
 * again with a different note cannot be closed on the strength of the one they read.
 */
export async function confirmUnappliedReturn(input: unknown): Promise<Result<undefined>> {
  try {
    const { actor, schoolId } = await scoped("finance.approve_refunds")
    const data = z.object({ id: z.string().uuid(), requestedAt: z.string().datetime(), confirmation: z.literal(true) }).parse(input)
    const held = await prisma.$transaction(async (tx) => {
      await lockHeldMoney(tx, data.id, schoolId)
      const row = await tx.unappliedPayment.findFirst({
        where: { id: data.id, schoolId, status: "OPEN" },
        select: { id: true, returnRequestedBy: true, returnRequestedAt: true, resolutionNote: true },
      })
      if (!row) throw new Error("Open unapplied money not found")
      const problems = heldReturnConfirmationProblems({ returnRequestedBy: row.returnRequestedBy, actorUserId: actor.userId })
      if (problems.length > 0) throw new Error(problems.join("; "))
      if (row.returnRequestedAt?.toISOString() !== new Date(data.requestedAt).toISOString()) {
        throw new Error("The return was changed after you opened it. Refresh, read it again, then confirm.")
      }
      const refunding = await tx.gatewayRefund.findFirst({
        where: { unappliedPaymentId: row.id, status: { notIn: ["REJECTED", "FAILED"] } }, select: { id: true },
      })
      if (refunding) throw new Error("A Paystack refund of this money is also in progress. Settle that first.")
      await tx.unappliedPayment.update({
        where: { id: row.id },
        data: { status: "RETURNED", resolvedBy: actor.userId, resolvedAt: new Date() },
      })
      return row
    })
    await recordAudit({ actor, action: "unapplied_payment.return", entityType: "UnappliedPayment", entityId: held.id,
      summary: "Confirmed held transfer money as returned to the payer",
      before: { status: "OPEN", returnRequestedBy: held.returnRequestedBy }, after: { status: "RETURNED", note: held.resolutionNote } })
    refresh()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: message(error, "Could not confirm the return") }
  }
}

/** Withdraws a recorded return that has not been confirmed, putting the money back to plain held. */
export async function withdrawUnappliedReturn(input: unknown): Promise<Result<undefined>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const data = z.object({ id: z.string().uuid(), confirmation: z.literal(true) }).parse(input)
    const changed = await prisma.unappliedPayment.updateMany({
      where: { id: data.id, schoolId, status: "OPEN", returnRequestedBy: { not: null } },
      data: { returnRequestedBy: null, returnRequestedAt: null, resolutionNote: null },
    })
    if (changed.count !== 1) throw new Error("No return is waiting for confirmation on this money")
    await recordAudit({ actor, action: "unapplied_payment.return_withdraw", entityType: "UnappliedPayment", entityId: data.id,
      summary: "Withdrew a recorded return of held transfer money" })
    refresh()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: message(error, "Could not withdraw the return") }
  }
}

/**
 * Undoes applying held money: the receipt it made is reversed, the fees it paid reopen, and
 * the money is held again. Such a receipt cannot be refunded at the counter, which would
 * reopen the fees while the money stayed with the school recorded nowhere. This is its way
 * back instead: once held again, it can be applied elsewhere or returned to the payer, and a
 * return takes two people. No money leaves the school here, and the family is not notified;
 * they hear when the money is actually applied again or returned.
 */
export async function moveAppliedMoneyBackToHeld(input: unknown): Promise<Result<{ receiptNo: string }>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const data = z.object({ id: z.string().uuid(), reason: z.string().trim().min(10).max(500), confirmation: z.literal(true) }).parse(input)
    const receiptNo = await prisma.$transaction(async (tx) => {
      await lockHeldMoney(tx, data.id, schoolId)
      const held = await tx.unappliedPayment.findFirst({
        where: { id: data.id, schoolId, status: "APPLIED" },
        select: { id: true, studentId: true, amount: true, appliedPayment: { select: { id: true, receiptNo: true, status: true, amount: true } } },
      })
      const receipt = held?.appliedPayment
      if (!held || !receipt) throw new Error("Applied held money not found")
      if (receipt.status !== "COMPLETED") throw new Error(`Receipt ${receipt.receiptNo} is ${receipt.status.toLowerCase()}, so there is nothing to move back`)
      // Applying never splits held money, so the receipt is the whole sum. Anything else is a
      // record this code did not make, and is left for a person to look at.
      if (!receipt.amount.equals(held.amount)) throw new Error(`Receipt ${receipt.receiptNo} does not match the held amount; refer it for review`)
      await tx.$queryRaw(Prisma.sql`SELECT id FROM students WHERE id = ${held.studentId} FOR UPDATE`)
      const outcome = await reverseStudentPaymentInTransaction(tx, {
        schoolId, paymentId: receipt.id, reason: `Moved back to held money: ${data.reason}`, createdBy: actor.userId,
      })
      if (outcome !== "reversed") throw new Error(`Receipt ${receipt.receiptNo} was already reversed`)
      await tx.unappliedPayment.update({
        where: { id: held.id },
        data: { status: "OPEN", appliedPaymentId: null, resolvedBy: null, resolvedAt: null,
          resolutionNote: `Moved back from receipt ${receipt.receiptNo}: ${data.reason}`.slice(0, 500) },
      })
      return receipt.receiptNo
    }, { isolationLevel: "Serializable" })
    await recordAudit({ actor, action: "unapplied_payment.unapply", entityType: "UnappliedPayment", entityId: data.id,
      summary: `Reversed receipt ${receiptNo} and held its transfer money again`,
      before: { status: "APPLIED", receiptNo }, after: { status: "OPEN", reason: data.reason } })
    refresh()
    return { success: true, data: { receiptNo } }
  } catch (error) {
    return { success: false, error: message(error, "Could not move the money back to held") }
  }
}

/** A parent's view of their child's account number, for the portal. */
export async function getStudentDedicatedAccountForParent(studentId: string) {
  const actor = await requireActor()
  if (actor.role !== "PARENT") return null
  const environment = checkoutEnvironment()
  const account = await prisma.dedicatedAccount.findFirst({
    where: {
      studentId, environment, status: "ACTIVE",
      configuration: { dedicatedAccountsEnabled: true, isEnabled: true },
      student: { parents: { some: { parent: { userId: actor.userId } } } },
    },
    select: { accountNumber: true, accountName: true, bankName: true },
  })
  return account
}

/**
 * Sends a payer's BVN and bank account to Paystack to identify the student's Paystack
 * customer, when Paystack requires it for this school. The BVN and account number go to
 * Paystack only — they are not stored — and the name must match the BVN record, so it is
 * the payer's (usually a parent's) name. The account itself is created when Paystack's
 * customeridentification.success webhook arrives.
 */
export async function requestDedicatedIdentification(input: unknown): Promise<Result<{ status: "PENDING" }>> {
  try {
    const { actor, schoolId } = await scoped("finance.manage_gateway")
    const data = z.object({
      studentId: z.string().uuid(),
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      bvn: z.string().regex(/^\d{11}$/, "A BVN is 11 digits"),
      bankCode: z.string().trim().min(1).max(20),
      accountNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
      consent: z.literal(true),
    }).parse(input)
    const { environment, configuration } = await readyConfiguration(schoolId)
    const problem = readiness(configuration)[0]
    if (problem) throw new Error(problem)
    if (!configuration.dedicatedRequiresIdentification) throw new Error("This school does not need identification before accounts are created")

    const student = await prisma.student.findFirst({
      where: { id: data.studentId, schoolId },
      select: { id: true, admissionNo: true, parents: { select: { parent: { select: { user: { select: { phone: true } } } } } } },
    })
    if (!student) throw new Error("Student not found")
    const phone = student.parents.map((link) => normalizeNigerianPhone(link.parent.user.phone)).find(Boolean)
    if (!phone) throw new Error("Add a valid Nigerian phone number to the student's parent first")

    const adapter = await adapterForPaymentConfiguration(configuration.id)
    const customerEmail = dedicatedCustomerEmail(student.id, dedicatedCustomerDomain())
    const customer = await adapter.createCustomer({
      email: customerEmail, firstName: data.firstName, lastName: data.lastName, phone,
      metadata: { schoolId, studentId: student.id, admissionNo: student.admissionNo },
    })
    await adapter.validateCustomer(customer.customerCode, {
      firstName: data.firstName, lastName: data.lastName, bvn: data.bvn, bankCode: data.bankCode, accountNumber: data.accountNumber,
    })
    const identification = await prisma.dedicatedCustomerIdentification.upsert({
      where: { configurationId_studentId: { configurationId: configuration.id, studentId: student.id } },
      create: { schoolId, studentId: student.id, configurationId: configuration.id, environment,
        customerCode: customer.customerCode, customerEmail, requestedBy: actor.userId },
      update: { customerCode: customer.customerCode, status: "PENDING", failureReason: null, requestedBy: actor.userId },
    })
    await recordAudit({ actor, action: "dedicated_account.identify", entityType: "DedicatedCustomerIdentification", entityId: identification.id,
      summary: "Sent a payer's identity to Paystack for a dedicated account",
      // Never the BVN: only enough to recognise the bank account later.
      after: { studentId: student.id, bankCode: data.bankCode, accountLast4: data.accountNumber.slice(-4) } })
    refresh()
    return { success: true, data: { status: "PENDING" } }
  } catch (error) {
    return { success: false, error: message(error, "Could not send the identification to Paystack") }
  }
}
