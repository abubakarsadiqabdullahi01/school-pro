"use server"

import type { PaymentGatewayEnvironment } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { requirePermission, requireRole } from "@/lib/authz"
import { prisma } from "@/lib/db"
import {
  encryptGatewaySecret,
  loadGatewayEncryptionKey,
  newGatewayWebhookToken,
} from "@/lib/payments/gateway-credentials.server"
import { loadPlatformPaystackConfig } from "@/lib/payments/paystack-config.server"
import { PaystackAdapter, PaystackApiError } from "@/lib/payments/paystack.server"
import { gatewayActivationProblems } from "@/lib/payments/payment-settings-rules"

import { dedicatedSplitShare } from "@/lib/payments/dedicated-account-rules"
import { platformChargeProblems, type PlatformChargeType } from "@/lib/payments/platform-charge"
import {
  adapterForPaymentConfiguration,
  getPaymentSettingsForSchool,
  paystackConfigurationForSchool,
} from "@/lib/payments/payment-settings.server"

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string }

const environmentSchema = z.enum(["TEST", "LIVE"])
const modeSchema = z.enum(["OFFLINE", "PLATFORM_MANAGED", "SCHOOL_OWNED"])
const channelSchema = z.enum(["card", "bank_transfer"])

async function requireGatewayManager() {
  const actor = await requirePermission("finance.manage_gateway")
  if (!actor.schoolId) throw new Error("Select a school before managing online payments")
  return { actor, schoolId: actor.schoolId }
}

function refreshPaymentSettings() {
  revalidatePath("/dashboard/admin/school-settings")
  revalidatePath("/dashboard/admin/school-settings/payments")
}

function safeError(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? fallback
  if (error instanceof PaystackApiError) {
    if (error.httpStatus === 401) return "Paystack rejected the credentials. Check the selected environment and key."
    if (error.httpStatus === 429) return "Paystack rate limit reached. Wait until the displayed retry time and try again."
    return error.message
  }
  return error instanceof Error ? error.message : fallback
}

function environmentValue(value: "TEST" | "LIVE"): PaymentGatewayEnvironment {
  return value
}

export async function getPaymentSettings(environment: "TEST" | "LIVE" = "TEST") {
  try {
    const { schoolId } = await requireGatewayManager()
    return { success: true as const, data: await getPaymentSettingsForSchool(schoolId, environmentValue(environmentSchema.parse(environment))) }
  } catch (error) {
    return { success: false as const, error: safeError(error, "Could not load payment settings") }
  }
}

export async function choosePaymentGatewayMode(input: unknown): Promise<ActionResult<{ configurationId: string | null }>> {
  try {
    const { actor, schoolId } = await requireGatewayManager()
    const data = z.object({ environment: environmentSchema, mode: modeSchema }).parse(input)

    if (data.mode === "OFFLINE") {
      await prisma.schoolPaymentConfiguration.updateMany({
        where: { schoolId, provider: "PAYSTACK", environment: data.environment },
        data: { isEnabled: false, status: "DISABLED", suspendedAt: new Date() },
      })
      await recordAudit({
        actor,
        schoolId,
        action: "payment_gateway.disable",
        entityType: "SchoolPaymentConfiguration",
        summary: `Disabled ${data.environment.toLowerCase()} online payments; offline collection remains available`,
        after: { environment: data.environment, mode: "OFFLINE" },
      })
      refreshPaymentSettings()
      return { success: true, data: { configurationId: null } }
    }

    const existing = await paystackConfigurationForSchool(schoolId, data.environment)
    const configuration = await prisma.schoolPaymentConfiguration.upsert({
      where: {
        schoolId_provider_environment: { schoolId, provider: "PAYSTACK", environment: data.environment },
      },
      create: {
        schoolId,
        provider: "PAYSTACK",
        environment: data.environment,
        accountMode: data.mode,
        status: "DRAFT",
        isEnabled: false,
        allowedChannels: ["card", "bank_transfer"],
      },
      update: existing?.accountMode === data.mode
        ? { status: existing.status === "DISABLED" ? "DRAFT" : existing.status, isEnabled: false, suspendedAt: null }
        : {
            accountMode: data.mode,
            status: "DRAFT",
            isEnabled: false,
            verifiedAt: null,
            suspendedAt: null,
            configVersion: { increment: 1 },
          },
      select: { id: true },
    })

    await recordAudit({
      actor,
      schoolId,
      action: "payment_gateway.mode_select",
      entityType: "SchoolPaymentConfiguration",
      entityId: configuration.id,
      summary: `Selected ${data.mode === "PLATFORM_MANAGED" ? "DigiSchool-managed" : "school-owned"} Paystack for ${data.environment.toLowerCase()}`,
      before: existing ? { accountMode: existing.accountMode, status: existing.status } : undefined,
      after: { accountMode: data.mode, status: "DRAFT", enabled: false },
    })

    refreshPaymentSettings()
    return { success: true, data: { configurationId: configuration.id } }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not save payment mode") }
  }
}

