import type { Prisma } from "@prisma/client"

import { formatNaira } from "@/lib/money"
import { toE164 } from "./phone"
import { measureSms } from "./sms-segments"
import { categoryAllowed, loadGovernance, resolveTemplate } from "./campaign.server"
import { DEFAULT_TEMPLATES, render, variablesFor, type TemplateValues } from "./templates"

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash at the school bursary",
  BANK_TRANSFER: "Bank transfer",
  POS: "POS (card at the bursary)",
  CHEQUE: "Cheque",
  ONLINE: "Online payment",
  PAYSTACK_CARD: "Card (online)",
  PAYSTACK_BANK_TRANSFER: "Bank transfer (online)",
  PAYSTACK_DEDICATED_NUBAN: "Bank transfer to the child's school account",
  PAYSTACK_BANK: "Bank (online)",
  PAYSTACK_USSD: "USSD (online)",
}

function portalLink(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "")
  return base ? `${base}/auth/login` : ""
}

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? (method.startsWith("PAYSTACK") ? "Online payment" : method)
}

/**
 * Queues the school's receipt message — email and SMS — to every parent linked to the
 * learner, inside the same transaction that posted the payment.
 *
 * Uses the school's own wording for `payment.received` when it has set one, and the
 * built-in wording otherwise. Queuing inside the posting transaction means a receipt is
 * never promised for money that was rolled back, and never missing for money that was not.
 * Delivery happens later in the outbox worker, so a provider being down cannot undo a
 * payment. Each parent gets each channel at most once per payment.
 */
export async function queuePaymentReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string
    studentId: string
    paymentId: string
    reference: string
    /** Whoever paid online. Always receipted, even if not (or no longer) linked to the learner. */
    payerEmail?: string | null
  },
): Promise<{ queued: number }> {
  const [school, payment, student, owing] = await Promise.all([
    tx.school.findUniqueOrThrow({ where: { id: input.schoolId }, select: { name: true } }),
    tx.payment.findUniqueOrThrow({
      where: { id: input.paymentId },
      select: {
        amount: true, receiptNo: true, paymentDate: true, paymentMethod: true,
        allocations: { select: { amount: true, charge: { select: { feeSchedule: { select: { name: true } }, term: { select: { name: true } } } } } },
      },
    }),
    tx.student.findUniqueOrThrow({
      where: { id: input.studentId },
      select: {
        admissionNo: true,
        user: { select: { firstName: true, lastName: true } },
        classTerms: {
          where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1,
          select: { classTerm: { select: { class: { select: { name: true } } } } },
        },
        parents: {
          select: { parent: { select: { user: { select: {
            id: true, firstName: true, lastName: true, phone: true, notifyByEmail: true, notifyBySms: true,
            credentials: { where: { type: "EMAIL" }, select: { value: true } },
          } } } } },
        },
      },
    }),
    tx.studentCharge.aggregate({
      where: { studentId: input.studentId, schoolId: input.schoolId, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] } },
      _sum: { balance: true },
    }),
  ])

  const templates = await tx.notificationTemplate.findMany({
    where: { schoolId: input.schoolId, templateKey: "payment.received", isActive: true },
    select: { channel: true, body: true, subject: true },
  })
  const stored = (channel: "SMS" | "EMAIL") => templates.find((template) => template.channel === channel)
  const defaults = DEFAULT_TEMPLATES["payment.received"]
  const smsTemplate = stored("SMS")?.body ?? defaults.sms
  const emailTemplate = stored("EMAIL")?.body ?? defaults.email
  const subjectTemplate = stored("EMAIL")?.subject ?? defaults.emailSubject

  const paidFor = payment.allocations
    .map((allocation) => {
      const name = allocation.charge.feeSchedule?.name ?? "School fees"
      const term = allocation.charge.term?.name
      return `${name}${term && !name.includes(term) ? ` (${term})` : ""}: ${formatNaira(allocation.amount)}`
    })
    .join("; ")
  const baseValues: Omit<TemplateValues, "payerName"> = {
    schoolName: school.name,
    studentName: `${student.user.firstName} ${student.user.lastName}`,
    admissionNo: student.admissionNo,
    className: student.classTerms[0]?.classTerm.class.name ?? "—",
    amount: formatNaira(payment.amount),
    paidFor: paidFor || "School fees",
    paymentMethod: methodLabel(payment.paymentMethod),
    paymentDate: payment.paymentDate.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }),
    receiptNo: payment.receiptNo,
    reference: input.reference,
    balance: formatNaira(owing._sum.balance ?? 0),
    portalLink: portalLink(),
  }
  const allowed = variablesFor("payment.received")
  const governance = await loadGovernance(tx, input.schoolId)
  let smsUsed = governance.smsUnitsThisMonth

  let queued = 0
  async function queue(data: Prisma.NotificationOutboxUncheckedCreateInput) {
    if (!data.dedupeKey) return
    const exists = await tx.notificationOutbox.findFirst({ where: { schoolId: data.schoolId, dedupeKey: data.dedupeKey }, select: { id: true } })
    if (exists) return
    await tx.notificationOutbox.create({ data })
    queued += 1
  }

  const userSelect = {
    id: true, firstName: true, lastName: true, phone: true, notifyByEmail: true, notifyBySms: true,
    credentials: { where: { type: "EMAIL" as const }, select: { value: true } },
  }
  const recipients = student.parents.map((link) => link.parent.user)
  const payerEmail = input.payerEmail?.trim().toLowerCase()
  if (payerEmail && !recipients.some((user) => user.credentials.some((credential) => credential.value.trim().toLowerCase() === payerEmail))) {
    const payer = await tx.credential.findUnique({ where: { value: payerEmail }, select: { user: { select: userSelect } } })
    if (payer) recipients.push(payer.user)
  }

  for (const user of recipients) {
    const values: TemplateValues = { ...baseValues, payerName: `${user.firstName} ${user.lastName}` }
    const email = user.credentials[0]?.value.trim().toLowerCase()
    if (email && user.notifyByEmail) {
      const body = render(emailTemplate, values, allowed)
      const subject = render(subjectTemplate, values, allowed)
      if (body.ok && subject.ok) {
        await queue({
          schoolId: input.schoolId, channel: "EMAIL", recipient: email, recipientUserId: user.id, studentId: input.studentId,
          subject: subject.text, body: body.text, templateKey: "payment.received",
          dedupeKey: `payment-receipt:${input.paymentId}:email:${user.id}`, units: 1,
        })
      }
    }
    const phone = toE164(user.phone)
    if (phone && user.notifyBySms && categoryAllowed(governance, "payment.received", "SMS")) {
      const body = render(smsTemplate, values, allowed)
      const units = body.ok ? measureSms(body.text).segments : 0
      const withinCap = governance.smsMonthlyLimit === null || smsUsed + units <= governance.smsMonthlyLimit
      if (body.ok && withinCap) {
        smsUsed += units
        await queue({
          schoolId: input.schoolId, channel: "SMS", recipient: phone, recipientUserId: user.id, studentId: input.studentId,
          body: body.text, templateKey: "payment.received",
          dedupeKey: `payment-receipt:${input.paymentId}:sms:${user.id}`, units: measureSms(body.text).segments,
        })
      }
    }
  }
  return { queued }
}

