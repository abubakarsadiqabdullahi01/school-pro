import { describe, expect, it } from "vitest"
import {
  formatNigerianPhone,
  normaliseNigerianPhone,
  samePhone,
  toE164,
} from "@/lib/notifications/phone"

/**
 * Normalising a Nigerian mobile number.
 *
 * This decides whether a family hears that results are out. A number stored in a shape the
 * provider quietly drops fails silently - no bounce, no error, just a parent who was never
 * told - so the cases worth pinning down are every shape a person actually types.
 */

const SHAPES = [
  "08012345678",
  "8012345678",
  "2348012345678",
  "+2348012345678",
  "+234 801 234 5678",
  "0801-234-5678",
  "(0801) 234 5678",
  "002348012345678",
  "  08012345678  ",
]

describe("the shapes people type", () => {
  it.each(SHAPES)("reads %s as the same number", (input) => {
    const result = normaliseNigerianPhone(input)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.e164).toBe("+2348012345678")
  })

  it("treats every one of them as the same person", () => {
    for (const shape of SHAPES) {
      expect(samePhone(shape, "08012345678")).toBe(true)
    }
  })
})

describe("numbers that would not deliver", () => {
  it.each([
    ["nothing at all", ""],
    ["only spaces", "   "],
    ["letters", "not a number"],
    ["too short", "0801234"],
    ["too long", "080123456789012"],
    ["a landline prefix", "01234567890"],
    ["an unknown mobile prefix", "06012345678"],
  ])("refuses %s", (_label, input) => {
    expect(normaliseNigerianPhone(input).ok).toBe(false)
  })

  it("refuses null and undefined without throwing", () => {
    expect(normaliseNigerianPhone(null).ok).toBe(false)
    expect(normaliseNigerianPhone(undefined).ok).toBe(false)
  })

  it("gives a reason a person can act on rather than a stack trace", () => {
    const result = normaliseNigerianPhone("0801234")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("That number is too short")
  })
})

describe("toE164", () => {
  it("returns null rather than a number that will be dropped", () => {
    expect(toE164("06012345678")).toBeNull()
    expect(toE164("")).toBeNull()
  })

  it("returns the storable form for a good number", () => {
    expect(toE164("0803 111 2222")).toBe("+2348031112222")
  })
})

describe("formatNigerianPhone", () => {
  it("shows a number the way a Nigerian reads it", () => {
    // +2348012345678 is correct and unfriendly. The E.164 form stays in the database.
    expect(formatNigerianPhone("+2348012345678")).toBe("0801 234 5678")
  })

  it("hands back whatever it was given when it cannot make sense of it", () => {
    // A bursar checking a recipient list needs to see the bad value to fix it, not a blank.
    expect(formatNigerianPhone("nonsense")).toBe("nonsense")
    expect(formatNigerianPhone(null)).toBe("")
  })
})

describe("samePhone", () => {
  it("is false when either side is unusable, rather than true for two blanks", () => {
    expect(samePhone(null, null)).toBe(false)
    expect(samePhone("", "")).toBe(false)
    expect(samePhone("nonsense", "nonsense")).toBe(false)
  })

  it("distinguishes different people", () => {
    expect(samePhone("08012345678", "08012345679")).toBe(false)
  })
})

describe("all three mobile prefix families", () => {
  it.each(["0701", "0802", "0903"])("accepts %s numbers", (prefix) => {
    expect(normaliseNigerianPhone(`${prefix}2345678`).ok).toBe(true)
  })
})
