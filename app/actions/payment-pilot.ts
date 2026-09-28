"use server"

import { requireRole } from "@/lib/authz"
import { collectPaymentHealth } from "@/lib/payments/payment-health.server"

type Result<T> = { success: true; data: T } | { success: false; error: string }

/** The Slice 8 pilot monitor: every school's payment health, for the platform owner only. */
export async function getPaymentPilotMonitor(): Promise<Result<Awaited<ReturnType<typeof collectPaymentHealth>> & { generatedAt: string }>> {
  try {
    await requireRole("SUPER_ADMIN")
    return { success: true, data: { ...(await collectPaymentHealth()), generatedAt: new Date().toISOString() } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not load the payment monitor" }
  }
}
