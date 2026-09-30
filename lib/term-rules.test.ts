import { describe, expect, it } from "vitest"

import {
  canAddTermToSession,
  canAssignInTerm,
  canDeleteTerm,
  canChangeSessionDates,
  canEditTerm,
  canSetTermCurrent,
  canUseTermName,
  hasTermEnded,
  TERM_NAMES,
} from "@/lib/term-rules"

const NOW = new Date("2026-09-17T12:00:00Z")
const ended = { endDate: new Date("2026-07-18T00:00:00Z"), isCurrent: false }
const running = { endDate: new Date("2026-10-31T00:00:00Z"), isCurrent: false }
const current = { endDate: new Date("2026-10-31T00:00:00Z"), isCurrent: true }

describe("hasTermEnded", () => {
  it("is true only once the end date has passed", () => {
    expect(hasTermEnded(ended, NOW)).toBe(true)
    expect(hasTermEnded(running, NOW)).toBe(false)
  })

  it("accepts an ISO string, which is what a server component hands a client one", () => {
    expect(hasTermEnded({ endDate: "2026-07-18T00:00:00Z", isCurrent: false }, NOW)).toBe(true)
  })
})

describe("canDeleteTerm", () => {
  it("refuses the current term", () => {
    const verdict = canDeleteTerm(current, NOW)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/current term cannot be deleted/i)
  })

  it("refuses a term that has already ended, even with nothing recorded against it", () => {
    const verdict = canDeleteTerm(ended, NOW)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/already ended/i)
  })

  it("allows a future or running term that is not current", () => {
    expect(canDeleteTerm(running, NOW).allowed).toBe(true)
  })
})

describe("canSetTermCurrent", () => {
  it("refuses the term that is already current, whoever is asking", () => {
    expect(canSetTermCurrent(current, "SUPER_ADMIN", NOW).allowed).toBe(false)
    expect(canSetTermCurrent(current, "ADMIN", NOW).allowed).toBe(false)
  })

  it("refuses an admin reopening a term that has ended", () => {
    const verdict = canSetTermCurrent(ended, "ADMIN", NOW)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/super admin/i)
  })

  it("allows a super admin to reopen a term that has ended", () => {
    expect(canSetTermCurrent(ended, "SUPER_ADMIN", NOW).allowed).toBe(true)
  })

  it("allows an admin to switch to a term that has not ended", () => {
    expect(canSetTermCurrent(running, "ADMIN", NOW).allowed).toBe(true)
  })

  it("treats an absent role as not a super admin", () => {
    expect(canSetTermCurrent(ended, null, NOW).allowed).toBe(false)
    expect(canSetTermCurrent(ended, undefined, NOW).allowed).toBe(false)
  })
})

describe("canAddTermToSession", () => {
  const openSession = { endDate: new Date("2026-11-30T00:00:00Z"), isCurrent: true }
  const closedSession = { endDate: new Date("2025-11-30T00:00:00Z"), isCurrent: false }

  it("allows a term in a session that is still running", () => {
    expect(canAddTermToSession(openSession, "ADMIN", NOW).allowed).toBe(true)
  })

  it("refuses an admin adding a term to a session that has ended", () => {
    const verdict = canAddTermToSession(closedSession, "ADMIN", NOW)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/session has ended/i)
  })

  it("lets a super admin correct a closed session", () => {
    expect(canAddTermToSession(closedSession, "SUPER_ADMIN", NOW).allowed).toBe(true)
  })

  it("treats an absent role as not a super admin", () => {
    expect(canAddTermToSession(closedSession, undefined, NOW).allowed).toBe(false)
  })
})

describe("canEditTerm", () => {
  it("allows an admin to correct a term that is still running", () => {
    expect(canEditTerm(running, "ADMIN", NOW).allowed).toBe(true)
    expect(canEditTerm(current, "ADMIN", NOW).allowed).toBe(true)
  })

  it("refuses an admin editing a term that has ended", () => {
    const verdict = canEditTerm(ended, "ADMIN", NOW)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/only a super admin/i)
  })

  it("lets a super admin correct a term that has ended", () => {
    expect(canEditTerm(ended, "SUPER_ADMIN", NOW).allowed).toBe(true)
  })

  // A term never outlives its session, so a closed session's terms are all ended and this
  // rule already covers them — no separate session check is needed on the edit path.
  it("covers a term whose session has closed", () => {
    const termInClosedSession = { endDate: new Date("2025-11-20T00:00:00Z"), isCurrent: false }
    expect(canEditTerm(termInClosedSession, "ADMIN", NOW).allowed).toBe(false)
  })
})