/**
 * Tells each linked parent (and the payer) that money arrived but could not all go on a
 * fee, so it is held for the bursar. Used when a transfer exceeds what is owed and when an
 * online payment lands after the same fees were paid at the bursary.
 */
export async function queueHeldMoneyNoticeInTransaction(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; studentId: string; heldAmount: Prisma.Decimal.Value; totalReceived: Prisma.Decimal.Value; reference: string; receipted: boolean; reason: string; payerEmail?: string | null },
): Promise<void> {
  const [school, student] = await Promise.all([
    tx.school.findUniqueOrThrow({ where: { id: input.schoolId }, select: { name: true } }),
    tx.student.findUniqueOrThrow({
      where: { id: input.studentId },
      select: {
        user: { select: { firstName: true, lastName: true } },
        parents: { select: { parent: { select: { user: { select: { id: true, notifyByEmail: true, credentials: { where: { type: "EMAIL" }, select: { value: true } } } } } } } },
      },
    }),
  ])
  const recipients = student.parents.map((link) => link.parent.user)
  const payerEmail = input.payerEmail?.trim().toLowerCase()
  if (payerEmail && !recipients.some((user) => user.credentials.some((credential) => credential.value.trim().toLowerCase() === payerEmail))) {
    const payer = await tx.credential.findUnique({
      where: { value: payerEmail },
      select: { user: { select: { id: true, notifyByEmail: true, credentials: { where: { type: "EMAIL" }, select: { value: true } } } } },
    })
    if (payer) recipients.push(payer.user)
  }
  const studentName = `${student.user.firstName} ${student.user.lastName}`
  for (const user of recipients) {
    const email = user.credentials[0]?.value.trim().toLowerCase()
    if (!email || !user.notifyByEmail) continue
    const dedupeKey = `held-money:${input.reference}:email:${user.id}`
    if (await tx.notificationOutbox.findFirst({ where: { schoolId: input.schoolId, dedupeKey }, select: { id: true } })) continue
    await tx.notificationOutbox.create({
      data: {
        schoolId: input.schoolId, channel: "EMAIL", recipient: email, recipientUserId: user.id, studentId: input.studentId,
        subject: `${school.name}: ${formatNaira(input.heldAmount)} received for ${studentName} is held for review`,
        body:
          `Dear Parent/Guardian,\n\n${school.name} received ${formatNaira(input.totalReceived)} for ${studentName} (reference ${input.reference}).\n\n` +
          `${input.receipted ? "The fees it covered have been receipted separately. " : ""}${formatNaira(input.heldAmount)} ${input.reason}\n\n` +
          `Your money is safe. The school's bursar will either apply it to other fees or refund it to you, and you will be told which.\n\n${school.name}`,
        templateKey: "payment.received", dedupeKey, units: 1,
      },
    })
  }
}

