import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"

export const smartSmsEmailEventSchema = z.object({
  event_type: z.enum(["delivery", "open", "click", "bounce", "complaint", "unsubscribe"]),
  ems_id: z.union([z.string(), z.number()]).transform(String),
  to_email: z.string().email(),
  message_type: z.enum(["authentication", "transactional", "operational", "marketing"]),
  processed_at: z.string().datetime({ offset: true }),
  bounce_type: z.enum(["hard", "soft", "transient"]).nullable().optional(),
}).passthrough()

export function verifySmartSmsEmailWebhook(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || !timestamp || !/^\d{10}$/.test(timestamp)) return false
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false
  const expected = createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest("hex")
  const expectedBytes = Buffer.from(expected, "hex"); const receivedBytes = Buffer.from(signature, "hex")
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
}
