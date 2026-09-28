import { describe, expect, it } from "vitest"
import { generateTemporaryPassword } from "@/lib/temporary-password"

describe("generateTemporaryPassword", () => {
  it("creates a strong password without predictable account data", () => {
    const password = generateTemporaryPassword()
    expect(password.length).toBeGreaterThanOrEqual(12)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%*\-_]/)
  })

  it("does not repeat a fixed default", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()))
    expect(passwords.size).toBe(20)
  })
})
