import { Prisma } from "@prisma/client"

import type { Money } from "@/lib/money"

/**
 * An amount written out in words, as a Nigerian receipt is expected to carry it.
 *
 * It is not decoration. The figure can be altered with a pen; "Twenty Thousand Naira Only"
 * cannot, which is why every bank and school receipt in the country prints both. A receipt
 * that shows only ₦20,000.00 is one digit away from ₦120,000.00.
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
]

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

/** Scale names in the short scale, which is what Nigerian banking uses. */
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"]

/** 0–999 in words. Empty string for 0, so a caller can drop empty groups. */
function underThousand(value: number): string {
  if (value === 0) return ""

  const parts: string[] = []
  const hundreds = Math.floor(value / 100)
  const rest = value % 100

  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`)

  if (rest > 0) {
    if (hundreds > 0) parts.push("and")
    if (rest < 20) {
      parts.push(ONES[rest])
    } else {
      const tens = Math.floor(rest / 10)
      const ones = rest % 10
      parts.push(ones > 0 ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens])
    }
  }

  return parts.join(" ")
}

/** A whole number in words. "Zero" for 0. */
export function numberToWords(value: number): string {
  if (!Number.isFinite(value)) return ""
  const whole = Math.floor(Math.abs(value))
  if (whole === 0) return "Zero"

  const groups: string[] = []
  let remaining = whole
  let scale = 0

  while (remaining > 0 && scale < SCALES.length) {
    const group = remaining % 1000
    if (group > 0) {
      const words = underThousand(group)
      groups.unshift(scale > 0 ? `${words} ${SCALES[scale]}` : words)
    }
    remaining = Math.floor(remaining / 1000)
    scale++
  }

  const words = groups.join(" ")
  return value < 0 ? `Minus ${words}` : words
}

/**
 * A money amount in words, ending in "Only" as a receipt does — the word that marks where
 * the amount stops so nothing can be appended to it.
 */
export function amountInWords(amount: Money): string {
  const value = new Prisma.Decimal(amount)
  const negative = value.isNegative()
  const absolute = value.abs()

  const naira = absolute.floor().toNumber()
  // Rounded rather than truncated: 0.005 is a kobo, and dropping it would make the words
  // disagree with the figure printed beside them.
  const kobo = absolute.minus(absolute.floor()).times(100).round().toNumber()

  const nairaWords = `${numberToWords(naira)} Naira`
  const koboWords = kobo > 0 ? ` ${numberToWords(kobo)} Kobo` : ""

  return `${negative ? "Minus " : ""}${nairaWords}${koboWords} Only`
}
