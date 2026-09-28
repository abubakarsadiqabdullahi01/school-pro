import Link from "next/link"

import { BackButton } from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * The header both Fee Setup screens share.
 *
 * Categories and schedules are two different objects: a category is a heading fees are
 * reported under, a schedule is an instruction to bill a class. They used to be stacked on
 * one page, and creating either meant a single screen carrying both forms side by side, so
 * the page never said which half you were meant to fill in. They are separate screens now,
 * and this is what ties them together — one place that says where you are, what else there
 * is, and what this screen can create.
 */
export function FeeSetupNav({
  basePath,
  active,
}: {
  basePath: string
  active: "schedules" | "categories"
}) {
  const tabs = [
    { key: "schedules", label: "Fee Schedules", href: `${basePath}/fees` },
    { key: "categories", label: "Fee Categories", href: `${basePath}/fees/categories` },
  ] as const

  const create =
    active === "schedules"
      ? { label: "New fee schedule", href: `${basePath}/fees/schedules/new` }
      : { label: "New fee category", href: `${basePath}/fees/categories/new` }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Fee Setup</h1>
            <InfoGuide guideKey="finance.fees" />
          </div>
          <p className="text-muted-foreground">
            {active === "schedules"
              ? "A schedule bills a class, a term or the whole session, and raises one charge per student."
              : "Categories are the headings fees are grouped and reported under."}
          </p>
        </div>
        <Button asChild>
          <Link href={create.href}>{create.label}</Link>
        </Button>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.key === active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
