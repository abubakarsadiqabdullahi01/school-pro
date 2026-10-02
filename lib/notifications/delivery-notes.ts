/**
 * What a provider's note on a message means, in words a bursar can act on.
 *
 * SmartSMS answers in its own phrasing ("Your message has been scheduled to deliver at the
 * following time(s)…", "The link … is not approved for your account…"), and the history
 * showed it raw, truncated, in red, next to a Retry button. Some of those notes are not
 * failures at all, and retrying one would send and charge the message twice. Pure, so the
 * screen and the retry guard read a note the same way.
 */

export type DeliveryNote = {
  tone: "info" | "warning" | "error"
  summary: string
  advice: string
}

const SCHEDULED = /scheduled to deliver at the following time\(s\):\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2})/i

/** When SmartSMS has accepted a message and is holding it for later, the time it named. */
export function providerScheduledFor(note: string | null | undefined): string | null {
  const match = note ? SCHEDULED.exec(note) : null
  return match ? match[1]!.replace("T", " ") : null
}

/** The note SmartSMS's "scheduled" reply is stored as, once it counts as sent. */
export function scheduledNote(when: string): string {
  return `SmartSMS accepted this message. It has been scheduled to deliver at the following time(s): ${when}`
}

export function explainDeliveryNote(note: string | null | undefined, status: string): DeliveryNote | null {
  if (!note) return null
  const scheduledFor = providerScheduledFor(note)
  if (scheduledFor) {
    return {
      tone: "info",
      summary: `SmartSMS accepted this message and will deliver it at ${scheduledFor}.`,
      advice: "Messages to numbers on Do-Not-Disturb go through SmartSMS's corporate route, which does not deliver at night. "
        + "Nothing needs doing. Do not retry it: that would send, and charge for, the message twice.",
    }
  }
  if (/link.*not approved|approved links?/i.test(note)) {
    const domain = /link \(([^)]+)\)/i.exec(note)?.[1]
    return {
      tone: "error",
      summary: `SmartSMS blocks web links it has not approved${domain ? ` (${domain})` : ""}, and this message contains one.`,
      advice: "In SmartSMS, open Approved Links and submit the school's web address for approval. Once it is approved, retry this message.",
    }
  }
  if (/insufficient/i.test(note)) {
    return { tone: "error", summary: "The SmartSMS wallet did not have enough units.", advice: "Top up the SmartSMS account, then retry." }
  }
  if (/sender\s*id/i.test(note)) {
    return {
      tone: "error",
      summary: "SmartSMS refused the sender name.",
      advice: "Check that the sender ID set on the server is registered and approved in SmartSMS, then retry.",
    }
  }
  if (/invalid.*(number|phone)|(number|phone).*invalid/i.test(note)) {
    return { tone: "error", summary: "SmartSMS rejected the phone number.", advice: "Correct the parent's phone number, then send the message again." }
  }
  if (/token|unauthori[sz]ed|authenticat/i.test(note)) {
    return {
      tone: "error",
      summary: "SmartSMS did not accept the server's API token.",
      advice: "Update SMARTSMS_API_TOKEN in the server settings, restart the app, then retry.",
    }
  }
  return {
    tone: status === "FAILED" ? "error" : "warning",
    summary: status === "FAILED" ? "The provider refused this message." : "The provider added a note to this message.",
    advice: "The provider's own words are shown below.",
  }
}
