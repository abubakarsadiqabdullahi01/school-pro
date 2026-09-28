import { describe, expect, it } from "vitest"

import { ANY, countActive, filterHref, isCalendarDate, readParam } from "./query-filters"

describe("readParam", () => {
  it("reads a plain parameter", () => {
    expect(readParam({ termId: "t1" }, "termId")).toBe("t1")
  })

  it("trims, because a copied URL often carries a space", () => {
    expect(readParam({ search: "  RCT/2026 " }, "search")).toBe("RCT/2026")
  })

  it("treats the select's placeholder and an empty value as no filter", () => {
    expect(readParam({ method: ANY }, "method")).toBeUndefined()
    expect(readParam({ method: "" }, "method")).toBeUndefined()
    expect(readParam({}, "method")).toBeUndefined()
  })

  it("takes the first of a repeated parameter rather than choking on the array", () => {
    expect(readParam({ termId: ["t1", "t2"] }, "termId")).toBe("t1")
  })
})

describe("filterHref", () => {
  it("carries the other filters when one changes", () => {
    expect(filterHref("/fees", { type: "MANDATORY", status: "ACTIVE" }, { status: "INACTIVE" })).toBe(
      "/fees?type=MANDATORY&status=INACTIVE",
    )
  })

  it("drops a filter set to undefined", () => {
    expect(filterHref("/fees", { type: "MANDATORY" }, { type: undefined })).toBe("/fees")
  })

  it("returns the bare path when nothing is left, so the URL does not collect a stray ?", () => {
    expect(filterHref("/fees", {})).toBe("/fees")
  })

  it("escapes what belongs escaped", () => {
    expect(filterHref("/fees", { search: "Tuition & Levy" })).toBe("/fees?search=Tuition+%26+Levy")
  })
})

describe("countActive", () => {
  it("counts only the filters that are set", () => {
    expect(countActive({ a: "x", b: undefined, c: "" })).toBe(1)
  })
})

describe("isCalendarDate", () => {
  it("accepts a real day", () => {
    expect(isCalendarDate("2026-09-29")).toBe(true)
  })

  it("rejects a day that does not exist, which Date would roll over instead", () => {
    expect(isCalendarDate("2026-02-31")).toBe(false)
  })

  it("rejects anything that is not yyyy-mm-dd", () => {
    expect(isCalendarDate("29/09/2026")).toBe(false)
    expect(isCalendarDate("yesterday")).toBe(false)
  })
})
