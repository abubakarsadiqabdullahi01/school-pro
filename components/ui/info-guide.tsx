"use client"

import { Info } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { PERMISSION_LABELS } from "@/lib/permissions"
import { MODULE_GUIDES, type ModuleGuide, type ModuleGuideKey } from "@/lib/module-guides"
import { cn } from "@/lib/utils"

/**
 * The ⓘ beside a screen heading. Opens the guide for that screen: what it is
 * for, what is on it, what saving does, and the rules that are enforced but not
 * visible. Content lives in `lib/module-guides.ts`, never inline here.
 */
export function InfoGuide({
  guideKey,
  className,
  label,
}: {
  guideKey: ModuleGuideKey
  className?: string
  /** Overrides the accessible name; defaults to "About <screen title>". */
  label?: string
}) {
  // Widened deliberately: the registry is `as const`, so each entry narrows to its
  // own literal shape and the optional fields do not exist on the union.
  const guide: ModuleGuide = MODULE_GUIDES[guideKey]
  const accessibleName = label ?? `About ${guide.title}`

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={accessibleName}
          title={accessibleName}
          className={cn(
            "size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <Info className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-2 border-b px-6 py-5 text-left">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {guide.location.join(" › ")}
          </p>
          <DialogTitle className="text-xl">{guide.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground/80">
            {guide.purpose}
          </DialogDescription>
        </DialogHeader>

        {/* Native overflow rather than ScrollArea: Radix's viewport is `h-full`, which
            resolves to nothing under a max-height parent, so the content clipped
            instead of scrolling. */}
        <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
          <div className="space-y-6 px-6 py-5">
            {guide.sections && guide.sections.length > 0 && (
              <GuideBlock title="What is on this screen">
                <dl className="space-y-3">
                  {guide.sections.map((section) => (
                    <div key={section.name} className="space-y-1">
                      <dt className="text-sm font-medium">{section.name}</dt>
                      <dd className="text-sm leading-relaxed text-muted-foreground">
                        {section.detail}
                      </dd>
                    </div>
                  ))}
                </dl>
              </GuideBlock>
            )}

            {guide.example && (
              <section className="rounded-md border border-dashed bg-muted/40 p-4">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Example
                </h3>
                <dl className="mt-2 space-y-2 text-sm leading-relaxed">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium">You do:</dt>
                    <dd className="text-muted-foreground">{guide.example.doing}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium">You get:</dt>
                    <dd className="text-muted-foreground">{guide.example.then}</dd>
                  </div>
                </dl>
              </section>
            )}

            {guide.onSave && guide.onSave.length > 0 && (
              <GuideBlock title="What happens when you save">
                <GuideList items={guide.onSave} marker="decimal" />
              </GuideBlock>
            )}

            {guide.rules && guide.rules.length > 0 && (
              <GuideBlock title="Rules the system enforces">
                <GuideList items={guide.rules} marker="disc" />
              </GuideBlock>
            )}

            {guide.nextSteps && guide.nextSteps.length > 0 && (
              <GuideBlock title="Where to go next">
                <GuideList items={guide.nextSteps} marker="disc" />
              </GuideBlock>
            )}

            {guide.permissions && guide.permissions.length > 0 && (
              <GuideBlock title="Who can use this">
                <div className="flex flex-wrap gap-2">
                  {guide.permissions.map((permission) => (
                    <Badge key={permission} variant="secondary" className="font-normal">
                      {PERMISSION_LABELS[permission]}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Granted through a permission profile. If a colleague cannot reach this screen,
                  their profile is missing one of these.
                </p>
              </GuideBlock>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GuideBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function GuideList({ items, marker }: { items: readonly string[]; marker: "disc" | "decimal" }) {
  return (
    <ol
      className={cn(
        "space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground",
        marker === "decimal" ? "list-decimal" : "list-disc",
      )}
    >
      {items.map((item) => (
        <li key={item} className="pl-1">
          {item}
        </li>
      ))}
    </ol>
  )
}
