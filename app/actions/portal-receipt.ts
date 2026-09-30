"use server"

import { prisma } from "@/lib/db"
import { requireActor } from "@/lib/authz"
import { loadReceipt, type ReceiptDocument } from "@/lib/finance/receipt-document.server"

/**
 * A receipt, for the family it belongs to.
 *
 * `getReceipt` requires a finance permission, which is right for the accountant's screens
 * and is why a parent could see a fee marked PAID with no way to see the receipt proving
 * it. These wrappers establish that the signed-in person owns the payment, then read the
 * same receipt through the same action — so the document a family opens is the one the
 * school issued, not a second rendering of it that could disagree.
 *
 * Ownership is checked against the payment's own `studentId`. Nothing is taken on trust
 * from the id in the URL beyond which payment to look for.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/** The signed-in student's own receipt. */
export async function getMyReceipt(paymentId: string): Promise<ActionResult<ReceiptDocument>> {
  try {
    const actor = await requireActor()

    const student = await prisma.student.findUnique({
      where: { userId: actor.userId },
      select: { id: true, schoolId: true },
    })
    if (!student) throw new Error("No student record for this account")

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { studentId: true },
    })
    if (!payment || payment.studentId !== student.id) {
      throw new Error("That receipt is not yours")
    }

    return loadReceipt(paymentId, student.schoolId)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load that receipt",
    }
  }
}

/** A receipt belonging to a child linked to the signed-in parent. */
export async function getChildReceipt(
  studentId: string,
  paymentId: string,
): Promise<ActionResult<ReceiptDocument>> {
  try {
    const actor = await requireActor()

    const parent = await prisma.parent.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    })
    if (!parent) throw new Error("No parent record for this account")

    const link = await prisma.studentParent.findFirst({
      where: { parentId: parent.id, studentId },
      select: { student: { select: { schoolId: true } } },
    })
    if (!link) throw new Error("That student is not linked to your account")

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { studentId: true },
    })
    if (!payment || payment.studentId !== studentId) {
      throw new Error("That receipt does not belong to this child")
    }

    return loadReceipt(paymentId, link.student.schoolId)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load that receipt",
    }
  }
}