describe("canUseTermName", () => {
  it("names the three terms a session runs", () => {
    expect(TERM_NAMES).toEqual(["First Term", "Second Term", "Third Term"])
  })

  it("allows a name no term in the session is using", () => {
    expect(canUseTermName("Third Term", ["First Term", "Second Term"]).allowed).toBe(true)
  })

  it("refuses a name the session already has", () => {
    const verdict = canUseTermName("First Term", ["First Term", "Second Term"])
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toBe("Already created in this session.")
  })

  it("does not treat a term as clashing with itself while being edited", () => {
    expect(canUseTermName("First Term", ["First Term", "Second Term"], "First Term").allowed).toBe(true)
  })

  it("still refuses renaming onto another term's name", () => {
    expect(canUseTermName("Second Term", ["First Term", "Second Term"], "First Term").allowed).toBe(false)
  })

  it("allows everything in a session with no terms yet", () => {
    for (const name of TERM_NAMES) {
      expect(canUseTermName(name, []).allowed).toBe(true)
    }
  })
})

describe("canAssignInTerm", () => {
  it("allows an admin to set the timetable for the running term", () => {
    expect(canAssignInTerm(current, "ADMIN", NOW).allowed).toBe(true)
    expect(canAssignInTerm(running, "ADMIN", NOW).allowed).toBe(true)
  })

  // Judged on the end date, not `isCurrent` — next term's timetable is ordinary work.
  it("allows an admin to prepare a term that has not started", () => {
    const upcoming = { endDate: new Date("2027-03-31T00:00:00Z"), isCurrent: false }
    expect(canAssignInTerm(upcoming, "ADMIN", NOW).allowed).toBe(true)
  })

  it("refuses an admin changing who taught in a term that has ended", () => {
    const verdict = canAssignInTerm(ended, "ADMIN", NOW)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/only a super admin/i)
  })

  it("lets a super admin correct the record", () => {
    expect(canAssignInTerm(ended, "SUPER_ADMIN", NOW).allowed).toBe(true)
  })
})

describe("canChangeSessionDates", () => {
  const now = new Date("2026-06-01")
  const running = { endDate: new Date("2026-08-31"), isCurrent: true }
  const ended = { endDate: new Date("2025-08-31"), isCurrent: false }
  const terms = [
    { name: "First Term", startDate: new Date("2025-09-08"), endDate: new Date("2025-12-12") },
    { name: "Third Term", startDate: new Date("2026-04-20"), endDate: new Date("2026-07-24") },
  ]
  const range = (start: string, end: string) => ({ startDate: new Date(start), endDate: new Date(end) })

  it("lets a running session move while it still holds its terms", () => {
    expect(canChangeSessionDates(running, range("2025-09-01", "2026-08-31"), terms, "ADMIN", now)).toEqual({ allowed: true })
  })

  it("refuses dates that cut a term out of its session", () => {
    const verdict = canChangeSessionDates(running, range("2025-09-01", "2026-07-01"), terms, "ADMIN", now)
    expect(verdict).toEqual({ allowed: false, reason: expect.stringMatching(/^Third Term would fall outside the session/) })
  })

  it("leaves an ended session's dates to a super admin", () => {
    expect(canChangeSessionDates(ended, range("2024-09-01", "2025-08-31"), [], "ADMIN", now).allowed).toBe(false)
    expect(canChangeSessionDates(ended, range("2024-09-01", "2025-08-31"), [], "SUPER_ADMIN", now).allowed).toBe(true)
  })

  it("refuses a session that ends before it starts", () => {
    expect(canChangeSessionDates(running, range("2026-08-31", "2025-09-01"), [], "SUPER_ADMIN", now).allowed).toBe(false)
  })
})
