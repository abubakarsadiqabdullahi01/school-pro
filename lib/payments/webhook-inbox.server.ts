import { Prisma, type PaymentGatewayEnvironment } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { paystackPayloadHash, verifyPaystackSignature } from "./webhook-security"

const MAX_WEBHOOK_BYTES = 1_000_000

const eventSchema = z.object({
  id: z.string().optional(),
  event: z.string().min(1).max(100),
  data: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    // Customer-identification events carry no domain; the secret that signed them decides.
    domain: z.enum(["test", "live"]).optional(),
    customer_code: z.string().max(64).optional(),
    status: z.string().optional(),
    reference: z.string().min(1).max(191).optional(),
    transaction_reference: z.string().min(1).max(191).optional(),
    amount: z.number().int().nonnegative().optional(),
    requested_amount: z.number().int().nonnegative().optional(),
    fees: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().max(10).optional(),
    channel: z.string().max(50).nullable().optional(),
    paid_at: z.string().nullable().optional(),
    subaccount: z.object({ subaccount_code: z.string().optional() }).passthrough().nullable().optional(),
    transaction: z.object({ reference: z.string().max(191).optional() }).passthrough().nullable().optional(),
    due_at: z.string().nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    category: z.string().max(120).nullable().optional(),
    resolution: z.string().max(64).nullable().optional(),
    // Slice 9: a transfer into a dedicated account names the customer and receiving account.
    customer: z.object({ customer_code: z.string().max(64).optional() }).passthrough().nullable().optional(),
    authorization: z.object({
      receiver_bank_account_number: z.string().max(20).nullable().optional(),
      sender_name: z.string().max(191).nullable().optional(),
      sender_bank: z.string().max(120).nullable().optional(),
    }).passthrough().nullable().optional(),
    metadata: z.unknown().optional(),
  }).passthrough(),
}).passthrough()

export type WebhookConnection = {
  secretKey: string
  environment: PaymentGatewayEnvironment
  schoolId?: string
  configurationId?: string
}

export type AcceptedWebhook = { eventId: string; duplicate: boolean }

function metadataText(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === "string" && value.length > 0 ? value.slice(0, 191) : null
}

function safeProviderValue(value: string | number | undefined): string | null {
  if (typeof value === "string") return value.slice(0, 191)
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value)
  return null
}

export async function acceptPaystackWebhook(
  rawBody: Buffer,
  signature: string | null,
  connection: WebhookConnection,
): Promise<AcceptedWebhook> {
  if (rawBody.length === 0 || rawBody.length > MAX_WEBHOOK_BYTES) throw new Error("Invalid webhook body size")
  if (!verifyPaystackSignature(rawBody, signature, connection.secretKey)) throw new Error("Invalid webhook signature")

  let decoded: unknown
  try {
    decoded = JSON.parse(rawBody.toString("utf8"))
  } catch {
    throw new Error("Invalid webhook JSON")
  }
  const parsed = eventSchema.parse(decoded)
  const environment = parsed.data.domain ? (parsed.data.domain === "test" ? "TEST" : "LIVE") : connection.environment
  if (environment !== connection.environment) throw new Error("Webhook environment does not match its secret")

  const reference = parsed.data.reference ?? parsed.data.transaction_reference ?? parsed.data.transaction?.reference ?? null
  const transaction = reference
    ? await prisma.gatewayTransaction.findFirst({
        where: {
          provider: "PAYSTACK",
          reference,
          environment,
          ...(connection.schoolId ? { schoolId: connection.schoolId } : {}),
          ...(connection.configurationId ? { configurationId: connection.configurationId } : {}),
        },
        select: { id: true, schoolId: true },
      })
    : null
  const customerCode = parsed.data.customer?.customer_code ?? parsed.data.customer_code ?? null
  const receiverAccountNumber = parsed.data.authorization?.receiver_bank_account_number
    ?? metadataText(parsed.data.metadata, "receiver_account_number")
  // A dedicated-account transfer has a Paystack-made reference no local checkout knows, so
  // the school comes from the account it was paid into.
  const dedicatedAccount = !transaction && parsed.data.channel === "dedicated_nuban" && (customerCode || receiverAccountNumber)
    ? await prisma.dedicatedAccount.findFirst({
        where: {
          provider: "PAYSTACK",
          environment,
          OR: [
            ...(receiverAccountNumber ? [{ accountNumber: receiverAccountNumber }] : []),
            ...(customerCode ? [{ providerCustomerCode: customerCode }] : []),
          ],
          ...(connection.schoolId ? { schoolId: connection.schoolId } : {}),
          ...(connection.configurationId ? { configurationId: connection.configurationId } : {}),
        },
        select: { schoolId: true },
      })
    : null
  const identification = !transaction && !dedicatedAccount && customerCode && parsed.event.startsWith("customeridentification.")
    ? await prisma.dedicatedCustomerIdentification.findFirst({
        where: {
          environment, customerCode,
          ...(connection.schoolId ? { schoolId: connection.schoolId } : {}),
          ...(connection.configurationId ? { configurationId: connection.configurationId } : {}),
        },
        select: { schoolId: true },
      })
    : null
  const payloadHash = paystackPayloadHash(rawBody)
  const minimalPayload: Prisma.InputJsonObject = {
    event: parsed.event,
    data: {
      id: safeProviderValue(parsed.data.id),
      domain: parsed.data.domain ?? null,
      status: parsed.data.status ?? null,
      reference,
      amount: parsed.data.amount ?? null,
      requestedAmount: parsed.data.requested_amount ?? null,
      fees: parsed.data.fees ?? null,
      currency: parsed.data.currency ?? null,
      channel: parsed.data.channel ?? null,
      paidAt: parsed.data.paid_at ?? null,
      subaccountCode: parsed.data.subaccount?.subaccount_code ?? null,
      dueAt: parsed.data.due_at ?? null,
      reason: parsed.data.reason ?? null,
      category: parsed.data.category ?? null,
      resolution: parsed.data.resolution ?? null,
      customerCode,
      receiverAccountNumber,
      senderName: parsed.data.authorization?.sender_name ?? null,
      senderBank: parsed.data.authorization?.sender_bank ?? null,
    },
  }

  try {
    const created = await prisma.gatewayEvent.create({
      data: {
        schoolId: transaction?.schoolId ?? dedicatedAccount?.schoolId ?? identification?.schoolId ?? connection.schoolId ?? null,
        gatewayTransactionId: transaction?.id ?? null,
        provider: "PAYSTACK",
        environment,
        providerEventId: parsed.id ?? null,
        eventType: parsed.event,
        reference,
        payloadHash,
        payload: minimalPayload,
      },
      select: { id: true },
    })
    return { eventId: created.id, duplicate: false }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error
    const existing = await prisma.gatewayEvent.findFirst({
      where: {
        provider: "PAYSTACK",
        environment,
        OR: [
          { payloadHash },
          ...(parsed.id ? [{ providerEventId: parsed.id }] : []),
        ],
      },
      select: { id: true },
    })
    if (!existing) throw error
    return { eventId: existing.id, duplicate: true }
  }
}
