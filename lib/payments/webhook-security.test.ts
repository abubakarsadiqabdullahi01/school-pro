import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"

import { paystackPayloadHash, verifyBearerSecret, verifyPaystackSignature } from "./webhook-security"

describe("Paystack webhook security", () => {
  const raw = Buffer.from('{"event":"charge.success","data":{"reference":"DSP-1"}}')
  const secret = "sk_test_not-a-real-secret"

  it("verifies the exact raw bytes using HMAC SHA512", () => {
    const signature = createHmac("sha512", secret).update(raw).digest("hex")
    expect(verifyPaystackSignature(raw, signature, secret)).toBe(true)
    expect(verifyPaystackSignature(Buffer.from(`${raw.toString()} `), signature, secret)).toBe(false)
  })

  it("rejects missing, malformed, and wrong signatures", () => {
    expect(verifyPaystackSignature(raw, null, secret)).toBe(false)
    expect(verifyPaystackSignature(raw, "not-hex", secret)).toBe(false)
    expect(verifyPaystackSignature(raw, "0".repeat(128), secret)).toBe(false)
  })

  it("creates a stable payload hash for deduplication", () => {
    expect(paystackPayloadHash(raw)).toMatch(/^[a-f0-9]{64}$/)
    expect(paystackPayloadHash(raw)).toBe(paystackPayloadHash(Buffer.from(raw)))
  })

  it("compares cron bearer secrets without ordinary string equality", () => {
    const cronSecret = "this-is-a-long-test-cron-secret"
    expect(verifyBearerSecret(`Bearer ${cronSecret}`, cronSecret)).toBe(true)
    expect(verifyBearerSecret("Bearer wrong", cronSecret)).toBe(false)
  })
})
