import { describe, expect, it } from "vitest"

import {
  HR_REPORT_TABS,
  hrReportTabHref,
  hrReportTabLabel,
  hrReportTabTitle,
  parseHrReportTab,
  showsSection,
} from "@/lib/hr/hr-report-tabs"

describe("parseHrReportTab", () => {
  it("reads the tab that was asked for", () => {
    expect(parseHrReportTab({ tab: "unpaid" })).toBe("unpaid")
    expect(parseHrReportTab({ tab: "all" })).toBe("all")
  })

  it("falls back to the overview when no tab is named", () => {
    expect(parseHrReportTab({})).toBe("overview")
  })

  it("falls back rather than failing on a stale or hand-edited link", () => {
    expect(parseHrReportTab({ tab: "pensions" })).toBe("overview")
    expect(parseHrReportTab({ tab: ["unpaid", "structure"] })).toBe("unpaid")
  })
})

describe("hrReportTabTitle", () => {
  it("names the document, so a printed tab says which report it is", () => {
    expect(hrReportTabTitle("departments")).toBe("Department Payroll Summary")
    expect(hrReportTabTitle("structure")).toBe("Salary Structure")
    expect(hrReportTabTitle("all")).toBe("HR Report Pack")
    expect(hrReportTabTitle("overview")).toBe("HR Reports")
  })

  it("gives every tab a title and a label", () => {
    for (const tab of HR_REPORT_TABS) {
      expect(hrReportTabTitle(tab.value)).toBeTruthy()
      expect(hrReportTabLabel(tab.value)).toBe(tab.label)
    }
  })
})

describe("hrReportTabHref", () => {
  it("leaves the overview as the bare path, so the default is not in every link", () => {
    expect(hrReportTabHref("/hr/reports", "overview")).toBe("/hr/reports")
  })

  it("names any other tab", () => {
    expect(hrReportTabHref("/hr/reports", "unpaid")).toBe("/hr/reports?tab=unpaid")
  })

  it("keeps the run being reported on across a tab change", () => {
    expect(hrReportTabHref("/hr/reports", "departments", "run-7")).toBe(
      "/hr/reports?tab=departments&runId=run-7",
    )
    expect(hrReportTabHref("/hr/reports", "overview", "run-7")).toBe("/hr/reports?runId=run-7")
  })
})

describe("showsSection", () => {
  it("shows a section on its own tab", () => {
    expect(showsSection("unpaid", "unpaid")).toBe(true)
    expect(showsSection("unpaid", "departments")).toBe(false)
  })

  it("shows every section on the everything tab, for one printed pack", () => {
    expect(showsSection("all", "unpaid")).toBe(true)
    expect(showsSection("all", "departments")).toBe(true)
    expect(showsSection("all", "structure")).toBe(true)
  })

  it("shows no section on the overview, which has its own content", () => {
    expect(showsSection("overview", "unpaid")).toBe(false)
    expect(showsSection("overview", "structure")).toBe(false)
  })
})
