import { Prisma } from "@prisma/client"

/**
 * Money handling.
 *
 * `FeeStructure.amount` and `Payment.amount` are `Decimal(12,2)`, not `Float`. Prisma hands
 * those back as `Prisma.Decimal`, which deliberately does not support `+` or
 * `toLocaleString()` — so the type checker points at every place money is read, instead of
 * letting float arithmetic quietly drift.
 *
 * The rules:
 *  - Sum with `sumAmounts`, never with `reduce((a, b) => a + b)`.
 *  - Format with `formatNaira` at the edge, right before rendering.
 *  - Use `toNumber` only when handing a value to something that demands a plain number
 *    (a chart, a JSON payload). Never sum plain numbers back into a total.
 */

export type Money = Prisma.Decimal | number | string

/** Adds any number of amounts exactly. Returns a Decimal, so the result stays exact. */
export function sumAmounts(amounts: Money[]): Prisma.Decimal {
  return amounts.reduce<Prisma.Decimal>(
    (total, amount) => total.plus(new Prisma.Decimal(amount)),
    new Prisma.Decimal(0),
  )
}

/**
 * Formats for display in Naira: `₦24,523.00`. Pass `{ kobo: false }` to drop the decimals
 * where whole Naira reads better, as on a summary tile.
 */
export function formatNaira(amount: Money, options?: { kobo?: boolean }): string {
  const showKobo = options?.kobo ?? true
  const value = new Prisma.Decimal(amount).toNumber()

  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: showKobo ? 2 : 0,
    maximumFractionDigits: showKobo ? 2 : 0,
  })}`
}

/**
 * Formats for a PDF or any other export that cannot carry the naira sign.
 *
 * jsPDF's built-in fonts are WinAnsi-encoded, which has no ₦, so `formatNaira` lands in a
 * generated PDF as the wrong glyph or none at all. The ISO code always prints.
 */
export function formatNairaPlain(amount: Money, options?: { kobo?: boolean }): string {
  return formatNaira(amount, options).replace("₦", "NGN ")
}

/**
 * The bare value for a CSV cell: no symbol and no grouping, so a spreadsheet reads the
 * column as numbers rather than as text it refuses to sum.
 */
export function toCsvAmount(amount: Money): string {
  return new Prisma.Decimal(amount).toFixed(2)
}

/**
 * Converts to a plain number, for a boundary that cannot take a Decimal — a chart series,
 * or a value crossing into a client component. Loses exactness, so never sum the results.
 */
export function toNumber(amount: Money): number {
  return new Prisma.Decimal(amount).toNumber()
}