/**
 * Tells the learner's parents that a receipt was refunded — the essential counterpart of
 * the receipt itself, so its email cannot be switched off. Called inside the transaction
 * that reverses the receipt, for a refund at the bursary and for a provider refund alike.
 */
export async function queueRefundNoticeInTransaction(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; paymentId: string; reason: string },
): Promise<{ queued: number }> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: input.paymentId },
    select: {
      amount: true, receiptNo: true, studentId: true,
      student: {
        select: {
          admissionNo: true, user: { select: { firstName: true, lastName: true } },
          parents: { select: { parent: { select: { user: { select: {
            id: true, phone: true, notifyByEmail: true, notifyBySms: true,
            credentials: { where: { type: "EMAIL" }, select: { value: true } },
          } } } } } },
        },
      },
      school: { select: { name: true } },
    },
  })
  const owing = await tx.studentCharge.aggregate({
    where: { studentId: payment.studentId, schoolId: input.schoolId, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] } },
    _sum: { balance: true },
  })
  const values: TemplateValues = {
    studentName: `${payment.student.user.firstName} ${payment.student.user.lastName}`,
    admissionNo: payment.student.admissionNo,
    amount: formatNaira(payment.amount),
    receiptNo: payment.receiptNo,
    reason: input.reason,
    balance: formatNaira(owing._sum.balance ?? 0),
    schoolName: payment.school.name,
    portalLink: portalLink(),
  }
  const allowed = variablesFor("payment.refunded")
  const governance = await loadGovernance(tx, input.schoolId)
  const [smsTemplate, emailTemplate] = await Promise.all([
    resolveTemplate(tx, input.schoolId, "payment.refunded", "SMS"),
    resolveTemplate(tx, input.schoolId, "payment.refunded", "EMAIL"),
  ])
  let queued = 0
  for (const link of payment.student.parents) {
    const user = link.parent.user
    const email = user.credentials[0]?.value.trim().toLowerCase()
    if (email && user.notifyByEmail) {
      const body = render(emailTemplate.body, values, allowed)
      const subject = render(emailTemplate.subject ?? DEFAULT_TEMPLATES["payment.refunded"].emailSubject, values, allowed)
      const dedupeKey = `payment-refund:${input.paymentId}:email:${user.id}`
      if (body.ok && subject.ok && !(await tx.notificationOutbox.findFirst({ where: { schoolId: input.schoolId, dedupeKey }, select: { id: true } }))) {
        await tx.notificationOutbox.create({ data: { schoolId: input.schoolId, channel: "EMAIL", recipient: email, recipientUserId: user.id,
          studentId: payment.studentId, subject: subject.text, body: body.text, templateKey: "payment.refunded", dedupeKey, units: 1 } })
        queued += 1
      }
    }
    const phone = toE164(user.phone)
    if (phone && user.notifyBySms && categoryAllowed(governance, "payment.refunded", "SMS")) {
      const body = render(smsTemplate.body, values, allowed)
      const dedupeKey = `payment-refund:${input.paymentId}:sms:${user.id}`
      const units = body.ok ? measureSms(body.text).segments : 0
      const withinCap = governance.smsMonthlyLimit === null || governance.smsUnitsThisMonth + units <= governance.smsMonthlyLimit
      if (body.ok && withinCap && !(await tx.notificationOutbox.findFirst({ where: { schoolId: input.schoolId, dedupeKey }, select: { id: true } }))) {
        await tx.notificationOutbox.create({ data: { schoolId: input.schoolId, channel: "SMS", recipient: phone, recipientUserId: user.id,
          studentId: payment.studentId, body: body.text, templateKey: "payment.refunded", dedupeKey, units } })
        queued += 1
      }
    }
  }
  return { queued }
}
