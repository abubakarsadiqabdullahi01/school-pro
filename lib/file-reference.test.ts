import { describe, expect, it } from "vitest"

import { isLogoReference } from "@/lib/file-reference"

describe("isLogoReference", () => {
  it("accepts generated local school logo references", () => {
    expect(
      isLogoReference(
        "/api/files/school-logos/school_1/550e8400-e29b-41d4-a716-446655440000.webp",
      ),
    ).toBe(true)
  })

  it("accepts legacy http and https logo URLs", () => {
    expect(isLogoReference("https://assets.example.com/logo.png")).toBe(true)
    expect(isLogoReference("http://assets.example.com/logo.jpg")).toBe(true)
  })

  it.each([
    "/api/files/expense-receipts/school/550e8400-e29b-41d4-a716-446655440000.pdf",
    "/api/files/school-logos/../../secret.png",
    "//evil.example/logo.png",
    "javascript:alert(1)",
    "logo.png",
  ])("rejects an invalid logo reference: %s", (value) => {
    expect(isLogoReference(value)).toBe(false)
  })
})
