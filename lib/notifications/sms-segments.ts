/**
 * How many SMS a message will actually cost.
 *
 * A bursar pressing "send" to four hundred families is spending real money, and the plan
 * for this module asks for the recipient count and an estimated cost *before* they commit.
 * That estimate is only honest if it counts the way the network bills: in segments, not in
 * messages, and with a smaller allowance the moment a single non-GSM character appears.
 *
 * The trap this exists to stop is a curly apostrophe. Typing "Your child's result" with the
 * apostrophe a word processor produces pushes the whole message out of the GSM alphabet and
 * roughly halves the characters per segment, so a 150-character note that cost one SMS
 * yesterday costs three today and nothing on screen looks different.
 *
 * Pure, so the arithmetic behind a bill can be tested exhaustively.
 */

/**
 * The GSM 03.38 basic alphabet.
 *
 * Anything outside it forces the whole message into UCS-2. Kept as a literal set rather
 * than a clever range test because that is what the specification is.
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"

/** These cost two characters each in GSM, because they are sent as an escape plus a code. */
const GSM_EXTENDED = "^{}\\[~]|€"

const GSM_CHARS = new Set([...GSM_BASIC])
const GSM_EXTENDED_CHARS = new Set([...GSM_EXTENDED])

export type SmsEncoding = "GSM_7BIT" | "UCS2"

export type SmsCost = {
  encoding: SmsEncoding
  /** Billable units in the chosen encoding — extended GSM characters count as two. */
  units: number
  /** How many SMS this becomes. Always at least 1, even for an empty body. */
  segments: number
  /** Units still available inside the current segment. */
  remainingInSegment: number
  /**
   * The first character that forced UCS-2, when one did.
   *
   * Surfaced so a screen can say "the ’ in line 2 is costing you double" rather than
   * leaving somebody to guess why an innocuous message got expensive.
   */
  forcedBy: string | null
}

// Single-segment limits, then the smaller per-segment limit once a message is split and
// each part has to carry a concatenation header.
const GSM_SINGLE = 160
const GSM_MULTI = 153
const UCS2_SINGLE = 70
const UCS2_MULTI = 67

/**
 * Counts what a body will cost to send.
 *
 * An empty message is reported as one segment rather than zero: providers bill for the
 * attempt, and reporting zero would understate a mistake rather than reveal it.
 */
export function measureSms(body: string): SmsCost {
  let units = 0
  let forcedBy: string | null = null

  for (const char of body) {
    if (GSM_EXTENDED_CHARS.has(char)) {
      units += 2
      continue
    }
    if (GSM_CHARS.has(char)) {
      units += 1
      continue
    }
    // One character outside the alphabet re-encodes the entire message, so there is no
    // point counting further in GSM terms.
    forcedBy ??= char
    units += 1
  }

  if (forcedBy !== null) {
    // UCS-2 counts UTF-16 code units, so an emoji beyond the basic plane costs two.
    units = [...body].reduce((total, char) => total + (char.codePointAt(0)! > 0xffff ? 2 : 1), 0)
  }

  const single = forcedBy === null ? GSM_SINGLE : UCS2_SINGLE
  const multi = forcedBy === null ? GSM_MULTI : UCS2_MULTI

  const segments = units <= single ? 1 : Math.ceil(units / multi)
  const capacity = segments === 1 ? single : segments * multi

  return {
    encoding: forcedBy === null ? "GSM_7BIT" : "UCS2",
    units,
    segments: Math.max(1, segments),
    remainingInSegment: Math.max(0, capacity - units),
    forcedBy,
  }
}

export type SendEstimate = {
  recipients: number
  segmentsEach: number
  totalSegments: number
  encoding: SmsEncoding
  /** Null when the school has not said what it pays per segment. */
  estimatedCost: number | null
  forcedBy: string | null
}

/**
 * What a send will cost in total.
 *
 * `costPerSegment` is the school's own rate; null means they have not entered one, and the
 * screen should say so rather than invent a figure a bursar might rely on.
 */
export function estimateSend(
  body: string,
  recipients: number,
  costPerSegment: number | null = null,
): SendEstimate {
  const measured = measureSms(body)
  const totalSegments = measured.segments * Math.max(0, recipients)

  return {
    recipients: Math.max(0, recipients),
    segmentsEach: measured.segments,
    totalSegments,
    encoding: measured.encoding,
    estimatedCost:
      costPerSegment === null || !Number.isFinite(costPerSegment)
        ? null
        : Math.round(totalSegments * costPerSegment * 100) / 100,
    forcedBy: measured.forcedBy,
  }
}

/**
 * Replaces the characters that quietly double the bill with their plain equivalents.
 *
 * Offered to the composer rather than applied automatically: a school writing in a language
 * that genuinely needs UCS-2 must not have its message silently mangled to save money.
 */
export function toGsmSafe(body: string): string {
  return body
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
}
