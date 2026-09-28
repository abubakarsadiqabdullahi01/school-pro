import { describe, expect, it } from "vitest"

import { loadPlatformPaystackConfig } from "./paystack-config.server"

const baseEnvironment = {
  PAYSTACK_SECRET_KEY: "sk_test_example-not-a-real-secret",
  PAYSTACK_PUBLIC_KEY: "pk_test_example-not-a-real-key",
  PAYSTACK_ENV: "test",
  PAYSTACK_WEBHOOK_URL: "https://schoolpro.digisoft.com.ng/api/webhooks/paystack/",
  NEXTAUTH_URL: "https://schoolpro.digisoft.com.ng",
}

describe("loadPlatformPaystackConfig", () => {
  it("loads a matching test configuration", () => {
    const config = loadPlatformPaystackConfig(baseEnvironment)

    expect(config.environment).toBe("test")
    expect(config.applicationOrigin).toBe("https://schoolpro.digisoft.com.ng")
    expect(config.timeoutMs).toBe(10_000)
  })

  it("rejects a test secret in live mode", () => {
    expect(() => loadPlatformPaystackConfig({ ...baseEnvironment, PAYSTACK_ENV: "live" })).toThrow(
      "does not match PAYSTACK_ENV",
    )
  })

  it("rejects a webhook on another origin", () => {
    expect(() =>
      loadPlatformPaystackConfig({
        ...baseEnvironment,
        PAYSTACK_WEBHOOK_URL: "https://attacker.example/webhook",
      }),
    ).toThrow("configured application origin")
  })

  it("allows HTTP only for local development", () => {
    const config = loadPlatformPaystackConfig({
      ...baseEnvironment,
      NEXTAUTH_URL: "http://localhost:3000",
      PAYSTACK_WEBHOOK_URL: "http://localhost:3000/api/webhooks/paystack/",
    })
    expect(config.applicationOrigin).toBe("http://localhost:3000")
  })
})
