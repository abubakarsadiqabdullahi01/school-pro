import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { smartSmsEmailEventSchema, verifySmartSmsEmailWebhook } from "./smartsms-webhook"

describe("SmartSMS email webhook security", () => {
  const secret = "test-webhook-secret-32-characters"
  const timestamp = "1790451000"
  const raw = Buffer.from('{"event_type":"delivery","ems_id":5842,"to_email":"parent@example.com","message_type":"transactional","processed_at":"2026-09-26T10:00:00Z","bounce_type":null}')
  const signature = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex")

  it("accepts the exact signed bytes inside the five-minute window", () => {
    expect(verifySmartSmsEmailWebhook(raw, signature, timestamp, secret, 1790451000)).toBe(true)
  })
  it("rejects tampering, stale timestamps and malformed signatures", () => {
    expect(verifySmartSmsEmailWebhook(Buffer.from(`${raw.toString()} `), signature, timestamp, secret, 1790451000)).toBe(false)
    expect(verifySmartSmsEmailWebhook(raw, signature, timestamp, secret, 1790451301)).toBe(false)
    expect(verifySmartSmsEmailWebhook(raw, "bad", timestamp, secret, 1790451000)).toBe(false)
  })
  it("keeps provider message ids as strings", () => {
    expect(smartSmsEmailEventSchema.parse(JSON.parse(raw.toString())).ems_id).toBe("5842")
  })
})
