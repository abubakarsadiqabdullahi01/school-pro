import { describe, expect, it } from "vitest"

import { amountInWords, numberToWords } from "@/lib/amount-in-words"

describe("numberToWords", () => {
  it("handles the small numbers, including the irregular teens", () => {
    expect(numberToWords(0)).toBe("Zero")
    expect(numberToWords(7)).toBe("Seven")
    expect(numberToWords(13)).toBe("Thirteen")
    expect(numberToWords(20)).toBe("Twenty")
    expect(numberToWords(42)).toBe("Forty-Two")
  })

  it("puts 'and' between hundreds and the rest, as English does", () => {
    expect(numberToWords(100)).toBe("One Hundred")
    expect(numberToWords(105)).toBe("One Hundred and Five")
    expect(numberToWords(999)).toBe("Nine Hundred and Ninety-Nine")
  })

  it("groups into thousands, millions and billions", () => {
    expect(numberToWords(1000)).toBe("One Thousand")
    expect(numberToWords(20000)).toBe("Twenty Thousand")
    expect(numberToWords(52500)).toBe("Fifty-Two Thousand Five Hundred")
    expect(numberToWords(1000000)).toBe("One Million")
    expect(numberToWords(2500000)).toBe("Two Million Five Hundred Thousand")
  })

  it("skips empty groups rather than saying 'zero thousand'", () => {
    expect(numberToWords(1000005)).toBe("One Million Five")
  })
})

describe("amountInWords", () => {
  it("writes a whole amount the way a receipt does", () => {
    expect(amountInWords(20000)).toBe("Twenty Thousand Naira Only")
    expect(amountInWords(52500)).toBe("Fifty-Two Thousand Five Hundred Naira Only")
  })

  it("names the kobo when there are any", () => {
    expect(amountInWords("1500.50")).toBe("One Thousand Five Hundred Naira Fifty Kobo Only")
  })

  it("leaves kobo out when the amount is whole", () => {
    expect(amountInWords("1500.00")).toBe("One Thousand Five Hundred Naira Only")
  })

  it("rounds the kobo rather than dropping it, so words match the figure", () => {
    expect(amountInWords("10.005")).toBe("Ten Naira One Kobo Only")
  })

  it("handles zero, which a refunded or voided receipt can show", () => {
    expect(amountInWords(0)).toBe("Zero Naira Only")
  })

  it("marks a negative amount rather than silently dropping the sign", () => {
    expect(amountInWords(-500)).toBe("Minus Five Hundred Naira Only")
  })
})
