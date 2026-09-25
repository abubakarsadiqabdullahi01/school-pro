/**
 * Getting a Nigerian mobile number into the one form that will actually deliver.
 *
 * `08012345678`, `8012345678`, `234 801 234 5678` and `+234-801-234-5678` are the same
 * person, and a gateway will accept some of them and silently drop the rest. The plan for
 * this module put it plainly: normalise when a parent is *saved*, not when a message is
 * sent, so the database holds one shape and the send path has nothing left to guess.
 *
 * Pure on purpose — this decides whether a family hears that results are out, and every
 * branch should be testable without a database or a provider.
 */

/** E.164 for Nigeria. */
const COUNTRY_CODE = "234"

/**
 * Nigerian mobile network prefixes, as the three digits after the country code.
 *
 * Used to tell a mobile number from a landline or a typo of the right length, not to
 * identify the network. Kept deliberately broad: a number on a prefix nobody has heard of
 * is better sent and rejected by the provider than refused here on stale knowledge.
 */
const MOBILE_PREFIX = /^[789]\d{2}$/

export type PhoneResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; reason: string }

/**
 * Strips everything a person might type around a number.
 *
 * Keeps a leading `+` only long enough to recognise it; everything downstream works on
 * digits, because "+2340801..." and "2340801..." have to reach the same place.
 */
function digitsOnly(input: string): string {
  return input.replace(/[^\d]/g, "")
}

/**
 * Normalises a Nigerian mobile number to E.164 (`+234…`).
 *
 * Returns a reason rather than throwing: this runs while somebody is filling in a form, and
 * "that does not look like a Nigerian mobile number" belongs under the field, not in a
 * stack trace.
 */
export function normaliseNigerianPhone(input: string | null | undefined): PhoneResult {
  if (input === null || input === undefined) return { ok: false, reason: "No number given" }

  const trimmed = input.trim()
  if (trimmed.length === 0) return { ok: false, reason: "No number given" }

  let digits = digitsOnly(trimmed)
  if (digits.length === 0) return { ok: false, reason: "That is not a number" }

  // 00 is the old international prefix, still typed by plenty of people.
  if (digits.startsWith("00")) digits = digits.slice(2)

  // Three shapes reach the same ten national digits:
  //   2348012345678  -> already international
  //   08012345678    -> national, with the trunk 0
  //   8012345678     -> national, bare
  let national: string
  if (digits.startsWith(COUNTRY_CODE) && digits.length === 13) {
    national = digits.slice(COUNTRY_CODE.length)
  } else if (digits.startsWith("0") && digits.length === 11) {
    national = digits.slice(1)
  } else if (digits.length === 10) {
    national = digits
  } else if (digits.startsWith(COUNTRY_CODE) && digits.length > 13) {
    return { ok: false, reason: "That number has too many digits" }
  } else {
    return {
      ok: false,
      reason:
        digits.length < 10 ? "That number is too short" : "That number is not the right length",
    }
  }

  if (!MOBILE_PREFIX.test(national.slice(0, 3))) {
    return { ok: false, reason: "That does not look like a Nigerian mobile number" }
  }

  return { ok: true, e164: `+${COUNTRY_CODE}${national}`, national: `0${national}` }
}

/** The stored form, or null when the number cannot be trusted to deliver. */
export function toE164(input: string | null | undefined): string | null {
  const result = normaliseNigerianPhone(input)
  return result.ok ? result.e164 : null
}

/**
 * How a number should be shown back to a person: `0801 234 5678`.
 *
 * Nigerians read their own numbers nationally. Printing `+2348012345678` on a screen is
 * correct and unfriendly, so the E.164 form stays in the database and this is what a
 * bursar checking a recipient list actually sees.
 */
export function formatNigerianPhone(input: string | null | undefined): string {
  const result = normaliseNigerianPhone(input)
  if (!result.ok) return typeof input === "string" ? input.trim() : ""
  const n = result.national
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`
}

/** Whether two numbers are the same person, whatever shape each was typed in. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = toE164(a)
  const right = toE164(b)
  return left !== null && left === right
}
