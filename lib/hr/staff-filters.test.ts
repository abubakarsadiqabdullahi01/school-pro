import { describe, expect, it } from "vitest"

import {
  countStaffFilters,
  describeStaffFilters,
  employmentStatusLabel,
  employmentTypeLabel,
  matchesSalaryFilter,
  parseStaffFilters,
  staffChips,
  staffFilterHref,
  staffTypeLabel,
} from "@/lib/hr/staff-filters"

const departments = ["Sciences", "Languages", "Support"]

describe("parseStaffFilters", () => {
  it("reads every filter the screen offers", () => {
    const filters = parseStaffFilters(
      {
        search: "abubakar",
        department: "Sciences",
        staffType: "TEACHER",
        employmentStatus: "ACTIVE",
        salary: "NO_SALARY",
      },
      departments,
    )

    expect(filters).toEqual({
      search: "abubakar",
      department: "Sciences",
      staffType: "TEACHER",
      employmentStatus: "ACTIVE",
      salary: "NO_SALARY",
    })
  })

  it("drops enum values that are not offered, because the query string is public", () => {
    expect(
      parseStaffFilters({ staffType: "HEADMASTER", employmentStatus: "FIRED", salary: "RICH" }, departments),
    ).toEqual({
      search: undefined,
      department: undefined,
      staffType: undefined,
      employmentStatus: undefined,
      salary: undefined,
    })
  })

  it("drops a department the school does not have", () => {
    expect(parseStaffFilters({ department: "Astrophysics" }, departments).department).toBeUndefined()
    expect(parseStaffFilters({ department: "Support" }, departments).department).toBe("Support")
  })

  it("keeps no department when the caller has not loaded the list yet", () => {
    expect(parseStaffFilters({ department: "Sciences" }).department).toBeUndefined()
  })

  it("treats the no-filter sentinel and blank input as absent", () => {
    expect(parseStaffFilters({ search: "   ", staffType: "ANY" }, departments)).toMatchObject({
      search: undefined,
      staffType: undefined,
    })
  })
})

describe("countStaffFilters", () => {
  it("counts only the filters that are on", () => {
    expect(countStaffFilters({})).toBe(0)
    expect(countStaffFilters({ staffType: "TEACHER", salary: "NO_SALARY" })).toBe(2)
  })
})

describe("staffFilterHref", () => {
  it("keeps the other filters when one changes", () => {
    // The order follows the filter object, not the alphabet: `staffType` was declared first.
    expect(staffFilterHref("/staff", { staffType: "TEACHER", search: "musa" }, { staffType: "DRIVER" })).toBe(
      "/staff?staffType=DRIVER&search=musa",
    )
  })

  it("clears one filter without losing the rest", () => {
    expect(staffFilterHref("/staff", { staffType: "TEACHER", search: "musa" }, { search: undefined })).toBe(
      "/staff?staffType=TEACHER",
    )
  })

  it("returns the bare path when nothing is filtered", () => {
    expect(staffFilterHref("/staff", {})).toBe("/staff")
  })
})

describe("staffChips", () => {
  it("names each filter in the words the select used", () => {
    expect(staffChips({ staffType: "ADMIN_STAFF", employmentStatus: "SUSPENDED", salary: "NO_SALARY" })).toEqual([
      { key: "staffType", label: "Type", value: "Admin staff" },
      { key: "employmentStatus", label: "Status", value: "Suspended" },
      { key: "salary", label: "Salary", value: "No salary set" },
    ])
  })

  it("shows a department by its own name", () => {
    expect(staffChips({ department: "Sciences" })).toEqual([
      { key: "department", label: "Department", value: "Sciences" },
    ])
  })

  it("has nothing to show when nothing is filtered", () => {
    expect(staffChips({})).toEqual([])
  })
})

describe("describeStaffFilters", () => {
  it("says so plainly when the whole directory is on screen", () => {
    expect(describeStaffFilters({})).toBe("All staff")
  })

  it("joins the active filters", () => {
    expect(describeStaffFilters({ department: "Support", employmentStatus: "ACTIVE" })).toBe(
      "Department: Support · Status: Active",
    )
  })
})

describe("labels", () => {
  it("reads a staff type back as its label", () => {
    expect(staffTypeLabel("ADMIN_STAFF")).toBe("Admin staff")
    expect(staffTypeLabel("PRINCIPAL")).toBe("PRINCIPAL")
  })

  it("reads an employment status back as its label", () => {
    expect(employmentStatusLabel("TERMINATED")).toBe("Terminated")
  })

  it("capitalises an employment type instead of printing it lower case", () => {
    expect(employmentTypeLabel("FULL_TIME")).toBe("Full time")
    expect(employmentTypeLabel("PART_TIME")).toBe("Part time")
    expect(employmentTypeLabel("CONTRACT")).toBe("Contract")
  })
})

describe("matchesSalaryFilter", () => {
  const paid = { baseSalary: "140000.00" }
  const unpaid = { baseSalary: null }

  it("passes everything when the filter is off", () => {
    expect(matchesSalaryFilter(paid, {})).toBe(true)
    expect(matchesSalaryFilter(unpaid, {})).toBe(true)
  })

  it("finds the people who cannot be paid yet", () => {
    expect(matchesSalaryFilter(unpaid, { salary: "NO_SALARY" })).toBe(true)
    expect(matchesSalaryFilter(paid, { salary: "NO_SALARY" })).toBe(false)
  })

  it("finds the people who can", () => {
    expect(matchesSalaryFilter(paid, { salary: "WITH_SALARY" })).toBe(true)
    expect(matchesSalaryFilter(unpaid, { salary: "WITH_SALARY" })).toBe(false)
  })
})