export async function getPaymentBanks(input: unknown): Promise<ActionResult<Array<{ name: string; code: string; id: number | null }>>> {
  try {
    const { schoolId } = await requireGatewayManager()
    const { environment } = z.object({ environment: environmentSchema }).parse(input)
    const configuration = await paystackConfigurationForSchool(schoolId, environment)
    if (!configuration) throw new Error("Choose an online payment mode first")
    const adapter = await adapterForPaymentConfiguration(configuration.id)
    const banks = await adapter.listBanks()
    return { success: true, data: banks.map(({ name, code, id }) => ({ name, code, id: id ?? null })) }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not load Paystack banks") }
  }
}

export async function resolvePaymentSettlementAccount(
  input: unknown,
): Promise<ActionResult<{ accountName: string; accountNumber: string; bankCode: string }>> {
  try {
    const { schoolId } = await requireGatewayManager()
    const data = z
      .object({
        environment: environmentSchema,
        bankCode: z.string().trim().min(1).max(20),
        accountNumber: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
      })
      .parse(input)
    const configuration = await paystackConfigurationForSchool(schoolId, data.environment)
    if (!configuration || configuration.accountMode !== "PLATFORM_MANAGED") {
      throw new Error("Choose DigiSchool-managed Paystack before resolving a settlement account")
    }
    const adapter = await adapterForPaymentConfiguration(configuration.id)
    return { success: true, data: await adapter.resolveBankAccount(data.accountNumber, data.bankCode) }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not verify the settlement account") }
  }
}

export async function connectPlatformManagedPaystack(
  input: unknown,
): Promise<ActionResult<{ accountName: string; subaccountCode: string }>> {
  try {
    const { actor, schoolId } = await requireGatewayManager()
    const data = z
      .object({
        environment: environmentSchema,
        businessName: z.string().trim().min(2).max(191),
        bankCode: z.string().trim().min(1).max(20),
        accountNumber: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
      })
      .parse(input)
    const configuration = await paystackConfigurationForSchool(schoolId, data.environment)
    if (!configuration || configuration.accountMode !== "PLATFORM_MANAGED") {
      throw new Error("Choose DigiSchool-managed Paystack first")
    }

    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { email: true, phone: true },
    })
    const adapter = await adapterForPaymentConfiguration(configuration.id)
    const resolved = await adapter.resolveBankAccount(data.accountNumber, data.bankCode)
    const subaccount = configuration.subaccountCode
      ? await adapter.updateSubaccount(configuration.subaccountCode, {
          businessName: data.businessName,
          settlementBankCode: data.bankCode,
          accountNumber: data.accountNumber,
          percentageCharge: 0,
        })
      : await adapter.createSubaccount({
          businessName: data.businessName,
          settlementBankCode: data.bankCode,
          accountNumber: data.accountNumber,
          percentageCharge: 0,
          primaryContactEmail: school.email,
          primaryContactPhone: school.phone,
          metadata: { schoolId },
        })

    await prisma.schoolPaymentConfiguration.update({
      where: { id: configuration.id },
      data: {
        businessName: data.businessName,
        subaccountCode: subaccount.subaccountCode,
        providerAccountId: subaccount.subaccountCode,
        settlementBankCode: data.bankCode,
        settlementAccountLast4: data.accountNumber.slice(-4),
        status: "READY",
        isEnabled: false,
        verifiedAt: new Date(),
        suspendedAt: null,
        configVersion: { increment: 1 },
      },
    })

    await recordAudit({
      actor,
      schoolId,
      action: "payment_gateway.subaccount_connect",
      entityType: "SchoolPaymentConfiguration",
      entityId: configuration.id,
      summary: `Verified the school's ${resolved.accountName} settlement account ending ${data.accountNumber.slice(-4)} in ${data.environment.toLowerCase()}`,
      after: {
        accountMode: "PLATFORM_MANAGED",
        environment: data.environment,
        accountLast4: data.accountNumber.slice(-4),
        subaccountCode: subaccount.subaccountCode,
        enabled: false,
      },
    })

    refreshPaymentSettings()
    return { success: true, data: { accountName: resolved.accountName, subaccountCode: subaccount.subaccountCode } }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not connect the school settlement account") }
  }
}

