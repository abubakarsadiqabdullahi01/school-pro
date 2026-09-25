import { describe, expect, it } from "vitest"
import { estimateSend, measureSms, toGsmSafe } from "@/lib/notifications/sms-segments"

/**
 * Counting what a send will cost.
 *
 * A bursar texting four hundred families is spending real money against an estimate this
 * module produces. The case that matters most is the invisible one: a curly apostrophe
 * from a word processor forces the whole message into UCS-2 and roughly halves the
 * characters per segment, so the same-looking note silently costs three times as much.
 */

describe("plain GSM messages", () => {
  it("fits 160 characters in one segment", () => {
    const result = measureSms("a".repeat(160))
    expect(result.encoding).toBe("GSM_7BIT")
    expect(result.segments).toBe(1)
    expect(result.remainingInSegment).toBe(0)
  })

  it("splits at 161, and each part then carries a concatenation header", () => {
    const result = measureSms("a".repeat(161))
    expect(result.segments).toBe(2)
    // 2 x 153, not 2 x 160 - the header costs seven characters per part.
    expect(result.remainingInSegment).toBe(306 - 161)
  })

  it("reports an empty message as one segment, not zero", () => {
    // Providers bill for the attempt. Reporting zero would hide a mistake.
    expect(measureSms("").segments).toBe(1)
  })

  it("counts an extended character as two", () => {
    // ^{}[]~|\ and the euro sign are sent as an escape plus a code.
    expect(measureSms("€").units).toBe(2)
    expect(measureSms("a".repeat(159) + "€").segments).toBe(2)
  })
})

describe("the curly apostrophe trap", () => {
  const straight = "Your child's result is ready"
  const curly = "Your child’s result is ready"

  it("keeps a straight apostrophe in GSM", () => {
    expect(measureSms(straight).encoding).toBe("GSM_7BIT")
  })

  it("forces the whole message to UCS-2 on one curly one", () => {
    const result = measureSms(curly)
    expect(result.encoding).toBe("UCS2")
    expect(result.forcedBy).toBe("’")
  })

  it("roughly triples the cost of a message that looks identical", () => {
    const body = "A".repeat(150)
    const cheap = measureSms(body)
    const dear = measureSms(body + "’")

    expect(cheap.segments).toBe(1)
    expect(dear.segments).toBe(3)
  })

  it("names the character that did it, so a screen can point at it", () => {
    expect(measureSms("Fees — due").forcedBy).toBe("—")
  })

  it("says nothing forced it when nothing did", () => {
    expect(measureSms("Fees - due").forcedBy).toBeNull()
  })
})

describe("UCS-2 messages", () => {
  it("fits 70 units in one segment", () => {
    expect(measureSms("’".repeat(70)).segments).toBe(1)
    expect(measureSms("’".repeat(71)).segments).toBe(2)
  })

  it("counts an astral character as two units", () => {
    // An emoji beyond the basic plane is a surrogate pair on the wire.
    expect(measureSms("\u{1F600}").units).toBe(2)
  })
})

describe("estimateSend", () => {
  it("multiplies segments by recipients", () => {
    const estimate = estimateSend("a".repeat(200), 100)
    expect(estimate.segmentsEach).toBe(2)
    expect(estimate.totalSegments).toBe(200)
  })

  it("costs the send at the school's own rate", () => {
    const estimate = estimateSend("a".repeat(200), 100, 3.5)
    expect(estimate.estimatedCost).toBe(700)
  })

  it("returns no figure at all when the school has not entered a rate", () => {
    // Better than inventing one a bursar might rely on.
    expect(estimateSend("hello", 10).estimatedCost).toBeNull()
  })

  it("does not go negative on a nonsense recipient count", () => {
    const estimate = estimateSend("hello", -5, 3)
    expect(estimate.recipients).toBe(0)
    expect(estimate.totalSegments).toBe(0)
    expect(estimate.estimatedCost).toBe(0)
  })

  it("carries the forcing character through to the estimate", () => {
    expect(estimateSend("Fees — due", 10).forcedBy).toBe("—")
    expect(estimateSend("Fees — due", 10).encoding).toBe("UCS2")
  })
})

describe("toGsmSafe", () => {
  it("replaces the characters that quietly double the bill", () => {
    const cleaned = toGsmSafe("Your child’s “result” — ready…")
    expect(measureSms(cleaned).encoding).toBe("GSM_7BIT")
    expect(cleaned).toBe('Your child\'s "result" - ready...')
  })

  it("leaves a message that was already safe exactly as it was", () => {
    const body = "Fees are due. Please pay at the office."
    expect(toGsmSafe(body)).toBe(body)
  })

  it("does not touch characters a school may genuinely need", () => {
    // Offered, not applied automatically - a school writing in a script that needs UCS-2
    // must not have its message mangled to save money.
    const arabic = "النتيجة"
    expect(toGsmSafe(arabic)).toBe(arabic)
    expect(measureSms(toGsmSafe(arabic)).encoding).toBe("UCS2")
  })
})
