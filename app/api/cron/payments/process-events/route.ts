import { processPendingGatewayEvents } from "@/lib/payments/gateway-event-processor.server"
import { recoverStaleGatewayTransactions } from "@/lib/payments/transaction-verification.server"
import { verifyBearerSecret } from "@/lib/payments/webhook-security"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_CRON_SECRET ?? ""
  if (!verifyBearerSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false }, { status: 401 })
  }
  try {
    const [events, transactions] = await Promise.all([
      processPendingGatewayEvents(25),
      recoverStaleGatewayTransactions(25),
    ])
    return Response.json({ ok: true, summary: { events, transactions } })
  } catch (error) {
    console.error("Payment event recovery failed", error)
    return Response.json({ ok: false }, { status: 500 })
  }
}