export async function connectSchoolOwnedPaystack(
  input: unknown,
): Promise<ActionResult<{ secretLast4: string; webhookUrl: string }>> {
  try {
    const { actor, schoolId } = await requireGatewayManager()
    const data = z
      .object({
        environment: environmentSchema,
        secretKey: z.string().trim().min(12),
        publicKey: z.string().trim().min(12).optional().or(z.literal("")),
      })
      .parse(input)
    const configuration = await paystackConfigurationForSchool(schoolId, data.environment)
    if (!configuration || configuration.accountMode !== "SCHOOL_OWNED") {
      throw new Error("Choose the school's own Paystack account first")
    }

    const origin = new URL(process.env.NEXTAUTH_URL ?? "").origin
    const webhookToken = configuration.credential?.webhookToken ?? newGatewayWebhookToken()
    const webhookUrl = `${origin}/api/webhooks/paystack/${webhookToken}/`
    const validated = loadPlatformPaystackConfig({
      PAYSTACK_SECRET_KEY: data.secretKey,
      PAYSTACK_PUBLIC_KEY: data.publicKey || undefined,
      PAYSTACK_ENV: data.environment.toLowerCase(),
      PAYSTACK_WEBHOOK_URL: webhookUrl,
      NEXTAUTH_URL: origin,
      PAYSTACK_TIMEOUT_MS: process.env.PAYSTACK_TIMEOUT_MS,
    })
    // Read-only API proof before any credential is persisted.
    await new PaystackAdapter(validated).listBanks()

    const encrypted = encryptGatewaySecret(
      data.secretKey,
      configuration.id,
      loadGatewayEncryptionKey(),
      configuration.credential?.keyVersion ?? 1,
    )
    await prisma.$transaction(async (tx) => {
      await tx.paymentGatewayCredential.upsert({
        where: { configurationId: configuration.id },
        create: {
          configurationId: configuration.id,
          ...encrypted,
          publicKey: data.publicKey || null,
          webhookToken,
        },
        update: {
          ...encrypted,
          publicKey: data.publicKey || null,
          rotatedAt: new Date(),
        },
      })
      await tx.schoolPaymentConfiguration.update({
        where: { id: configuration.id },
        data: {
          credentialKeyRef: "DATABASE_ENCRYPTED",
          status: "READY",
          isEnabled: false,
          verifiedAt: new Date(),
          suspendedAt: null,
          configVersion: { increment: 1 },
        },
      })
    })

    await recordAudit({
      actor,
      schoolId,
      action: "payment_gateway.school_owned_connect",
      entityType: "SchoolPaymentConfiguration",
      entityId: configuration.id,
      summary: `Verified and encrypted the school's own ${data.environment.toLowerCase()} Paystack connection ending ${encrypted.secretLast4}`,
      after: {
        accountMode: "SCHOOL_OWNED",
        environment: data.environment,
        secretLast4: encrypted.secretLast4,
        enabled: false,
      },
    })

    refreshPaymentSettings()
    return { success: true, data: { secretLast4: encrypted.secretLast4, webhookUrl } }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not connect the school's Paystack account") }
  }
}

