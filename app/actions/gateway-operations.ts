"use server"

import type { GatewayEventStatus, GatewayTransactionStatus, PaymentGatewayEnvironment } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { processGatewayEvent } from "@/lib/payments/gateway-event-processor.server"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

const statusSchema = z.enum([
  "CREATED", "INITIALIZED", "INITIALIZATION_UNKNOWN", "PENDING", "PROCESSING",
  "SUCCEEDED", "FAILED", "ABANDONED", "REQUIRES_REVIEW", "REFUNDED", "DISPUTED",
])

export type GatewayRegisterFilters = {
  query?: string
  status?: GatewayTransactionStatus
  environment?: PaymentGatewayEnvironment
}

async function scopedActor(permission: "finance.view_reports" | "finance.manage_gateway") {
  const actor = await requirePermission(permission)
  if (!actor.schoolId) throw new Error("Select a school before viewing online payments")
  return { actor, schoolId: actor.schoolId }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function getGatewayTransactionRegister(filters: GatewayRegisterFilters = {}) {
  try {
    const { schoolId } = await scopedActor("finance.view_reports")
    const parsed = z.object({
      query: z.string().trim().max(120).optional(),
      status: statusSchema.optional(),
      environment: z.enum(["TEST", "LIVE"]).optional(),
    }).parse(filters)

    const where = {
      schoolId,
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.environment ? { environment: parsed.environment } : {}),
      ...(parsed.query
        ? {
            OR: [
              { reference: { contains: parsed.query } },
              { providerTransactionId: { contains: parsed.query } },
              { payerEmail: { contains: parsed.query } },
              { student: { admissionNo: { contains: parsed.query } } },
              { student: { user: { firstName: { contains: parsed.query } } } },
              { student: { user: { lastName: { contains: parsed.query } } } },
            ],
          }
        : {}),
    }

    const [rows, total, attention, pending] = await Promise.all([
      prisma.gatewayTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 250,
        select: {
          id: true, reference: true, status: true, environment: true, amountExpected: true,
          amountRequested: true, amountCharged: true, providerFee: true, channel: true,
          payerEmail: true, createdAt: true, paidAt: true, verifiedAt: true, failureMessage: true,
          student: { select: { admissionNo: true, user: { select: { firstName: true, lastName: true } } } },
          payment: { select: { id: true, receiptNo: true } },
          _count: { select: { events: true } },
        },
      }),
      prisma.gatewayTransaction.count({ where }),
      prisma.gatewayTransaction.count({ where: { schoolId, status: { in: ["FAILED", "REQUIRES_REVIEW", "INITIALIZATION_UNKNOWN"] } } }),
      prisma.gatewayTransaction.count({ where: { schoolId, status: { in: ["CREATED", "INITIALIZED", "PENDING", "PROCESSING"] } } }),
    ])

    return {
      success: true as const,
      data: {
        total,
        capped: total > rows.length,
        attention,
        pending,
        rows: rows.map((row) => ({
          ...row,
          amountExpected: row.amountExpected.toFixed(2),
          amountRequested: row.amountRequested?.toFixed(2) ?? null,
          amountCharged: row.amountCharged?.toFixed(2) ?? null,
          providerFee: row.providerFee?.toFixed(2) ?? null,
          createdAt: row.createdAt.toISOString(),
          paidAt: row.paidAt?.toISOString() ?? null,
          verifiedAt: row.verifiedAt?.toISOString() ?? null,
          studentName: `${row.student.user.firstName} ${row.student.user.lastName}`,
        })),
      },
    }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, "Could not load online payments") }
  }
}

