import { z } from "zod"

import type { GatewayEnvironment } from "./contracts"

export type PaystackConnectionConfig = {
  secretKey: string
  publicKey?: string
  environment: GatewayEnvironment
  applicationOrigin: string
  webhookUrl: string
  timeoutMs: number
}

const environmentSchema = z.object({
  PAYSTACK_SECRET_KEY: z.string().trim().min(1, "PAYSTACK_SECRET_KEY is required"),
  PAYSTACK_PUBLIC_KEY: z.string().trim().optional(),
  PAYSTACK_ENV: z.enum(["test", "live"]),
  PAYSTACK_WEBHOOK_URL: z.string().trim().url(),
  NEXTAUTH_URL: z.string().trim().url(),
  PAYSTACK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
})

function normalizedOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Paystack application URLs must use HTTPS outside local development")
  }
  return url.origin
}

export function loadPlatformPaystackConfig(
  environment: Record<string, string | undefined> = process.env,
): PaystackConnectionConfig {
  const parsed = environmentSchema.parse(environment)
  const keyEnvironment = parsed.PAYSTACK_SECRET_KEY.startsWith("sk_test_")
    ? "test"
    : parsed.PAYSTACK_SECRET_KEY.startsWith("sk_live_")
      ? "live"
      : null

  if (!keyEnvironment) throw new Error("PAYSTACK_SECRET_KEY has an invalid key prefix")
  if (keyEnvironment !== parsed.PAYSTACK_ENV) {
    throw new Error("PAYSTACK_SECRET_KEY does not match PAYSTACK_ENV")
  }

  if (parsed.PAYSTACK_PUBLIC_KEY) {
    const expectedPrefix = parsed.PAYSTACK_ENV === "test" ? "pk_test_" : "pk_live_"
    if (!parsed.PAYSTACK_PUBLIC_KEY.startsWith(expectedPrefix)) {
      throw new Error("PAYSTACK_PUBLIC_KEY does not match PAYSTACK_ENV")
    }
  }

  const applicationOrigin = normalizedOrigin(parsed.NEXTAUTH_URL)
  const webhook = new URL(parsed.PAYSTACK_WEBHOOK_URL)
  if (webhook.origin !== applicationOrigin) {
    throw new Error("PAYSTACK_WEBHOOK_URL must use the configured application origin")
  }

  return {
    secretKey: parsed.PAYSTACK_SECRET_KEY,
    publicKey: parsed.PAYSTACK_PUBLIC_KEY || undefined,
    environment: parsed.PAYSTACK_ENV,
    applicationOrigin,
    webhookUrl: webhook.toString(),
    timeoutMs: parsed.PAYSTACK_TIMEOUT_MS,
  }
}