export async function updatePaymentGatewayPolicy(input: unknown): Promise<ActionResult> {
  try {
    const { actor, schoolId } = await requireGatewayManager()
    const data = z
      .object({
        environment: environmentSchema,
        channels: z.array(channelSchema).min(1, "Choose at least one payment channel"),
        feePolicy: z.enum(["SCHOOL_PAYS", "PARENT_PAYS_GROSS_UP"]),
        allowPartialPayments: z.boolean(),
      })
      .parse(input)
    const configuration = await paystackConfigurationForSchool(schoolId, data.environment)
    if (!configuration) throw new Error("Choose an online payment mode first")

    await prisma.schoolPaymentConfiguration.update({
      where: { id: configuration.id },
      data: {
        allowedChannels: [...new Set(data.channels)],
        feePolicy: data.feePolicy,
        allowPartialPayments: data.allowPartialPayments,
        configVersion: { increment: 1 },
      },
    })
    await recordAudit({
      actor,
      schoolId,
      action: "payment_gateway.policy_update",
      entityType: "SchoolPaymentConfiguration",
      entityId: configuration.id,
      summary: `Updated ${data.environment.toLowerCase()} online-payment policy`,
      before: {
        channels: configuration.allowedChannels,
        feePolicy: configuration.feePolicy,
        allowPartialPayments: configuration.allowPartialPayments,
      },
      after: {
        channels: data.channels,
        feePolicy: data.feePolicy,
        allowPartialPayments: data.allowPartialPayments,
      },
    })
    refreshPaymentSettings()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not save payment policy") }
  }
}

export async function setPaymentGatewayEnabled(input: unknown): Promise<ActionResult> {
  try {
    const { actor, schoolId } = await requireGatewayManager()
    const data = z
      .object({ environment: environmentSchema, enabled: z.boolean(), confirmation: z.literal(true) })
      .parse(input)
    const configuration = await paystackConfigurationForSchool(schoolId, data.environment)
    if (!configuration) throw new Error("Payment gateway configuration was not found")

    if (data.enabled) {
      const configuredChannels = Array.isArray(configuration.allowedChannels)
        ? configuration.allowedChannels.filter((item): item is string => typeof item === "string")
        : []
      let testConfigurationReady = true
      if (data.environment === "LIVE") {
        const test = await paystackConfigurationForSchool(schoolId, "TEST")
        testConfigurationReady = Boolean(test?.verifiedAt && test.status === "READY")
      }
      // A school may hold a configuration for every gateway it has set up, but only one may
      // be collecting. Two enabled at once and nothing decides which gateway a checkout
      // opens against — and a transaction has to stay with the provider that created it,
      // since that is the only one that can verify, refund or defend it afterwards.
      const alreadyCollecting = await prisma.schoolPaymentConfiguration.findFirst({
        where: {
          schoolId,
          environment: environmentValue(data.environment),
          isEnabled: true,
          NOT: { id: configuration.id },
        },
        select: { provider: true },
      })
      const problems = gatewayActivationProblems({
        otherEnabledProvider: alreadyCollecting?.provider ?? null,
        environment: data.environment,
        accountMode: configuration.accountMode,
        status: configuration.status,
        verifiedAt: configuration.verifiedAt,
        subaccountCode: configuration.subaccountCode,
        hasCredential: Boolean(configuration.credential),
        allowedChannels: configuredChannels,
        testConfigurationReady,
        liveApproved: Boolean(configuration.liveApprovedAt),
      })
      if (problems[0]) throw new Error(problems[0])
    }

    await prisma.schoolPaymentConfiguration.update({
      where: { id: configuration.id },
      data: { isEnabled: data.enabled, suspendedAt: data.enabled ? null : new Date() },
    })
    await recordAudit({
      actor,
      schoolId,
      action: data.enabled ? "payment_gateway.enable" : "payment_gateway.disable",
      entityType: "SchoolPaymentConfiguration",
      entityId: configuration.id,
      summary: `${data.enabled ? "Enabled" : "Disabled"} ${data.environment.toLowerCase()} online payments`,
      before: { enabled: configuration.isEnabled },
      after: { enabled: data.enabled },
    })
    refreshPaymentSettings()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not change payment activation") }
  }
}

