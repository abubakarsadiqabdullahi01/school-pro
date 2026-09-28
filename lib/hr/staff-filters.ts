import { ANY, countActive, filterHref, readParam } from "@/lib/query-filters"

/**
 * Filters for the staff directory.
 *
 * The screen used to carry a GET form with native selects and an Apply button, plus a second
 * search box inside the table — so a school with two hundred staff had two different places
 * to type a name and no way to tell which one was in force. One search, in the URL, applied
 * by the server: the same arrangement as every other list in the app.
 */

export { ANY }

export const STAFF_TYPES = [
  { value: "TEACHER", label: "Teacher" },
  { value: "ADMIN_STAFF", label: "Admin staff" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "CLEANER", label: "Cleaner" },
  { value: "DRIVER", label: "Driver" },
  { value: "SECURITY", label: "Security" },
  { value: "LIBRARIAN", label: "Librarian" },
  { value: "NURSE", label: "Nurse" },
  { value: "OTHER", label: "Other" },
] as const

export const EMPLOYMENT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
] as const

/** Whether a salary is on record. Nobody without one can be paid, so it is worth filtering. */
export const SALARY_STATES = [
  { value: "WITH_SALARY", label: "Salary set" },
  { value: "NO_SALARY", label: "No salary set" },
] as const

export type StaffFilters = {
  search?: string
  department?: string
  staffType?: string
  employmentStatus?: string
  salary?: string
}

export type StaffChip = { key: string; label: string; value: string }

const oneOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string }>) =>
  value && allowed.some((option) => option.value === value) ? value : undefined

const labelOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string; label: string }>) =>
  allowed.find((option) => option.value === value)?.label ?? value ?? ""

/**
 * A department is free text on the staff record, so it cannot be checked against a list of
 * allowed values the way an enum can — the caller passes the departments the school actually
 * uses, and anything else is dropped rather than queried on.
 */
export function parseStaffFilters(
  raw: Record<string, string | string[] | undefined>,
  departments: readonly string[] = [],
): StaffFilters {
  const department = readParam(raw, "department")

  return {
    search: readParam(raw, "search"),
    department: department && departments.includes(department) ? department : undefined,
    staffType: oneOf(readParam(raw, "staffType"), STAFF_TYPES),
    employmentStatus: oneOf(readParam(raw, "employmentStatus"), EMPLOYMENT_STATUSES),
    salary: oneOf(readParam(raw, "salary"), SALARY_STATES),
  }
}

export function countStaffFilters(filters: StaffFilters): number {
  return countActive(filters)
}

export function staffFilterHref(
  basePath: string,
  filters: StaffFilters,
  overrides: Partial<Record<keyof StaffFilters, string | undefined>> = {},
): string {
  return filterHref(basePath, filters, overrides)
}

export function staffChips(filters: StaffFilters): StaffChip[] {
  const chips: StaffChip[] = []

  if (filters.search) chips.push({ key: "search", label: "Search", value: filters.search })
  if (filters.department) {
    chips.push({ key: "department", label: "Department", value: filters.department })
  }
  if (filters.staffType) {
    chips.push({ key: "staffType", label: "Type", value: labelOf(filters.staffType, STAFF_TYPES) })
  }
  if (filters.employmentStatus) {
    chips.push({
      key: "employmentStatus",
      label: "Status",
      value: labelOf(filters.employmentStatus, EMPLOYMENT_STATUSES),
    })
  }
  if (filters.salary) {
    chips.push({ key: "salary", label: "Salary", value: labelOf(filters.salary, SALARY_STATES) })
  }

  return chips
}

/** What the screen is showing, in one line — for the card description and a printed copy. */
export function describeStaffFilters(filters: StaffFilters): string {
  const chips = staffChips(filters)
  if (chips.length === 0) return "All staff"
  return chips.map((chip) => `${chip.label}: ${chip.value}`).join(" · ")
}

export function staffTypeLabel(value: string): string {
  return labelOf(value, STAFF_TYPES)
}

export function employmentStatusLabel(value: string): string {
  return labelOf(value, EMPLOYMENT_STATUSES)
}

/** `FULL_TIME` reads as "Full time" rather than "full time" or the raw enum. */
export function employmentTypeLabel(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The salary filter applied in memory.
 *
 * Whether a salary is on record is a row in another table, and the directory already returns
 * it — so it is applied against exactly the reading the table shows rather than being
 * approximated a second time in SQL.
 */
export function matchesSalaryFilter(
  staff: { baseSalary: string | null },
  filters: StaffFilters,
): boolean {
  if (filters.salary === "WITH_SALARY") return staff.baseSalary !== null
  if (filters.salary === "NO_SALARY") return staff.baseSalary === null
  return true
}
