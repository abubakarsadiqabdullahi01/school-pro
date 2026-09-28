import type { PaymentGatewayEnvironment, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { decryptGatewaySecret, loadGatewayEncryptionKey } from "./gateway-credentials.server"
import { loadPlatformPaystackConfig, type PaystackConnectionConfig } from "./paystack-config.server"
import { PaystackAdapter } from "./paystack.server"

export type PaymentSettingsDto = {
  school: { id: string; name: string; email: string; phone: string }
  environment: "TEST" | "LIVE"
  platformConnectionAvailable: boolean
  schoolOwnedEncryptionAvailable: boolean
  payerContactReadiness: { parentAccounts: number; missingEmail: number }
  configuration: null | {
    id: string
    accountMode: "PLATFORM_MANAGED" | "SCHOOL_OWNED"
    status: "DRAFT" | "PENDING_VERIFICATION" | "READY" | "SUSPENDED" | "DISABLED"
    isEnabled: boolean
    businessName: string | null
    subaccountCode: string | null
    settlementBankCode: string | null
    settlementAccountLast4: string | null
    feePolicy: "SCHOOL_PAYS" | "PLATFORM_PAYS" | "PARENT_PAYS_GROSS_UP"
    allowPartialPayments: boolean
    allowedChannels: string[]
    verifiedAt: string | null
    credential: null | {
      secretLast4: string
      publicKey: string | null
      webhookUrl: string
      rotatedAt: string | null
    }
  }
}

function gatewayEnvironment(value: PaymentGatewayEnvironment): "test" | "live" {
  return value === "TEST" ? "test" : "live"
}

function applicationOrigin(): string {
  const raw = process.env.NEXTAUTH_URL
  if (!raw) throw new Error("NEXTAUTH_URL is required")
  const url = new URL(raw)
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Payment gateway URLs must use HTTPS outside local development")
  }
  return url.origin
}

function timeoutMs(): number {
  const value = Number(process.env.PAYSTACK_TIMEOUT_MS ?? 10_000)
  if (!Number.isInteger(value) || value < 1_000 || value > 30_000) return 10_000
  return value
}

function channels(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export async function getPaymentSettingsForSchool(
  schoolId: string,
  environment: PaymentGatewayEnvironment = "TEST",
): Promise<PaymentSettingsDto> {
  const [school, configuration, parentAccounts, parentsMissingEmail] = await Promise.all([
    prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.schoolPaymentConfiguration.findUnique({
      where: { schoolId_provider_environment: { schoolId, provider: "PAYSTACK", environment } },
      include: {
        credential: {
          select: { secretLast4: true, publicKey: true, webhookToken: true, rotatedAt: true },
        },
      },
    }),
    prisma.parent.count({ where: { schoolId } }),
    prisma.parent.count({
      where: { schoolId, user: { credentials: { none: { type: "EMAIL" } } } },
    }),
  ])

  let encryptionAvailable = false
  try {
    loadGatewayEncryptionKey()
    encryptionAvailable = true
  } catch {
    encryptionAvailable = false
  }

  const keyPrefix = environment === "TEST" ? "sk_test_" : "sk_live_"
  const platformConnectionAvailable = Boolean(process.env.PAYSTACK_SECRET_KEY?.startsWith(keyPrefix))
  const origin = applicationOrigin()

  return {
    school,
    environment,
    platformConnectionAvailable,
    schoolOwnedEncryptionAvailable: encryptionAvailable,
    payerContactReadiness: { parentAccounts, missingEmail: parentsMissingEmail },
    configuration: configuration
      ? {
          id: configuration.id,
          accountMode: configuration.accountMode,
          status: configuration.status,
          isEnabled: configuration.isEnabled,
          businessName: configuration.businessName,
          subaccountCode: configuration.subaccountCode,
          settlementBankCode: configuration.settlementBankCode,
          settlementAccountLast4: configuration.settlementAccountLast4,
          feePolicy: configuration.feePolicy,
          allowPartialPayments: configuration.allowPartialPayments,
          allowedChannels: channels(configuration.allowedChannels),
          verifiedAt: configuration.verifiedAt?.toISOString() ?? null,
          credential: configuration.credential
            ? {
                secretLast4: configuration.credential.secretLast4,
                publicKey: configuration.credential.publicKey,
                webhookUrl: `${origin}/api/webhooks/paystack/${configuration.credential.webhookToken}/`,
                rotatedAt: configuration.credential.rotatedAt?.toISOString() ?? null,
              }
            : null,
        }
      : null,
  }
}

export async function adapterForPaymentConfiguration(configurationId: string): Promise<PaystackAdapter> {
  const configuration = await prisma.schoolPaymentConfiguration.findUnique({
    where: { id: configurationId },
    include: { credential: true },
  })
  if (!configuration) throw new Error("Payment gateway configuration was not found")

  if (configuration.accountMode === "PLATFORM_MANAGED") {
    const config = loadPlatformPaystackConfig()
    if (config.environment !== gatewayEnvironment(configuration.environment)) {
      throw new Error("The platform Paystack environment does not match this school configuration")
    }
    return new PaystackAdapter(config)
  }

  if (!configuration.credential) throw new Error("Connect the school's Paystack account first")
  const origin = applicationOrigin()
  const secretKey = decryptGatewaySecret(
    configuration.credential,
    configuration.id,
    loadGatewayEncryptionKey(),
  )
  const config: PaystackConnectionConfig = {
    secretKey,
    publicKey: configuration.credential.publicKey ?? undefined,
    environment: gatewayEnvironment(configuration.environment),
    applicationOrigin: origin,
    webhookUrl: `${origin}/api/webhooks/paystack/${configuration.credential.webhookToken}/`,
    timeoutMs: timeoutMs(),
  }
  return new PaystackAdapter(config)
}

export function paystackConfigurationForSchool(
  schoolId: string,
  environment: PaymentGatewayEnvironment,
) {
  return prisma.schoolPaymentConfiguration.findUnique({
    where: { schoolId_provider_environment: { schoolId, provider: "PAYSTACK", environment } },
    include: { credential: true },
  })
}

export async function schoolOwnedWebhookConnection(webhookToken: string): Promise<{
  configurationId: string
  schoolId: string
  environment: PaymentGatewayEnvironment
  secretKey: string
} | null> {
  if (!/^[a-f0-9]{64}$/.test(webhookToken)) return null
  const credential = await prisma.paymentGatewayCredential.findUnique({
    where: { webhookToken },
    include: {
      configuration: {
        select: { id: true, schoolId: true, environment: true, accountMode: true, status: true },
      },
    },
  })
  if (!credential || credential.configuration.accountMode !== "SCHOOL_OWNED"
    || credential.configuration.status === "DISABLED") return null

  return {
    configurationId: credential.configuration.id,
    schoolId: credential.configuration.schoolId,
    environment: credential.configuration.environment,
    secretKey: decryptGatewaySecret(credential, credential.configuration.id, loadGatewayEncryptionKey()),
  }
}