/**
 * DigiSchool's own cut, for schools collecting through DigiSchool's Paystack account.
 *
 * Deliberately not a school-controlled setting: a school cannot be allowed to edit what the
 * platform charges it, which is why this lives behind the super admin rather than on the
 * school's own payment screen. It changes nothing a parent sees — Paystack holds the amount
 * back in the platform account and settles the remainder to the school's subaccount.
 */
async function requirePlatformOwner() {
  return requireRole("SUPER_ADMIN")
}

export async function listPlatformPaymentConfigurations(): Promise<ActionResult<Array<{
  id: string
  schoolId: string
  schoolName: string
  schoolCode: string
  environment: "TEST" | "LIVE"
  accountMode: string
  status: string
  isEnabled: boolean
  platformChargeType: PlatformChargeType
  platformChargeValue: string
  liveApprovedAt: string | null
  pilotMaxAmount: string | null
}>>> {
  try {
    await requirePlatformOwner()
    const configurations = await prisma.schoolPaymentConfiguration.findMany({
      orderBy: [{ school: { name: "asc" } }, { environment: "asc" }],
      select: {
        id: true,
        schoolId: true,
        environment: true,
        accountMode: true,
        status: true,
        isEnabled: true,
        platformChargeType: true,
        platformChargeValue: true,
        liveApprovedAt: true,
        pilotMaxAmount: true,
        school: { select: { name: true, code: true } },
      },
    })
    return {
      success: true,
      data: configurations.map((configuration) => ({
        id: configuration.id,
        schoolId: configuration.schoolId,
        schoolName: configuration.school.name,
        schoolCode: configuration.school.code,
        environment: configuration.environment,
        accountMode: configuration.accountMode,
        status: configuration.status,
        isEnabled: configuration.isEnabled,
        platformChargeType: configuration.platformChargeType,
        platformChargeValue: configuration.platformChargeValue.toFixed(2),
        liveApprovedAt: configuration.liveApprovedAt?.toISOString() ?? null,
        pilotMaxAmount: configuration.pilotMaxAmount?.toFixed(2) ?? null,
      })),
    }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not load payment configurations") }
  }
}

export async function setPlatformCharge(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requirePlatformOwner()
    const data = z
      .object({
        configurationId: z.string().uuid(),
        type: z.enum(["NONE", "FLAT", "PERCENTAGE"]),
        value: z.number().nonnegative(),
      })
      .parse(input)

    const problems = platformChargeProblems({ type: data.type, value: data.value })
    if (problems[0]) throw new Error(problems[0])

    const configuration = await prisma.schoolPaymentConfiguration.findUnique({
      where: { id: data.configurationId },
      select: {
        id: true,
        schoolId: true,
        accountMode: true,
        environment: true,
        platformChargeType: true,
        platformChargeValue: true,
        subaccountCode: true,
        dedicatedAccountsEnabled: true,
        dedicatedSplitId: true,
        dedicatedSplitShare: true,
      },
    })
    if (!configuration) throw new Error("Payment configuration was not found")
    if (configuration.accountMode !== "PLATFORM_MANAGED" && data.type !== "NONE") {
      throw new Error("A school collecting on its own Paystack account settles directly, so there is nothing to charge")
    }

    // Dedicated-account transfers settle through the school's Paystack split, so the split
    // must carry the same percentage. Paystack is updated first: if it refuses, nothing is saved.
    let dedicatedSplitShareValue = configuration.dedicatedSplitShare
    if (configuration.accountMode === "PLATFORM_MANAGED" && (configuration.dedicatedAccountsEnabled || configuration.dedicatedSplitId)) {
      const { schoolShare } = dedicatedSplitShare(data.type, data.value)
      if (configuration.dedicatedSplitId && configuration.subaccountCode && schoolShare !== configuration.dedicatedSplitShare) {
        await (await adapterForPaymentConfiguration(configuration.id))
          .updateSplitShare(configuration.dedicatedSplitId, configuration.subaccountCode, schoolShare)
        dedicatedSplitShareValue = schoolShare
      }
    }

    await prisma.schoolPaymentConfiguration.update({
      where: { id: configuration.id },
      // The version bump invalidates any checkout already quoted under the old charge,
      // rather than letting it initialize against a figure that has since moved.
      data: {
        platformChargeType: data.type,
        platformChargeValue: data.value,
        dedicatedSplitShare: dedicatedSplitShareValue,
        configVersion: { increment: 1 },
      },
    })
    await recordAudit({
      actor,
      schoolId: configuration.schoolId,
      action: "payment_gateway.platform_charge_update",
      entityType: "SchoolPaymentConfiguration",
      entityId: configuration.id,
      summary: `Set the ${configuration.environment.toLowerCase()} platform charge`,
      before: {
        type: configuration.platformChargeType,
        value: configuration.platformChargeValue.toFixed(2),
      },
      after: { type: data.type, value: data.value.toFixed(2) },
    })
    revalidatePath("/dashboard/super-admin/payments")
    refreshPaymentSettings()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not save the platform charge") }
  }
}

