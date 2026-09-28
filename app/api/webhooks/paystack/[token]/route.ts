import { schoolOwnedWebhookConnection } from "@/lib/payments/payment-settings.server"
import { handlePaystackWebhook } from "@/lib/payments/webhook-route.server"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const connection = await schoolOwnedWebhookConnection(token)
    if (!connection) return Response.json({ accepted: false }, { status: 404 })
    return handlePaystackWebhook(request, connection)
  } catch (error) {
    console.error("School-owned Paystack webhook configuration is unavailable", error)
    return Response.json({ accepted: false }, { status: 503 })
  }
}
