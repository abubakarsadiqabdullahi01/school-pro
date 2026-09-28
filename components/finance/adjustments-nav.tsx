import Link from "next/link"

import { BackButton } from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * The header both adjustment screens share.
 *
 * Granting a discount and auditing the ones already granted are two different jobs done by
 * two different people on two different days, so they are two screens. This is what ties
 * them together — where you are, what else there is, and the action this screen offers.
 */
export function AdjustmentsNav({
  basePath,
  mode,
  active,
}: {
  basePath: string
  mode: "discount" | "exemption"
  active: "apply" | "records"
}) {
  const section = mode === "discount" ? "discounts" : "exemptions"
  const noun = mode === "discount" ? "Discount" : "Exemption"
  const title = mode === "discount" ? "Discounts" : "Fee Exemptions"

  const tabs = [
    { key: "apply", label: `Apply ${noun.toLowerCase()}`, href: `${basePath}/${section}` },
    { key: "records", label: `Recorded ${section}`, href: `${basePath}/${section}/records` },
  ] as const

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <InfoGuide guideKey="finance.adjustments" />
          </div>
          <p className="text-muted-foreground">
            {active === "apply"
              ? `Find the student, choose the fee that is still owing, and record the approved ${mode} with a reason.`
              : `Every ${mode} the school has granted — who it was for, which fee, how much, and why.`}
          </p>
        </div>
        <Button asChild variant={active === "apply" ? "outline" : "default"}>
          <Link href={active === "apply" ? `${basePath}/${section}/records` : `${basePath}/${section}`}>
            {active === "apply" ? `Recorded ${section}` : `Apply ${noun.toLowerCase()}`}
          </Link>
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
