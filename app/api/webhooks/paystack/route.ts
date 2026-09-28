import { loadPlatformPaystackConfig } from "@/lib/payments/paystack-config.server"
import { handlePaystackWebhook } from "@/lib/payments/webhook-route.server"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const config = loadPlatformPaystackConfig()
    return handlePaystackWebhook(request, {
      secretKey: config.secretKey,
      environment: config.environment === "test" ? "TEST" : "LIVE",
    })
  } catch (error) {
    console.error("Platform Paystack webhook configuration is unavailable", error)
    return Response.json({ accepted: false }, { status: 503 })
  }
}
