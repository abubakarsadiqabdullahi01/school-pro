import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  decryptGatewaySecret,
  encryptGatewaySecret,
  loadGatewayEncryptionKey,
  newGatewayWebhookToken,
} from "./gateway-credentials.server"

describe("school-owned gateway credentials", () => {
  it("encrypts and decrypts only for the owning configuration", () => {
    const key = randomBytes(32)
    const encrypted = encryptGatewaySecret("sk_test_not-a-real-secret-1234", "configuration-1", key)

    expect(encrypted.encryptedSecret).not.toContain("sk_test_")
    expect(encrypted.secretLast4).toBe("1234")
    expect(decryptGatewaySecret(encrypted, "configuration-1", key)).toBe("sk_test_not-a-real-secret-1234")
    expect(() => decryptGatewaySecret(encrypted, "configuration-2", key)).toThrow("could not be decrypted")
  })

  it("rejects a wrong master key", () => {
    const encrypted = encryptGatewaySecret("sk_live_not-a-real-secret-9876", "configuration-1", randomBytes(32))
    expect(() => decryptGatewaySecret(encrypted, "configuration-1", randomBytes(32))).toThrow("could not be decrypted")
  })

  it("requires an exact base64-encoded 32-byte environment key", () => {
    const value = randomBytes(32).toString("base64")
    expect(loadGatewayEncryptionKey(value)).toHaveLength(32)
    expect(() => loadGatewayEncryptionKey("too-short")).toThrow("exactly 32 random bytes")
  })

  it("creates opaque unique webhook selectors", () => {
    const first = newGatewayWebhookToken()
    const second = newGatewayWebhookToken()
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).not.toBe(first)
  })
})
