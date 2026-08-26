import { describe, expect, it } from "vitest"
import { exportFileName, toCsv } from "@/lib/csv"

/**
 * Export correctness is quiet when it breaks: a debtor row that splits across two columns
 * still opens in Excel, it just puts the wrong money against the wrong student.
 */

describe("toCsv", () => {
  it("writes a header row followed by the body", () => {
    expect(toCsv(["Student", "Balance"], [["Ada", "5000.00"]])).toBe("Student,Balance\r\nAda,5000.00")
  })

  it("leaves ordinary values unquoted", () => {
    expect(toCsv(["Class"], [["JSS 1A"]])).toBe("Class\r\nJSS 1A")
  })

  it("quotes a value containing the delimiter", () => {
    // A fee named "Books, Term 1" would otherwise become two columns.
    expect(toCsv(["Fee"], [["Books, Term 1"]])).toBe('Fee\r\n"Books, Term 1"')
  })

  it("doubles embedded quotes", () => {
    expect(toCsv(["Note"], [['He said "paid"']])).toBe('Note\r\n"He said ""paid"""')
  })

  it("quotes a value containing a newline", () => {
    expect(toCsv(["Note"], [["line one\nline two"]])).toBe('Note\r\n"line one\nline two"')
  })

  it("handles an empty body", () => {
    expect(toCsv(["Student", "Balance"], [])).toBe("Student,Balance")
  })
})

describe("exportFileName", () => {
  it("slugs a title into a safe filename", () => {
    expect(exportFileName("Debtors Report", "csv")).toBe("debtors-report.csv")
  })

  it("strips characters Windows refuses in a filename", () => {
    expect(exportFileName("Debtors: First Term 2025/2026", "pdf")).toBe("debtors-first-term-2025-2026.pdf")
  })

  it("collapses runs of separators and trims the edges", () => {
    expect(exportFileName("  Class -- Summary  ", "csv")).toBe("class-summary.csv")
  })

  it("falls back rather than producing a bare extension", () => {
    expect(exportFileName("///", "csv")).toBe("export.csv")
  })
})
