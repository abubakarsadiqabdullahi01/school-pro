"use client"

import type { Role } from "@prisma/client"
import { ArrowLeft, ArrowRight, Check, Info, MapPin } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MODULE_GUIDES } from "@/lib/module-guides"
import { tourStopsFor, tourStorageKey } from "@/lib/welcome-tour"
import { cn } from "@/lib/utils"

/**
 * Shown once, the first time somebody signs in: the handful of places their role
 * actually works in, and the one thing about each that is not obvious.
 *
 * Dismissal is kept in `localStorage` rather than on the user record, so that
 * adding this needed no migration — which matters on a deployment where
 * migrations are run by hand. The cost is that it appears again on a new browser
 * or device; for a welcome tour that is a fair trade, and "Skip" takes one click.
 */
export function WelcomeTour({
  userId,
  userRole,
  userName,
  permissions,
}: {
  userId?: string
  userRole: Role
  userName: string
  permissions: readonly string[]
}) {
  const stops = tourStopsFor(userRole, permissions)

  // Starts closed and opens from an effect: localStorage is not available during
  // the server render, and opening on the first client pass would flash the
  // dialog at people who have already dismissed it.
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!userId || stops.length === 0) return
    try {
      if (window.localStorage.getItem(tourStorageKey(userId))) return
    } catch {
      // Private browsing, or site data blocked. Showing the tour is the safe
      // failure: it is dismissible, and a loop is prevented by the same catch
      // swallowing the write below.
    }
    setOpen(true)
  }, [stops.length, userId])

  function close() {
    try {
      if (userId) window.localStorage.setItem(tourStorageKey(userId), new Date().toISOString())
    } catch {
      // Nothing to do — the tour simply appears again next time.
    }
    setOpen(false)
  }

  if (!userId || stops.length === 0) return null

  const isLast = step === stops.length
  const stop = isLast ? null : stops[step]
  const guide = stop ? MODULE_GUIDES[stop.guideKey] : null

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="text-left">
          {!isLast && guide && stop ? (
            <>
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <MapPin className="size-3.5" aria-hidden="true" />
                {guide.location.join(" › ")}
              </p>
              <DialogTitle className="text-xl">{guide.title}</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-foreground/80">
                {guide.purpose}
              </DialogDescription>
            </>
          ) : (
            <>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Welcome
              </p>
              <DialogTitle className="text-xl">You are ready to start</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-foreground/80">
                That is the tour. Everything else is explained where you need it.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {!isLast && stop && guide ? (
          <div className="space-y-4">
            <p className="rounded-md border border-dashed bg-muted/40 p-3 text-sm leading-relaxed">
              {stop.why}
            </p>

            {guide.example && (
              <dl className="space-y-1.5 text-sm leading-relaxed">
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">You do:</dt>
                  <dd className="text-muted-foreground">{guide.example.doing}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">You get:</dt>
                  <dd className="text-muted-foreground">{guide.example.then}</dd>
                </div>
              </dl>
            )}

            <Button variant="outline" size="sm" asChild onClick={close}>
              <Link href={stop.href}>Take me there</Link>
            </Button>
          </div>
        ) : (
          <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Every screen has an <strong className="text-foreground">ⓘ</strong> beside its title,{" "}
              {userName.split(" ")[0]}. It explains what that screen does, what happens when you
              save, and the rules the system enforces — with an example.
            </span>
          </p>
        )}

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {stops.map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                index <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={close}>
            {isLast ? "Close" : "Skip tour"}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={close}>
                <Check className="size-4" aria-hidden="true" />
                Get started
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                {step === stops.length - 1 ? "Finish" : "Next"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
