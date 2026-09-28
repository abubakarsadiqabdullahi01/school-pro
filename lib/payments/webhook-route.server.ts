import { after } from "next/server"

import { processGatewayEvent } from "./gateway-event-processor.server"
import { acceptPaystackWebhook, type WebhookConnection } from "./webhook-inbox.server"

const PAYSTACK_SOURCE_IPS = new Set(["52.31.139.75", "52.49.173.169", "52.214.14.220"])

function sourceIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? null
}

export async function handlePaystackWebhook(request: Request, connection: WebhookConnection): Promise<Response> {
  if (process.env.PAYSTACK_WEBHOOK_ENFORCE_IP === "true") {
    const ip = sourceIp(request)
    if (!ip || !PAYSTACK_SOURCE_IPS.has(ip)) return Response.json({ accepted: false }, { status: 403 })
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    return Response.json({ accepted: false }, { status: 413 })
  }

  try {
    const rawBody = Buffer.from(await request.arrayBuffer())
    const accepted = await acceptPaystackWebhook(
      rawBody,
      request.headers.get("x-paystack-signature"),
      connection,
    )
    after(() => processGatewayEvent(accepted.eventId))
    return Response.json({ accepted: true, duplicate: accepted.duplicate })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("signature")) return Response.json({ accepted: false }, { status: 401 })
    if (message.includes("body") || message.includes("JSON") || message.includes("environment")) {
      return Response.json({ accepted: false }, { status: 400 })
    }
    console.error("Paystack webhook could not be durably accepted", error)
    return Response.json({ accepted: false }, { status: 503 })
  }
}
