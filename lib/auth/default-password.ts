/**
 * The password a school account is created with, and the one a reset returns it to.
 *
 * The rule is the registration year — the same year printed on the admission number and
 * shown as "Registration Date" on the person's detail page. A bursar handing out fifty
 * logins in a morning can say it once and be understood, and a learner who forgets it can
 * work it out from their own admission number.
 *
 * That convenience is the whole point, and it is also the whole risk: the year is four
 * digits, it is the same for everyone admitted in that intake, and it is derivable from
 * information the school prints on documents. It is safe only as a *first* password, used
 * once and replaced. Anything that keeps it is one guess away from being read by anybody
 * who knows an admission number.
 *
 * So it is deliberately not used for accounts that can change other people's records:
 * administrators and finance staff keep `generateTemporaryPassword`. See
 * [[lib/temporary-password.ts]].
 */

/** Four digits, as a string — bcrypt hashes it like any other password. */
export function defaultPasswordForYear(year: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) {
    throw new Error(`${year} is not a usable registration year`)
  }
  return String(year)
}

/**
 * The default for a person registered on `date`, falling back to today.
 *
 * `null` and `undefined` both mean "no registration date recorded", which happens on
 * records imported before the field existed; today's year is the honest answer there,
 * because that is when the account is being created.
 */
export function defaultPasswordForDate(date: Date | null | undefined, now = new Date()): string {
  const source = date && !Number.isNaN(date.getTime()) ? date : now
  return defaultPasswordForYear(source.getFullYear())
}

/**
 * A student's default, preferring the admission year held on the student record over the
 * date the row happened to be written. They differ whenever a school enters last year's
 * intake late, and the admission number says the former.
 */
export function defaultPasswordForStudent(
  student: { year?: number | null; createdAt?: Date | null },
  now = new Date(),
): string {
  if (typeof student.year === "number" && Number.isInteger(student.year)) {
    return defaultPasswordForYear(student.year)
  }
  return defaultPasswordForDate(student.createdAt, now)
}

/** What the screen tells the person handing the password over. */
export const DEFAULT_PASSWORD_NOTE =
  "This is the registration year, so it is easy to pass on and easy to guess. " +
  "Ask them to change it the first time they sign in."
