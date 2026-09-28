import { readParam } from "@/lib/query-filters"

/**
 * The HR report pack, as tabs.
 *
 * Five reports on one page meant a screen you scrolled for a while and a Print that produced
 * all five whether you wanted them or not. Each is its own tab now, and the tab lives in the
 * query string rather than in component state — which is what makes it linkable ("look at
 * the unpaid list"), survivable by the back button, and printable on its own, because only
 * the tab on screen is rendered at all.
 *
 * `all` is the exception that earns its place: somebody filing the month's pack wants the
 * whole thing on one document, so it renders every section for a single print run.
 */

export const HR_REPORT_TABS = [
  { value: "overview", label: "Overview", title: "HR Reports" },
  { value: "departments", label: "Departments", title: "Department Payroll Summary" },
  { value: "allowances", label: "Allowances", title: "Allowance Report" },
  { value: "deductions", label: "Deductions", title: "Deduction Report" },
  { value: "unpaid", label: "Unpaid", title: "Unpaid Salary" },
  { value: "structure", label: "Salary structure", title: "Salary Structure" },
  { value: "all", label: "Everything", title: "HR Report Pack" },
] as const

export type HrReportTab = (typeof HR_REPORT_TABS)[number]["value"]

/** The tab asked for, or the overview. An unknown tab is a stale link, not an error. */
export function parseHrReportTab(raw: Record<string, string | string[] | undefined>): HrReportTab {
  const value = readParam(raw, "tab")
  return HR_REPORT_TABS.some((tab) => tab.value === value) ? (value as HrReportTab) : "overview"
}

/** The document title for the letterhead, so a printed tab says which report it is. */
export function hrReportTabTitle(tab: HrReportTab): string {
  return HR_REPORT_TABS.find((entry) => entry.value === tab)?.title ?? "HR Reports"
}

export function hrReportTabLabel(tab: HrReportTab): string {
  return HR_REPORT_TABS.find((entry) => entry.value === tab)?.label ?? "Overview"
}

/**
 * A link to one tab, keeping the run being reported on.
 *
 * The period has to survive a tab change: somebody looking at August's departments and then
 * at August's unpaid list should not be silently moved to the current month.
 */
export function hrReportTabHref(basePath: string, tab: HrReportTab, runId?: string): string {
  const params = new URLSearchParams()
  if (tab !== "overview") params.set("tab", tab)
  if (runId) params.set("runId", runId)

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

/** Whether a section should render: its own tab, or the everything tab. */
export function showsSection(tab: HrReportTab, section: Exclude<HrReportTab, "overview" | "all">): boolean {
  return tab === section || tab === "all"
}
