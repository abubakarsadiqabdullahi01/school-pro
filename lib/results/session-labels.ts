/**
 * Labels for a sessional report, as plain functions with no database behind them.
 *
 * Kept out of `session-report.server.ts` deliberately. That module imports Prisma, and the
 * moment a client component imported a *value* from it — a type import is erased, a function
 * is not — the bundler followed the chain into `@prisma/adapter-mariadb` and the MariaDB
 * driver, which requires `fs`, and the whole app failed to build with "Can't resolve 'fs'".
 *
 * Anything both a server action and a button need belongs here.
 */

/** "First Term" -> "1st". Anything unrecognised keeps its own name. */
export function termOrdinal(name: string): string {
  const match = name.match(/first|second|third|fourth/i)?.[0]?.toLowerCase()
  return { first: "1st", second: "2nd", third: "3rd", fourth: "4th" }[match ?? ""] ?? name
}

/**
 * A short name for the period a sessional card covers.
 *
 * "Sessional Summary (First Term, Second Term, Third Term)" ran off the edge of the card's
 * Term field and was cut mid-word. This says the same thing in a quarter of the space, and
 * it still adapts: a session with one term names that term rather than pretending to a range.
 */
export function sessionTermLabel(terms: ReadonlyArray<{ name: string }>): string {
  const ordinal = termOrdinal

  if (terms.length === 0) return "Sessional Summary"
  if (terms.length === 1) return `Sessional (${ordinal(terms[0]!.name)} Term)`
  return `Sessional (${ordinal(terms[0]!.name)}–${ordinal(terms[terms.length - 1]!.name)} Term)`
}

/**
 * The five score-column labels a sessional card uses, in the generator's order.
 *
 * A termly card marks three CAs and an exam; a sessional card marks three terms and totals
 * them. Same columns, same widths, different headings.
 */
export function sessionScoreHeaders(
  terms: ReadonlyArray<{ name: string }>,
): [string, string, string, string, string] {
  // "1st Term", not "First Term". The column is about 14mm wide and "Second"
  // wrapped mid-word into "Secon / d Term" on the printed card.
  const label = (index: number) => {
    const name = terms[index]?.name
    return name ? `${termOrdinal(name)}\nTerm` : "\u2014"
  }
  return [label(0), label(1), label(2), "Total", "Average"]
}
