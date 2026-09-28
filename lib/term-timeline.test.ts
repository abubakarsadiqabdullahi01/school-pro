import { describe, expect, it } from "vitest"

import { hasTermEnded } from "@/lib/term-rules"
import { termTimeline } from "@/lib/term-timeline"

const term = { startDate: new Date("2026-08-03"), endDate: new Date("2026-11-01") }

describe("termTimeline", () => {
  it("counts both ends of the term, so a one-day term lasts a day", () => {
    const single = termTimeline(
      { startDate: new Date("2026-08-03"), endDate: new Date("2026-08-03") },
      new Date("2026-08-02T23:00:00"),
    )
    expect(single.days).toBe(1)
    expect(single.weeks).toBe(1)
  })

  it("reports a term that has not begun", () => {
    const t = termTimeline(term, new Date("2026-07-01T09:00:00"))
    expect(t.phase).toBe("upcoming")
    expect(t.percent).toBe(0)
    expect(t.dayOfTerm).toBeNull()
    expect(t.summary).toMatch(/^Starts in/)
  })

  it("reports a term that is running, with the day it is on", () => {
    const t = termTimeline(term, new Date("2026-09-17T12:00:00"))
    expect(t.phase).toBe("running")
    expect(t.days).toBe(91)
    expect(t.weeks).toBe(13)
    expect(t.dayOfTerm).toBe(46)
    expect(t.percent).toBe(51)
    expect(t.summary).toBe("Day 46 of 91 — ends in 1 month")
  })

  it("reports a term that has finished", () => {
    const t = termTimeline(term, new Date("2026-12-25T09:00:00"))
    expect(t.phase).toBe("ended")
    expect(t.percent).toBe(100)
    expect(t.dayOfTerm).toBeNull()
    expect(t.summary).toMatch(/^Ended .* ago$/)
  })

  it("never shows a running term as 0% or 100%", () => {
    const firstDay = termTimeline(term, new Date("2026-08-03T08:00:00"))
    const lastMoment = termTimeline(term, new Date("2026-10-31T23:00:00"))
    expect(firstDay.percent).toBe(1)
    expect(lastMoment.phase).toBe("running")
    expect(lastMoment.percent).toBe(99)
  })

  // The page must not tell someone a term is still running while the server is already
  // refusing to delete it as history. Both sides read the end date the same way.
  it("switches to ended at exactly the moment hasTermEnded does", () => {
    // Spelled in UTC on purpose: `new Date("2026-11-01")` is UTC midnight, so a local-time
    // literal here would land on the wrong side of the boundary outside UTC.
    const justBefore = new Date("2026-10-31T23:59:59Z")
    const justAfter = new Date("2026-11-01T00:00:01Z")

    expect(hasTermEnded({ ...term, isCurrent: false }, justBefore)).toBe(false)
    expect(termTimeline(term, justBefore).phase).toBe("running")

    expect(hasTermEnded({ ...term, isCurrent: false }, justAfter)).toBe(true)
    expect(termTimeline(term, justAfter).phase).toBe("ended")
  })

  it("accepts ISO strings, which is what a serialized term carries", () => {
    const t = termTimeline({ startDate: "2026-08-03", endDate: "2026-11-01" }, new Date("2026-09-17T12:00:00"))
    expect(t.dayOfTerm).toBe(46)
  })
})
