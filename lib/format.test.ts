import { describe, expect, it } from "vitest"

import { formatDocumentDate, formatDocumentDateTime } from "./format"

describe("formatDocumentDate", () => {
  it("renders a date the way a document column needs it", () => {
    expect(formatDocumentDate(new Date(2026, 8, 29))).toBe("29 Sep 2026")
  })

  it("pads single-digit days, so every row is the same width", () => {
    expect(formatDocumentDate(new Date(2026, 0, 2))).toBe("02 Jan 2026")
    expect(formatDocumentDate(new Date(2026, 0, 2))).toHaveLength(
      formatDocumentDate(new Date(2026, 11, 31)).length,
    )
  })

  it("never abbreviates September to four letters, unlike en-GB", () => {
    expect(formatDocumentDate(new Date(2026, 8, 1))).toBe("01 Sep 2026")
  })

  it("accepts the ISO strings the server actions hand to client tables", () => {
    expect(formatDocumentDate("2026-09-29T10:30:00")).toBe("29 Sep 2026")
  })

  it("says so rather than printing NaN when a date is unusable", () => {
    expect(formatDocumentDate("not a date")).toBe("Invalid date")
  })
})

describe("formatDocumentDate on a bare calendar date", () => {
  it("reads yyyy-mm-dd as that day, not as midnight UTC", () => {
    // `new Date("2026-09-01")` is 01:00 in Lagos but 20:00 on 31 August in New York.
    expect(formatDocumentDate("2026-09-01")).toBe("01 Sep 2026")
    expect(formatDocumentDate("2026-01-01")).toBe("01 Jan 2026")
  })
})

describe("formatDocumentDateTime", () => {
  it("adds the clock to the document date, so two runs an hour apart are distinguishable", () => {
    expect(formatDocumentDateTime(new Date(2026, 8, 20, 11, 20, 19))).toBe("20 Sep 2026, 11:20")
    expect(formatDocumentDateTime(new Date(2026, 8, 20, 9, 58, 53))).toBe("20 Sep 2026, 09:58")
  })

  it("pads a single-digit hour and minute, so a column of times lines up", () => {
    expect(formatDocumentDateTime(new Date(2026, 0, 2, 7, 5))).toBe("02 Jan 2026, 07:05")
  })

  it("says so rather than printing NaN on a value that is not a date", () => {
    expect(formatDocumentDateTime("not a date")).toBe("Invalid date")
  })
})
