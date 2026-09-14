import { describe, expect, it } from "vitest"

import { filterRows, isOnPage, pageWindow } from "@/lib/table"

const rows = [
  { search: "REC-001 Pamela Walsh-Crist JSS 2A Tuition" },
  { search: "REC-002 Guy Funk SSS 3 Commercial Exam Fee" },
  { search: "REC-003 Julio Cole Primary 2 Tuition" },
]

describe("filterRows", () => {
  it("returns every row for an empty or blank query", () => {
    expect(filterRows(rows, "")).toHaveLength(3)
    expect(filterRows(rows, "   ")).toHaveLength(3)
  })

  it("matches regardless of case", () => {
    expect(filterRows(rows, "pamela")).toHaveLength(1)
    expect(filterRows(rows, "PAMELA")).toHaveLength(1)
  })

  it("requires every word, so extra words narrow rather than widen", () => {
    expect(filterRows(rows, "tuition")).toHaveLength(2)
    expect(filterRows(rows, "tuition jss")).toHaveLength(1)
  })

  it("ignores the order the words are typed in", () => {
    // The class and the fee name sit in different columns; the reader should not have to know.
    expect(filterRows(rows, "jss tuition")).toEqual(filterRows(rows, "tuition jss"))
  })

  it("returns nothing when a word matches no row", () => {
    expect(filterRows(rows, "tuition boarding")).toHaveLength(0)
  })
})

describe("pageWindow", () => {
  it("describes the first page of a longer list", () => {
    expect(pageWindow(30, 1, 12)).toEqual({ page: 1, totalPages: 3, firstIndex: 0, lastIndex: 12 })
  })

  it("stops the last page at the final row rather than the page size", () => {
    expect(pageWindow(30, 3, 12)).toEqual({ page: 3, totalPages: 3, firstIndex: 24, lastIndex: 30 })
  })

  it("clamps a page that no longer exists down to the last one", () => {
    // Sitting on page 4 when a search cuts the list to 13 rows lands on page 2, not page 1.
    expect(pageWindow(13, 4, 12).page).toBe(2)
  })

  it("clamps a page below the first", () => {
    expect(pageWindow(13, 0, 12).page).toBe(1)
  })

  it("reports one empty page for an empty list", () => {
    expect(pageWindow(0, 1, 12)).toEqual({ page: 1, totalPages: 1, firstIndex: 0, lastIndex: 0 })
  })
})

describe("isOnPage", () => {
  it("covers exactly the rows in the window", () => {
    const window = pageWindow(30, 2, 12)
    expect(isOnPage(11, window)).toBe(false)
    expect(isOnPage(12, window)).toBe(true)
    expect(isOnPage(23, window)).toBe(true)
    expect(isOnPage(24, window)).toBe(false)
  })

  it("puts every row off-page for an empty list", () => {
    expect(isOnPage(0, pageWindow(0, 1, 12))).toBe(false)
  })
})