/**
 * Slice 8: the platform owner's approval for one school to take live money.
 *
 * The school's own switch is not enough on its own; this is the second key. Approval can
 * carry a per-checkout ceiling while the school pilots. Revoking switches LIVE off at once
 * and, like any approval change, bumps the version so a checkout already quoted under the
 * old terms cannot initialize.
 */
export async function setSchoolLiveApproval(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requirePlatformOwner()
    const data = z
      .object({
        configurationId: z.string().uuid(),
        approved: z.boolean(),
        pilotMaxAmount: z.number().positive().max(100_000_000).nullable(),
        confirmation: z.literal(true),
      })
      .parse(input)

    const configuration = await prisma.schoolPaymentConfiguration.findUnique({
      where: { id: data.configurationId },
      select: { id: true, schoolId: true, environment: true, isEnabled: true, liveApprovedAt: true, pilotMaxAmount: true },
    })
    if (!configuration) throw new Error("Payment configuration was not found")
    if (configuration.environment !== "LIVE") throw new Error("Only a live configuration needs pilot approval")

    await prisma.schoolPaymentConfiguration.update({
      where: { id: configuration.id },
      data: data.approved
        ? {
            liveApprovedAt: configuration.liveApprovedAt ?? new Date(),
            liveApprovedBy: actor.userId,
            pilotMaxAmount: data.pilotMaxAmount,
            configVersion: { increment: 1 },
          }
        : {
            liveApprovedAt: null,
            liveApprovedBy: null,
            isEnabled: false,
            suspendedAt: configuration.isEnabled ? new Date() : undefined,
            configVersion: { increment: 1 },
          },
    })
    await recordAudit({
      actor,
      schoolId: configuration.schoolId,
      action: data.approved ? "payment_gateway.live_approve" : "payment_gateway.live_revoke",
      entityType: "SchoolPaymentConfiguration",
      entityId: configuration.id,
      summary: data.approved
        ? `Approved live online payments${data.pilotMaxAmount ? ` with a ₦${data.pilotMaxAmount.toFixed(2)} pilot limit` : ""}`
        : "Revoked live online payment approval and switched live payments off",
      before: {
        approved: Boolean(configuration.liveApprovedAt),
        enabled: configuration.isEnabled,
        pilotMaxAmount: configuration.pilotMaxAmount?.toFixed(2) ?? null,
      },
      after: {
        approved: data.approved,
        enabled: data.approved ? configuration.isEnabled : false,
        pilotMaxAmount: data.approved ? data.pilotMaxAmount?.toFixed(2) ?? null : null,
      },
    })
    revalidatePath("/dashboard/super-admin/payments")
    revalidatePath("/dashboard/super-admin/payments/monitor")
    refreshPaymentSettings()
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: safeError(error, "Could not change live approval") }
  }
}