export async function getGatewayTransactionDetail(id: string) {
  try {
    const { schoolId } = await scopedActor("finance.view_reports")
    const transaction = await prisma.gatewayTransaction.findFirst({
      where: { id: z.string().uuid().parse(id), schoolId },
      select: {
        id: true, reference: true, providerTransactionId: true, provider: true, environment: true,
        status: true, currency: true, amountExpected: true, amountRequested: true, amountCharged: true,
        providerFee: true, channel: true, payerEmail: true, failureCode: true, failureMessage: true,
        initializedAt: true, verifiedAt: true, paidAt: true, expiresAt: true, createdAt: true, updatedAt: true,
        configurationSnapshot: true,
        student: { select: { id: true, admissionNo: true, user: { select: { firstName: true, lastName: true } } } },
        term: { select: { name: true, session: { select: { name: true } } } },
        payment: { select: { id: true, receiptNo: true, status: true, amount: true } },
        allocations: {
          select: { id: true, amount: true, charge: { select: { id: true, balance: true, status: true, feeSchedule: { select: { name: true } } } } },
        },
        events: {
          orderBy: { receivedAt: "desc" },
          select: { id: true, providerEventId: true, eventType: true, status: true, attempts: true, receivedAt: true, processedAt: true, nextAttemptAt: true, lastError: true },
        },
        refunds: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, amount: true, reason: true, providerRefundId: true, providerMessage: true, createdAt: true, processedAt: true, rejectionReason: true, environment: true } },
      },
    })
    if (!transaction) throw new Error("Online payment was not found")

    return {
      success: true as const,
      data: {
        ...transaction,
        amountExpected: transaction.amountExpected.toFixed(2),
        amountRequested: transaction.amountRequested?.toFixed(2) ?? null,
        amountCharged: transaction.amountCharged?.toFixed(2) ?? null,
        providerFee: transaction.providerFee?.toFixed(2) ?? null,
        initializedAt: transaction.initializedAt?.toISOString() ?? null,
        verifiedAt: transaction.verifiedAt?.toISOString() ?? null,
        paidAt: transaction.paidAt?.toISOString() ?? null,
        expiresAt: transaction.expiresAt?.toISOString() ?? null,
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString(),
        studentName: `${transaction.student.user.firstName} ${transaction.student.user.lastName}`,
        payment: transaction.payment ? { ...transaction.payment, amount: transaction.payment.amount.toFixed(2) } : null,
        allocations: transaction.allocations.map((allocation) => ({
          ...allocation,
          amount: allocation.amount.toFixed(2),
          charge: { ...allocation.charge, balance: allocation.charge.balance.toFixed(2) },
        })),
        events: transaction.events.map((event) => ({
          ...event,
          receivedAt: event.receivedAt.toISOString(),
          processedAt: event.processedAt?.toISOString() ?? null,
          nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
        })),
        refunds: transaction.refunds.map((refund) => ({ ...refund, amount: refund.amount.toFixed(2), createdAt: refund.createdAt.toISOString(), processedAt: refund.processedAt?.toISOString() ?? null })),
      },
    }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, "Could not load online payment") }
  }
}

export async function reprocessGatewayEvent(input: unknown): Promise<ActionResult<{ result: string }>> {
  try {
    const { actor, schoolId } = await scopedActor("finance.manage_gateway")
    const data = z.object({ transactionId: z.string().uuid(), eventId: z.string().uuid(), confirmation: z.literal(true) }).parse(input)
    const event = await prisma.gatewayEvent.findFirst({
      where: { id: data.eventId, gatewayTransactionId: data.transactionId, schoolId },
      select: { id: true, status: true, eventType: true, lastError: true },
    })
    if (!event) throw new Error("Gateway event was not found for this school")
    if (event.eventType !== "charge.success") throw new Error("Only a charge.success event can be reprocessed in this slice")
    if (!["FAILED", "PENDING"].includes(event.status)) {
      throw new Error(`A ${event.status.toLowerCase()} event cannot be manually reprocessed`)
    }

    await prisma.gatewayEvent.update({
      where: { id: event.id },
      data: { status: "PENDING", nextAttemptAt: null, claimedAt: null },
    })
    const result = await processGatewayEvent(event.id)
    await recordAudit({
      actor,
      schoolId,
      action: "payment_gateway.event_reprocess",
      entityType: "GatewayEvent",
      entityId: event.id,
      summary: `Reprocessed ${event.eventType} for online payment ${data.transactionId}: ${result}`,
      before: { status: event.status, lastError: event.lastError },
      after: { result },
    })
    revalidatePath(`/dashboard/admin/finance/online-payments/${data.transactionId}`)
    revalidatePath(`/dashboard/accountant/online-payments/${data.transactionId}`)
    return { success: true, data: { result } }
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not reprocess the gateway event") }
  }
}

export type GatewayEventViewStatus = GatewayEventStatus
