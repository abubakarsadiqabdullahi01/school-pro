import type { ReactNode } from "react"

import { InfoGuide } from "@/components/ui/info-guide"
import type { ModuleGuideKey } from "@/lib/module-guides"
import { cn } from "@/lib/utils"

/**
 * The standard screen heading: title, the ⓘ that explains the screen, an
 * optional sub-line, and an optional slot for the screen's own buttons.
 *
 * Deliberately not a client component — it only renders one, so a server page
 * can use it without turning its whole subtree into client code.
 */
export function ModuleHeading({
  title,
  description,
  guideKey,
  actions,
  className,
}: {
  title: string
  description?: ReactNode
  guideKey: ModuleGuideKey
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
          <InfoGuide guideKey={guideKey} />
        </div>
        {description ? (
          typeof description === "string" ? (
            <p className="text-muted-foreground">{description}</p>
          ) : (
            description
          )
        ) : null}
      </div>
      {actions ? <div className="flex flex-col gap-2 sm:flex-row">{actions}</div> : null}
    </div>
  )
}
