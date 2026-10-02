import { describe, expect, it } from "vitest"

import { explainDeliveryNote, providerScheduledFor, scheduledNote } from "./delivery-notes"

const SCHEDULED = "Your message has been scheduled to deliver at the following time(s): 2026-10-02 08:15:00. This is due to the time restriction"
const LINK = "The link (schoolpro.digisoft.com.ng) is not approved for your account. Kindly submit it for approval on the Approved Links page"

describe("a SmartSMS scheduled delivery", () => {
  it("is read from SmartSMS's own words and from the note the app stores", () => {
    expect(providerScheduledFor(SCHEDULED)).toBe("2026-10-02 08:15")
    expect(providerScheduledFor(scheduledNote("2026-10-02 08:15"))).toBe("2026-10-02 08:15")
  })

  it("is not mistaken in an ordinary refusal", () => {
    expect(providerScheduledFor(LINK)).toBeNull()
    expect(providerScheduledFor(null)).toBeNull()
  })

  it("is explained as accepted, with a warning not to retry", () => {
    const note = explainDeliveryNote(SCHEDULED, "FAILED")
    expect(note).toMatchObject({ tone: "info", summary: expect.stringMatching(/will deliver it at 2026-10-02 08:15/) })
    expect(note?.advice).toMatch(/Do not retry/)
  })
})

describe("explaining a provider note", () => {
  it("names the unapproved link and what to do about it", () => {
    expect(explainDeliveryNote(LINK, "FAILED")).toMatchObject({
      tone: "error",
      summary: expect.stringMatching(/\(schoolpro\.digisoft\.com\.ng\)/),
      advice: expect.stringMatching(/Approved Links/),
    })
  })

  it("covers a wallet that ran out, a sender name and a bad token", () => {
    expect(explainDeliveryNote("Insufficient SMS units in the SmartSMS wallet", "FAILED")?.advice).toMatch(/Top up/)
    expect(explainDeliveryNote("Sender ID not approved", "FAILED")?.summary).toMatch(/sender name/)
    expect(explainDeliveryNote("Invalid token supplied", "FAILED")?.advice).toMatch(/SMARTSMS_API_TOKEN/)
  })

  it("says nothing when there is nothing to say", () => {
    expect(explainDeliveryNote(null, "SENT")).toBeNull()
  })
})
