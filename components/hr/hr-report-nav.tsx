import Link from "next/link"

import { HR_REPORT_TABS, hrReportTabHref, type HrReportTab } from "@/lib/hr/hr-report-tabs"
import { cn } from "@/lib/utils"

/**
 * The HR report tabs.
 *
 * Plain links rather than client-side tab state: each tab is a real URL, so it can be sent
 * to somebody, reached with the back button, and printed on its own — only the tab on screen
 * is rendered, which is what makes "Print" mean "print this report" rather than all five.
 */
export function HrReportNav({
  basePath,
  active,
  runId,
}: {
  basePath: string
  active: HrReportTab
  /** Carried across a tab change so the period does not reset to the current month. */
  runId?: string
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b print:hidden">
      {HR_REPORT_TABS.map((tab) => (
        <Link
          key={tab.value}
          href={hrReportTabHref(basePath, tab.value, runId)}
          aria-current={tab.value === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.value === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
