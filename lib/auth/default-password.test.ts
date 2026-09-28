import { describe, expect, it } from "vitest"

import {
  defaultPasswordForDate,
  defaultPasswordForStudent,
  defaultPasswordForYear,
} from "./default-password"

describe("defaultPasswordForYear", () => {
  it("is the year, as digits", () => {
    expect(defaultPasswordForYear(2026)).toBe("2026")
  })

  it("refuses a year that cannot be a registration year", () => {
    expect(() => defaultPasswordForYear(26)).toThrow(/not a usable registration year/)
    expect(() => defaultPasswordForYear(3200)).toThrow(/not a usable registration year/)
    expect(() => defaultPasswordForYear(2026.5)).toThrow(/not a usable registration year/)
  })
})

describe("defaultPasswordForDate", () => {
  it("uses the year the person was registered", () => {
    expect(defaultPasswordForDate(new Date("2025-09-17T00:00:00Z"))).toBe("2025")
  })

  it("falls back to today when no date was recorded", () => {
    const now = new Date("2026-03-01T00:00:00Z")
    expect(defaultPasswordForDate(null, now)).toBe("2026")
    expect(defaultPasswordForDate(undefined, now)).toBe("2026")
  })

  it("falls back to today for an unparseable date rather than producing NaN", () => {
    const now = new Date("2026-03-01T00:00:00Z")
    expect(defaultPasswordForDate(new Date("nonsense"), now)).toBe("2026")
  })
})

describe("defaultPasswordForStudent", () => {
  it("prefers the admission year over the row's creation date", () => {
    // A school entering last year's intake in January: the admission number says 2025,
    // so the password has to say 2025 too or it contradicts the document.
    const student = { year: 2025, createdAt: new Date("2026-01-08T00:00:00Z") }
    expect(defaultPasswordForStudent(student)).toBe("2025")
  })

  it("uses the creation date when no admission year is held", () => {
    const student = { year: null, createdAt: new Date("2026-01-08T00:00:00Z") }
    expect(defaultPasswordForStudent(student)).toBe("2026")
  })

  it("uses today when the record has neither", () => {
    const now = new Date("2026-05-05T00:00:00Z")
    expect(defaultPasswordForStudent({}, now)).toBe("2026")
  })
})
